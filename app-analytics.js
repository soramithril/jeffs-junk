// ─── ANALYTICS ───
// Depends on app.js globals: db, toast, vehicles, jobs, fd, todayStr, Chart,
// analyticsPeriod, analyticsCompare, initReportSection (etc).
// Loaded via its own script tag before app.js.

// ─── ANALYTICS ───
function setAnalyticsPeriod(p, el){
  analyticsPeriod = p;
  document.querySelectorAll('.chart-filter[id^="af-"]').forEach(function(c){c.classList.remove('active');});
  if(el) el.classList.add('active');
  var wk=document.getElementById('an-week-pickers'),mo=document.getElementById('an-month-pickers'),yr=document.getElementById('an-year-pickers');
  if(wk) wk.style.display=p==='week'?'flex':'none';
  if(mo) mo.style.display=p==='month'?'flex':'none';
  if(yr) yr.style.display=p==='year'?'flex':'none';
  var now=new Date();
  if(p==='week'){
    var wa=document.getElementById('an-week-a'); if(wa&&!wa.value) wa.value=toWeekValue(now);
    var wb=document.getElementById('an-week-b'); if(wb&&!wb.value){var pv=new Date(now);pv.setDate(pv.getDate()-7);wb.value=toWeekValue(pv);}
  }
  if(p==='month'){
    var ma=document.getElementById('an-month-a'); if(ma&&!ma.value) ma.value=now.getFullYear()+'-'+(now.getMonth()<9?'0':'')+(now.getMonth()+1);
    var mb=document.getElementById('an-month-b'); if(mb&&!mb.value){var pm=new Date(now.getFullYear(),now.getMonth()-1,1);mb.value=pm.getFullYear()+'-'+(pm.getMonth()<9?'0':'')+(pm.getMonth()+1);}
  }
  if(p==='year'){populateYearSelects();var ya=document.getElementById('an-year-a');if(ya&&!ya.value)ya.value=now.getFullYear();var yb=document.getElementById('an-year-b');if(yb&&!yb.value)yb.value=now.getFullYear()-1;}
  renderAnalytics();
}
function toWeekValue(d){
  var jan4=new Date(d.getFullYear(),0,4);
  var sow=new Date(jan4);sow.setDate(jan4.getDate()-((jan4.getDay()||7)-1));
  var wn=Math.max(1,Math.min(52,Math.floor(1+(d-sow)/(7*86400000))));
  return d.getFullYear()+'-W'+(wn<10?'0':'')+wn;
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
  var years=[],now=new Date().getFullYear();
  jobs.forEach(function(j){var y=new Date(j.date).getFullYear();if(years.indexOf(y)<0)years.push(y);});
  for(var y=now;y>=now-5;y--){if(years.indexOf(y)<0)years.push(y);}
  years.sort(function(a,b){return b-a;});
  ['an-year-a','an-year-b'].forEach(function(id){
    var sel=document.getElementById(id);if(!sel)return;
    var cur=sel.value;
    sel.innerHTML=(id==='an-year-b'?'<option value="">— None —</option>':'')+years.map(function(y){return'<option value="'+y+'">'+y+'</option>';}).join('');
    if(cur)sel.value=cur;
  });
}
function clearCompareB(){
  if(analyticsPeriod==='week'){var e=document.getElementById('an-week-b');if(e)e.value='';}
  if(analyticsPeriod==='month'){var e=document.getElementById('an-month-b');if(e)e.value='';}
  if(analyticsPeriod==='year'){var e=document.getElementById('an-year-b');if(e)e.value='';}
  renderAnalytics();
}
function getAnalyticsDates(){
  var now=new Date();
  if(analyticsPeriod==='all')return{a:{start:new Date(0),end:now,label:'All Time'},b:null};
  if(analyticsPeriod==='week'){
    var wa=document.getElementById('an-week-a'),wb=document.getElementById('an-week-b');
    var da=wa&&wa.value?weekValueToDates(wa.value):{start:new Date(now.getFullYear(),now.getMonth(),now.getDate()-now.getDay(),0,0,0),end:new Date(now.getFullYear(),now.getMonth(),now.getDate()-now.getDay()+6,23,59,59)};
    var db=wb&&wb.value?weekValueToDates(wb.value):null;
    var fmt=function(d){return'Week of '+d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});};
    return{a:{start:da.start,end:da.end,label:fmt(da.start)},b:db?{start:db.start,end:db.end,label:fmt(db.start)}:null};
  }
  if(analyticsPeriod==='month'){
    var ma=document.getElementById('an-month-a'),mb=document.getElementById('an-month-b');
    var dma=ma&&ma.value?monthValueToDates(ma.value):{start:new Date(now.getFullYear(),now.getMonth(),1),end:new Date(now.getFullYear(),now.getMonth()+1,0,23,59,59)};
    var dmb=mb&&mb.value?monthValueToDates(mb.value):null;
    var fmtM=function(d){return d.toLocaleDateString('en-US',{month:'long',year:'numeric'});};
    return{a:{start:dma.start,end:dma.end,label:fmtM(dma.start)},b:dmb?{start:dmb.start,end:dmb.end,label:fmtM(dmb.start)}:null};
  }
  if(analyticsPeriod==='year'){
    var ya=document.getElementById('an-year-a'),yb=document.getElementById('an-year-b');
    var yav=ya&&ya.value?parseInt(ya.value):now.getFullYear();
    var ybv=yb&&yb.value?parseInt(yb.value):0;
    return{a:{start:new Date(yav,0,1),end:new Date(yav,11,31,23,59,59),label:yav.toString()},b:ybv?{start:new Date(ybv,0,1),end:new Date(ybv,11,31,23,59,59),label:ybv.toString()}:null};
  }
  return{a:{start:new Date(0),end:now,label:'All Time'},b:null};
}
function getFilteredJobs(start,end){
  return jobs.filter(function(j){
    if(!start)return true;
    if(!j.date)return false;
    var parts=j.date.split('-');
    var d=new Date(parseInt(parts[0]),parseInt(parts[1])-1,parseInt(parts[2]));
    return d>=start&&d<=end;
  });
}
function delta(curr,prev){
  if(prev===null||prev===undefined)return'';
  if(prev===0)return curr===0?'':'<span style="font-size:12px;font-weight:700;color:#22c55e;margin-left:6px">▲ NEW</span>';
  var pct=Math.round((curr-prev)/prev*100),up=pct>=0;
  return'<span style="font-size:12px;font-weight:700;color:'+(up?'#22c55e':'#dc3545')+';margin-left:6px">'+(up?'▲':'▼')+' '+(up?'+':'')+pct+'%</span>';
}
async function renderYoyTracker(){
  var wrap=document.getElementById('yoy-tracker');
  if(!wrap)return;
  var now=new Date();
  var y=now.getFullYear(), m=now.getMonth();
  var thisStart=new Date(y,m,1).toISOString().split('T')[0];
  var thisEnd=new Date(y,m+1,0).toISOString().split('T')[0];
  var lastStart=new Date(y-1,m,1).toISOString().split('T')[0];
  var lastEnd=new Date(y-1,m+1,0).toISOString().split('T')[0];
  var monthName=now.toLocaleString('default',{month:'long'});

  var rThis=await db.from('jobs').select('service').neq('status','Cancelled')
    .gte('date',thisStart).lte('date',thisEnd);
  var rLast=await db.from('jobs').select('service').neq('status','Cancelled')
    .gte('date',lastStart).lte('date',lastEnd);
  var thisJobs=rThis.data||[];var lastJobs=rLast.data||[];

  function count(arr,svc){return arr.filter(function(j){return j.service===svc;}).length;}
  var services=[
    {key:'Bin Rental',label:'Bins',icon:'🚛',color:'#22c55e'},
    {key:'Junk Removal',label:'Junk',icon:'🗑️',color:'#eab308'},
    {key:'Furniture Pickup',label:'Furniture Pickups',icon:'🛋️',color:'#8b5cf6'}
  ];

  wrap.innerHTML=services.map(function(s){
    var cur=count(thisJobs,s.key);
    var target=count(lastJobs,s.key);
    var pct=target>0?Math.min(Math.round(cur/target*100),100):((cur>0)?100:0);
    var beat=cur>=target&&target>0;
    var diff=cur-target;
    var diffLabel=target===0?(cur>0?cur+' booked':'No data last year'):(diff>=0?'<span style="color:#22c55e;font-weight:700">+'+diff+' ahead</span>':'<span style="color:#dc3545;font-weight:700">'+Math.abs(diff)+' to go</span>');
    var barColor=beat?'#22c55e':s.color;
    return '<div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:10px 14px;min-width:160px;flex:1;max-width:220px">'
      +'<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">'
        +'<span style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px">'+s.icon+' '+s.label+'</span>'
        +(beat?'<span style="font-size:10px;background:rgba(34,197,94,.15);color:#22c55e;border-radius:4px;padding:1px 6px;font-weight:700">BEAT!</span>':'')
      +'</div>'
      +'<div style="display:flex;align-items:baseline;gap:4px;margin-bottom:4px">'
        +'<span style="font-family:Bebas Neue,sans-serif;font-size:26px;color:var(--text);line-height:1">'+cur+'</span>'
        +'<span style="font-size:12px;color:var(--muted)">/ '+target+'</span>'
        +'<span style="font-size:10px;color:var(--muted)">last '+monthName+'</span>'
      +'</div>'
      +'<div style="height:6px;background:var(--surface2);border-radius:3px;overflow:hidden;margin-bottom:4px">'
        +'<div style="height:100%;width:'+pct+'%;background:'+barColor+';border-radius:3px;transition:width .6s ease"></div>'
      +'</div>'
      +'<div style="font-size:11px">'+diffLabel+'</div>'
    +'</div>';
  }).join('');
}

