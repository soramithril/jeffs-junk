// ─── LEADERBOARD (Driver / Crew) ───
// Depends on app.js globals: db, toast, vehicles, crewMembers, crewAvatarColor,
// Chart, fd, todayStr (etc). Loaded via its own script tag before app.js.

// ── Leaderboard shared helpers ──
var activeLeaderboard='vehicles'; // 'vehicles' or 'crew'

function switchLeaderboard(tab){
  activeLeaderboard=tab;
  // Update dashboard tabs
  var vBtn=document.getElementById('lb-tab-vehicles');
  var cBtn=document.getElementById('lb-tab-crew');
  if(vBtn) vBtn.style.cssText='font-size:11px;padding:3px 10px;border-radius:6px;font-weight:600;'+(tab==='vehicles'?'background:rgba(34,197,94,.12);color:#15803d;':'');
  if(cBtn) cBtn.style.cssText='font-size:11px;padding:3px 10px;border-radius:6px;font-weight:600;'+(tab==='crew'?'background:rgba(34,197,94,.12);color:#15803d;':'');
  // Update page tabs
  var pvBtn=document.getElementById('lb-page-tab-vehicles');
  var pcBtn=document.getElementById('lb-page-tab-crew');
  if(pvBtn) pvBtn.style.cssText='font-size:12px;padding:5px 14px;border-radius:8px;font-weight:600;'+(tab==='vehicles'?'background:rgba(34,197,94,.12);color:#15803d;':'');
  if(pcBtn) pcBtn.style.cssText='font-size:12px;padding:5px 14px;border-radius:8px;font-weight:600;'+(tab==='crew'?'background:rgba(34,197,94,.12);color:#15803d;':'');
  // Use full page render if on leaderboard page, otherwise simple dashboard render
  var pageView=document.getElementById('view-leaderboard');
  if(pageView&&pageView.classList.contains('active')) renderLeaderboardPage();
  else renderActiveLeaderboard();
}
function getLeaderboardTargets(){
  var el=document.getElementById('dash-leaderboard');
  var periodEl=document.getElementById('leaderboard-period');
  return {el:el,periodEl:periodEl};
}
function renderActiveLeaderboard(){
  if(activeLeaderboard==='crew') renderCrewLeaderboard();
  else renderDriverLeaderboard();
}

function leaderboardEvtRow(label,count,color,icon){
  var barW=count?Math.min(100,count*15):0;
  return '<div style="display:flex;align-items:center;gap:8px;padding:3px 0">'
    +'<div style="width:14px;text-align:center;font-size:11px">'+icon+'</div>'
    +'<div style="width:100px;font-size:11px;color:var(--muted)">'+label+'</div>'
    +'<div style="flex:1;height:6px;background:rgba(0,0,0,.05);border-radius:3px;min-width:60px"><div style="height:100%;width:'+barW+'%;background:'+color+';border-radius:3px;transition:width .3s"></div></div>'
    +'<div style="width:28px;text-align:right;font-weight:700;font-size:12px;color:'+(count?color:'var(--muted)')+'">'+count+'</div>'
  +'</div>';
}

function leaderboardCleanBadge(totalEvents){
  return totalEvents===0
    ?'<div style="display:inline-flex;align-items:center;gap:4px;margin-top:4px;padding:2px 10px;border-radius:20px;background:rgba(34,197,94,.08);color:#16a34a;font-size:10px;font-weight:700;letter-spacing:.3px">✓ CLEAN RECORD</div>'
    :'<div style="display:inline-flex;align-items:center;gap:4px;margin-top:4px;padding:2px 10px;border-radius:20px;background:rgba(220,53,69,.08);color:#dc3545;font-size:10px;font-weight:700;letter-spacing:.3px">'+totalEvents+' event'+(totalEvents!==1?'s':'')+'</div>';
}

// ── Vehicle Leaderboard ──
async function renderDriverLeaderboard(){
  var t=getLeaderboardTargets();
  var el=t.el;if(!el)return;
  var days=t.periodEl?parseInt(t.periodEl.value):7;
  var fromDate=new Date();fromDate.setDate(fromDate.getDate()-days);
  var fromStr=fromDate.toISOString().split('T')[0];

  el.innerHTML='<div style="color:var(--muted);font-size:12px;text-align:center;padding:16px">Loading...</div>';

  var res=await db.from('driver_scores').select('*').gte('period_date',fromStr).order('period_date',{ascending:false});
  var rows=res.data||[];

  var vidSet={};vehicles.forEach(function(v){vidSet[v.vid]=true;});
  rows=rows.filter(function(r){return vidSet[r.vid];});

  var periodLabel=days===1?'Yesterday':(days+' Days');

  if(!rows.length){
    el.innerHTML='<div style="color:var(--muted);font-size:13px;text-align:center;padding:20px">No safety data for '+periodLabel+'. Scores are collected from Geotab every 6 hours.</div>';
    return;
  }

  var byVid={};
  rows.forEach(function(r){
    if(!byVid[r.vid]) byVid[r.vid]={vid:r.vid,name:r.driver_name,days:0,safety:0,harshBrake:0,harshAccel:0,speeding:0,seatbelt:0,cornering:0,distance:0,driveMin:0,idleMin:0};
    var d=byVid[r.vid];
    d.days++;d.name=r.driver_name||d.name;
    d.safety+=Number(r.safety_score);
    d.harshBrake+=r.harsh_braking;d.harshAccel+=r.harsh_accel;d.speeding+=r.speeding_events;d.seatbelt+=r.seatbelt_off;d.cornering+=(r.cornering_events||0);
    d.distance+=Number(r.distance_km);d.driveMin+=r.drive_minutes;d.idleMin+=r.idle_minutes;
  });

  var drivers=Object.values(byVid).map(function(d){
    d.avgSafety=d.days?Math.round(d.safety/d.days*10)/10:0;
    d.totalEvents=d.harshBrake+d.harshAccel+d.speeding+d.seatbelt+d.cornering;
    return d;
  });
  drivers.sort(function(a,b){return b.avgSafety-a.avgSafety;});

  var vehMap={};vehicles.forEach(function(v){vehMap[v.vid]={name:v.name,color:v.color};});

  var medals=['🥇','🥈','🥉'];
  el.innerHTML=drivers.map(function(d,i){
    var v=vehMap[d.vid]||{name:d.name,color:'#22c55e'};
    var medal=i<3?medals[i]:'<span style="font-size:14px;color:var(--muted);font-weight:700;width:22px;display:inline-block;text-align:center">'+(i+1)+'</span>';
    var safeColor=d.avgSafety>=90?'#22c55e':d.avgSafety>=70?'#e67e22':'#dc3545';

    var evtHtml=leaderboardEvtRow('Hard Braking',d.harshBrake,'#dc3545','🛑')
      +leaderboardEvtRow('Hard Accel',d.harshAccel,'#f97316','⚡')
      +leaderboardEvtRow('Speeding',d.speeding,'#e67e22','🏎️')
      +leaderboardEvtRow('Seatbelt Off',d.seatbelt,'#dc2626','🔓')
      +leaderboardEvtRow('Cornering',d.cornering,'#8b5cf6','↩️');

    return '<div style="border:1px solid var(--border);border-radius:12px;margin-bottom:10px;background:var(--surface2);overflow:hidden;transition:box-shadow .15s" onmouseover="this.style.boxShadow=\'0 2px 12px rgba(34,197,94,.08)\'" onmouseout="this.style.boxShadow=\'none\'">'
      +'<div style="display:flex;align-items:center;gap:12px;padding:12px 16px">'
        +'<div style="font-size:22px;flex-shrink:0;width:30px;text-align:center">'+medal+'</div>'
        +'<div style="flex:1;min-width:0">'
          +'<div style="font-weight:700;font-size:15px;display:flex;align-items:center;gap:6px"><span style="width:9px;height:9px;border-radius:50%;background:'+(v.color||'#22c55e')+'"></span>'+(v.name||d.name)+'</div>'
          +'<div style="font-size:11px;color:var(--muted);margin-top:1px">'+Math.round(d.distance)+' km · '+d.days+' day'+(d.days!==1?'s':'')+(d.driveMin?' · '+Math.round(d.driveMin)+' min driving':'')+'</div>'
        +'</div>'
        +'<div style="text-align:center;flex-shrink:0">'
          +'<div style="font-family:\'Bebas Neue\',sans-serif;font-size:38px;color:'+safeColor+';line-height:1">'+d.avgSafety+'</div>'
          +'<div style="font-size:8px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;font-weight:600">Safety Score</div>'
        +'</div>'
      +'</div>'
      +'<div style="padding:6px 16px 12px 58px;border-top:1px solid var(--border);background:rgba(0,0,0,.01)">'
        +evtHtml
        +leaderboardCleanBadge(d.totalEvents)
      +'</div>'
    +'</div>';
  }).join('');
}

