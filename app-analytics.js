// ─── ANALYTICS ───
// Depends on app.js globals: db, jobs, binItems, analyticsPeriod, extractCity,
// makeBarChart, animateBars, animCount, initReportSection, atabsSync.
// Loaded via its own script tag before app.js.
//
// Data model (v522): one slim fetch of EVERY job cached for the session in
// _anaAll. All periods/charts slice that cache in memory, so switching periods
// is instant and costs zero extra egress. Total jobs and all charts exclude
// Cancelled jobs and Junk Quotes; both are surfaced separately in the hero.
//
// Counting day (v523, Jake's rule): a job counts on the day the WORK happens,
// not the day it was booked. For bin rentals that's bin_dropoff (the written
// `date` is usually just the day the order was taken); junk and furniture
// already carry their service day in `date`, verified against the DB. The
// work date is computed once at load into each row's `date`, so every chart
// downstream shares one meaning.

var _anaAll = null;          // slim rows for every job on record
var _anaAllPromise = null;   // in-flight fetch guard
var _anaFirstSeen = null;    // client_cid -> earliest job date (YYYY-MM-DD)
var _anaDayRecord = null;    // all-time busiest day {date,count}
var _anaInitDone = false;

// Service display config — colors follow the app-wide service tokens
// (junk yellow, furniture purple/orange). Bins stay in the green family.
var ANA_SVC = [
  {key:'Bin Rental',        label:'Bin Rentals',        color:'var(--green-b2)'},
  {key:'Junk Removal',      label:'Junk Removal',       color:'var(--c-junk)'},
  {key:'Furniture Pickup',  label:'Furniture Pickups',  color:'var(--c-furn)'},
  {key:'Furniture Delivery',label:'Furniture Deliveries',color:'var(--c-furn-del)'}
];

function anaEsc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function anaFmtInt(n){ return (n||0).toLocaleString('en-US'); }
function anaYmd(d){ return d.getFullYear()+'-'+(d.getMonth()<9?'0':'')+(d.getMonth()+1)+'-'+(d.getDate()<10?'0':'')+d.getDate(); }
// Parse YYYY-MM-DD as a LOCAL date (new Date('YYYY-MM-DD') is UTC and shifts the day)
function anaParseYmd(s){ var p=s.split('-'); return new Date(parseInt(p[0]),parseInt(p[1])-1,parseInt(p[2])); }

// ── Data layer ────────────────────────────────────────────────
function anaLoadAll(){
  if(_anaAll) return Promise.resolve(_anaAll);
  if(_anaAllPromise) return _anaAllPromise;
  _anaAllPromise = (async function(){
    var rows=[], from=0, pageSize=1000;
    while(true){
      var r = await db.from('jobs')
        .select('service,status,city,address,date,bin_dropoff,referral,bin_size,client_cid')
        .order('date',{ascending:true})
        .order('id',{ascending:true})   // unique tiebreaker — keeps paging stable when many jobs share a date
        .range(from, from+pageSize-1);
      if(r.error) throw new Error('Analytics load failed: '+r.error.message);
      if(!r.data || !r.data.length) break;
      r.data.forEach(function(row){
        rows.push({service:row.service||'', status:row.status||'',
          city:row.city||'', address:row.address||'',
          date:(row.service==='Bin Rental'&&row.bin_dropoff)?row.bin_dropoff:(row.date||''),
          referral:row.referral||'', binSize:row.bin_size||'', cid:row.client_cid||''});
      });
      if(r.data.length<pageSize) break;
      from += pageSize;
    }
    // First-ever REAL job date per client (drives New vs Returning) — a quote or
    // a cancelled booking doesn't make someone a past customer
    var seen={};
    rows.forEach(function(j){
      if(!j.cid || !j.date || !anaIsWork(j)) return;
      if(!seen[j.cid] || j.date<seen[j.cid]) seen[j.cid]=j.date;
    });
    _anaFirstSeen = seen;
    // All-time busiest day (real work only)
    var perDay={}, rec={date:'',count:0};
    rows.forEach(function(j){
      if(!j.date || !anaIsWork(j)) return;
      perDay[j.date]=(perDay[j.date]||0)+1;
      if(perDay[j.date]>rec.count){ rec={date:j.date,count:perDay[j.date]}; }
    });
    _anaDayRecord = rec;
    _anaAll = rows;
    return rows;
  })().catch(function(e){
    _anaAllPromise = null;   // a failed load must not brick the page — next render retries
    throw e;
  });
  return _anaAllPromise;
}
// "Real work": not cancelled, not a quote
function anaIsWork(j){ return j.status!=='Cancelled' && j.service!=='Junk Quote'; }
function anaSlice(start,end){
  var s=start?anaYmd(start):null, e=end?anaYmd(end):null;
  return _anaAll.filter(function(j){
    if(!j.date) return false;
    if(s && j.date<s) return false;
    if(e && j.date>e) return false;
    return true;
  });
}

