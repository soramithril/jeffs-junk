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
    _crewLoading=db.from("crew_members").select("id,name").then(function(res){
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
    function addNonBin(crewId,dateStr,label,time,durMin){
      var nm=_crewName[crewId];
      if(!nm||!inRange(dateStr,s,e))return;
      var day=dayNameOf(dateStr);if(!day)return;
      var sm=parseHHMM(time),timeStr="";
      if(sm!=null)timeStr=(durMin>0)?fmtMins(sm)+"–"+fmtMins(ceil30(sm+durMin)):fmtMins(sm);
      ensure(nm.toLowerCase(),day).push({label:label,time:timeStr,count:1,detail:""});
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
        (j.assigned_crew_ids||[]).forEach(function(cid){addNonBin(cid,j.date,svcLabel(j.service),j.time,j.est_duration_min);});
      }
    });
    // Fold each person/day's bins into a single chip: count + estimated window.
    // Window start = earliest real time set that day, else 8:00am; end = start + summed estimate.
    Object.keys(bins).forEach(function(key){
      Object.keys(bins[key]).forEach(function(day){
        var a=bins[key][day],n=a.drop+a.pick,parts=[];
        if(a.drop)parts.push(a.drop+" drop-off"+(a.drop>1?"s":""));
        if(a.pick)parts.push(a.pick+" pick-up"+(a.pick>1?"s":""));
        var rs=(a.anchor!=null)?a.anchor:480,time="";                 // start: real time set, else 8:00am
        if(a.est>0)time=fmtMins(floor30(rs))+"–"+fmtMins(ceil30(rs+a.est));   // snap to 30-min blocks
        else if(a.anchor!=null)time=fmtMins(floor30(rs));
        ensure(key,day).push({label:"Bins",time:time,count:n,detail:parts.join(" · ")});
      });
    });
    return occ;
  }

  function loadWeek(ws){
    var weekKey=localDateStr(ws);
    if(_loading[weekKey])return;
    _loading[weekKey]=true;
    var s=localDateStr(ws),e=localDateStr(addDays(ws,6));
    var cols="service,date,time,est_duration_min,assigned_crew_ids,dropoff_crew_id,pickup_crew_id,bin_dropoff,bin_dropoff_time,bin_pickup,bin_pickup_time,status,city";
    ensureCrew().then(ensureCityTimes).then(function(){
      return db.from("jobs").select(cols)
        .or("and(date.gte."+s+",date.lte."+e+"),and(bin_dropoff.gte."+s+",bin_dropoff.lte."+e+"),and(bin_pickup.gte."+s+",bin_pickup.lte."+e+")");
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
  function chipEl(entries){
    var stack=document.createElement("div");
    stack.className="shift-stack jwg-junk-stack";
    entries.forEach(function(en){
      var bar=document.createElement("div");
      bar.className="shift-bar shift-bar-flow jwg-junk-chip";
      bar.setAttribute("style","background:#dbeafe;color:#1d4ed8;border:1.5px solid #60a5fa66");
      bar.title="From Jeff's Junk — tap to put it on the schedule"+(en.detail?" ("+en.detail+")":"");
      var lbl="🚚 "+esc(en.label)+(en.count>1?" ×"+en.count:"");
      bar.innerHTML='<span class="shift-label">'+lbl+"</span>"+(en.time?'<span class="shift-times">'+esc(en.time)+"</span>":"");
      stack.appendChild(bar);
    });
    return stack;
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
      grid.querySelectorAll(".jwg-junk-stack").forEach(function(n){n.remove();});
      grid.querySelectorAll("tbody tr.emp-row").forEach(function(row){
        var emp=empById[row.getAttribute("data-empid")];if(!emp)return;
        var byDay=occ[(emp.name||"").toLowerCase()];if(!byDay)return;
        var cells=row.querySelectorAll("td.day-cell");
        for(var i=0;i<cells.length;i++){
          var day=activeDays[i];if(!day)continue;
          var entries=byDay[day];if(!entries||!entries.length)continue;
          var cell=cells[i];
          if(cell.querySelector(".shift-bar, .status-label"))continue;   // scheduler already booked → leave it
          cell.appendChild(chipEl(entries));
        }
      });
    }catch(err){console.warn("[jwg-feed] paint failed",err);}
    finally{reobserve();}
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
    schedulePaint();
  }

  window.JWGFeed={init:init,refresh:schedulePaint};
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();