// ── Crew Leaderboard ──
async function renderCrewLeaderboard(){
  var t=getLeaderboardTargets();
  var el=t.el;if(!el)return;
  var days=t.periodEl?parseInt(t.periodEl.value):7;
  var fromDate=new Date();fromDate.setDate(fromDate.getDate()-days);
  var fromStr=fromDate.toISOString().split('T')[0];

  el.innerHTML='<div style="color:var(--muted);font-size:12px;text-align:center;padding:16px">Loading...</div>';

  var res=await db.from('crew_driver_scores').select('*').gte('period_date',fromStr).order('period_date',{ascending:false});
  var rows=res.data||[];

  var periodLabel=days===1?'Yesterday':(days+' Days');

  if(!rows.length){
    el.innerHTML='<div style="color:var(--muted);font-size:13px;text-align:center;padding:20px">No crew safety data for '+periodLabel+'. Crew scores are generated when drivers are assigned to vehicles.</div>';
    return;
  }

  // Aggregate by crew_member_id
  var byCrew={};
  rows.forEach(function(r){
    var cid=r.crew_member_id;
    if(!byCrew[cid]) byCrew[cid]={crewId:cid,days:0,safety:0,harshBrake:0,harshAccel:0,speeding:0,seatbelt:0,cornering:0,distance:0,driveMin:0,vids:{}};
    var d=byCrew[cid];
    d.days++;
    d.safety+=Number(r.safety_score);
    d.harshBrake+=r.harsh_braking;d.harshAccel+=r.harsh_accel;d.speeding+=r.speeding_events;d.seatbelt+=r.seatbelt_off;d.cornering+=(r.cornering_events||0);
    d.distance+=Number(r.distance_km||0);d.driveMin+=(r.drive_minutes||0);
    (r.vehicles_driven||[]).forEach(function(v){d.vids[v]=true;});
  });

  // Map crew IDs to names
  var crewMap={};crewMembers.forEach(function(c){crewMap[c.id]=c.name;});

  var crew=Object.values(byCrew).map(function(d){
    d.name=crewMap[d.crewId]||'Unknown';
    d.avgSafety=d.days?Math.round(d.safety/d.days*10)/10:0;
    d.totalEvents=d.harshBrake+d.harshAccel+d.speeding+d.seatbelt+d.cornering;
    d.vehicleCount=Object.keys(d.vids).length;
    return d;
  });
  crew.sort(function(a,b){return b.avgSafety-a.avgSafety;});

  var medals=['🥇','🥈','🥉'];
  el.innerHTML=crew.map(function(d,i){
    var medal=i<3?medals[i]:'<span style="font-size:14px;color:var(--muted);font-weight:700;width:22px;display:inline-block;text-align:center">'+(i+1)+'</span>';
    var safeColor=d.avgSafety>=90?'#22c55e':d.avgSafety>=70?'#e67e22':'#dc3545';

    var evtHtml=leaderboardEvtRow('Hard Braking',d.harshBrake,'#dc3545','🛑')
      +leaderboardEvtRow('Hard Accel',d.harshAccel,'#f97316','⚡')
      +leaderboardEvtRow('Speeding',d.speeding,'#e67e22','🏎️')
      +leaderboardEvtRow('Seatbelt Off',d.seatbelt,'#dc2626','🔓')
      +leaderboardEvtRow('Cornering',d.cornering,'#8b5cf6','↩️');

    return '<div style="border:1px solid var(--border);border-radius:12px;margin-bottom:10px;background:var(--surface2);overflow:hidden;transition:box-shadow .15s" onmouseover="this.style.boxShadow=\'0 2px 12px rgba(34,197,94,.08)\'" onmouseout="this.style.boxShadow=\'none\'">'
      +'<div style="display:flex;align-items:center;gap:12px;padding:12px 16px">'
        +'<div style="font-size:22px;flex-shrink:0;width:30px;text-align:center">'+medal+'</div>'
        +'<div style="flex:1;min-width:0">'
          +'<div style="font-weight:700;font-size:15px">'+d.name+'</div>'
          +'<div style="font-size:11px;color:var(--muted);margin-top:1px">'+Math.round(d.distance)+' km · '+d.days+' day'+(d.days!==1?'s':'')+' · '+d.vehicleCount+' vehicle'+(d.vehicleCount!==1?'s':'')+(d.driveMin?' · '+Math.round(d.driveMin)+' min driving':'')+'</div>'
        +'</div>'
        +'<div style="text-align:center;flex-shrink:0">'
          +'<div style="font-family:\'Bebas Neue\',sans-serif;font-size:38px;color:'+safeColor+';line-height:1">'+d.avgSafety+'</div>'
          +'<div style="font-size:8px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;font-weight:600">Safety Score</div>'
        +'</div>'
      +'</div>'
      +'<div style="padding:6px 16px 12px 58px;border-top:1px solid var(--border);background:rgba(0,0,0,.01)">'
        +evtHtml
        +leaderboardCleanBadge(d.totalEvents)
      +'</div>'
    +'</div>';
  }).join('');
}