// ── Period selection ──────────────────────────────────────────
function setAnalyticsPeriod(p, el){
  // Active-class flip + atabsSync are owned by app.js's _patchAtabs wrapper,
  // which runs around this function for every atab group — don't duplicate here.
  analyticsPeriod = p;
  var wk=document.getElementById('an-week-pickers'),mo=document.getElementById('an-month-pickers'),yr=document.getElementById('an-year-pickers');
  if(wk) wk.style.display=p==='week'?'flex':'none';
  if(mo) mo.style.display=p==='month'?'flex':'none';
  if(yr) yr.style.display=p==='year'?'flex':'none';
  var alln=document.getElementById('an-all-note'); if(alln) alln.style.display=p==='all'?'block':'none';
  var steps=document.getElementById('an-steppers'); if(steps) steps.style.display=p==='all'?'none':'flex';
  // Custom comparison is opt-in — fully reset it (values too, or a hidden stale
  // B picker would silently keep custom-compare mode on) whenever the period changes
  document.querySelectorAll('.an-compare-group').forEach(function(g){g.style.display='none';});
  document.querySelectorAll('.an-compare-btn').forEach(function(b){b.style.display=p==='all'?'none':'';});
  ['an-week-b','an-month-b','an-year-b'].forEach(function(id){ var e=document.getElementById(id); if(e) e.value=''; });
  var now=new Date();
  if(p==='week'){
    var wa=document.getElementById('an-week-a'); if(wa&&!wa.value) wa.value=toWeekValue(now);
  }
  if(p==='month'){
    var ma=document.getElementById('an-month-a'); if(ma&&!ma.value) ma.value=now.getFullYear()+'-'+(now.getMonth()<9?'0':'')+(now.getMonth()+1);
  }
  if(p==='year'){populateYearSelects();var ya=document.getElementById('an-year-a');if(ya&&!ya.value)ya.value=now.getFullYear();}
  renderAnalytics();
}
// Step the shown period back/forward one week / month / year
function anaStep(dir){
  var now=new Date();
  if(analyticsPeriod==='week'){
    var wa=document.getElementById('an-week-a'); if(!wa) return;
    var cur=wa.value?weekValueToDates(wa.value).start:now;
    var next=new Date(cur); next.setDate(next.getDate()+dir*7);
    wa.value=toWeekValue(next);
  } else if(analyticsPeriod==='month'){
    var ma=document.getElementById('an-month-a'); if(!ma) return;
    var y=now.getFullYear(), m=now.getMonth();
    if(ma.value){ var p=ma.value.split('-'); y=parseInt(p[0]); m=parseInt(p[1])-1; }
    var d=new Date(y,m+dir,1);
    ma.value=d.getFullYear()+'-'+(d.getMonth()<9?'0':'')+(d.getMonth()+1);
  } else if(analyticsPeriod==='year'){
    var ya=document.getElementById('an-year-a'); if(!ya) return;
    var target=String(parseInt(ya.value||now.getFullYear())+dir);
    var has=false;
    for(var i=0;i<ya.options.length;i++){ if(ya.options[i].value===target) has=true; }
    if(!has) return; // no data that far — stay put
    ya.value=target;
  } else { return; }
  renderAnalytics();
}
// Reveal the opt-in "Compare to" picker and pre-fill it so a comparison shows immediately
function analyticsToggleCompare(){
  document.querySelectorAll('.an-compare-group').forEach(function(g){g.style.display='flex';});
  document.querySelectorAll('.an-compare-btn').forEach(function(b){b.style.display='none';});
  var now=new Date();
  if(analyticsPeriod==='week'){var wb=document.getElementById('an-week-b');if(wb&&!wb.value){var pv=new Date(now);pv.setDate(pv.getDate()-7);wb.value=toWeekValue(pv);}}
  else if(analyticsPeriod==='month'){var mb=document.getElementById('an-month-b');if(mb&&!mb.value){var pm=new Date(now.getFullYear(),now.getMonth()-1,1);mb.value=pm.getFullYear()+'-'+(pm.getMonth()<9?'0':'')+(pm.getMonth()+1);}}
  else if(analyticsPeriod==='year'){var yb=document.getElementById('an-year-b');if(yb&&!yb.value)yb.value=now.getFullYear()-1;}
  renderAnalytics();
}
function toWeekValue(d){
  // Proper ISO-8601 week number — no W52 clamp (some years, incl. 2026, have 53 weeks,
  // and the period stepper would get stuck at year end with a clamp)
  var t=new Date(d.getFullYear(),d.getMonth(),d.getDate());
  t.setDate(t.getDate()-((t.getDay()+6)%7)+3);           // Thursday of this week → owns the ISO year
  var isoYear=t.getFullYear();
  var jan4=new Date(isoYear,0,4);
  var week1Mon=new Date(isoYear,0,4-((jan4.getDay()+6)%7));
  var wn=1+Math.round((t-week1Mon)/(7*86400000));
  return isoYear+'-W'+(wn<10?'0':'')+wn;
}
function weekValueToDates(wv){
  if(!wv)return null;
  var p=wv.split('-W'),y=parseInt(p[0]),w=parseInt(p[1]);
  var jan4=new Date(y,0,4),d1=new Date(jan4);
  d1.setDate(jan4.getDate()-((jan4.getDay()||7)-1)+(w-1)*7);d1.setHours(0,0,0,0);
  var d7=new Date(d1);d7.setDate(d1.getDate()+6);d7.setHours(23,59,59,999);
  return{start:d1,end:d7};
}
function monthValueToDates(mv){
  if(!mv)return null;
  var p=mv.split('-'),y=parseInt(p[0]),m=parseInt(p[1])-1;
  return{start:new Date(y,m,1,0,0,0,0),end:new Date(y,m+1,0,23,59,59,999)};
}
function populateYearSelects(){
  // Only the full cache is a valid source — renderAnalytics re-invokes this once it's loaded
  if(!_anaAll) return;
  var years=[],now=new Date().getFullYear();
  _anaAll.forEach(function(j){ if(!j.date)return; var y=parseInt(j.date.slice(0,4)); if(y&&years.indexOf(y)<0)years.push(y); });
  if(years.indexOf(now)<0)years.push(now);
  years.sort(function(a,b){return b-a;});
  ['an-year-a','an-year-b'].forEach(function(id){
    var sel=document.getElementById(id);if(!sel)return;
    var cur=sel.value;
    sel.innerHTML=(id==='an-year-b'?'<option value="">— None —</option>':'')+years.map(function(y){return'<option value="'+y+'">'+y+'</option>';}).join('');
    if(cur)sel.value=cur;
  });
}
function clearCompareB(){
  var e;
  if(analyticsPeriod==='week'){e=document.getElementById('an-week-b');if(e)e.value='';}
  if(analyticsPeriod==='month'){e=document.getElementById('an-month-b');if(e)e.value='';}
  if(analyticsPeriod==='year'){e=document.getElementById('an-year-b');if(e)e.value='';}
  document.querySelectorAll('.an-compare-group').forEach(function(g){g.style.display='none';});
  document.querySelectorAll('.an-compare-btn').forEach(function(b){b.style.display='';});
  renderAnalytics();
}
// Returns {a, b, custom}. b is the CUSTOM pick when set, otherwise the
// auto previous equivalent period (previous week / month / year). All Time has no b.
function getAnalyticsDates(){
  var now=new Date();
  var fmtW=function(d){return'Week of '+d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});};
  var fmtM=function(d){return d.toLocaleDateString('en-US',{month:'long',year:'numeric'});};
  if(analyticsPeriod==='week'){
    var wa=document.getElementById('an-week-a'),wb=document.getElementById('an-week-b');
    var da=wa&&wa.value?weekValueToDates(wa.value):weekValueToDates(toWeekValue(now));
    if(wb&&wb.value){
      var dbx=weekValueToDates(wb.value);
      return{a:{start:da.start,end:da.end,label:fmtW(da.start)},b:{start:dbx.start,end:dbx.end,label:fmtW(dbx.start)},custom:true};
    }
    var pw=new Date(da.start); pw.setDate(pw.getDate()-7);
    var pwe=new Date(da.start); pwe.setMilliseconds(-1);
    return{a:{start:da.start,end:da.end,label:fmtW(da.start)},b:{start:pw,end:pwe,label:'previous week'},custom:false};
  }
  if(analyticsPeriod==='month'){
    var ma=document.getElementById('an-month-a'),mb=document.getElementById('an-month-b');
    var dma=ma&&ma.value?monthValueToDates(ma.value):{start:new Date(now.getFullYear(),now.getMonth(),1),end:new Date(now.getFullYear(),now.getMonth()+1,0,23,59,59)};
    if(mb&&mb.value){
      var dmb=monthValueToDates(mb.value);
      return{a:{start:dma.start,end:dma.end,label:fmtM(dma.start)},b:{start:dmb.start,end:dmb.end,label:fmtM(dmb.start)},custom:true};
    }
    var pm=new Date(dma.start.getFullYear(),dma.start.getMonth()-1,1);
    var pme=new Date(dma.start.getFullYear(),dma.start.getMonth(),0,23,59,59,999);
    return{a:{start:dma.start,end:dma.end,label:fmtM(dma.start)},b:{start:pm,end:pme,label:fmtM(pm)},custom:false};
  }
  if(analyticsPeriod==='year'){
    var ya=document.getElementById('an-year-a'),yb=document.getElementById('an-year-b');
    var yav=ya&&ya.value?parseInt(ya.value):now.getFullYear();
    if(yb&&yb.value){
      var ybv=parseInt(yb.value);
      return{a:{start:new Date(yav,0,1),end:new Date(yav,11,31,23,59,59),label:String(yav)},b:{start:new Date(ybv,0,1),end:new Date(ybv,11,31,23,59,59),label:String(ybv)},custom:true};
    }
    return{a:{start:new Date(yav,0,1),end:new Date(yav,11,31,23,59,59),label:String(yav)},b:{start:new Date(yav-1,0,1),end:new Date(yav-1,11,31,23,59,59),label:String(yav-1)},custom:false};
  }
  return{a:{start:null,end:null,label:'All Time'},b:null,custom:false};
}

