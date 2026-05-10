// ─── BIN UTILIZATION ───
// Depends on app.js globals: db, todayStr, Chart (etc).
// Loaded via its own script tag before app.js.

// ─── BIN UTILIZATION ───
async function renderUtilization(){
  var today2=todayStr();
  var windowDays=90;
  var window30=30;
  var winStart=new Date(Date.now()-windowDays*86400000).toISOString().split('T')[0];
  var win30Start=new Date(Date.now()-window30*86400000).toISOString().split('T')[0];
  var totalBinCount=binItems.length;
  var totalPossibleDays=totalBinCount*windowDays;
  var sizeColors={'4 yard':'#4ade80','7 yard':'#f0932b','14 yard':'#f0932b','20 yard':'#e76f7e'};

  // Fetch all bin rental jobs from Supabase (not the limited in-memory set)
  var utilJobs=[];
  var pg=0;
  while(true){
    var r=await db.from('jobs').select('job_id,service,status,date,bin_size,bin_dropoff,bin_pickup,bin_bid,bin_instatus,name,address,city').eq('service','Bin Rental').neq('status','Cancelled').range(pg*1000,pg*1000+999);
    if(r.error||!r.data||!r.data.length)break;
    r.data.forEach(function(row){utilJobs.push({service:'Bin Rental',date:row.date||'',binSize:row.bin_size||'',binDropoff:row.bin_dropoff||'',binPickup:row.bin_pickup||'',binBid:row.bin_bid||'',binInstatus:row.bin_instatus||'',name:row.name||'',address:row.address||'',city:row.city||''});});
    if(r.data.length<1000)break;
    pg++;
  }

  // Per-size bin counts
  var sizePossible={'4 yard':0,'7 yard':0,'14 yard':0,'20 yard':0};
  binItems.forEach(function(b){if(sizePossible.hasOwnProperty(b.size))sizePossible[b.size]+=windowDays;});

  // Aggregate metrics
  var rentedDays=0;
  var rentedBySize={'4 yard':0,'7 yard':0,'14 yard':0,'20 yard':0};
  var rentedByCity={};
  var durationBySize={'4 yard':[],  '7 yard':[], '14 yard':[], '20 yard':[]};
  var turnoverBySize={'4 yard':0,'7 yard':0,'14 yard':0,'20 yard':0};
  var binsUsed30={}; // bid or address used in last 30 days

  utilJobs.forEach(function(j){
    var drop=j.binDropoff||j.date;var pick=j.binPickup||today2;
    if(!drop)return;
    var sz=j.binSize||'unknown';
    // Turnover (jobs in 90-day window)
    if(drop>=winStart||pick>=winStart){
      if(turnoverBySize.hasOwnProperty(sz))turnoverBySize[sz]++;
    }
    // Idle detection: any rental in 30-day window?
    if(drop>=win30Start||pick>=win30Start){
      binsUsed30[j.name+(j.address||'')]=true;
    }
    // Duration per size
    var dur=j.binPickup&&j.binDropoff?Math.max(0,Math.floor((new Date(j.binPickup)-new Date(j.binDropoff))/86400000)+1):0;
    if(dur>0&&durationBySize.hasOwnProperty(sz))durationBySize[sz].push(dur);
    // Utilization days
    var effectiveDrop=drop<winStart?winStart:drop;
    var effectivePick=pick>today2?today2:pick;
    if(effectiveDrop>effectivePick)return;
    var days=Math.max(0,Math.floor((new Date(effectivePick)-new Date(effectiveDrop))/86400000)+1);
    rentedDays+=days;
    if(rentedBySize.hasOwnProperty(sz))rentedBySize[sz]+=days;
    var city=extractCity(j.address,j.city);rentedByCity[city]=(rentedByCity[city]||0)+days;
  });

  var utilPct=totalPossibleDays?Math.round(rentedDays/totalPossibleDays*100):0;
  var avgDurAll=Object.values(durationBySize).reduce(function(a,arr){return a.concat(arr);}, []);
  var avgDur=avgDurAll.length?Math.round(avgDurAll.reduce(function(s,v){return s+v;},0)/avgDurAll.length*10)/10:0;

  // Idle bins: bins in fleet that had zero rentals in 30 days
  var idleBins=binItems.filter(function(b){
    var wasUsed=utilJobs.some(function(j){
      var drop=j.binDropoff||j.date;var pick=j.binPickup||today2;
      return (drop>=win30Start||pick>=win30Start)&&(j.binSize===b.size);
    });
    return !wasUsed;
  });

  // Use binItems.status as the single source of truth for current in/out
  // (same as renderBinInventory does — so all three pages always agree)
  var currentOut=binItems.filter(function(b){return b.status==='out';}).length;
  var currentIn=binItems.filter(function(b){return b.status==='in';}).length;
  document.getElementById('util-metrics').innerHTML=
    '<div class="metric-box"><div class="metric-val" id="utm-util" style="color:var(--accent)">0%</div><div class="metric-lbl">Overall Utilization (90d)</div></div>'
    +'<div class="metric-box"><div class="metric-val" id="utm-days">0</div><div class="metric-lbl">Bin-Days Rented (90d)</div></div>'
    +'<div class="metric-box"><div class="metric-val" id="utm-dur">0d</div><div class="metric-lbl">Avg Rental Duration</div></div>'
    +'<div class="metric-box"><div class="metric-val" id="utm-idle" style="color:'+(idleBins.length>0?'#dc3545':'#22c55e')+'">0</div><div class="metric-lbl">Idle Bins (30d)</div></div>'
    +'<div class="metric-box" style="grid-column:1/-1"><div style="display:flex;justify-content:center;gap:32px"><div style="text-align:center"><div class="metric-val" style="color:#dc3545">'+currentOut+'</div><div class="metric-lbl">Currently Out</div></div><div style="text-align:center"><div class="metric-val" style="color:#22c55e">'+currentIn+'</div><div class="metric-lbl">Currently In Yard</div></div><div style="text-align:center"><div class="metric-val" style="color:var(--text)">'+totalBinCount+'</div><div class="metric-lbl">Total Fleet</div></div></div><div style="height:8px;background:var(--surface2);border-radius:4px;margin:12px 0"><div style="height:100%;background:#dc3545;border-radius:4px;width:'+Math.round(totalBinCount?currentOut/totalBinCount*100:0)+'%"></div></div><div style="font-size:12px;color:var(--muted);text-align:center">'+Math.round(totalBinCount?currentOut/totalBinCount*100:0)+'% of fleet currently deployed</div></div>';
  requestAnimationFrame(function(){
    animCount(document.getElementById('utm-util'),utilPct,'','%');
    animCount(document.getElementById('utm-days'),rentedDays);
    animCount(document.getElementById('utm-idle'),idleBins.length);
    var durEl=document.getElementById('utm-dur');if(durEl)durEl.textContent=avgDur+'d';
  });

  // Utilization by size %
  var sizeData=Object.keys(rentedBySize).filter(function(k){return sizePossible[k]>0;}).map(function(k){return{key:k,val:Math.round(rentedBySize[k]/sizePossible[k]*100)};}).sort(function(a,b){return b.val-a.val;});
  document.getElementById('util-by-size').innerHTML=makeBarChart(sizeData,function(k){return sizeColors[k]||'#22c55e';},function(v){return v+'%';});

  // By city
  var cityData=Object.keys(rentedByCity).sort(function(a,b){return rentedByCity[b]-rentedByCity[a];}).slice(0,8).map(function(k){return{key:k,val:rentedByCity[k]};});
  document.getElementById('util-by-city').innerHTML=makeBarChart(cityData,function(){return '#22c55e';},function(v){return v+' days';});

  // Average duration by size
  var durData=Object.keys(durationBySize).filter(function(k){return durationBySize[k].length>0;}).map(function(k){var avg=Math.round(durationBySize[k].reduce(function(s,v){return s+v;},0)/durationBySize[k].length*10)/10;return{key:k,val:avg};}).sort(function(a,b){return b.val-a.val;});
  document.getElementById('util-avg-duration').innerHTML=makeBarChart(durData,function(k){return sizeColors[k]||'#22c55e';},function(v){return v+'d';});

  // Turnover (# rentals per size in 90d)
  var turnData=Object.keys(turnoverBySize).filter(function(k){return turnoverBySize[k]>0;}).map(function(k){return{key:k,val:turnoverBySize[k]};}).sort(function(a,b){return b.val-a.val;});
  document.getElementById('util-turnover').innerHTML=makeBarChart(turnData,function(k){return sizeColors[k]||'#22c55e';},function(v){return v+' rentals';});
  requestAnimationFrame(function(){['util-by-size','util-by-city','util-avg-duration','util-turnover'].forEach(function(id){animateBars(document.getElementById(id));});});

  // Idle bins panel
  var idleEl=document.getElementById('util-idle');
  if(!idleBins.length){
    idleEl.innerHTML='<div style="color:var(--accent);font-size:13px;padding:12px;text-align:center">✅ All bin sizes had at least one rental in the last 30 days</div>';
  } else {
    var idleBySize={};
    idleBins.forEach(function(b){idleBySize[b.size]=(idleBySize[b.size]||0)+1;});
    idleEl.innerHTML='<div style="font-size:13px;color:var(--muted);margin-bottom:10px">These bin sizes had no rentals in the last 30 days. Consider promotions or price adjustments.</div>'
      +Object.keys(idleBySize).map(function(sz){return'<div style="padding:8px 12px;border:1px solid rgba(220,53,69,.3);border-radius:8px;margin-bottom:6px;background:rgba(220,53,69,.05);display:flex;justify-content:space-between"><strong>'+sz+'</strong><span style="color:#dc3545;font-weight:700">'+idleBySize[sz]+' idle bins</span></div>';}).join('');
  }

  // Summary & planning
  var recommendation=utilPct>85?'🚨 Very high utilization — consider buying more bins'
    :utilPct>65?'✅ Healthy utilization — fleet is performing well'
    :utilPct>40?'⚠️ Moderate utilization — review pricing or run promotions'
    :'📉 Low utilization — consider promotions or reducing fleet size';

  // Best performing size
  var bestSize=sizeData.length?sizeData[0].key:'N/A';
  var bestSizePct=sizeData.length?sizeData[0].val:0;
  document.getElementById('util-summary').innerHTML=
    '<div style="padding:16px;border-radius:10px;background:var(--surface2);margin-bottom:16px">'
    +'<div style="font-size:15px;font-weight:600;margin-bottom:8px">'+recommendation+'</div>'
    +'<div style="font-size:13px;color:var(--muted)">Last 90 days: <strong style="color:var(--text)">'+totalBinCount+' bins × '+windowDays+' days = '+totalPossibleDays+' possible bin-days</strong>. '
    +'<strong style="color:var(--accent)">'+rentedDays+' bin-days were rented = '+utilPct+'% utilization.</strong></div>'
    +'</div>'
    +'<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px">'
    +['4 yard','7 yard','14 yard','20 yard'].map(function(sz){
      var poss=sizePossible[sz]||0;var pct=poss?Math.round(rentedBySize[sz]/poss*100):0;
      var cnt=binItems.filter(function(b){return b.size===sz;}).length;
      var inYard=binItems.filter(function(b){return b.size===sz&&b.status==='in';}).length;
      return'<div style="background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:14px;text-align:center">'
        +'<div style="font-family:\'Bebas Neue\',sans-serif;font-size:32px;color:'+(sizeColors[sz]||'#22c55e')+'">'+pct+'%</div>'
        +'<div style="font-size:12px;color:var(--text);font-weight:600;margin-bottom:4px">'+sz+'</div>'
        +'<div style="font-size:11px;color:var(--muted)">'+cnt+' bins · '+inYard+' in yard</div>'
        +'<div style="font-size:11px;color:var(--muted)">'+turnoverBySize[sz]+' rentals</div>'
        +'</div>';
    }).join('')
    +'</div>'
    +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">'
    +'<div style="background:var(--surface2);border-radius:8px;padding:12px"><div style="font-size:11px;color:var(--muted);margin-bottom:4px">🏆 HIGHEST UTILIZATION</div><div style="font-size:15px;font-weight:600">'+bestSize+'</div><div style="font-size:13px;color:var(--accent)">'+bestSizePct+'% utilized</div></div>'
    +'<div style="background:var(--surface2);border-radius:8px;padding:12px"><div style="font-size:11px;color:var(--muted);margin-bottom:4px">⏱️ AVG RENTAL LENGTH</div><div style="font-size:15px;font-weight:600">'+avgDur+' days</div><div style="font-size:13px;color:var(--muted)">across all sizes</div></div>'
    +'</div>';
}