// Initialize leaderboard tab styling on load
document.addEventListener('DOMContentLoaded',function(){
  var sel=document.getElementById('leaderboard-period');
  if(sel)sel.addEventListener('change',function(){renderActiveLeaderboard();});
  switchLeaderboard('vehicles');
  initLeaderboardPage();
});

// ══════════════════════════════════════════════════════════
// ── Enhanced Leaderboard Page ──
// ══════════════════════════════════════════════════════════

var _lbPeriodMode='week';
var _lbTrendChart=null;
var _lbEventsChart=null;
var _lbIdleChart=null;
var _lbDistanceChart=null;
var _lbImprovChart=null;

// ── Crew-to-vehicle auto-assignments ──
// locked: true = cannot be removed (Max, Darrin)
// locked: false = auto-assigned daily but user can remove (Neil, Jordan, Josh)
var AUTO_ASSIGNMENTS=[
  {crew:'Max',    vehicleMatch:'SILVERADO',      locked:true},
  {crew:'Darrin', vehicleMatch:'Darrin Truck',    locked:true},
  {crew:'Neil',   vehicleMatch:'2020',            locked:false},
  {crew:'Jordan', vehicleMatch:'Furniture Bank',  locked:false},
  {crew:'Josh',   vehicleMatch:'L7 2023',         locked:false}
];

function isPermanentAssignment(crewName, vid){
  var v=vehicles.find(function(vv){return vv.vid===vid;});
  if(!v) return false;
  return AUTO_ASSIGNMENTS.some(function(pa){
    return pa.locked && v.name.indexOf(pa.vehicleMatch)>=0 && crewName.toLowerCase()===pa.crew.toLowerCase();
  });
}

function ensureAutoAssignments(){
  var todayISO=todayStr();
  AUTO_ASSIGNMENTS.forEach(function(pa){
    var v=vehicles.find(function(vv){return vv.name.indexOf(pa.vehicleMatch)>=0;});
    var c=crewMembers.find(function(cc){return cc.name.toLowerCase()===pa.crew.toLowerCase();});
    if(!v||!c) return;
    if(!vehicleAssignments[v.vid]) vehicleAssignments[v.vid]=[];
    var already=vehicleAssignments[v.vid].some(function(a){return a.crewMemberId===c.id && !a.endedAt;});
    if(already) return;
    // Auto-assign
    var now=new Date().toISOString();
    var newRec={id:null, crewMemberId:c.id, name:c.name, startedAt:now, endedAt:null};
    vehicleAssignments[v.vid].push(newRec);
    db.from('vehicle_assignments').upsert({vid:v.vid, crew_member_id:c.id, assignment_date:todayISO, started_at:now},{onConflict:'vid,crew_member_id,assignment_date',ignoreDuplicates:true}).select().then(function(r){
      if(r.error) console.warn('Auto-assignment failed:',r.error.message);
      if(r.data&&r.data[0]) newRec.id=r.data[0].id;
    });
  });
}

function renderLbAssignments(){
  var grid=document.getElementById('lb-assignments-grid');
  if(!grid) return;
  var allVehs=vehicles.filter(function(v){return v.active!==false;});
  grid.innerHTML=allVehs.map(function(v){
    var assigned=(vehicleAssignments[v.vid]||[]).filter(function(a){return !a.endedAt;});
    var crewHtml=assigned.length
      ? assigned.map(function(a){
          var perm=isPermanentAssignment(a.name, v.vid);
          return '<span class="lb-assign-crew'+(perm?' lb-assign-perm':'')+'">'
            +(perm?'🔒 ':'')+a.name
            +(perm?'':'<span class="lb-assign-x" onclick="event.stopPropagation();lbUnassignCrew(\''+v.vid+'\',\''+a.crewMemberId+'\')">&times;</span>')
            +'</span>';
        }).join('')
      : '<span style="font-size:11px;color:var(--muted);font-style:italic">No crew</span>';

    var menuId='lb-assign-menu-'+v.vid;
    // Build crew options (exclude already-assigned)
    var assignedIds={};assigned.forEach(function(a){assignedIds[a.crewMemberId]=true;});
    var opts=crewMembers.filter(function(c){return !assignedIds[c.id];}).map(function(c){
      var perm=isPermanentAssignment(c.name, v.vid);
      return '<div class="lb-assign-opt" onclick="event.stopPropagation();lbAssignCrew(\''+v.vid+'\',\''+c.id+'\')">'+c.name+'</div>';
    }).join('');

    return '<div class="lb-assign-card" onclick="lbToggleAssignMenu(\''+menuId+'\')">'
      +'<div class="lb-assign-vname">'+(v.leaderboardOnly?'':'🚛 ')+v.name+'</div>'
      +'<div class="lb-assign-crew-row">'+crewHtml+'</div>'
      +'<div id="'+menuId+'" class="lb-assign-menu" style="display:none;">'
      +(opts||'<div style="padding:8px 12px;font-size:11px;color:var(--muted)">All crew assigned</div>')
      +'</div>'
    +'</div>';
  }).join('');
}

function lbToggleAssignMenu(menuId){
  var m=document.getElementById(menuId);if(!m)return;
  var wasOpen=m.style.display!=='none';
  // Close all menus first
  document.querySelectorAll('.lb-assign-menu').forEach(function(el){el.style.display='none';});
  if(!wasOpen) m.style.display='block';
}

function lbAssignCrew(vid, crewId){
  document.querySelectorAll('.lb-assign-menu').forEach(function(el){el.style.display='none';});
  toggleCrewAssignment(vid, crewId);
  renderLbAssignments();
  renderDashVehicleStatus();
}

function lbUnassignCrew(vid, crewId){
  // Block unassigning permanent crew
  var crew=crewMembers.find(function(c){return c.id===crewId;});
  if(crew && isPermanentAssignment(crew.name, vid)) return;
  toggleCrewAssignment(vid, crewId);
  renderLbAssignments();
  renderDashVehicleStatus();
}