// ── YoY tracker (this month vs same month last year) ─────────
// Sliced from the one cached fetch — no extra queries.
async function renderYoyTracker(){
  var wrap=document.getElementById('yoy-tracker');
  if(!wrap)return;
  await anaLoadAll();
  var now=new Date();
  var y=now.getFullYear(), m=now.getMonth(), dom=now.getDate();
  // Same-days pacing (v556, Jake's ask — like the TV board): Aug 1–14 this year
  // vs Aug 1–14 LAST year. It used to race a half-finished month against the
  // full month last year (and the current side even counted work scheduled for
  // later in the month), so it always read as "behind" mid-month.
  var thisJobs=anaSlice(new Date(y,m,1),new Date(y,m,dom,23,59,59)).filter(anaIsWork);
  var lastJobs=anaSlice(new Date(y-1,m,1),new Date(y-1,m,dom,23,59,59)).filter(anaIsWork);
  var windowLbl=now.toLocaleString('default',{month:'short'})+' 1–'+dom;

  function count(arr,svc){return arr.filter(function(j){return j.service===svc;}).length;}
  var services=[
    {key:'Bin Rental',label:'Bins',icon:'🚛',color:'var(--accent)'},
    {key:'Junk Removal',label:'Junk',icon:'🗑️',color:'var(--c-junk)'},
    {key:'Furniture Pickup',label:'Furniture Pickups',icon:'🛋️',color:'var(--c-furn)'}
  ];

  wrap.innerHTML=services.map(function(s){
    var cur=count(thisJobs,s.key);
    var target=count(lastJobs,s.key);
    var pct=target>0?Math.min(Math.round(cur/target*100),100):((cur>0)?100:0);
    var beat=cur>=target&&target>0;
    var diff=cur-target;
    var diffLabel=target===0?(cur>0?cur+' booked':'No data last year'):(diff>=0?'<span style="color:var(--accent);font-weight:700">+'+diff+' ahead</span>':'<span style="color:var(--red);font-weight:700">'+Math.abs(diff)+' to go</span>');
    var barColor=beat?'var(--accent)':s.color;
    return '<div class="yoy-card">'
      +'<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">'
        +'<span style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px">'+s.icon+' '+s.label+'</span>'
        +(beat?'<span style="font-size:10px;background:rgba(34,197,94,.15);color:var(--accent);border-radius:4px;padding:1px 6px;font-weight:700">BEAT!</span>':'')
      +'</div>'
      +'<div style="display:flex;align-items:baseline;gap:4px;margin-bottom:4px">'
        +'<span style="font-family:Bebas Neue,sans-serif;font-size:26px;color:var(--text);line-height:1">'+cur+'</span>'
        +'<span style="font-size:12px;color:var(--muted)">/ '+target+'</span>'
        +'<span style="font-size:10px;color:var(--muted)">'+windowLbl+' last yr</span>'
      +'</div>'
      +'<div style="height:6px;background:var(--surface2);border-radius:3px;overflow:hidden;margin-bottom:4px">'
        +'<div style="height:100%;width:'+pct+'%;background:'+barColor+';border-radius:3px;transition:width .6s ease"></div>'
      +'</div>'
      +'<div style="font-size:11px">'+diffLabel+'</div>'
    +'</div>';
  }).join('');
}