async function renderAnalytics(){
  var dates=getAnalyticsDates();
  var pageSize=1000;

  async function fetchJobsInRange(start,end){
    var results=[];
    var from=0;
    var startS=start?start.toISOString().split('T')[0]:null;
    var endS=end?end.toISOString().split('T')[0]:null;
    while(true){
      var q=db.from('jobs').select('job_id,service,status,name,address,city,date,price,referral,bin_size')
        .order('date',{ascending:false}).range(from,from+pageSize-1);
      if(startS)q=q.gte('date',startS);
      if(endS)q=q.lte('date',endS);
      var r=await q;
      if(r.error||!r.data||r.data.length===0)break;
      r.data.forEach(function(row){
        results.push({id:row.job_id,service:row.service||'',status:row.status||'',
          name:row.name||'',address:row.address||'',city:row.city||'',
          date:row.date||'',price:row.price||'',referral:row.referral||'',
          binSize:row.bin_size||''});
      });
      if(r.data.length<pageSize)break;
      from+=pageSize;
    }
    return results;
  }

  var aJobs=await fetchJobsInRange(dates.a.start,dates.a.end);
  var bJobs=dates.b?await fetchJobsInRange(dates.b.start,dates.b.end):[];
  var hasB=dates.b!==null;
  _renderAnalyticsWithJobs(dates,aJobs,bJobs,hasB);
}