function initLeaderboardPage(){
  // Populate default date pickers
  var now=new Date();
  var wp=document.getElementById('lb-week-pick');
  if(wp){
    var jan4=new Date(now.getFullYear(),0,4);
    var sow=new Date(jan4);sow.setDate(jan4.getDate()-((jan4.getDay()||7)-1));
    var wn=Math.max(1,Math.min(52,Math.floor(1+(now-sow)/(7*86400000))));
    wp.value=now.getFullYear()+'-W'+(wn<10?'0':'')+wn;
  }
  var mp=document.getElementById('lb-month-pick');
  if(mp) mp.value=now.getFullYear()+'-'+(now.getMonth()+1<10?'0':'')+(now.getMonth()+1);

  // Quarter picker
  var qp=document.getElementById('lb-quarter-pick');
  if(qp){
    var html='';
    for(var y=now.getFullYear();y>=now.getFullYear()-2;y--){
      for(var q=4;q>=1;q--){
        var sel=(y===now.getFullYear()&&q===Math.ceil((now.getMonth()+1)/3))?'selected':'';
        html+='<option value="'+y+'-Q'+q+'" '+sel+'>Q'+q+' '+y+'</option>';
      }
    }
    qp.innerHTML=html;
  }

  // Year picker
  var yp=document.getElementById('lb-year-pick');
  if(yp){
    var html='';
    for(var y=now.getFullYear();y>=now.getFullYear()-3;y--){
      html+='<option value="'+y+'"'+(y===now.getFullYear()?' selected':'')+'>'+y+'</option>';
    }
    yp.innerHTML=html;
  }

  // Custom defaults
  var cf=document.getElementById('lb-custom-from');
  var ct=document.getElementById('lb-custom-to');
  if(cf) cf.value=new Date(now.getFullYear(),now.getMonth(),1).toISOString().split('T')[0];
  if(ct) ct.value=now.toISOString().split('T')[0];
}

function setLbPeriodMode(mode,btn){
  _lbPeriodMode=mode;
  document.querySelectorAll('.lb-period-btn').forEach(function(b){b.classList.remove('active');});
  if(btn)btn.classList.add('active');
  ['today','week','month','quarter','year','custom'].forEach(function(m){
    var el=document.getElementById('lb-date-'+m);
    if(el) el.style.display=(m===mode)?'flex':'none';
  });
  renderLeaderboardPage();
}

function getLbDateRange(){
  var now=new Date();
  var from,to;
  if(_lbPeriodMode==='today'){
    from=new Date(now.getFullYear(),now.getMonth(),now.getDate());
    to=new Date(now.getFullYear(),now.getMonth(),now.getDate());
  } else if(_lbPeriodMode==='week'){
    var wp=document.getElementById('lb-week-pick');
    if(wp&&wp.value){
      var parts=wp.value.split('-W');
      var y=parseInt(parts[0]),w=parseInt(parts[1]);
      var jan4=new Date(y,0,4);
      var sow=new Date(jan4);sow.setDate(jan4.getDate()-((jan4.getDay()||7)-1));
      from=new Date(sow);from.setDate(from.getDate()+(w-1)*7);
      to=new Date(from);to.setDate(to.getDate()+6);
    }
  } else if(_lbPeriodMode==='month'){
    var mp=document.getElementById('lb-month-pick');
    if(mp&&mp.value){
      var parts=mp.value.split('-');
      from=new Date(parseInt(parts[0]),parseInt(parts[1])-1,1);
      to=new Date(parseInt(parts[0]),parseInt(parts[1]),0);
    }
  } else if(_lbPeriodMode==='quarter'){
    var qp=document.getElementById('lb-quarter-pick');
    if(qp&&qp.value){
      var parts=qp.value.split('-Q');
      var y=parseInt(parts[0]),q=parseInt(parts[1]);
      from=new Date(y,(q-1)*3,1);
      to=new Date(y,q*3,0);
    }
  } else if(_lbPeriodMode==='year'){
    var yp=document.getElementById('lb-year-pick');
    if(yp&&yp.value){
      var y=parseInt(yp.value);
      from=new Date(y,0,1);
      to=new Date(y,11,31);
    }
  } else if(_lbPeriodMode==='custom'){
    var cf=document.getElementById('lb-custom-from');
    var ct=document.getElementById('lb-custom-to');
    if(cf&&cf.value) from=new Date(cf.value+'T12:00:00');
    if(ct&&ct.value) to=new Date(ct.value+'T12:00:00');
  }
  if(!from) from=new Date(now.getFullYear(),now.getMonth(),now.getDate()-7);
  if(!to) to=now;
  return {
    from:from.toISOString().split('T')[0],
    to:to.toISOString().split('T')[0],
    label:_lbPeriodMode==='today'?'Today — '+from.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):
          _lbPeriodMode==='month'?from.toLocaleDateString('en-US',{month:'long',year:'numeric'}):
          _lbPeriodMode==='quarter'?(document.getElementById('lb-quarter-pick')||{}).value||'':
          _lbPeriodMode==='year'?(document.getElementById('lb-year-pick')||{}).value||'':
          from.toLocaleDateString('en-US',{month:'short',day:'numeric'})+' – '+to.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})
  };
}

async function renderLeaderboardPage(){
  // Ensure permanent crew are assigned
  ensureAutoAssignments();
  renderLbAssignments();

  var range=getLbDateRange();
  var isCrewMode=activeLeaderboard==='crew';

  // Fetch data
  var rows=[];
  if(isCrewMode){
    var res=await db.from('crew_driver_scores').select('*').gte('period_date',range.from).lte('period_date',range.to).order('period_date',{ascending:true});
    rows=res.data||[];
  } else {
    var res=await db.from('driver_scores').select('*').gte('period_date',range.from).lte('period_date',range.to).order('period_date',{ascending:true});
    rows=res.data||[];
    var vidSet={};vehicles.forEach(function(v){vidSet[v.vid]=true;});
    rows=rows.filter(function(r){return vidSet[r.vid];});
  }

  renderLbWinnerBanner(rows,range,isCrewMode);
  renderLbStatCards(rows,range,isCrewMode);
  renderLbTrendChart(rows,isCrewMode);
  renderLbEventsChart(rows,isCrewMode);
  renderLbIdleChart(rows,isCrewMode);
  renderLbDistanceChart(rows,isCrewMode);
  renderLbImprovement(rows,range,isCrewMode);
  renderLbRankings(rows,range,isCrewMode);
}