// ── Skeleton while the one-time fetch runs ───────────────────
function anaShowSkeleton(){
  var hero=document.getElementById('ana-hero');
  if(hero) hero.innerHTML=
    '<div style="flex:1"><div class="ana-skel" style="height:64px;width:180px;margin-bottom:10px"></div>'
    +'<div class="ana-skel" style="height:14px;width:260px"></div></div>'
    +'<div style="flex:2;display:flex;gap:10px;flex-wrap:wrap">'
    +'<div class="ana-skel" style="height:74px;flex:1;min-width:120px"></div>'
    +'<div class="ana-skel" style="height:74px;flex:1;min-width:120px"></div>'
    +'<div class="ana-skel" style="height:74px;flex:1;min-width:120px"></div>'
    +'<div class="ana-skel" style="height:74px;flex:1;min-width:120px"></div></div>';
  ['chart-time','chart-busiest-a','ana-records','ana-customers','chart-bin-size','chart-city','chart-referral','chart-service-mix','chart-bin-turnover'].forEach(function(id){
    var el=document.getElementById(id);
    if(el) el.innerHTML='<div class="ana-skel" style="height:120px"></div>';
  });
}

// ── Main render ──────────────────────────────────────────────
async function renderAnalytics(){
  var dates=getAnalyticsDates();
  if(!_anaAll) anaShowSkeleton();
  try{ await anaLoadAll(); }
  catch(e){
    var hero=document.getElementById('ana-hero');
    if(hero) hero.innerHTML='<div style="color:var(--red);font-size:13px;font-weight:600">Couldn\'t load analytics data — '+anaEsc(e.message)+'. Check your connection and reopen this page.</div>';
    return;
  }
  populateYearSelects();
  var aJobs=dates.a.start?anaSlice(dates.a.start,dates.a.end):_anaAll.filter(function(j){return !!j.date;});
  var bJobs=dates.b?anaSlice(dates.b.start,dates.b.end):[];
  _renderAnalyticsWithJobs(dates,aJobs,bJobs);
}

function anaDeltaChip(curr,prev,hasB){
  if(!hasB) return '';
  if(prev===0) return curr===0?'<span class="ana-delta ana-delta-flat">—</span>':'<span class="ana-delta ana-delta-up">▲ new</span>';
  var pct=Math.round((curr-prev)/prev*100);
  if(pct===0) return '<span class="ana-delta ana-delta-flat">±0%</span>';
  var up=pct>0;
  return '<span class="ana-delta '+(up?'ana-delta-up':'ana-delta-down')+'">'+(up?'▲':'▼')+' '+(up?'+':'')+pct+'%</span>';
}

