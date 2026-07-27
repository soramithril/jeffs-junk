/* ===== app-cuttimes.js ===== */
// Cut Times — how long Darrin's truck spends at each cutting location.
// Built from a MyGeotab stop-history pull; method and rules live in
// docs/cut-times/SPEC.md (local only — the raw pull is customer addresses and
// one employee's movements, and this repo is public). The snapshot lives in
// jwg_cut_locations / jwg_cut_visits, readable by signed-in staff.
// Renders as a sub-view of the JWG Summer page — app-jwg-scheduler.js calls
// CutTimes.mount().
(function(){
"use strict";

// The truck parks overnight at the Ottaway Ave yard. Shown on the map, never counted as a cut.
var HOME=[{lat:44.40353,lon:-79.69292,label:"22 Ottaway Ave (home base)"},
          {lat:44.40405,lon:-79.69155,label:"42 Ottaway Ave (home base)"}];
var COL={loc:"#057334",flag:"#dc2626",home:"#555555"};
var MONTHS=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

var LOCS=null,VISITS=null,BY_ADDR=null;
var map=null,markers={},sortK="visits",sortDir=-1;

function esc(s){return String(s).replace(/[&<>"]/g,function(c){
  return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c];});}
function short(a){return a.replace(/, ON.*$/,"").replace(/, Canada$/,"");}
function niceDate(d){var p=d.split("-");return MONTHS[+p[1]-1]+" "+(+p[2]);}

// Postgres numerics arrive as strings, so every number is coerced here rather
// than at each use site.
function loadData(){
  if(LOCS&&VISITS)return Promise.resolve();
  return Promise.all([
    db.from("jwg_cut_locations").select("cl,address,lat,lon,visits,avg_min,median_min,min_min,max_min,total_hrs,flagged"),
    db.from("jwg_cut_visits").select("cl,address,type,visit_date,day,arrive,depart,dur_min,flag")
  ]).then(function(res){
    res.forEach(function(r){if(r.error)throw new Error("Cut Times: "+r.error.message);});
    LOCS=res[0].data.map(function(o){return{
      cl:o.cl,address:o.address,lat:+o.lat,lon:+o.lon,visits:+o.visits,
      avg:+o.avg_min,median:+o.median_min,min:+o.min_min,max:+o.max_min,
      total_hrs:+o.total_hrs,flagged:+o.flagged};});
    VISITS=res[1].data.map(function(v){return{
      cl:v.cl,address:v.address,type:v.type,date:v.visit_date,day:v.day,
      arrive:v.arrive,depart:v.depart,dur_min:+v.dur_min,flag:v.flag};});
    BY_ADDR={};LOCS.forEach(function(o){BY_ADDR[o.address]=o;});
  });
}

// ── derived numbers ──
// A "cut" is a job_visit: 15 min to 6 h, away from home base. Quick stops and
// overnight parks are classified in the data and stay out of the averages.
function cuts(){return VISITS.filter(function(v){return v.type==="job_visit";});}
function flagged(){return VISITS.filter(function(v){return v.flag;});}
function longParks(){return VISITS.filter(function(v){return v.type==="long_park";});}

function stats(){
  var c=cuts(),mins=c.reduce(function(s,v){return s+v.dur_min;},0);
  return{cuts:c.length,locations:LOCS.length,avg:Math.round(mins/c.length),
         hours:Math.round(mins/60),flags:flagged().length};
}

function dateRange(){
  var d=VISITS.map(function(v){return v.date;}).sort();
  return niceDate(d[0])+" – "+niceDate(d[d.length-1])+", "+d[0].slice(0,4);
}

// ── markup ──
function shell(){
  return'<div class="ctm-head">'+
      '<div class="ctm-title">Cut Times</div>'+
      '<div class="ctm-sub">Darrin Truck stop history from MyGeotab · '+esc(dateRange())+' · times in minutes, Eastern</div>'+
    '</div>'+
    '<div class="ctm-tiles" id="ctm-tiles"></div>'+
    '<div class="ctm-grid">'+
      '<div class="ctm-panel">'+
        '<div class="ctm-h2">Where the truck stops</div>'+
        '<div id="ctm-map"></div>'+
        '<div class="ctm-legend">'+
          '<span class="ctm-l1">Cut location</span>'+
          '<span class="ctm-l2">Has over-normal visits</span>'+
          '<span class="ctm-l3">Home base</span>'+
        '</div>'+
      '</div>'+
      '<div class="ctm-panel">'+
        '<div class="ctm-h2">Average time per location'+
          '<span class="ctm-hint">click a column to sort, a row to zoom the map</span></div>'+
        '<div class="ctm-scroll"><table class="ctm-table" id="ctm-loctable">'+
          '<thead><tr>'+
            '<th data-k="address">Location</th>'+
            '<th class="num" data-k="visits">Visits</th>'+
            '<th class="num" data-k="avg">Avg</th>'+
            '<th class="num" data-k="min">Min</th>'+
            '<th class="num" data-k="max">Max</th>'+
            '<th class="num" data-k="flagged">Over</th>'+
          '</tr></thead><tbody></tbody>'+
        '</table></div>'+
      '</div>'+
    '</div>'+
    '<div class="ctm-panel ctm-panel-wide">'+
      '<div class="ctm-h2">Visits that ran long <span class="ctm-badge" id="ctm-flagcount"></span></div>'+
      '<div class="ctm-scroll ctm-scroll-sm"><table class="ctm-table" id="ctm-flagtable">'+
        '<thead><tr><th>Date</th><th>Location</th><th class="num">Took</th>'+
        '<th class="num">Location avg</th><th class="num">Over by</th></tr></thead><tbody></tbody>'+
      '</table></div>'+
    '</div>'+
    '<p class="ctm-note" id="ctm-note"></p>';
}

function renderTiles(){
  var t=stats();
  document.getElementById("ctm-tiles").innerHTML=[
    [t.cuts,"cuts tracked",""],
    [t.locations,"locations",""],
    [t.avg+" min","avg per cut",""],
    [t.hours+" h","total cutting time",""],
    [t.flags,"visits ran long","warn"]
  ].map(function(r){
    return'<div class="ctm-tile '+r[2]+'"><div class="v">'+r[0]+'</div><div class="l">'+r[1]+'</div></div>';
  }).join("");
}

function buildMap(){
  var bounds=[];
  markers={};
  map=L.map("ctm-map",{scrollWheelZoom:true});
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,
    attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'}).addTo(map);

  LOCS.forEach(function(o){
    var m=L.circleMarker([o.lat,o.lon],{
      radius:Math.min(6+o.visits*0.6,16),weight:2,color:"#ffffff",
      fillColor:o.flagged?COL.flag:COL.loc,fillOpacity:.85}).addTo(map);
    m.bindTooltip("<b>"+esc(short(o.address))+"</b><br>"+o.visits+" visits · avg "+o.avg+
      " min · "+Math.round(o.min)+"–"+Math.round(o.max)+" min"+
      (o.flagged?'<br><b style="color:'+COL.flag+'">'+o.flagged+" ran long</b>":""));
    markers[o.address]=m;
    bounds.push([o.lat,o.lon]);
  });

  HOME.forEach(function(h){
    L.circleMarker([h.lat,h.lon],{radius:7,weight:2,color:"#ffffff",
      fillColor:COL.home,fillOpacity:.95}).addTo(map).bindTooltip("<b>"+esc(h.label)+"</b>");
    bounds.push([h.lat,h.lon]);
  });

  map.fitBounds(bounds,{padding:[25,25]});
  // The Summer page swaps views before this runs, so Leaflet sizes itself against
  // a container that just changed — re-measure on the next frame.
  requestAnimationFrame(function(){map.invalidateSize();});
}

function renderTable(){
  var rows=LOCS.slice().sort(function(a,b){
    var va=a[sortK],vb=b[sortK];
    return(typeof va==="string"?va.localeCompare(vb):va-vb)*sortDir;
  });
  document.querySelector("#ctm-loctable tbody").innerHTML=rows.map(function(o){
    return'<tr class="'+(o.flagged?"hasflag":"")+'" data-a="'+esc(o.address)+'">'+
      "<td>"+esc(short(o.address))+"</td>"+
      '<td class="num">'+o.visits+"</td>"+
      '<td class="num"><b>'+Math.round(o.avg)+"</b></td>"+
      '<td class="num">'+Math.round(o.min)+"</td>"+
      '<td class="num">'+Math.round(o.max)+"</td>"+
      '<td class="num">'+(o.flagged||"")+"</td></tr>";
  }).join("");
}

function renderFlags(){
  var f=flagged();
  document.getElementById("ctm-flagcount").textContent=f.length;
  document.querySelector("#ctm-flagtable tbody").innerHTML=f.map(function(v){
    var o=BY_ADDR[v.address],over=Math.round(v.dur_min-o.avg);
    return'<tr class="ctm-flagrow"><td>'+v.day+" "+esc(niceDate(v.date))+"</td>"+
      "<td>"+esc(short(v.address))+"</td>"+
      '<td class="num"><b>'+Math.round(v.dur_min)+" min</b></td>"+
      '<td class="num">'+Math.round(o.avg)+" min</td>"+
      '<td class="num"><b>+'+over+" min</b></td></tr>";
  }).join("")||'<tr><td colspan="5">None</td></tr>';
}

function renderNote(){
  var parks=longParks().map(function(v){return esc(short(v.address))+" ("+esc(niceDate(v.date))+")";});
  document.getElementById("ctm-note").innerHTML=
    "<b>How to read this:</b> a cut is any stop of 15 min to 6 h away from home base "+
    "(22/42 Ottaway Ave). A visit is flagged when it ran more than 1.5× that location's "+
    "average and at least 30 min over it — only for locations with 3 or more visits. "+
    "Heads-up: 353 Duckworth St Unit 16 (34 visits, ~26 min avg) looks like a shop or "+
    "supplier stop rather than a lawn."+
    (parks.length?" The truck also parked overnight away from home "+parks.length+
      " times: "+parks.join(", ")+".":"");
}

function wire(root){
  root.querySelectorAll("#ctm-loctable th").forEach(function(th){
    th.onclick=function(){
      var k=th.dataset.k;
      if(!k)return;
      sortDir=(k===sortK)?-sortDir:(k==="address"?1:-1);
      sortK=k;
      renderTable();
    };
  });
  root.querySelector("#ctm-loctable tbody").addEventListener("click",function(e){
    var tr=e.target.closest("tr");
    if(!tr)return;
    var o=BY_ADDR[tr.dataset.a];
    if(!o)return;
    map.setView([o.lat,o.lon],16);
    markers[o.address].openTooltip();
  });
}

function mount(root){
  if(!window.L)throw new Error("Cut Times needs Leaflet — check the script tag in index.html");
  root.innerHTML='<div class="ctm-loading">Loading cut times…</div>';
  return loadData().then(function(){
    root.innerHTML=shell();
    renderTiles();
    buildMap();
    renderTable();
    renderFlags();
    renderNote();
    wire(root);
  }).catch(function(e){
    root.innerHTML='<div class="ctm-loading">'+esc(e.message)+"</div>";
    throw e;
  });
}

window.CutTimes={mount:mount};
})();