// ── Winner Banner ──
function renderLbWinnerBanner(rows,range,isCrewMode){
  var el=document.getElementById('lb-winner-banner');if(!el)return;
  if(!rows.length){el.style.display='none';return;}

  var agg=aggregateLbRows(rows,isCrewMode);
  if(!agg.length){el.style.display='none';return;}
  agg.sort(function(a,b){return b.avgSafety-a.avgSafety;});
  var winner=agg[0];

  el.style.display='';
  el.innerHTML='<div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;">'
    +'<div style="font-size:48px;">🏆</div>'
    +'<div style="flex:1;min-width:200px;">'
      +'<div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--accent);margin-bottom:2px;">Top Performer — '+range.label+'</div>'
      +'<div style="font-size:24px;font-weight:800;">'+winner.name+'</div>'
      +'<div style="font-size:13px;color:var(--muted);margin-top:2px;">'+Math.round(winner.distance)+' km driven · '+winner.days+' day'+(winner.days!==1?'s':'')+' active · '+winner.totalEvents+' event'+(winner.totalEvents!==1?'s':'')+'</div>'
    +'</div>'
    +'<div style="text-align:center;">'
      +'<div style="font-family:\'Bebas Neue\',sans-serif;font-size:56px;color:'+(winner.avgSafety>=90?'#22c55e':winner.avgSafety>=70?'#e67e22':'#dc3545')+';line-height:1;">'+winner.avgSafety+'</div>'
      +'<div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);">Avg Safety Score</div>'
    +'</div>'
  +'</div>';
}

// ── Stat Cards ──
function renderLbStatCards(rows,range,isCrewMode){
  var el=document.getElementById('lb-stat-cards');if(!el)return;
  if(!rows.length){el.innerHTML='';return;}

  var agg=aggregateLbRows(rows,isCrewMode);
  var totalEvents=0,totalDist=0,totalDays=0,safetySum=0,cleanCount=0;
  agg.forEach(function(d){
    totalEvents+=d.totalEvents;totalDist+=d.distance;totalDays+=d.days;safetySum+=d.avgSafety;
    if(d.totalEvents===0) cleanCount++;
  });
  var fleetAvg=agg.length?Math.round(safetySum/agg.length*10)/10:0;

  var totalDriveHrs=0;
  agg.forEach(function(d){totalDriveHrs+=d.driveMin;});
  var driveDisplay=totalDriveHrs>=60?Math.round(totalDriveHrs/60)+'h':Math.round(totalDriveHrs)+'m';

  el.innerHTML=lbStatCard('Fleet Avg Safety',fleetAvg,fleetAvg>=90?'#22c55e':fleetAvg>=70?'#e67e22':'#dc3545','📊')
    +lbStatCard('Total Events',totalEvents,totalEvents===0?'#22c55e':'#dc3545','⚠️')
    +lbStatCard('Clean Records',cleanCount+'/'+agg.length,'#22c55e','✅')
    +lbStatCard('Total Distance',Math.round(totalDist)+' km','var(--text)','🛣️')
    +lbStatCard('Drive Time',driveDisplay,'var(--text)','⏱️');
}

function lbStatCard(label,value,color,icon){
  return '<div class="stat-card" style="flex:1;min-width:140px;"><div class="stat-icon">'+icon+'</div><div class="stat-value" style="color:'+color+'">'+value+'</div><div class="stat-label">'+label+'</div></div>';
}