function _renderAnalyticsWithJobs(dates,aJobs,bJobs,hasB){
  var lbl=document.getElementById('analytics-compare-lbl');
  if(lbl)lbl.innerHTML='<strong style="color:var(--accent)">A: '+dates.a.label+'</strong>'+(hasB?' <span style="color:var(--muted)">vs</span> <strong style="color:#e67e22">B: '+dates.b.label+'</strong>':'');

  var aBin=aJobs.filter(function(j){return j.service==='Bin Rental';}).length;
  var bBin=bJobs.filter(function(j){return j.service==='Bin Rental';}).length;
  var aJunk=aJobs.filter(function(j){return j.service==='Junk Removal';}).length;
  var bJunk=bJobs.filter(function(j){return j.service==='Junk Removal';}).length;
  var aFP=aJobs.filter(function(j){return j.service==='Furniture Pickup';}).length;
  var bFP=bJobs.filter(function(j){return j.service==='Furniture Pickup';}).length;
  var aFD=aJobs.filter(function(j){return j.service==='Furniture Delivery';}).length;
  var bFD=bJobs.filter(function(j){return j.service==='Furniture Delivery';}).length;

  function mbox(idA,val,prev,color,label){
    return'<div class="metric-box"><div style="display:flex;align-items:baseline;flex-wrap:wrap">'
      +'<div class="metric-val" id="'+idA+'" style="color:'+color+'">0</div>'+(hasB?delta(val,prev):'')+'</div>'
      +'<div class="metric-lbl">'+label+'</div>'+(hasB?'<div style="font-size:10px;color:var(--muted);margin-top:2px">B: '+prev+'</div>':'')+'</div>';
  }
  document.getElementById('analytics-metrics').innerHTML=
    mbox('am-jobs',aJobs.length,bJobs.length,'var(--accent)','Total Jobs')
    +mbox('am-bins',aBin,bBin,'#22c55e','Bin Rentals')
    +mbox('am-junk',aJunk,bJunk,'#eab308','Junk Removal')
    +mbox('am-furnp',aFP,bFP,'#8b5cf6','Furniture Pickup')
    +mbox('am-furnd',aFD,bFD,'#f97316','Furniture Delivery');

  // ── Month-over-Month summary ─────────────────────────────────
  (function(){
    var momEl  = document.getElementById('analytics-mom-summary');
    var momGrid = document.getElementById('analytics-mom-grid');
    if(!momEl || !momGrid) return;
    // Only show when comparing two periods (month vs previous month)
    if(!hasB){ momEl.style.display='none'; return; }
    momEl.style.display='block';

    function pct(a,b){ if(!b) return null; return Math.round((a-b)/b*100); }
    function arrow(p){ return p>0?'▲':'▼'; }
    function arrowColor(p,higherIsBetter){
      if(p===0) return 'var(--muted)';
      var positive = higherIsBetter ? p>0 : p<0;
      return positive ? '#22c55e' : '#dc3545';
    }

    function momCard(label, aVal, bVal, fmt, higherIsBetter){
      var p = pct(aVal, bVal);
      var pStr = p!==null ? (p>=0?'+':'')+p+'%' : '—';
      var col  = p!==null ? arrowColor(p, higherIsBetter!==false) : 'var(--muted)';
      var arw  = p!==null ? arrow(p) : '';
      return '<div style="background:var(--surface2);border-radius:10px;padding:12px 14px">'
        +'<div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.8px;margin-bottom:6px">'+label+'</div>'
        +'<div style="display:flex;align-items:baseline;gap:6px;flex-wrap:wrap">'
          +'<span style="font-family:Bebas Neue,sans-serif;font-size:24px;color:var(--text);letter-spacing:.5px;line-height:1">'+fmt(aVal)+'</span>'
          +(p!==null?'<span style="font-size:12px;font-weight:700;color:'+col+'">'+arw+' '+pStr+'</span>':'')
        +'</div>'
        +'<div style="font-size:11px;color:var(--muted);margin-top:3px">Last: '+fmt(bVal)+'</div>'
        +'</div>';
    }

    var aActive = aJobs.filter(function(j){ return j.status!=='Cancelled'; }).length;
    var bActive = bJobs.filter(function(j){ return j.status!=='Cancelled'; }).length;
    var aBinCount  = aJobs.filter(function(j){ return j.service==='Bin Rental'; }).length;
    var bBinCount  = bJobs.filter(function(j){ return j.service==='Bin Rental'; }).length;
    var aJunkCount = aJobs.filter(function(j){ return j.service==='Junk Removal'; }).length;
    var bJunkCount = bJobs.filter(function(j){ return j.service==='Junk Removal'; }).length;
    var aCancelled = aJobs.filter(function(j){ return j.status==='Cancelled'; }).length;
    var bCancelled = bJobs.filter(function(j){ return j.status==='Cancelled'; }).length;

    momGrid.innerHTML =
      momCard('Total Jobs',    aActive,    bActive,    String,           true)
      +momCard('Bin Rentals',  aBinCount,  bBinCount,  String,           true)
      +momCard('Junk Removal', aJunkCount, bJunkCount, String,           true)
      +momCard('Cancellations',aCancelled, bCancelled, String,           false);
  })();

  requestAnimationFrame(function(){
    animCount(document.getElementById('am-jobs'),aJobs.length);
    animCount(document.getElementById('am-bins'),aBin);
    animCount(document.getElementById('am-junk'),aJunk);
    animCount(document.getElementById('am-furnp'),aFP);
    animCount(document.getElementById('am-furnd'),aFD);
  });

  // Busiest days side-by-side
  var dayNames=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  var dayShort=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  function buildDayChart(jobSet,color){
    var counts=[0,0,0,0,0,0,0];
    jobSet.forEach(function(j){
      // Parse YYYY-MM-DD directly to avoid UTC→local timezone day shift
      var parts=j.date?j.date.split('-'):null;
      if(!parts||parts.length<3)return;
      var d=new Date(parseInt(parts[0]),parseInt(parts[1])-1,parseInt(parts[2]));
      counts[d.getDay()]++;
    });
    var bIdx=counts.indexOf(Math.max.apply(null,counts));
    var data=dayShort.map(function(n,i){return{key:n,val:counts[i]};});
    return{html:makeBarChart(data,function(k,i){return i===bIdx?color:'rgba(34,197,94,.2)';}),busiestDay:dayNames[bIdx],busiestCount:counts[bIdx]};
  }
  var cA=buildDayChart(aJobs,'#22c55e');
  document.getElementById('busiest-a-lbl').innerHTML='<span style="color:var(--accent)">● A: '+dates.a.label+'</span>';
  document.getElementById('chart-busiest-a').innerHTML=cA.html;
  document.getElementById('busiest-insight-a').innerHTML='🏆 Busiest: <strong>'+cA.busiestDay+'</strong> ('+cA.busiestCount+' jobs)';
  var bCol=document.getElementById('busiest-b-col');
  var bGrid=document.getElementById('busiest-grid');
  if(hasB&&bJobs.length>0){
    var cB=buildDayChart(bJobs,'#e67e22');
    bCol.style.display='block';
    bGrid.style.gridTemplateColumns='1fr 1fr';
    document.getElementById('busiest-b-lbl').innerHTML='<span style="color:#e67e22">● B: '+dates.b.label+'</span>';
    document.getElementById('chart-busiest-b').innerHTML=cB.html;
    document.getElementById('busiest-insight-b').innerHTML='🏆 Busiest: <strong>'+cB.busiestDay+'</strong> ('+cB.busiestCount+' jobs)'+(cA.busiestDay!==cB.busiestDay?'<br><span style="color:#e67e22">Shift: '+cB.busiestDay+' → '+cA.busiestDay+'</span>':' · same day');
    requestAnimationFrame(function(){animateBars(document.getElementById('chart-busiest-b'));});
  } else {
    bCol.style.display='none';
    bGrid.style.gridTemplateColumns='1fr';
  }

  // Bins by size
  var sizes={'4 yard':0,'7 yard':0,'14 yard':0,'20 yard':0};
  aJobs.filter(function(j){return j.service==='Bin Rental'&&j.binSize;}).forEach(function(j){sizes[j.binSize]=(sizes[j.binSize]||0)+1;});
  var sizeColors={'4 yard':'#4ade80','7 yard':'#f0932b','14 yard':'#f0932b','20 yard':'#e76f7e'};
  var sizeData=Object.keys(sizes).filter(function(k){return sizes[k]>0;}).map(function(k){return{key:k,val:sizes[k]};});
  document.getElementById('chart-bin-size').innerHTML=makeBarChart(sizeData,function(k){return sizeColors[k]||'#22c55e';});

  // By city
  var cityMap={};
  aJobs.forEach(function(j){var c=extractCity(j.address,j.city);cityMap[c]=(cityMap[c]||0)+1;});
  var cityData=Object.keys(cityMap).sort(function(a,b){return cityMap[b]-cityMap[a];}).map(function(k){return{key:k,val:cityMap[k]};});
  var cityColors=['#22c55e','#4ade80','#7cc9a0','#c8e6d5','#e6f4ed','#a7f3d0','#6ee7b7','#34d399'];
  document.getElementById('chart-city').innerHTML=makeBarChart(cityData,function(k,i){return cityColors[cityData.findIndex(function(d){return d.key===k;})]||'#22c55e';});

  // Referral
  var refMap={};
  aJobs.forEach(function(j){var r=j.referral||'Unknown';refMap[r]=(refMap[r]||0)+1;});
  var refColors={Google:'#4285f4','Word of Mouth':'#22c55e',Facebook:'#1877f2',Instagram:'#e1306c',Kijiji:'#ff6b00','Repeat Customer':'#a78bfa',Other:'#888888',Unknown:'#555555'};
  var refData=Object.keys(refMap).sort(function(a,b){return refMap[b]-refMap[a];}).map(function(k){return{key:k,val:refMap[k]};});
  document.getElementById('chart-referral').innerHTML=makeBarChart(refData,function(k){return refColors[k]||'#888';});

  requestAnimationFrame(function(){['chart-busiest-a','chart-bin-size','chart-city','chart-referral'].forEach(function(id){animateBars(document.getElementById(id));});});

  // Loyalty
  var custJobCount={};
  aJobs.forEach(function(j){if(j.name){var n=j.name.toLowerCase();custJobCount[n]=(custJobCount[n]||0)+1;}});
  var newC=0,repeatC=0,frequentC=0;
  Object.values(custJobCount).forEach(function(cnt){if(cnt===1)newC++;else if(cnt<=3)repeatC++;else frequentC++;});
  var lt=newC+repeatC+frequentC||1;
  document.getElementById('chart-loyalty').innerHTML=
    '<div class="pie-legend">'
    +'<div class="pie-legend-item"><div class="pie-dot" style="background:#4ade80"></div><span class="pie-legend-label">🆕 New (1 job)</span><span class="pie-legend-val">'+newC+' <span style="color:var(--muted);font-size:11px">('+Math.round(newC/lt*100)+'%)</span></span></div>'
    +'<div class="pie-legend-item"><div class="pie-dot" style="background:#f0932b"></div><span class="pie-legend-label">🔁 Repeat (2–3)</span><span class="pie-legend-val">'+repeatC+' <span style="color:var(--muted);font-size:11px">('+Math.round(repeatC/lt*100)+'%)</span></span></div>'
    +'<div class="pie-legend-item"><div class="pie-dot" style="background:#22c55e"></div><span class="pie-legend-label">⭐ Frequent (4+)</span><span class="pie-legend-val">'+frequentC+' <span style="color:var(--muted);font-size:11px">('+Math.round(frequentC/lt*100)+'%)</span></span></div>'
    +'</div>'
    +'<div style="display:flex;gap:4px;margin-top:16px;height:28px;border-radius:8px;overflow:hidden">'
    +'<div style="width:'+Math.round(newC/lt*100)+'%;background:#4ade80" title="New: '+newC+'"></div>'
    +'<div style="width:'+Math.round(repeatC/lt*100)+'%;background:#f0932b" title="Repeat: '+repeatC+'"></div>'
    +'<div style="width:'+Math.round(frequentC/lt*100)+'%;background:#22c55e" title="Frequent: '+frequentC+'"></div>'
    +'</div><div style="display:flex;gap:16px;font-size:10px;color:var(--muted);margin-top:6px"><span style="color:#4ade80">■ New</span><span style="color:#f0932b">■ Repeat</span><span style="color:#22c55e">■ Frequent</span></div>';

  // Jobs over time
  var now2=new Date(),months=[];
  for(var i=11;i>=0;i--){var d=new Date(now2.getFullYear(),now2.getMonth()-i,1);months.push({label:d.toLocaleDateString('en-US',{month:'short'}),year:d.getFullYear(),month:d.getMonth(),bins:0,junk:0,furn:0});}
  aJobs.forEach(function(j){var d=new Date(j.date);months.forEach(function(m){if(d.getFullYear()===m.year&&d.getMonth()===m.month){if(j.service==='Bin Rental')m.bins++;else if(j.service==='Junk Removal')m.junk++;else m.furn++;}});});
  var maxM=Math.max.apply(null,months.map(function(m){return m.bins+m.junk+m.furn;}))||1;
  var chartEl=document.getElementById('chart-time'),labelsEl=document.getElementById('chart-time-labels');
  chartEl.innerHTML=months.map(function(m,mi){
    var tot=m.bins+m.junk+m.furn,bH=Math.round(m.bins/maxM*110),jH=Math.round(m.junk/maxM*110),fH=Math.round(m.furn/maxM*110);
    function seg(h,col,cnt,r){if(!cnt)return'';return'<div class="vbar-seg" data-h="'+h+'" style="width:100%;height:0;background:'+col+';border-radius:'+r+';overflow:hidden;display:flex;align-items:center;justify-content:center;transition:height 2.45s cubic-bezier(.22,.68,0,1.2);transition-delay:'+(mi*30)+'ms"><span style="font-size:9px;font-weight:700;color:#fff;user-select:none">'+cnt+'</span></div>';}
    return'<div style="flex:1;display:flex;flex-direction:column;align-items:center">'
      +'<div style="font-size:11px;font-weight:700;color:var(--text);margin-bottom:3px;min-height:16px">'+(tot>0?tot:'')+'</div>'
      +'<div style="width:100%;display:flex;flex-direction:column;justify-content:flex-end;height:110px;gap:1px">'+seg(fH,'#dc3545',m.furn,'2px 2px 0 0')+seg(jH,'#e67e22',m.junk,'0')+seg(bH,'#22c55e',m.bins,'0')+(tot===0?'<div style="width:100%;height:2px;background:var(--border)"></div>':'')+'</div></div>';
  }).join('');
  labelsEl.innerHTML=months.map(function(m){return'<div style="flex:1;text-align:center;font-size:10px;color:var(--muted)">'+m.label+'</div>';}).join('');
  requestAnimationFrame(function(){document.querySelectorAll('#chart-time .vbar-seg').forEach(function(seg){var h=seg.getAttribute('data-h');setTimeout(function(){seg.style.height=h+'px';},10);});});

  // Service Mix Trend
  var mixEl=document.getElementById('chart-service-mix');
  if(mixEl){
    var yearMix={};
    aJobs.forEach(function(j){
      if(!j.date)return;
      var yr=j.date.slice(0,4);
      if(!yearMix[yr])yearMix[yr]={bin:0,junk:0,other:0,total:0};
      yearMix[yr].total++;
      if(j.service==='Bin Rental')yearMix[yr].bin++;
      else if(j.service==='Junk Removal')yearMix[yr].junk++;
      else yearMix[yr].other++;
    });
    var years=Object.keys(yearMix).sort();
    if(years.length<2){
      mixEl.innerHTML='<div style="color:var(--muted);font-size:12px;padding:12px 0;">Switch to <strong>Year</strong> or <strong>All Time</strong> to see the multi-year trend.</div>';
    }else{
      mixEl.innerHTML=years.map(function(yr){
        var d=yearMix[yr];if(!d.total)return'';
        var binPct=Math.round(d.bin/d.total*100),junkPct=Math.round(d.junk/d.total*100),otherPct=100-binPct-junkPct;
        return'<div style="margin-bottom:14px;">'
          +'<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:5px;">'
          +'<span style="font-size:13px;font-weight:700;color:var(--text);">'+yr+'</span>'
          +'<span style="font-size:11px;color:var(--muted);">'+d.total.toLocaleString()+' jobs</span></div>'
          +'<div style="height:22px;border-radius:6px;overflow:hidden;display:flex;gap:1px;">'
          +(binPct?'<div style="width:'+binPct+'%;background:#22c55e;display:flex;align-items:center;justify-content:center;"><span style="font-size:10px;font-weight:700;color:#fff;">'+binPct+'%</span></div>':'')
          +(junkPct?'<div style="width:'+junkPct+'%;background:#e67e22;display:flex;align-items:center;justify-content:center;"><span style="font-size:10px;font-weight:700;color:#fff;">'+junkPct+'%</span></div>':'')
          +(otherPct>2?'<div style="width:'+otherPct+'%;background:#94a3b8;display:flex;align-items:center;justify-content:center;"><span style="font-size:10px;font-weight:700;color:#fff;">'+otherPct+'%</span></div>':'')
          +'</div></div>';
      }).join('')
      +'<div style="display:flex;gap:16px;margin-top:8px;flex-wrap:wrap;">'
      +'<div style="display:flex;align-items:center;gap:5px;"><div style="width:10px;height:10px;border-radius:2px;background:#22c55e;flex-shrink:0;"></div><span style="font-size:11px;color:var(--muted);">Bin Rental</span></div>'
      +'<div style="display:flex;align-items:center;gap:5px;"><div style="width:10px;height:10px;border-radius:2px;background:#e67e22;flex-shrink:0;"></div><span style="font-size:11px;color:var(--muted);">Junk Removal</span></div>'
      +'<div style="display:flex;align-items:center;gap:5px;"><div style="width:10px;height:10px;border-radius:2px;background:#94a3b8;flex-shrink:0;"></div><span style="font-size:11px;color:var(--muted);">Other</span></div>'
      +'</div>';
    }
  }

  // Bin Turnover Rate — always all-time
  var turnoverEl=document.getElementById('chart-bin-turnover');
  var turnoverNote=document.getElementById('chart-bin-turnover-note');
  if(turnoverEl){
    var fleetCounts={'14 yard':54,'20 yard':20,'4 yard':8,'7 yard':4};
    var sizeColors2={'14 yard':'#22c55e','20 yard':'#3b82f6','4 yard':'#e67e22','7 yard':'#f97316'};
    db.from('jobs').select('bin_size').eq('service','Bin Rental').neq('status','cancelled').not('bin_size','is',null)
      .then(function(res){
        if(res.error||!res.data)return;
        var binBySize={};
        res.data.forEach(function(j){binBySize[j.bin_size]=(binBySize[j.bin_size]||0)+1;});
        var totalMonths=Math.max(1,Math.round((new Date()-new Date(2023,2,1))/(30*24*60*60*1000)));
        var sizes=['14 yard','20 yard','4 yard','7 yard'];
        var maxRate=0;
        var rates=sizes.map(function(sz){
          var rentals=binBySize[sz]||0,fleet=fleetCounts[sz];
          var rate=fleet>0?rentals/fleet/totalMonths:0;
          if(rate>maxRate)maxRate=rate;
          return{sz:sz,rentals:rentals,fleet:fleet,rate:rate};
        });
        turnoverEl.innerHTML=rates.map(function(r){
          var pct=maxRate>0?Math.round(r.rate/maxRate*100):0,rateStr=r.rate.toFixed(1);
          return'<div style="margin-bottom:14px;">'
            +'<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:5px;">'
            +'<span style="font-size:13px;font-weight:700;color:var(--text);">'+r.sz+'</span>'
            +'<span style="font-size:11px;color:var(--muted);">'+rateStr+' rentals/bin/mo &nbsp;·&nbsp; '+r.rentals.toLocaleString()+' total &nbsp;·&nbsp; '+r.fleet+' bins</span></div>'
            +'<div style="height:18px;background:var(--surface2);border-radius:6px;overflow:hidden;">'
            +'<div style="height:100%;width:'+pct+'%;background:'+sizeColors2[r.sz]+';border-radius:6px;transition:width .6s ease;display:flex;align-items:center;padding-left:8px;">'
            +(pct>18?'<span style="font-size:10px;font-weight:700;color:#fff;">'+rateStr+'x</span>':'')
            +'</div></div></div>';
        }).join('');
        if(turnoverNote)turnoverNote.textContent='All-time average since March 2023. Higher = each bin rented more often per month.';
      });
  }
}
function initAnalytics(){
  renderYoyTracker();
  setAnalyticsPeriod('week',document.getElementById('af-week'));
  initReportSection();
}
