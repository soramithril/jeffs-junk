// ── JWG FEED ─────────────────────────────────────────────
// Overlays Jeff's Junk bookings onto EMPTY days of the JWG staff scheduler.
//
// Design (see scheduler-merge-decisions): the scheduler is "king".
//  - A scheduler day that already has a shift / "day off" / "sick" is left alone.
//  - A day left empty, where that person is booked on a junk job that day, shows a
//    read-only "from Jeff's Junk" chip. Tapping the cell opens the normal add-shift
//    modal (the standard edit flow), so the admin can keep/adjust it — at which point
//    it becomes a real scheduler entry and the junk side never touches it again.
//
// This is a pure DOM overlay. It NEVER writes to jwg_schedules, so it cannot corrupt
// the scheduler's own auto-save. It lives on the dashboard side (it needs the junk
// `jobs`/`crew_members` tables, which the scheduler bundle knows nothing about) and
// re-applies itself after every scheduler re-render via a MutationObserver — so the
// generated scheduler bundle is left completely untouched.
(function(){
  'use strict';

  var DOW=["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  var _crewName={};                 // crew_members.id -> name
  var _crewLoaded=false,_crewLoading=null;
  var _weekCache={};                // weekKey -> { empNameLower: { DayName: [{label,time}] } }
  var _loading={};                  // weekKey -> true while fetching
  var _observer=null;
  var _timer=null;

  function esc(s){return String(s==null?"":s).replace(/[&<>"]/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c];});}
  function pad(n){return String(n).padStart(2,"0");}
  function localDateStr(d){return d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate());}
  // Monday of the week, offset in weeks — mirrors the scheduler's getWS()
  function getWS(off){var n=new Date(),d=n.getDay(),r=new Date(n);r.setDate(n.getDate()-d+(d===0?-6:1)+(off||0)*7);r.setHours(0,0,0,0);return r;}
  function addDays(d,n){var r=new Date(d);r.setDate(r.getDate()+n);return r;}
  function dayNameOf(dateStr){var p=String(dateStr).split("-");if(p.length<3)return null;var d=new Date(+p[0],+p[1]-1,+p[2]);return DOW[d.getDay()];}
  function inRange(dateStr,s,e){return !!dateStr && dateStr>=s && dateStr<=e;}   // ISO dates sort lexically

  function svcLabel(service,leg){
    if(service==="Bin Rental")return leg==="drop"?"Bins · drop-off":"Bins · pick-up";
    return service||"Junk";
  }
  // Map a junk service onto the scheduler's task ids (DEFAULT_TASKS: bins/junk/furniture/…).
  function taskKeyFor(service){
    var s=String(service||"").toLowerCase();
    if(s.indexOf("bin")>=0)return "bins";
    if(s.indexOf("furniture")>=0)return "furniture";
    if(s.indexOf("landscap")>=0)return "landscaping";
    return "junk";                                   // Junk Removal, Junk Quote, anything else
  }
  // The day/time a job actually happens on — junk/landscaping reschedule via junk_date,
  // furniture via fb_date; the job's own `date` is just the booking date then.
  function effDate(j){
    var s=j.service;
    if(s==="Furniture Pickup"||s==="Furniture Delivery")return j.fb_date||j.date;
    if(s==="Junk Removal"||s==="Junk Quote"||s==="Landscaping")return j.junk_date||j.date;
    return j.date;
  }
  function effTime(j){
    var s=j.service;
    if(s==="Furniture Pickup"||s==="Furniture Delivery")return j.fb_time||j.time;
    if(s==="Junk Removal"||s==="Junk Quote"||s==="Landscaping")return j.junk_time||j.time;
    return j.time;
  }
  // Which real-shift labels "cover" a ghost of this kind (per-entry hiding).
  var FAMILY={bins:["bin"],junk:["junk"],furniture:["furniture"],landscaping:["landscap"]};
  function coveredBy(labels,taskKey){
    var keys=FAMILY[taskKey]||[];
    return labels.some(function(l){return keys.some(function(k){return l.indexOf(k)>=0;});});
  }
  function parseHHMM(t){if(!t)return null;var p=String(t).split(":");if(p.length<2)return null;var h=+p[0],m=+p[1];if(isNaN(h)||isNaN(m))return null;return h*60+m;}
  // Match the scheduler's own fmtHour: uppercase AM/PM, minutes only when off the hour ("7AM", "11:30AM").
  function fmtMins(mins){mins=Math.round(mins);var h=Math.floor(mins/60)%24,m=((mins%60)+60)%60,ap=h<12?"AM":"PM",hh=(h===0)?12:(h>12?h-12:h);return m===0?(hh+ap):(hh+":"+pad(m)+ap);}
  function floor30(m){return Math.floor(m/30)*30;}   // snap window to 30-min blocks like the scheduler
  function ceil30(m){return Math.ceil(m/30)*30;}
  // Reuse Dispatch's own drive-time + service-duration math (globals in app-dispatch.js) to
  // estimate how long a bin leg takes. Combos aren't detected here, so it can slightly
  // over-estimate — it's a ballpark window, editable on the scheduler.
  function estMinutesFor(leg,city){
    if(typeof dispatchEstimateMinutes!=="function")return 0;
    return dispatchEstimateMinutes({city:city},leg==="pick"?"standalone-pickup":"standalone-delivery")||0;
  }
  var _cityLoaded=false,_cityLoading=null;
  function ensureCityTimes(){
    if(_cityLoaded||typeof dispatchLoadCityTimes!=="function")return Promise.resolve();
    if(_cityLoading)return _cityLoading;
    _cityLoading=Promise.resolve(dispatchLoadCityTimes()).then(function(){_cityLoaded=true;}).catch(function(){_cityLoaded=true;});
    return _cityLoading;
  }

  function ensureCrew(){
    if(_crewLoaded)return Promise.resolve();
    if(_crewLoading)return _crewLoading;
    _crewLoading=db.from("crew_members").select("id,name").eq("on_junk", true).then(function(res){
      (res.data||[]).forEach(function(c){_crewName[c.id]=c.name;});
      _crewLoaded=true;
    }).catch(function(e){console.warn("[jwg-feed] crew load failed",e);_crewLoaded=true;});
    return _crewLoading;
  }

  // Turn raw job rows into { empNameLower: { DayName: [{label,time,count,detail}] } } for one week.
  // Bins collapse into ONE "Bins ×N" chip per person/day (drop-off + pick-up counted together);
  // other services stay as individual chips carrying their own time.
  function buildOcc(rows,s,e){
    var occ={};      // key -> day -> entries[]
    var bins={};     // key -> day -> {drop:n, pick:n}
    function ensure(key,day){(occ[key]||(occ[key]={}));return occ[key][day]||(occ[key][day]=[]);}
    function addNonBin(crewId,dateStr,label,time,durMin,taskKey){
      var nm=_crewName[crewId];
      if(!nm||!inRange(dateStr,s,e))return;
      var day=dayNameOf(dateStr);if(!day)return;
      var sm=parseHHMM(time),timeStr="",s0=null,e0=null;
      if(sm!=null){
        s0=floor30(sm);
        if(durMin>0)e0=ceil30(sm+durMin);
        timeStr=(e0!=null)?fmtMins(s0)+"–"+fmtMins(e0):fmtMins(s0);
      }
      ensure(nm.toLowerCase(),day).push({label:label,time:timeStr,count:1,detail:"",taskKey:taskKey,startMin:s0,endMin:e0});
    }
    function addBin(crewId,dateStr,leg,legTime,city){
      var nm=_crewName[crewId];
      if(!nm||!inRange(dateStr,s,e))return;
      var day=dayNameOf(dateStr);if(!day)return;
      var key=nm.toLowerCase();
      bins[key]||(bins[key]={});
      var a=bins[key][day]||(bins[key][day]={drop:0,pick:0,est:0,anchor:null});
      if(leg==="drop")a.drop++;else a.pick++;
      a.est+=estMinutesFor(leg,city);
      var tm=parseHHMM(legTime);                                  // real time set on the dashboard, if any
      if(tm!=null&&(a.anchor==null||tm<a.anchor))a.anchor=tm;
    }
    rows.forEach(function(j){
      if(j.status&&/cancel/i.test(j.status))return;              // skip cancelled jobs
      if(j.service==="Bin Rental"){
        // Bins have two legs on their own dates/people; the job's own date is the order date.
        addBin(j.dropoff_crew_id,j.bin_dropoff,"drop",j.bin_dropoff_time,j.city);
        addBin(j.pickup_crew_id,j.bin_pickup,"pick",j.bin_pickup_time,j.city);
      }else{
        (j.assigned_crew_ids||[]).forEach(function(cid){addNonBin(cid,effDate(j),svcLabel(j.service),effTime(j),j.est_duration_min,taskKeyFor(j.service));});
      }
    });
    // Fold each person/day's bins into a single chip: count + estimated window.
    // Window start = earliest real time set that day, else 8:00am; end = start + summed estimate.
    Object.keys(bins).forEach(function(key){
      Object.keys(bins[key]).forEach(function(day){
        var a=bins[key][day],n=a.drop+a.pick,parts=[];
        if(a.drop)parts.push(a.drop+" drop-off"+(a.drop>1?"s":""));
        if(a.pick)parts.push(a.pick+" pick-up"+(a.pick>1?"s":""));
        var rs=(a.anchor!=null)?a.anchor:480;                          // start: real time set, else 8:00am
        var s0=floor30(rs),e0=(a.est>0)?ceil30(rs+a.est):null,time=""; // snap to 30-min blocks
        if(e0!=null)time=fmtMins(s0)+"–"+fmtMins(e0);
        else if(a.anchor!=null)time=fmtMins(s0);
        ensure(key,day).push({label:"Bins",time:time,count:n,detail:parts.join(" · "),taskKey:"bins",startMin:s0,endMin:e0});
      });
    });
    return occ;
  }

  function loadWeek(ws){
    var weekKey=localDateStr(ws);
    if(_loading[weekKey])return;
    _loading[weekKey]=true;
    var s=localDateStr(ws),e=localDateStr(addDays(ws,6));
    var cols="service,date,time,junk_date,junk_time,fb_date,fb_time,est_duration_min,assigned_crew_ids,dropoff_crew_id,pickup_crew_id,bin_dropoff,bin_dropoff_time,bin_pickup,bin_pickup_time,status,city";
    ensureCrew().then(ensureCityTimes).then(function(){
      return db.from("jobs").select(cols)
        .or("and(date.gte."+s+",date.lte."+e+"),and(junk_date.gte."+s+",junk_date.lte."+e+"),and(fb_date.gte."+s+",fb_date.lte."+e+"),and(bin_dropoff.gte."+s+",bin_dropoff.lte."+e+"),and(bin_pickup.gte."+s+",bin_pickup.lte."+e+")");
    }).then(function(res){
      _weekCache[weekKey]=buildOcc((res&&res.data)||[],s,e);
    }).catch(function(err){
      console.warn("[jwg-feed] week load failed",err);_weekCache[weekKey]={};
    }).then(function(){
      _loading[weekKey]=false;schedulePaint();
    });
  }

  // Render as the scheduler's own shift bars so size/typography match exactly; junk-blue
  // palette + 🚚 keep it recognizable. Clicking bubbles to the cell's openShiftModal.
  function barEl(en){
    var bar=document.createElement("div");
    bar.className="shift-bar shift-bar-flow jwg-junk-chip";
    bar.setAttribute("style","background:#dbeafe;color:#1d4ed8;border:1.5px solid #60a5fa66");
    bar.title="From Jeff's Junk — tap to put it on the schedule"+(en.detail?" ("+en.detail+")":"");
    var lbl="🚚 "+esc(en.label)+(en.count>1?" ×"+en.count:"");
    bar.innerHTML='<span class="shift-label">'+lbl+"</span>"+(en.time?'<span class="shift-times">'+esc(en.time)+"</span>":"");
    return bar;
  }

  function paint(){
    var view=document.getElementById("view-jwgscheduler");
    if(!view||!window.JWG||!JWG.S)return;
    var S=JWG.S;
    if(S.tab&&S.tab!=="schedule")return;              // only the weekly Schedule board
    var grid=view.querySelector(".sched-grid");
    if(!grid)return;
    var ws=getWS(S.weekOffset||0),weekKey=localDateStr(ws);
    var occ=_weekCache[weekKey];
    if(occ===undefined){loadWeek(ws);return;}         // fetch, then repaint

    var empById={};(S.employees||[]).forEach(function(em){empById[em.id]=em;});
    var activeDays=S.activeDays||[];

    if(_observer)_observer.disconnect();              // don't let our own edits re-trigger us
    try{
      grid.querySelectorAll(".jwg-junk-stack,.jwg-junk-chip").forEach(function(n){n.remove();});
      grid.querySelectorAll("tbody tr.emp-row").forEach(function(row){
        var emp=empById[row.getAttribute("data-empid")];
        var byDay=emp?occ[(emp.name||"").toLowerCase()]:null;
        var cells=row.querySelectorAll("td.day-cell");
        for(var i=0;i<cells.length;i++){
          var cell=cells[i],day=activeDays[i];
          // day off / sick → scheduler wins outright
          if(day&&byDay&&!cell.querySelector(".status-label")){
            var entries=byDay[day];
            if(entries&&entries.length){
              // Per-entry hiding: a real shift only covers ghosts of the SAME kind (e.g. a real
              // Bins shift hides the Bins ghost but leaves an uncovered Junk Removal ghost showing).
              var realLabels=[].map.call(cell.querySelectorAll(".shift-bar:not(.jwg-junk-chip) .shift-label"),function(n){return (n.textContent||"").toLowerCase();});
              var visible=entries.filter(function(en){return !coveredBy(realLabels,en.taskKey);});
              if(visible.length){
                // Chips join the cell's existing stack so real shifts and junk jobs share
                // one layout flow (the compact grid needs a single container to count).
                var host=cell.querySelector(".shift-stack");
                if(!host){
                  host=document.createElement("div");
                  host.className="shift-stack jwg-junk-stack";
                  cell.appendChild(host);
                }
                visible.forEach(function(en){host.appendChild(barEl(en));});
              }
            }
          }
          // 2+ jobs in one day → compact side-by-side cards (see app-jwg-scheduler.css)
          cell.classList.toggle("cell-compact",cell.querySelectorAll(".shift-bar").length>=2);
        }
      });
    }catch(err){console.warn("[jwg-feed] paint failed",err);}
    finally{reobserve();}
  }

  // ── SHIFT-MODAL PRE-FILL ──
  // Wrap the scheduler's exposed openShiftModal: after the modal renders, if the junk feed
  // has uncovered entries for that person+day, show a "From Jeff's Junk" strip and (when
  // there's exactly one) pre-select the matching task + fill the time dropdowns — so it
  // reads as already inputted. Committing still goes through the scheduler's own
  // "Add shift" → its data only; the junk side is never written.
  var _pendingModal=null,_appliedTaskId=null;
  function hookShiftModal(){
    if(!window.JWG||typeof JWG.openShiftModal!=="function"||JWG.openShiftModal._jwgFeedWrapped)return;
    var orig=JWG.openShiftModal;
    var wrapped=function(empId,day){
      orig(empId,day);
      try{prefillModal(empId,day);}catch(e){console.warn("[jwg-feed] prefill failed",e);}
    };
    wrapped._jwgFeedWrapped=true;
    JWG.openShiftModal=wrapped;
  }
  function prefillModal(empId,day){
    _pendingModal=null;_appliedTaskId=null;
    var S=window.JWG&&JWG.S;if(!S)return;
    var occ=_weekCache[localDateStr(getWS(S.weekOffset||0))];if(!occ)return;
    var emp=(S.employees||[]).find(function(e){return e.id===empId;});if(!emp)return;
    var byDay=occ[(emp.name||"").toLowerCase()];
    var entries=(byDay&&byDay[day])||[];if(!entries.length)return;
    var dd=(S.schedule[empId]||{})[day]||{};
    if(dd.status==="dayoff"||dd.status==="sick")return;
    var modal=document.querySelector("#moverlay .modal");if(!modal)return;
    // task id → label map straight from the modal's own picker (works with custom task lists)
    var tmap={};
    [].forEach.call(modal.querySelectorAll(".task-opt"),function(b){tmap[(b.id||"").replace(/^topt_/,"")]=(b.textContent||"").trim().toLowerCase();});
    var labels=[];
    (dd.shifts||[]).forEach(function(sh){
      (sh.tasks||(sh.task?[sh.task]:[])).forEach(function(tid){labels.push(tmap[tid]||String(tid).toLowerCase());});
    });
    var visible=entries.filter(function(en){return !coveredBy(labels,en.taskKey);});
    if(!visible.length)return;
    _pendingModal={entries:visible};
    injectStrip(modal,visible);
    if(visible.length===1)applyGhost(0);
  }
  function injectStrip(modal,entries){
    var old=modal.querySelector("#jwg-feed-strip");if(old)old.remove();
    var strip=document.createElement("div");
    strip.id="jwg-feed-strip";
    strip.setAttribute("style","background:#eff6ff;border:1.5px solid rgba(96,165,250,.45);border-radius:10px;padding:10px 12px;margin:0 0 14px");
    var h='<div style="font-size:11px;font-weight:800;color:#1d4ed8;letter-spacing:.4px;margin-bottom:7px">🚚 FROM JEFF\'S JUNK</div>';
    entries.forEach(function(en,i){
      h+='<button class="jwg-strip-row" onclick="JWGFeed._apply('+i+')" style="display:flex;width:100%;align-items:center;gap:8px;background:#fff;border:1.5px solid rgba(96,165,250,.5);border-radius:8px;padding:8px 10px;margin-bottom:6px;cursor:pointer;font-family:inherit;text-align:left">'
        +'<span style="font-weight:700;font-size:13px;color:#1d4ed8">'+esc(en.label)+(en.count>1?" ×"+en.count:"")+"</span>"
        +(en.time?'<span style="font-size:12px;font-weight:600;color:#1d4ed8;opacity:.75;margin-left:auto">'+esc(en.time)+"</span>":"")
        +"</button>";
    });
    h+='<div style="font-size:11px;color:#1d4ed8;opacity:.7;line-height:1.4">Tap one to fill it in below, then hit “Add shift” to keep it. Nothing changes on the junk side.</div>';
    strip.innerHTML=h;
    // sit right above the "Add a shift" section
    var anchor=null;
    [].forEach.call(modal.querySelectorAll(".sect-label"),function(el){if(!anchor&&/add a shift/i.test(el.textContent||""))anchor=el;});
    if(anchor&&anchor.parentNode)anchor.parentNode.insertBefore(strip,anchor);   // label sits inside a column now
    else modal.appendChild(strip);
  }
  function applyGhost(i){
    var pm=_pendingModal;if(!pm)return;
    var en=pm.entries[i];if(!en)return;
    var modal=document.querySelector("#moverlay .modal");if(!modal)return;
    // time dropdowns run on the same 30-min values our rounding produces (e.g. "8:00","11:30")
    function setSel(id,mins){
      if(mins==null)return;
      var el=modal.querySelector("#"+id);if(!el)return;
      var v=Math.floor(mins/60)+":"+pad(mins%60);
      if([].some.call(el.options,function(o){return o.value===v;}))el.value=v;
    }
    setSel("sm_start",en.startMin);
    setSel("sm_end",en.endMin);
    // highlight the matching task in the picker (direct id, else label keyword)
    var btn=modal.querySelector("#topt_"+en.taskKey);
    if(!btn){
      var keys=FAMILY[en.taskKey]||[];
      [].forEach.call(modal.querySelectorAll(".task-opt"),function(b){
        if(!btn&&keys.some(function(k){return (b.textContent||"").toLowerCase().indexOf(k)>=0;}))btn=b;
      });
    }
    var newId=btn?btn.id.replace(/^topt_/,""):null;
    if(_appliedTaskId&&_appliedTaskId!==newId){
      var prev=modal.querySelector("#topt_"+_appliedTaskId);
      if(prev&&prev.classList.contains("sel"))JWG.pickTask(_appliedTaskId);   // unpick the old one
    }
    if(newId&&!btn.classList.contains("sel"))JWG.pickTask(newId);
    _appliedTaskId=newId;
    [].forEach.call(modal.querySelectorAll(".jwg-strip-row"),function(r,idx){
      r.style.outline=(idx===i)?"2px solid #2563eb":"none";
    });
  }

  function schedulePaint(){
    if(_timer)return;
    _timer=setTimeout(function(){_timer=null;paint();},60);
  }
  function reobserve(){
    var app=document.getElementById("app");
    if(app&&_observer)_observer.observe(app,{childList:true,subtree:true});
  }
  function init(){
    if(_observer)return;
    var app=document.getElementById("app");
    if(!app){setTimeout(init,500);return;}
    _observer=new MutationObserver(schedulePaint);
    _observer.observe(app,{childList:true,subtree:true});
    hookShiftModal();
    schedulePaint();
  }

  window.JWGFeed={init:init,refresh:schedulePaint,_apply:applyGhost};
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();