// ── Trend Chart ──
function renderLbTrendChart(rows,isCrewMode){
  var ctx=document.getElementById('lb-trend-chart');if(!ctx)return;
  if(_lbTrendChart){_lbTrendChart.destroy();_lbTrendChart=null;}
  if(!rows.length)return;

  // Group by date and entity
  var entities={};
  rows.forEach(function(r){
    var key=isCrewMode?r.crew_member_id:r.vid;
    if(!entities[key])entities[key]={name:'',dates:{}};
    entities[key].dates[r.period_date]=Number(r.safety_score);
    entities[key].name=isCrewMode?(crewMembers.find(function(c){return c.id===key;})||{}).name||'Unknown':(vehicles.find(function(v){return v.vid===key;})||{}).name||r.driver_name||key;
  });

  var allDates=[];
  rows.forEach(function(r){if(allDates.indexOf(r.period_date)===-1)allDates.push(r.period_date);});
  allDates.sort();

  var colors=['#22c55e','#3b82f6','#f97316','#8b5cf6','#ec4899','#14b8a6','#eab308','#dc3545'];
  var datasets=[];var ci=0;
  Object.keys(entities).forEach(function(key){
    var ent=entities[key];
    var data=allDates.map(function(d){return ent.dates[d]!==undefined?ent.dates[d]:null;});
    datasets.push({
      label:ent.name,
      data:data,
      borderColor:colors[ci%colors.length],
      backgroundColor:colors[ci%colors.length]+'20',
      tension:0.3,
      pointRadius:3,
      pointHoverRadius:6,
      fill:false
    });
    ci++;
  });

  var isDark=document.documentElement.getAttribute('data-theme')==='dark';
  var gridColor=isDark?'rgba(255,255,255,.08)':'rgba(0,0,0,.06)';
  var textColor=isDark?'#aaa':'#666';

  _lbTrendChart=new Chart(ctx,{
    type:'line',
    data:{labels:allDates.map(function(d){return new Date(d+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'});}),datasets:datasets},
    options:{
      responsive:true,maintainAspectRatio:false,
      interaction:{mode:'index',intersect:false},
      scales:{
        y:{min:0,max:100,grid:{color:gridColor},ticks:{color:textColor,font:{size:11}}},
        x:{grid:{display:false},ticks:{color:textColor,font:{size:10},maxTicksLimit:15}}
      },
      plugins:{legend:{position:'bottom',labels:{usePointStyle:true,pointStyle:'circle',padding:12,font:{size:11},color:textColor}}}
    }
  });
}

// ── Events Breakdown Chart ──
function renderLbEventsChart(rows,isCrewMode){
  var ctx=document.getElementById('lb-events-chart');if(!ctx)return;
  if(_lbEventsChart){_lbEventsChart.destroy();_lbEventsChart=null;}
  if(!rows.length)return;

  var agg=aggregateLbRows(rows,isCrewMode);
  agg.sort(function(a,b){return b.totalEvents-a.totalEvents;});

  var labels=agg.map(function(d){return d.name;});
  var isDark=document.documentElement.getAttribute('data-theme')==='dark';
  var gridColor=isDark?'rgba(255,255,255,.08)':'rgba(0,0,0,.06)';
  var textColor=isDark?'#aaa':'#666';

  _lbEventsChart=new Chart(ctx,{
    type:'bar',
    data:{
      labels:labels,
      datasets:[
        {label:'Hard Braking',data:agg.map(function(d){return d.harshBrake;}),backgroundColor:'#dc3545'},
        {label:'Hard Accel',data:agg.map(function(d){return d.harshAccel;}),backgroundColor:'#f97316'},
        {label:'Speeding',data:agg.map(function(d){return d.speeding;}),backgroundColor:'#e67e22'},
        {label:'Seatbelt Off',data:agg.map(function(d){return d.seatbelt;}),backgroundColor:'#dc2626'},
        {label:'Cornering',data:agg.map(function(d){return d.cornering;}),backgroundColor:'#8b5cf6'}
      ]
    },
    options:{
      responsive:true,maintainAspectRatio:false,
      scales:{
        x:{stacked:true,grid:{display:false},ticks:{color:textColor,font:{size:10}}},
        y:{stacked:true,grid:{color:gridColor},ticks:{color:textColor,font:{size:11},stepSize:1}}
      },
      plugins:{legend:{position:'bottom',labels:{usePointStyle:true,pointStyle:'rect',padding:12,font:{size:10},color:textColor}}}
    }
  });
}

// ── Idle vs Drive Chart ──
function renderLbIdleChart(rows,isCrewMode){
  var ctx=document.getElementById('lb-idle-chart');if(!ctx)return;
  if(_lbIdleChart){_lbIdleChart.destroy();_lbIdleChart=null;}
  // Manage the "no data" message for crew mode
  var idleWrap=ctx.parentElement;
  var idleMsg=document.getElementById('lb-idle-no-data');
  if(!idleMsg&&idleWrap){idleWrap.insertAdjacentHTML('beforeend','<div id="lb-idle-no-data" style="display:none;color:var(--muted);font-size:13px;text-align:center;padding:40px 0;position:absolute;inset:0;display:none;align-items:center;justify-content:center;">Idle data is only available for vehicles</div>');}
  idleMsg=document.getElementById('lb-idle-no-data');
  if(!rows.length||isCrewMode){
    ctx.style.display='none';
    if(idleMsg)idleMsg.style.display=isCrewMode?'flex':'none';
    return;
  }
  ctx.style.display='';
  if(idleMsg)idleMsg.style.display='none';

  var agg=aggregateLbRows(rows,false);
  agg.sort(function(a,b){return b.driveMin-a.driveMin;});
  var labels=agg.map(function(d){return d.name;});

  var isDark=document.documentElement.getAttribute('data-theme')==='dark';
  var gridColor=isDark?'rgba(255,255,255,.08)':'rgba(0,0,0,.06)';
  var textColor=isDark?'#aaa':'#666';

  _lbIdleChart=new Chart(ctx,{
    type:'bar',
    data:{
      labels:labels,
      datasets:[
        {label:'Drive (min)',data:agg.map(function(d){return Math.round(d.driveMin);}),backgroundColor:'#22c55e'},
        {label:'Idle (min)',data:agg.map(function(d){return Math.round(d.idleMin);}),backgroundColor:'#f97316'}
      ]
    },
    options:{
      responsive:true,maintainAspectRatio:false,
      scales:{
        x:{stacked:true,grid:{display:false},ticks:{color:textColor,font:{size:10}}},
        y:{stacked:true,grid:{color:gridColor},ticks:{color:textColor,font:{size:11}}}
      },
      plugins:{legend:{position:'bottom',labels:{usePointStyle:true,pointStyle:'rect',padding:12,font:{size:10},color:textColor}}}
    }
  });
}

// ── Distance Chart ──
function renderLbDistanceChart(rows,isCrewMode){
  var ctx=document.getElementById('lb-distance-chart');if(!ctx)return;
  if(_lbDistanceChart){_lbDistanceChart.destroy();_lbDistanceChart=null;}
  if(!rows.length)return;

  var agg=aggregateLbRows(rows,isCrewMode);
  agg.sort(function(a,b){return b.distance-a.distance;});
  var labels=agg.map(function(d){return d.name;});

  var isDark=document.documentElement.getAttribute('data-theme')==='dark';
  var gridColor=isDark?'rgba(255,255,255,.08)':'rgba(0,0,0,.06)';
  var textColor=isDark?'#aaa':'#666';

  _lbDistanceChart=new Chart(ctx,{
    type:'bar',
    data:{
      labels:labels,
      datasets:[{label:'Distance (km)',data:agg.map(function(d){return Math.round(d.distance);}),backgroundColor:'#3b82f6'}]
    },
    options:{
      responsive:true,maintainAspectRatio:false,
      indexAxis:'horizontal',
      scales:{
        x:{grid:{display:false},ticks:{color:textColor,font:{size:10}}},
        y:{grid:{color:gridColor},ticks:{color:textColor,font:{size:11}}}
      },
      plugins:{legend:{display:false}}
    }
  });
}

// ── Improvement Tracker ──
function renderLbImprovement(rows,range,isCrewMode){
  var chartCtx=document.getElementById('lb-improvement-chart');
  var cardsEl=document.getElementById('lb-improvement-cards');
  var sectionEl=document.getElementById('lb-improvement-section');
  if(_lbImprovChart){_lbImprovChart.destroy();_lbImprovChart=null;}
  if(!cardsEl||!sectionEl)return;

  if(rows.length<2){
    sectionEl.style.display='none';
    return;
  }
  sectionEl.style.display='';

  // Sort rows by date and split into first half / second half
  var sorted=rows.slice().sort(function(a,b){return a.period_date.localeCompare(b.period_date);});
  var mid=Math.floor(sorted.length/2);
  var firstHalf=sorted.slice(0,mid);
  var secondHalf=sorted.slice(mid);

  var firstStart=firstHalf.length?firstHalf[0].period_date:'';
  var firstEnd=firstHalf.length?firstHalf[firstHalf.length-1].period_date:'';
  var secondStart=secondHalf.length?secondHalf[0].period_date:'';
  var secondEnd=secondHalf.length?secondHalf[secondHalf.length-1].period_date:'';

  function fd(d){return new Date(d+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'});}
  var firstLabel=firstStart?fd(firstStart)+' – '+fd(firstEnd):'First Half';
  var secondLabel=secondStart?fd(secondStart)+' – '+fd(secondEnd):'Second Half';

  // Aggregate each half by entity
  function aggHalf(half){
    var byE={};
    half.forEach(function(r){
      var key=isCrewMode?r.crew_member_id:r.vid;
      if(!byE[key])byE[key]={safety:0,events:0,distance:0,driveMin:0,n:0};
      byE[key].safety+=Number(r.safety_score);
      byE[key].events+=(r.harsh_braking||0)+(r.harsh_accel||0)+(r.speeding_events||0)+(r.seatbelt_off||0)+(r.cornering_events||0);
      byE[key].distance+=Number(r.distance_km||0);
      byE[key].driveMin+=(r.drive_minutes||0);
      byE[key].n++;
    });
    // Compute averages
    Object.keys(byE).forEach(function(k){
      var d=byE[k];
      d.avgSafety=d.n?Math.round(d.safety/d.n*10)/10:0;
      d.avgEvents=d.n?Math.round(d.events/d.n*10)/10:0;
    });
    return byE;
  }

  var first=aggHalf(firstHalf);
  var second=aggHalf(secondHalf);

  // Build improvement data for entities present in both halves
  var allKeys={};
  Object.keys(first).forEach(function(k){allKeys[k]=true;});
  Object.keys(second).forEach(function(k){allKeys[k]=true;});

  var improvements=[];
  Object.keys(allKeys).forEach(function(key){
    var f=first[key]||{avgSafety:0,avgEvents:0,events:0,distance:0,driveMin:0,n:0};
    var s=second[key]||{avgSafety:0,avgEvents:0,events:0,distance:0,driveMin:0,n:0};
    var name;
    if(isCrewMode){
      name=(crewMembers.find(function(c){return c.id===key;})||{}).name||'Unknown';
    } else {
      name=(vehicles.find(function(v){return v.vid===key;})||{}).name||key;
    }
    var safetyDelta=Math.round((s.avgSafety-f.avgSafety)*10)/10;
    var safetyPct=f.avgSafety>0?Math.round((safetyDelta/f.avgSafety)*1000)/10:0;
    var eventsDelta=Math.round((s.avgEvents-f.avgEvents)*10)/10;
    var eventsPct=f.avgEvents>0?Math.round((eventsDelta/f.avgEvents)*1000)/10:0;
    improvements.push({
      key:key,name:name,
      firstSafety:f.avgSafety,secondSafety:s.avgSafety,
      safetyDelta:safetyDelta,safetyPct:safetyPct,
      firstEvents:f.avgEvents,secondEvents:s.avgEvents,
      eventsDelta:eventsDelta,eventsPct:eventsPct,
      firstTotalEvents:f.events,secondTotalEvents:s.events,
      firstDistance:Math.round(f.distance),secondDistance:Math.round(s.distance),
      firstDays:f.n,secondDays:s.n
    });
  });

  improvements.sort(function(a,b){return b.safetyDelta-a.safetyDelta;});

  // ── Chart: grouped bar (first half vs second half safety) ──
  if(chartCtx){
    var isDark=document.documentElement.getAttribute('data-theme')==='dark';
    var gridColor=isDark?'rgba(255,255,255,.08)':'rgba(0,0,0,.06)';
    var textColor=isDark?'#aaa':'#666';

    _lbImprovChart=new Chart(chartCtx,{
      type:'bar',
      data:{
        labels:improvements.map(function(d){return d.name;}),
        datasets:[
          {label:firstLabel+' (avg safety)',data:improvements.map(function(d){return d.firstSafety;}),backgroundColor:'rgba(59,130,246,.6)',borderRadius:4},
          {label:secondLabel+' (avg safety)',data:improvements.map(function(d){return d.secondSafety;}),backgroundColor:'rgba(34,197,94,.7)',borderRadius:4}
        ]
      },
      options:{
        responsive:true,maintainAspectRatio:false,
        scales:{
          x:{grid:{display:false},ticks:{color:textColor,font:{size:11}}},
          y:{min:0,max:100,grid:{color:gridColor},ticks:{color:textColor,font:{size:11}}}
        },
        plugins:{
          legend:{position:'bottom',labels:{usePointStyle:true,pointStyle:'rect',padding:12,font:{size:11},color:textColor}},
          tooltip:{callbacks:{afterBody:function(ctx){
            var i=ctx[0].dataIndex;
            var d=improvements[i];
            return 'Change: '+(d.safetyDelta>=0?'+':'')+d.safetyDelta+' ('+(d.safetyPct>=0?'+':'')+d.safetyPct+'%)';
          }}}
        }
      }
    });
  }

  // ── Cards: detailed breakdown per person ──
  cardsEl.innerHTML=improvements.map(function(d){
    var safeColor=d.safetyDelta>0?'#22c55e':d.safetyDelta<0?'#dc3545':'var(--muted)';
    var evtColor=d.eventsDelta<0?'#22c55e':d.eventsDelta>0?'#dc3545':'var(--muted)';
    var safeArrow=d.safetyDelta>0?'▲':d.safetyDelta<0?'▼':'—';
    var evtArrow=d.eventsDelta<0?'▼':d.eventsDelta>0?'▲':'—';

    // Safety score bar visual
    var firstW=d.firstSafety;
    var secondW=d.secondSafety;

    return '<div style="border:1px solid var(--border);border-radius:10px;padding:14px 16px;margin-bottom:10px;background:var(--surface2)">'
      +'<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">'
        +'<div style="font-weight:700;font-size:14px;">'+d.name+'</div>'
        +'<div style="display:flex;align-items:center;gap:8px;">'
          +'<span style="font-family:\'Bebas Neue\',sans-serif;font-size:28px;color:'+safeColor+';line-height:1;">'+(d.safetyDelta>=0?'+':'')+d.safetyDelta+'</span>'
          +'<span style="font-size:12px;font-weight:700;color:'+safeColor+';background:'+safeColor+'14;padding:2px 8px;border-radius:6px;">'+(d.safetyPct>=0?'+':'')+d.safetyPct+'%</span>'
        +'</div>'
      +'</div>'
      // Safety score comparison
      +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:10px;">'
        +'<div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:10px 12px;">'
          +'<div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);margin-bottom:4px;">'+firstLabel+'</div>'
          +'<div style="display:flex;align-items:baseline;gap:8px;">'
            +'<span style="font-size:24px;font-weight:800;color:'+(d.firstSafety>=90?'#22c55e':d.firstSafety>=70?'#e67e22':'#dc3545')+'">'+d.firstSafety+'</span>'
            +'<span style="font-size:11px;color:var(--muted)">safety avg</span>'
          +'</div>'
          +'<div style="height:4px;background:rgba(0,0,0,.06);border-radius:2px;margin-top:6px;"><div style="height:100%;width:'+firstW+'%;background:rgba(59,130,246,.5);border-radius:2px;"></div></div>'
          +'<div style="font-size:11px;color:var(--muted);margin-top:6px;">'+d.firstTotalEvents+' events · '+d.firstDistance+' km · '+d.firstDays+' day'+(d.firstDays!==1?'s':'')+'</div>'
        +'</div>'
        +'<div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:10px 12px;">'
          +'<div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);margin-bottom:4px;">'+secondLabel+'</div>'
          +'<div style="display:flex;align-items:baseline;gap:8px;">'
            +'<span style="font-size:24px;font-weight:800;color:'+(d.secondSafety>=90?'#22c55e':d.secondSafety>=70?'#e67e22':'#dc3545')+'">'+d.secondSafety+'</span>'
            +'<span style="font-size:11px;color:var(--muted)">safety avg</span>'
          +'</div>'
          +'<div style="height:4px;background:rgba(0,0,0,.06);border-radius:2px;margin-top:6px;"><div style="height:100%;width:'+secondW+'%;background:rgba(34,197,94,.6);border-radius:2px;"></div></div>'
          +'<div style="font-size:11px;color:var(--muted);margin-top:6px;">'+d.secondTotalEvents+' events · '+d.secondDistance+' km · '+d.secondDays+' day'+(d.secondDays!==1?'s':'')+'</div>'
        +'</div>'
      +'</div>'
      // Events change
      +'<div style="display:flex;gap:16px;font-size:12px;color:var(--muted);border-top:1px solid var(--border);padding-top:8px;">'
        +'<span>Events/day: '+d.firstEvents+' → '+d.secondEvents+' <span style="color:'+evtColor+';font-weight:700">'+evtArrow+' '+(d.eventsPct>=0?'+':'')+d.eventsPct+'%</span></span>'
        +'<span>Distance: '+d.firstDistance+' → '+d.secondDistance+' km</span>'
      +'</div>'
    +'</div>';
  }).join('');
}

// ── Rankings (reuses existing card style) ──
function renderLbRankings(rows,range,isCrewMode){
  var el=document.getElementById('page-leaderboard');if(!el)return;
  var titleEl=document.getElementById('lb-rankings-title');

  if(!rows.length){
    el.innerHTML='<div style="color:var(--muted);font-size:13px;text-align:center;padding:30px">No data for '+range.label+'.</div>';
    if(titleEl)titleEl.textContent='Rankings';
    return;
  }

  var agg=aggregateLbRows(rows,isCrewMode);
  agg.sort(function(a,b){return b.avgSafety-a.avgSafety;});
  if(titleEl)titleEl.textContent='Rankings — '+range.label;

  var vehMap={};vehicles.forEach(function(v){vehMap[v.vid]={name:v.name,color:v.color};});
  var medals=['🥇','🥈','🥉'];

  el.innerHTML=agg.map(function(d,i){
    var medal=i<3?medals[i]:'<span style="font-size:14px;color:var(--muted);font-weight:700;width:22px;display:inline-block;text-align:center">'+(i+1)+'</span>';
    var safeColor=d.avgSafety>=90?'#22c55e':d.avgSafety>=70?'#e67e22':'#dc3545';
    var v=isCrewMode?null:vehMap[d.id];
    var dotHtml=v?'<span style="width:9px;height:9px;border-radius:50%;background:'+(v.color||'#22c55e')+'"></span>':'';

    var evtHtml=leaderboardEvtRow('Hard Braking',d.harshBrake,'#dc3545','🛑')
      +leaderboardEvtRow('Hard Accel',d.harshAccel,'#f97316','⚡')
      +leaderboardEvtRow('Speeding',d.speeding,'#e67e22','🏎️')
      +leaderboardEvtRow('Seatbelt Off',d.seatbelt,'#dc2626','🔓')
      +leaderboardEvtRow('Cornering',d.cornering,'#8b5cf6','↩️');

    // Extra metrics row
    var extraHtml='<div style="display:flex;gap:16px;flex-wrap:wrap;margin-top:8px;padding-top:8px;border-top:1px dashed var(--border);font-size:11px;color:var(--muted)">';
    extraHtml+='<span>🛣️ '+Math.round(d.distance)+' km</span>';
    extraHtml+='<span>⏱️ '+Math.round(d.driveMin)+' min driving</span>';
    if(!isCrewMode){
      extraHtml+='<span>💤 '+Math.round(d.idleMin)+' min idle</span>';
      extraHtml+='<span>🅿️ '+Math.round(d.stopMin)+' min stopped</span>';
      if(d.efficiencyAvg!==undefined) extraHtml+='<span>⚡ Efficiency: '+d.efficiencyAvg+'</span>';
    }
    extraHtml+='<span>📅 '+d.days+' day'+(d.days!==1?'s':'')+'</span>';
    extraHtml+='</div>';

    return '<div style="border:1px solid var(--border);border-radius:12px;margin-bottom:10px;background:var(--surface2);overflow:hidden;transition:box-shadow .15s" onmouseover="this.style.boxShadow=\'0 2px 12px rgba(34,197,94,.08)\'" onmouseout="this.style.boxShadow=\'none\'">'
      +'<div style="display:flex;align-items:center;gap:12px;padding:12px 16px">'
        +'<div style="font-size:22px;flex-shrink:0;width:30px;text-align:center">'+medal+'</div>'
        +'<div style="flex:1;min-width:0">'
          +'<div style="font-weight:700;font-size:15px;display:flex;align-items:center;gap:6px">'+dotHtml+d.name+'</div>'
          +'<div style="font-size:11px;color:var(--muted);margin-top:1px">'+Math.round(d.distance)+' km · '+d.days+' day'+(d.days!==1?'s':'')+(d.driveMin?' · '+Math.round(d.driveMin)+' min driving':'')+'</div>'
        +'</div>'
        +'<div style="text-align:center;flex-shrink:0">'
          +'<div style="font-family:\'Bebas Neue\',sans-serif;font-size:38px;color:'+safeColor+';line-height:1">'+d.avgSafety+'</div>'
          +'<div style="font-size:8px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;font-weight:600">Safety Score</div>'
        +'</div>'
      +'</div>'
      +'<div style="padding:6px 16px 12px 58px;border-top:1px solid var(--border);background:rgba(0,0,0,.01)">'
        +evtHtml
        +leaderboardCleanBadge(d.totalEvents)
        +extraHtml
      +'</div>'
    +'</div>';
  }).join('');
}

// ── Shared aggregation helper ──
function aggregateLbRows(rows,isCrewMode){
  var byEntity={};
  rows.forEach(function(r){
    var key=isCrewMode?r.crew_member_id:r.vid;
    if(!byEntity[key]) byEntity[key]={id:key,name:'',days:0,safety:0,harshBrake:0,harshAccel:0,speeding:0,seatbelt:0,cornering:0,distance:0,driveMin:0,idleMin:0,stopMin:0,efficiency:0};
    var d=byEntity[key];
    d.days++;
    d.safety+=Number(r.safety_score);
    d.harshBrake+=(r.harsh_braking||0);d.harshAccel+=(r.harsh_accel||0);d.speeding+=(r.speeding_events||0);d.seatbelt+=(r.seatbelt_off||0);d.cornering+=(r.cornering_events||0);
    d.distance+=Number(r.distance_km||0);d.driveMin+=(r.drive_minutes||0);d.idleMin+=(r.idle_minutes||0);d.stopMin+=(r.stop_minutes||0);
    d.efficiency+=Number(r.efficiency_score||0);
    if(isCrewMode){
      d.name=(crewMembers.find(function(c){return c.id===key;})||{}).name||'Unknown';
    } else {
      d.name=(vehicles.find(function(v){return v.vid===key;})||{}).name||r.driver_name||key;
    }
  });
  return Object.values(byEntity).map(function(d){
    d.avgSafety=d.days?Math.round(d.safety/d.days*10)/10:0;
    d.totalEvents=d.harshBrake+d.harshAccel+d.speeding+d.seatbelt+d.cornering;
    d.efficiencyAvg=d.days?Math.round(d.efficiency/d.days*10)/10:0;
    return d;
  });
}