// Bucket a job set by the granularity that fits the period:
// week → 7 days · month → each day · year → 12 months · all → each year
function anaBuckets(jobSet,dates){
  var labels=[],keys=[],titles=[];
  var mkIdx={};
  if(analyticsPeriod==='week'||analyticsPeriod==='month'){
    var d=new Date(dates.a.start), end=dates.a.end;
    var dayShort=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    while(d<=end){
      var k=anaYmd(d);
      mkIdx[k]=keys.length; keys.push(k);
      labels.push(analyticsPeriod==='week'?dayShort[d.getDay()]+' '+d.getDate():String(d.getDate()));
      titles.push(d.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'}));
      d.setDate(d.getDate()+1);
    }
  } else if(analyticsPeriod==='year'){
    var yr=dates.a.start.getFullYear();
    for(var m=0;m<12;m++){
      var k2=yr+'-'+(m<9?'0':'')+(m+1);
      mkIdx[k2]=keys.length; keys.push(k2);
      labels.push(new Date(yr,m,1).toLocaleDateString('en-US',{month:'short'}));
      titles.push(new Date(yr,m,1).toLocaleDateString('en-US',{month:'long',year:'numeric'}));
    }
  } else {
    var years=[];
    jobSet.forEach(function(j){ if(j.date){ var y=j.date.slice(0,4); if(years.indexOf(y)<0)years.push(y); } });
    years.sort();
    years.forEach(function(y){ mkIdx[y]=keys.length; keys.push(y); labels.push(y); titles.push(y); });
  }
  var n=keys.length;
  var series={}; ANA_SVC.forEach(function(s){ series[s.key]=new Array(n).fill(0); });
  var other=new Array(n).fill(0), totals=new Array(n).fill(0);
  jobSet.forEach(function(j){
    if(!j.date || !anaIsWork(j)) return;
    var k = analyticsPeriod==='year' ? j.date.slice(0,7)
          : analyticsPeriod==='all'  ? j.date.slice(0,4)
          : j.date;
    var i=mkIdx[k]; if(i===undefined) return;
    if(series[j.service]!==undefined) series[j.service][i]++;
    else other[i]++;
    totals[i]++;
  });
  return {labels:labels,titles:titles,series:series,other:other,totals:totals,n:n};
}

function anaSparkline(totals,color,h){
  var n=totals.length;
  if(n<2) return '';
  var stroke=color||'var(--accent)';
  var fill=color?'color-mix(in srgb, '+color+' 12%, transparent)':'rgba(22,163,74,.10)';
  var max=Math.max.apply(null,totals)||1;
  var W=100,H=34;
  var pts=totals.map(function(v,i){
    var x=(i/(n-1))*W, y=H-2-((v/max)*(H-6));
    return x.toFixed(2)+','+y.toFixed(2);
  });
  return '<svg class="ana-spark"'+(h?' style="height:'+h+'px"':'')+' viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="none">'
    +'<polygon points="0,'+H+' '+pts.join(' ')+' '+W+','+H+'" fill="'+fill+'"></polygon>'
    +'<polyline points="'+pts.join(' ')+'" fill="none" stroke="'+stroke+'" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round"></polyline>'
    +'</svg>';
}

function _renderAnalyticsWithJobs(dates,aJobs,bJobs){
  var hasB=!!dates.b;
  var aWork=aJobs.filter(anaIsWork);
  var bWork=bJobs.filter(anaIsWork);
  var aCancelled=aJobs.filter(function(j){return j.status==='Cancelled';}).length;
  var aQuotes=aJobs.filter(function(j){return j.service==='Junk Quote';}).length;
  var buckets=anaBuckets(aJobs,dates);

  // ── Hero ──
  var hero=document.getElementById('ana-hero');
  if(hero){
    var today=new Date(); today.setHours(0,0,0,0);
    var paceHtml='';
    if(analyticsPeriod!=='all' && dates.a.start && today>=dates.a.start && today<dates.a.end){
      // A live period always holds future scheduled work now that jobs count on
      // their work day — so show the real split, not a per-day projection.
      // Math.round absorbs both the 23:59:59 period end and the ±1h DST offset
      var elapsed=Math.round((today-dates.a.start)/86400000)+1;
      var total=Math.round((dates.a.end-dates.a.start)/86400000);
      var todayS=anaYmd(today);
      var doneN=aWork.filter(function(j){return j.date<=todayS;}).length;
      var aheadN=aWork.length-doneN;
      paceHtml='<div class="ana-pace">⏱ Day '+elapsed+' of '+total+' — '+anaFmtInt(doneN)+' done so far · '+anaFmtInt(aheadN)+' scheduled ahead</div>';
    }
    var subBits=[];
    if(hasB) subBits.push('vs '+dates.b.label+': '+anaFmtInt(bWork.length)+' jobs');
    if(aQuotes) subBits.push(anaFmtInt(aQuotes)+' junk quote'+(aQuotes!==1?'s':''));
    if(aCancelled) subBits.push(anaFmtInt(aCancelled)+' cancelled (not counted)');
    var granLbl = analyticsPeriod==='week'||analyticsPeriod==='month' ? 'Jobs per day'
                : analyticsPeriod==='year' ? 'Jobs per month' : 'Jobs per year';
    hero.innerHTML=
      '<div class="ana-hero-main">'
        +'<div class="ana-hero-kicker">'+anaEsc(dates.a.label)+'</div>'
        +'<div style="display:flex;align-items:baseline;gap:10px;flex-wrap:wrap">'
          +'<div class="ana-hero-num" id="ana-hero-num">0</div>'
          +anaDeltaChip(aWork.length,bWork.length,hasB)
        +'</div>'
        +'<div class="ana-hero-lbl">Jobs on the schedule — counted on the day the work happens</div>'
        +(subBits.length?'<div class="ana-note" style="margin-top:6px">'+subBits.join(' · ')+'</div>':'')
        +paceHtml
      +'</div>'
      +'<div class="ana-hero-side">'
        +'<div class="ana-chips">'
        +ANA_SVC.map(function(s){
          var c=aWork.filter(function(j){return j.service===s.key;}).length;
          var pc=bWork.filter(function(j){return j.service===s.key;}).length;
          var svcSpark=anaSparkline(buckets.series[s.key],s.color,20);
          return '<div class="ana-chip">'
            +'<div class="ana-chip-top"><span class="ana-chip-dot" style="background:'+s.color+'"></span><span class="ana-chip-lbl">'+s.label+'</span></div>'
            +'<div class="ana-chip-row"><span class="ana-chip-val" data-count="'+c+'">'+anaFmtInt(c)+'</span>'+anaDeltaChip(c,pc,hasB)+'</div>'
            +(hasB?'<div class="ana-chip-prev">prev '+anaFmtInt(pc)+'</div>':'')
            +(svcSpark?'<div class="ana-chip-spark">'+svcSpark+'</div>':'')
          +'</div>';
        }).join('')
        +'</div>'
        +'<div class="ana-spark-wrap">'+anaSparkline(buckets.totals)+'<div class="ana-note">'+granLbl+' — '+anaEsc(dates.a.label)+'</div></div>'
      +'</div>';
    // v546: motion layer counts with commas + a landing pulse, and the service
    // chips tick up too. animCount stays as the path for stale-HTML users.
    requestAnimationFrame(function(){
      var hn=document.getElementById('ana-hero-num');
      if(window.JJMotion && JJMotion.countUp){
        JJMotion.countUp(hn, aWork.length, 1.3);
        Array.prototype.forEach.call(hero.querySelectorAll('.ana-chip-val[data-count]'), function(cv){
          JJMotion.countUp(cv, parseInt(cv.getAttribute('data-count'),10)||0, 0.9);
        });
      } else animCount(hn, aWork.length);
    });
  }

  // ── Jobs over time (period-aware stacked bars) ──
  var chartEl=document.getElementById('chart-time'),labelsEl=document.getElementById('chart-time-labels');
  if(chartEl){
    var sub=document.getElementById('chart-time-sub');
    if(sub) sub.textContent = (analyticsPeriod==='week'||analyticsPeriod==='month'?'Daily':analyticsPeriod==='year'?'Monthly':'Yearly')
      +' job volume — '+dates.a.label;
    var maxT=Math.max.apply(null,buckets.totals)||1;
    var many=buckets.n>16;
    var segCfg=[
      {key:'Bin Rental',color:'var(--green-b2)'},
      {key:'Junk Removal',color:'var(--c-junk)'},
      {key:'Furniture Pickup',color:'var(--c-furn)'},
      {key:'Furniture Delivery',color:'var(--c-furn-del)'}
    ];
    chartEl.innerHTML=buckets.totals.map(function(tot,i){
      var stack=segCfg.map(function(s){
        var cnt=buckets.series[s.key][i];
        if(!cnt) return '';
        var h=Math.round(cnt/maxT*110);
        return '<div class="vbar-seg" data-h="'+h+'" style="background:'+s.color+'" title="'+anaEsc(buckets.titles[i])+': '+cnt+' '+anaEsc(s.key)+'">'+(!many&&h>=14?'<span>'+cnt+'</span>':'')+'</div>';
      }).reverse().join('');
      var oth=buckets.other[i];
      if(oth){ var oh=Math.round(oth/maxT*110); stack='<div class="vbar-seg" data-h="'+oh+'" style="background:#94a3b8" title="'+anaEsc(buckets.titles[i])+': '+oth+' other">'+(!many&&oh>=14?'<span>'+oth+'</span>':'')+'</div>'+stack; }
      return '<div class="vbar-col" title="'+anaEsc(buckets.titles[i])+': '+tot+' job'+(tot!==1?'s':'')+'">'
        +'<div class="vbar-total">'+(!many&&tot>0?tot:'')+'</div>'
        +'<div class="vbar-stack">'+stack+(tot===0?'<div class="vbar-zero"></div>':'')+'</div>'
      +'</div>';
    }).join('');
    labelsEl.innerHTML=buckets.labels.map(function(l,i){
      var show=!many || i%5===0 || i===buckets.n-1;
      return '<div class="vbar-lbl">'+(show?l:'')+'</div>';
    }).join('');
    var legend=document.getElementById('chart-time-legend');
    if(legend) legend.innerHTML=segCfg.map(function(s){
      return '<span class="ana-legend-item"><span class="ana-chip-dot" style="background:'+s.color+'"></span>'+s.key+'</span>';
    }).join('');
    requestAnimationFrame(function(){
      chartEl.querySelectorAll('.vbar-seg').forEach(function(seg){
        var h=seg.getAttribute('data-h');
        setTimeout(function(){seg.style.height=h+'px';},10);
      });
    });
  }

  // ── Busiest days ──
  var dayNames=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  var dayShort=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  function buildDayChart(jobSet,color){
    var counts=[0,0,0,0,0,0,0];
    jobSet.forEach(function(j){
      if(!j.date||!anaIsWork(j))return;
      counts[anaParseYmd(j.date).getDay()]++;
    });
    var maxC=Math.max.apply(null,counts);
    var bIdx=counts.indexOf(maxC);
    var data=dayShort.map(function(n,i){return{key:n,val:counts[i]};});
    return{html:makeBarChart(data,function(k,i){return (maxC>0&&i===bIdx)?color:'color-mix(in srgb, '+color+' 22%, transparent)';}),
      insight:maxC>0?'🏆 Busiest: <strong>'+dayNames[bIdx]+'</strong> ('+maxC+' jobs)':'No jobs in this period',
      busiestDay:maxC>0?dayNames[bIdx]:null};
  }
  var cA=buildDayChart(aJobs,'var(--accent)');
  var aLbl=document.getElementById('busiest-a-lbl');
  if(aLbl) aLbl.innerHTML='<span style="color:var(--accent)">● '+anaEsc(dates.a.label)+'</span>';
  document.getElementById('chart-busiest-a').innerHTML=cA.html;
  document.getElementById('busiest-insight-a').innerHTML=cA.insight;
  var bCol=document.getElementById('busiest-b-col');
  var bGrid=document.getElementById('busiest-grid');
  if(dates.custom&&bJobs.length>0){
    var cB=buildDayChart(bJobs,'#e67e22');
    bCol.style.display='block';
    bGrid.style.gridTemplateColumns='1fr 1fr';
    document.getElementById('busiest-b-lbl').innerHTML='<span style="color:#e67e22">● '+anaEsc(dates.b.label)+'</span>';
    document.getElementById('chart-busiest-b').innerHTML=cB.html;
    document.getElementById('busiest-insight-b').innerHTML=cB.insight
      +(cA.busiestDay&&cB.busiestDay?(cA.busiestDay!==cB.busiestDay?'<br><span style="color:#e67e22">Shift: '+cB.busiestDay+' → '+cA.busiestDay+'</span>':' · same day'):'');
    requestAnimationFrame(function(){animateBars(document.getElementById('chart-busiest-b'));});
  } else {
    bCol.style.display='none';
    bGrid.style.gridTemplateColumns='1fr';
  }

  // ── Records ──
  var recEl=document.getElementById('ana-records');
  if(recEl){
    var perDay={},best={date:'',count:0};
    aWork.forEach(function(j){
      if(!j.date)return;
      perDay[j.date]=(perDay[j.date]||0)+1;
      if(perDay[j.date]>best.count) best={date:j.date,count:perDay[j.date]};
    });
    var cityCount={},topCity='—',topCityN=0;
    aWork.forEach(function(j){
      var c=extractCity(j.address,j.city);
      if(c==='Unknown')return;
      cityCount[c]=(cityCount[c]||0)+1;
      if(cityCount[c]>topCityN){topCity=c;topCityN=cityCount[c];}
    });
    function recRow(icon,lbl,val,sub){
      return '<div class="ana-rec-row"><span class="ana-rec-icon">'+icon+'</span>'
        +'<div class="ana-rec-body"><div class="ana-rec-lbl">'+lbl+'</div><div class="ana-rec-val">'+val+'</div>'
        +(sub?'<div class="ana-note">'+sub+'</div>':'')+'</div></div>';
    }
    var bestStr=best.date?anaParseYmd(best.date).toLocaleDateString('en-US',{weekday:'long',month:'short',day:'numeric',year:'numeric'})+' — <strong>'+best.count+' jobs</strong>':'No jobs in this period';
    var recStr=_anaDayRecord&&_anaDayRecord.date?anaParseYmd(_anaDayRecord.date).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})+' — <strong>'+_anaDayRecord.count+' jobs</strong>':'—';
    var isRecord=best.count>0&&_anaDayRecord&&best.count>=_anaDayRecord.count;
    recEl.innerHTML=
      recRow('📅','Busiest day this period',bestStr,isRecord?'<span style="color:var(--accent);font-weight:700">All-time record!</span>':'')
      +recRow('🏔️','All-time record day',recStr,'Across every job since 2016')
      +recRow('📍','Top city this period',topCityN?anaEsc(topCity)+' — <strong>'+anaFmtInt(topCityN)+' jobs</strong>':'—','');
  }

  // ── New vs returning customers ──
  var custEl=document.getElementById('ana-customers');
  if(custEl){
    var startS=dates.a.start?anaYmd(dates.a.start):null;
    var byCid={};
    aWork.forEach(function(j){ if(j.cid) byCid[j.cid]=(byCid[j.cid]||0)+1; });
    var cids=Object.keys(byCid);
    var newC=0,retC=0,newJobs=0,retJobs=0,multi=0;
    cids.forEach(function(cid){
      var isNew = startS ? (_anaFirstSeen[cid]>=startS) : true;
      if(isNew){ newC++; newJobs+=byCid[cid]; } else { retC++; retJobs+=byCid[cid]; }
      if(byCid[cid]>=2) multi++;
    });
    var totC=newC+retC;
    // Compare period: how many first-ever customers did it bring?
    var bNew=0;
    if(hasB){
      var bStartS=anaYmd(dates.b.start);
      var bSeen={};
      bWork.forEach(function(j){ if(j.cid&&!bSeen[j.cid]){ bSeen[j.cid]=1; if(_anaFirstSeen[j.cid]>=bStartS&&_anaFirstSeen[j.cid]<=anaYmd(dates.b.end)) bNew++; } });
    }
    if(!totC){
      custEl.innerHTML='<div style="color:var(--muted);font-size:13px;padding:12px 0">No customers in this period</div>';
    } else if(analyticsPeriod==='all'){
      custEl.innerHTML='<div style="color:var(--muted);font-size:13px;padding:12px 0">'
        +'<strong style="color:var(--text)">'+anaFmtInt(totC)+'</strong> customers on record all-time. '
        +'Pick a week, month or year to split new vs returning.</div>';
    } else {
      var newPct=Math.round(newC/totC*100), retPct=100-newPct;
      custEl.innerHTML=
        '<div class="ana-split-bar">'
          +(newC?'<div style="width:'+Math.max(newPct,3)+'%;background:var(--green-b1)" title="New: '+newC+'"></div>':'')
          +(retC?'<div style="width:'+Math.max(retPct,3)+'%;background:var(--green-b3)" title="Returning: '+retC+'"></div>':'')
        +'</div>'
        +'<div class="ana-split-legend">'
          +'<div class="ana-split-item"><span class="ana-chip-dot" style="background:var(--green-b1)"></span><span>🆕 New — first-ever booking</span><strong>'+anaFmtInt(newC)+' <span class="ana-note">('+newPct+'%)</span></strong></div>'
          +'<div class="ana-split-item"><span class="ana-chip-dot" style="background:var(--green-b3)"></span><span>🔁 Returning — booked before</span><strong>'+anaFmtInt(retC)+' <span class="ana-note">('+retPct+'%)</span></strong></div>'
        +'</div>'
        +'<div class="ana-note" style="margin-top:10px">New customers brought '+anaFmtInt(newJobs)+' job'+(newJobs!==1?'s':'')+' · returning brought '+anaFmtInt(retJobs)
        +(multi?' · '+anaFmtInt(multi)+' customer'+(multi!==1?'s':'')+' booked 2+ times this period':'')+'</div>'
        +(hasB?'<div class="ana-note" style="margin-top:4px">New customers vs '+anaEsc(dates.b.label)+': '+anaFmtInt(newC)+' now, '+anaFmtInt(bNew)+' then '+anaDeltaChip(newC,bNew,true)+'</div>':'');
    }
  }

  // ── Bins by size ──
  var sizeOrder=['4 yard','7 yard','14 yard','20 yard'];
  var sizeRamp={'4 yard':'var(--green-b1)','7 yard':'var(--green-b2)','14 yard':'var(--green-b3)','20 yard':'var(--green-b4)'};
  var sizes={};
  var aBinJobs=aWork.filter(function(j){return j.service==='Bin Rental'&&j.binSize;});
  aBinJobs.forEach(function(j){sizes[j.binSize]=(sizes[j.binSize]||0)+1;});
  var sizeKeys=sizeOrder.filter(function(k){return sizes[k];}).concat(Object.keys(sizes).filter(function(k){return sizeOrder.indexOf(k)<0;}).sort());
  var totBins=aBinJobs.length||1;
  var sizeData=sizeKeys.map(function(k){return{key:k,val:sizes[k],display:anaFmtInt(sizes[k])+' · '+Math.round(sizes[k]/totBins*100)+'%'};});
  document.getElementById('chart-bin-size').innerHTML=makeBarChart(sizeData,function(k){return sizeRamp[k]||'var(--green-b2)';});

  // ── By city (top 10 + rest) ──
  var cityMap={};
  aWork.forEach(function(j){var c=extractCity(j.address,j.city);cityMap[c]=(cityMap[c]||0)+1;});
  var cityKeys=Object.keys(cityMap).sort(function(a,b){return cityMap[b]-cityMap[a];});
  var totCity=aWork.length||1;
  var topCities=cityKeys.slice(0,10).map(function(k){return{key:k,val:cityMap[k],display:anaFmtInt(cityMap[k])+' · '+Math.round(cityMap[k]/totCity*100)+'%'};});
  var restKeys=cityKeys.slice(10);
  if(restKeys.length){
    var restN=restKeys.reduce(function(s,k){return s+cityMap[k];},0);
    topCities.push({key:restKeys.length+' other cities',val:restN,display:anaFmtInt(restN)+' · '+Math.round(restN/totCity*100)+'%'});
  }
  var cityRamp=['var(--green-b2)','var(--green-b2)','var(--green-b2)','var(--green-b1)','var(--green-b1)','var(--green-b1)','var(--green-b1)','var(--green-b1)','var(--green-b1)','var(--green-b1)','#94a3b8'];
  document.getElementById('chart-city').innerHTML=makeBarChart(topCities.map(function(d){return{key:anaEsc(d.key),val:d.val,display:d.display};}),function(k,i){return cityRamp[Math.min(i,cityRamp.length-1)];});

  // ── Referral sources (only tracked since 2026 — be honest about coverage) ──
  var refEl=document.getElementById('chart-referral');
  var refNote=document.getElementById('chart-referral-note');
  if(refEl){
    var refMap={},known=0;
    aWork.forEach(function(j){
      var r=(j.referral||'').trim();
      if(!r)return;
      refMap[r]=(refMap[r]||0)+1;known++;
    });
    var refColors={Google:'#4285f4','Word of Mouth':'var(--accent)',Facebook:'#1877f2',Instagram:'#e1306c',Kijiji:'#ff6b00','Repeat Customer':'var(--c-furn)',Other:'#888888'};
    var refData=Object.keys(refMap).sort(function(a,b){return refMap[b]-refMap[a];}).map(function(k){return{key:anaEsc(k),val:refMap[k],display:anaFmtInt(refMap[k])+' · '+Math.round(refMap[k]/(known||1)*100)+'%'};});
    if(!refData.length){
      refEl.innerHTML='<div style="color:var(--muted);font-size:13px;padding:12px 0">No referral data for this period — source tracking started in 2026.</div>';
      if(refNote)refNote.textContent='';
    }else{
      refEl.innerHTML=makeBarChart(refData,function(k){return refColors[k]||'#888';});
      if(refNote)refNote.textContent='Source recorded on '+anaFmtInt(known)+' of '+anaFmtInt(aWork.length)+' jobs in this period (tracking started 2026).';
    }
  }

  requestAnimationFrame(function(){['chart-busiest-a','chart-bin-size','chart-city','chart-referral'].forEach(function(id){animateBars(document.getElementById(id));});});

  // ── Service mix by year (always all years, from the full cache) ──
  var mixEl=document.getElementById('chart-service-mix');
  if(mixEl){
    var yearMix={};
    _anaAll.forEach(function(j){
      if(!j.date||!anaIsWork(j))return;
      var yr=j.date.slice(0,4);
      if(!yearMix[yr])yearMix[yr]={bin:0,junk:0,other:0,total:0};
      yearMix[yr].total++;
      if(j.service==='Bin Rental')yearMix[yr].bin++;
      else if(j.service==='Junk Removal')yearMix[yr].junk++;
      else yearMix[yr].other++;
    });
    var mixYears=Object.keys(yearMix).sort();
    mixEl.innerHTML=mixYears.map(function(yr){
      var d=yearMix[yr];if(!d.total)return'';
      var binPct=Math.round(d.bin/d.total*100),junkPct=Math.round(d.junk/d.total*100),otherPct=100-binPct-junkPct;
      return'<div style="margin-bottom:12px;">'
        +'<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px;">'
        +'<span style="font-size:13px;font-weight:700;color:var(--text);">'+yr+'</span>'
        +'<span style="font-size:11px;color:var(--muted);">'+d.total.toLocaleString()+' jobs</span></div>'
        +'<div style="height:20px;border-radius:6px;overflow:hidden;display:flex;gap:1px;">'
        +(binPct?'<div style="width:'+binPct+'%;background:var(--green-b2);display:flex;align-items:center;justify-content:center;"><span style="font-size:10px;font-weight:700;color:#fff;">'+binPct+'%</span></div>':'')
        +(junkPct?'<div style="width:'+junkPct+'%;background:var(--c-junk);display:flex;align-items:center;justify-content:center;"><span style="font-size:10px;font-weight:700;color:#fff;">'+junkPct+'%</span></div>':'')
        +(otherPct>2?'<div style="width:'+otherPct+'%;background:#94a3b8;display:flex;align-items:center;justify-content:center;"><span style="font-size:10px;font-weight:700;color:#fff;">'+otherPct+'%</span></div>':'')
        +'</div></div>';
    }).join('')
    +'<div style="display:flex;gap:16px;margin-top:8px;flex-wrap:wrap;">'
    +'<span class="ana-legend-item"><span class="ana-chip-dot" style="background:var(--green-b2)"></span>Bin Rental</span>'
    +'<span class="ana-legend-item"><span class="ana-chip-dot" style="background:var(--c-junk)"></span>Junk Removal</span>'
    +'<span class="ana-legend-item"><span class="ana-chip-dot" style="background:#94a3b8"></span>Other</span>'
    +'</div>';
  }

  // ── Bin turnover — trailing 12 months, live fleet counts ──
  var turnoverEl=document.getElementById('chart-bin-turnover');
  var turnoverNote=document.getElementById('chart-bin-turnover-note');
  if(turnoverEl){
    var cutoff=new Date(); cutoff.setFullYear(cutoff.getFullYear()-1);
    var cutS=anaYmd(cutoff), todayS=anaYmd(new Date());
    var binBySize={};
    _anaAll.forEach(function(j){
      if(j.service!=='Bin Rental'||j.status==='Cancelled'||!j.binSize||!j.date)return;
      if(j.date<cutS||j.date>todayS)return;   // trailing 12 months — future pre-bookings don't count
      binBySize[j.binSize]=(binBySize[j.binSize]||0)+1;
    });
    var fleetCounts={};
    binItems.forEach(function(b){ fleetCounts[b.size]=(fleetCounts[b.size]||0)+1; });
    var maxRate=0;
    var rates=sizeOrder.filter(function(sz){return fleetCounts[sz]||binBySize[sz];}).map(function(sz){
      var rentals=binBySize[sz]||0,fleet=fleetCounts[sz]||0;
      var rate=fleet>0?rentals/fleet/12:0;
      if(rate>maxRate)maxRate=rate;
      return{sz:sz,rentals:rentals,fleet:fleet,rate:rate};
    });
    turnoverEl.innerHTML=rates.map(function(r){
      var pct=maxRate>0?Math.round(r.rate/maxRate*100):0,rateStr=r.rate.toFixed(1);
      return'<div style="margin-bottom:14px;">'
        +'<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:5px;">'
        +'<span style="font-size:13px;font-weight:700;color:var(--text);">'+r.sz+'</span>'
        +'<span style="font-size:11px;color:var(--muted);">'+(r.fleet?rateStr+' rentals/bin/mo &nbsp;·&nbsp; ':'')+r.rentals.toLocaleString()+' rentals &nbsp;·&nbsp; '+r.fleet+' bins</span></div>'
        +'<div style="height:18px;background:var(--surface2);border-radius:6px;overflow:hidden;">'
        +'<div style="height:100%;width:'+pct+'%;background:'+(sizeRamp[r.sz]||'var(--green-b2)')+';border-radius:6px;transition:width .6s ease;display:flex;align-items:center;padding-left:8px;">'
        +(pct>18?'<span style="font-size:10px;font-weight:700;color:#fff;">'+rateStr+'x</span>':'')
        +'</div></div></div>';
    }).join('');
    if(turnoverNote)turnoverNote.textContent='Trailing 12 months, using today\'s fleet counts. Higher = each bin rents more often per month.';
  }
}

function initAnalytics(){
  renderYoyTracker();
  var p=analyticsPeriod;
  if(!_anaInitDone){ p='month'; _anaInitDone=true; }   // Month is the most useful landing view
  setAnalyticsPeriod(p, document.getElementById('af-'+p));
  initReportSection();
}
