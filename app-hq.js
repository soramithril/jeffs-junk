// ── TODAY AT HQ: the office TV's pixel-art screen ──────────────────────────────
// Screen 4 of the office board (office-tv.html). It draws the day as a little game
// world: the office with its flip board, the yard, the shop, the dump, and a street
// of today's stops, with the trucks driving between them.
//
// Every number and every event comes from data the board already reads. Nothing is
// made up and nothing is written anywhere - the office people and the yard crew
// walking about are decoration, and they carry no labels that claim what anyone is
// doing. Each time the screen comes up it replays today so far in REPLAY_MS, then
// holds on what is happening now.
//
// Built from the mockup at https://claude.ai/artifact/1bxeGKTSyc57pgGiPhxzac
// (Jake, 2026-11-02). office-tv.html calls JJHQ.mount once, then JJHQ.show(snapshot)
// each time the screen rotates in and JJHQ.hide() when it rotates out, so nothing
// animates while the screen is off.
(function(){
'use strict';
/* 720x312 fills the TV's whole stage (Jake, 2026-11-02: the whole screen is the game) */
/* 640x360 is exactly a third of the TV's 1920x1080, so the whole TV is the game and
   every pixel lands as a clean 3x3 block (Jake, 2026-11-02) */
var W=640,H=360,RT=178,ROADY=RT+5,YARD_Y=150,SPEED=22;   /* SPEED: px a second for trucks lapping the town */
/* the office got a new wing on its left (Jake, 2026-11-03): Jeff's office, a break room
   and a meeting room. Everything from the office to the dump is drawn in its old
   coordinates, shifted right by DX, so the wing sits at negative x in that space. The
   badge wall moved into the meeting room as a trophy shelf to make the room. */
var DX=76;
/* the right-hand block: the "who's out" board, with a parking lot under it */
var BOARD_X=480,BOARD_H=136,LOT_Y=152;
/* below the main road (Jake, 2026-11-02: "all info on the board", no "+N more"):
   row A of today's stops, a lane, row B, every bin out on rental, then the park */
/* below the main road (Jake, 2026-11-02): one block per TOWN - row A along the road,
   row B along the lane - each with its bins out and today's stops; then the park */
var ROWA=198,BLOCK_H=44,LANE_TOP=244,LANEY=LANE_TOP+2,ROWB=259,PARK_TOP=306,CX=3,LOTS_X=28;
var REPLAY_MS=14000;                 // how long "today so far" takes to play
var AMBIENT_MIN_PER_SEC=2;           // office and yard folk move on this clock, not the real one
var MIN=60000;

function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;var t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
var rng=mulberry32(1);
function pick(a){return a[Math.floor(rng()*a.length)];}
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}

var C={road:'#585f6b',line:'#e9d98f',curb:'#b9b3a3',drive:'#a9a59a',
  brick:'#8b5a44',brick2:'#74493a',wall:'#efe3cf',base:'#8a6a4a',floor:'#c99c6b',floor2:'#b68a5c',deskTop:'#9a6644',desk:'#7c4f33',desk2:'#5e3a25',
  gravel:'#cfc4ab',gravel2:'#bdb196',fence:'#7b5d41',metal:'#6b7280',metal2:'#5b6270',concrete:'#bdbab1',concrete2:'#aaa79e',
  dirt:'#a99172',dirt2:'#957e61',mound:'#8f8272',mound2:'#776b5d',mound3:'#a99c8a',
  truck:'#3d9b4f',truck2:'#2b7a3a',out:'#1d2a22',glass:'#bfe2f2',tire:'#22252b',rim:'#8a8f98',light:'#ffe28a',
  bin:'#22c55e',bin2:'#15803d',binOff:'#8c8f94',binOff2:'#6f7277',
  skin:'#f0c39a',white:'#ffffff',paper:'#f7f5ef',paper2:'#dcd8cc',ink:'#1d2a22',sky:'#a9dcf5',grey:'#9aa0a6',dark:'#2b2f36',
  red:'#d9412b',amber:'#e39a1c',blue:'#2f74c8',green:'#16a34a',staff:'#2f8f46',gold:'#f2c14e',gold2:'#b7791f',
  trunk:'#6b4a32',sign:'#26332b',signText:'#f2f0e6',wood:'#6b4a32',snow:'#eef3f6',snow2:'#dbe4ec',nodriver:'#8a8f98'};

function rect(g,c,x,y,w,h){g.fillStyle=c;g.fillRect(Math.round(x),Math.round(y),w,h);}

/* 3x5 pixel font: each row is 3 bits (4 = left, 2 = middle, 1 = right) */
var GL={A:[2,5,7,5,5],B:[6,5,6,5,6],C:[3,4,4,4,3],D:[6,5,5,5,6],E:[7,4,6,4,7],F:[7,4,6,4,4],G:[3,4,5,5,3],H:[5,5,7,5,5],
  I:[7,2,2,2,7],J:[1,1,1,5,2],K:[5,5,6,5,5],L:[4,4,4,4,7],M:[5,7,7,5,5],N:[6,5,5,5,5],O:[2,5,5,5,2],P:[6,5,6,4,4],
  Q:[2,5,5,7,3],R:[6,5,6,5,5],S:[3,4,2,1,6],T:[7,2,2,2,2],U:[5,5,5,5,7],V:[5,5,5,5,2],W:[5,5,7,7,5],X:[5,5,2,5,5],
  Y:[5,5,2,2,2],Z:[7,1,2,4,7],'0':[7,5,5,5,7],'1':[2,6,2,2,7],'2':[6,1,2,4,7],'3':[6,1,2,1,6],'4':[5,5,7,1,1],
  '5':[7,4,6,1,6],'6':[3,4,7,5,7],'7':[7,1,1,2,2],'8':[7,5,7,5,7],'9':[7,5,7,1,6],' ':[0,0,0,0,0],'/':[1,1,2,4,4],
  ':':[0,2,0,2,0],'!':[2,2,2,0,2],'+':[0,2,7,2,0],'-':[0,0,7,0,0],'.':[0,0,0,0,2],"'":[2,2,0,0,0],'?':[6,1,2,0,2]};
function text(g,s,x,y,c){s=String(s).toUpperCase();x=Math.round(x);y=Math.round(y);g.fillStyle=c;
  for(var i=0;i<s.length;i++){var gl=GL[s.charAt(i)]||GL[' '];
    for(var r=0;r<5;r++){var bt=gl[r];if(bt&4)g.fillRect(x,y+r,1,1);if(bt&2)g.fillRect(x+1,y+r,1,1);if(bt&1)g.fillRect(x+2,y+r,1,1);}
    x+=4;}}
/* the same font at double size, for what has to be read from across the office */
function text2(g,s,x,y,c){s=String(s).toUpperCase();x=Math.round(x);y=Math.round(y);g.fillStyle=c;
  for(var i=0;i<s.length;i++){var gl=GL[s.charAt(i)]||GL[' '];
    for(var r=0;r<5;r++)for(var b=0;b<3;b++)if(gl[r]&(4>>b))g.fillRect(x+b*2,y+r*2,2,2);
    x+=8;}}
function tw(s){return String(s).length*4-1;}
function sign(g,s,cx,y){var w=tw(s)+6,x=Math.round(cx-w/2);rect(g,C.sign,x,y,w,9);text(g,s,x+3,y+2,C.signText);}
function badge(g,s,cx,y,col){var w=tw(s)+4,x=Math.round(cx-w/2);rect(g,col,x,y,w,7);text(g,s,x+2,y+1,C.white);}
function spr(g,rows,pal,x,y,flip){x=Math.round(x);y=Math.round(y);var w=0,r,i;
  for(r=0;r<rows.length;r++)w=Math.max(w,rows[r].length);
  for(r=0;r<rows.length;r++){var row=rows[r];for(i=0;i<row.length;i++){var col=pal[row.charAt(i)];if(!col)continue;
    g.fillStyle=col;g.fillRect(flip?x+w-1-i:x+i,y+r,1,1);}}}

/* a hook-lift truck, 28x12: flat bed on the left, cab on the right, three axles.
   The driver sits in the window (cols 20-22, rows 1-2) - see drawTruck. */
var TRUCK=[
"..................OOOOOOO...",
"..................OWWWWGGO..",
"..................OWWWWGGGO.",
"..................OGGGGGGGO.",
"OOOOOOOOOOOOOOOOOOOGGGGGGGGO",
"OggggggggggggggggOOGGGSSGGYO",
"OggggggggggggggggOOGGGSSGGGO",
"OddddddddddddddddOOGGGGGGGGO",
"OOOOOOOOOOOOOOOOOOOOOOOOOOOO",
"...OKKKO.....OKKKO.....OKKKO",
"...KkkkK.....KkkkK.....KkkkK",
"....KKK.......KKK.......KKK."];
var TRUCK_W=28,TRUCK_H=12;
/* what a Geotab vehicle is, and what to call it when nobody is named as its driver */
function vehicleKind(name){name=String(name||'');if(/van/i.test(name))return'van';if(/^hino/i.test(name))return'truck';return'pickup';}
function vehicleName(name){name=String(name||'').trim();
  if(/furniture bank/i.test(name))return'FB Van';if(/mercedes/i.test(name))return'Merc Van';if(/silverado/i.test(name))return'Chevy';
  if(/L7/i.test(name))return'L7';var hy=name.match(/^hino\s+\d\d(\d\d)$/i);if(hy)return'Hino '+hy[1];
  return name.replace(/[^A-Za-z0-9 ]/g,'').trim().slice(0,10);}
/* a van or a pickup in the same 28x12 box as a hook-lift, so placement is the same */
function drawSmallVehicle(kind,x,y,flip,stripe){
  function r(x0,y0,w,h,c){rect(ctx,c,flip?x+TRUCK_W-x0-w:x+x0,y+y0,w,h);}
  if(kind==='van'){
    r(2,2,22,8,C.out);r(3,3,20,6,'#eef1f4');r(22,4,4,6,C.out);r(22,5,3,4,'#eef1f4');
    r(15,3,6,3,C.glass);r(22,5,2,2,C.glass);r(3,7,20,1,stripe);r(25,7,1,1,C.light);
    [5,18].forEach(function(c){r(c,10,4,2,C.tire);r(c+1,10,2,1,C.rim);});
  }else{
    r(1,5,15,5,C.out);r(2,6,13,3,'#c9ced4');r(15,2,10,8,C.out);r(16,3,8,6,'#c9ced4');r(25,5,2,5,C.out);r(25,6,1,3,'#c9ced4');
    r(18,3,5,3,C.glass);r(16,7,8,1,stripe);r(26,6,1,1,C.light);
    [4,19].forEach(function(c){r(c,10,4,2,C.tire);r(c+1,10,2,1,C.rim);});
  }
}
var BIGBIN=[
"OOOOOOOOOOOOOOO",
"OBBBBBBBBBBBBBO",
".ObBBBBBBBBBbO.",
".OBBBBBBBBBBBO.",
"..OBBBBBBBBBO..",
"..OOOOOOOOOOO.."];
var BIN=[
"OOOOOOOOOOO",
"OBBBBBBBBBO",
".ObBBBBBbO.",
".OBBBBBBBO.",
"..OOOOOOO.."];
var binPal={O:C.out,B:C.bin,b:C.bin2},offPal={O:C.out,B:C.binOff,b:C.binOff2};

/* ---------- the office crew (decoration: nameplates on the desks, nothing more) ---------- */
/* everyone looks different, so you know who's who without reading a tag
   (Jake, 2026-11-02): their own colour and one signature detail each */
var P={
  /* hair per Jake, 2026-11-03: all the girls have big long hair - Kelly red, Rachel, Sam
     and Barb brown - and Jake is blonde */
  kelly:{hair:'#c4401f',big:true,long:true,shirt:'#2f74c8',headset:true},           /* blue, big red hair, phone headset */
  rachel:{hair:'#6b4226',big:true,long:true,shirt:'#d6336c',glasses:true},          /* pink, big brown hair, glasses */
  sam:{hair:'#7a4e2c',big:true,long:true,shirt:'#3a5168',pants:'#2b2f36'},           /* navy, big brown hair */
  barb:{hair:'#4a3020',big:true,long:true,shirt:'#8b5cf6',pearls:true},             /* purple, big dark brown hair, pearls */
  jake:{hair:'#ecc95c',shirt:'#3a3f47',hood:true,phones:'#d9412b',logo:true},       /* blonde, dark hoodie, red headphones */
  shop:{hair:'#2b2b2b',shirt:'#56606e',pants:'#3a3f47',hardhat:'#f2c14e',belt:true}, /* Darrin: hard hat, tool belt */
  jeff:{hair:'#5a4030',cap:'#1f7a33',shirt:C.staff,pants:'#3a3f47',coffee:true,beard:true},  /* green cap, beard, coffee */
  josh:{hair:'#3b2416',shirt:'#1d1d1d',pants:'#1d1d1d',pimp:true,chain:true,cane:true},     /* the hat, the chain, the cane */
  jwg1:{hair:'#6b4a32',cap:'#e8590c',shirt:'#e8590c',pants:'#3a3f47',vest:true},     /* hi-vis */
  jwg2:{hair:'#8a5a3c',long:true,shirt:'#6b8e23',pants:'#4f3a2e',sunhat:true}};      /* straw sun hat */
var CUSTOMERS=[{hair:'#3b2416',shirt:'#c4482b'},{hair:'#d8b46a',shirt:'#5f7f9e'},{hair:'#2b2b2b',shirt:'#e3b13a'},{hair:'#8a5a3c',shirt:'#8b5cf6'},
  {hair:'#c9c2b8',shirt:'#3f8f8f'},{hair:'#5a4030',shirt:'#d6336c'},{hair:'#2b2b2b',shirt:'#6b8e23'},{hair:'#a07a52',shirt:'#4f6d8a'}];
/* office walkways: aisle between the desk rows (y 96), the gap between Barb's and Jake's desks (x 54), the floor at the bottom (y 134) */
var AISLE=96,FLOOR=134,GAPX=54;
var OFFICE=[
  {key:'kelly',seat:[26,69],home:[30,AISLE],left:40},
  {key:'rachel',seat:[68,69],home:[72,AISLE],left:15,from:15},   /* Rachel comes in at 3 pm (Jake, 2026-11-03) */
  {key:'sam',seat:[110,69],home:[114,AISLE],left:22},
  {key:'barb',seat:[26,111],home:[30,FLOOR],left:55},
  {key:'jake',seat:[74,111],home:[80,FLOOR],left:32}];
/* the wing (old coordinates, x<4): a corridor down its right side (HALLX) and three
   rooms off it, each with a door at its own height: Jeff's office (top), the break room
   (middle, door on the aisle) and the meeting room (bottom, door on the floor lane) */
var HALLX=-8,RWALL=-15,JEFF_DOOR=26,OUTY=165,YARD_IN=122;
var JEFF_SEAT=[-45,27],JEFF_VISIT=[-24,40],COFFEE=[-46,80],COFFEE2=[-36,84],BREAK_SIT=[-58,100],BREAK_SIT2=[-26,98],
    MEET1=[-64,140],MEET2=[-28,144],MEET3=[-50,137];
var BEDS=[[-68,32],[-68,50],[-29,54]];   /* the dogs' beds in Jeff's office */
/* where a booking is pinned: in front of the ticket wall in the booking room */
var BOOK_SPOT={p:[101,148]};
var PLACES=[BOOK_SPOT,{p:[38,FLOOR]},{p:[46,FLOOR]},{p:[86,AISLE],not:'jake'},{p:[33,AISLE],not:'kelly'},
  {p:[75,AISLE],not:'rachel'},{p:[108,AISLE],not:'sam'},{p:[22,FLOOR],not:'barb'},
  /* the break room and meeting room get a good share of the walks, and people linger
     there (Jake, 2026-11-03: "make our people go into the meeting, break room etc") */
  {p:COFFEE,stay:[10,25]},{p:COFFEE2,stay:[10,25]},{p:BREAK_SIT,stay:[15,35]},{p:BREAK_SIT2,stay:[15,35]},
  {p:MEET1,stay:[20,45]},{p:MEET2,stay:[20,45]},{p:MEET3,stay:[20,45]},
  /* Jake also pops in on Jeff and heads out to the yard (Jake, 2026-11-03) */
  {p:JEFF_VISIT,only:'jake'},{p:[196,104],only:'jake',stay:[20,45]},{p:[214,92],only:'jake',stay:[20,45]}];

/* ---------- getting about: wing <-> office floor <-> sidewalk <-> yard ----------
   Each area has its own way of walking; between neighbours you go through one door:
   the wing's door on the aisle, the front door, and the yard gate. */
var ZONES=['wing','main','out','yard'];
var DOORS={'wing>main':[[HALLX,AISLE],[9,AISLE]],'main>wing':[[9,AISLE],[HALLX,AISLE]],
  'main>out':[[76,FLOOR],[76,OUTY]],'out>main':[[76,OUTY],[76,FLOOR]],
  'out>yard':[[212,OUTY],[212,YARD_IN]],'yard>out':[[212,YARD_IN],[212,OUTY]]};
function zoneOf(p){return p[0]<4?'wing':p[1]>=160?'out':p[0]>=148?'yard':'main';}
function wingDoor(p){return p[1]<67?JEFF_DOOR:p[1]<119?AISLE:FLOOR;}
function wingRoute(a,b){var da=wingDoor(a),db=wingDoor(b);
  if(da===db&&a[0]<RWALL&&b[0]<RWALL)return[b.slice()];
  return[[a[0],da],[HALLX,da],[HALLX,db],[b[0],db],b.slice()];}
function zoneRoute(z,a,b){
  if(z==='main')return officeRoute(a,b);
  if(z==='wing')return wingRoute(a,b);
  if(z==='out')return[[b[0],OUTY],b.slice()];
  return[b.slice()];
}
function route2(from,to){
  var za=zoneOf(from),zb=zoneOf(to),ia=ZONES.indexOf(za),ib=ZONES.indexOf(zb),step=ib>ia?1:-1,cur=from,pts=[];
  while(za!==zb){var nz=ZONES[ia+step],d=DOORS[za+'>'+nz];
    pts=pts.concat(zoneRoute(za,cur,d[0]));pts.push(d[1].slice());cur=d[1];za=nz;ia+=step;}
  return pts.concat(zoneRoute(za,cur,to));
}

/* ---------- seasons, from today's date; weather, from the board's real forecast ---------- */
var FALL={grass:'#9aaa62',grass2:'#8a9a55',grass3:'#aab872',leaves:['#d9822b','#c4482b','#e3b13a','#a8632a'],ambient:'leaves',leafPiles:true,park:'rake'};
var SEASONS={
  spring:{grass:'#8fbe62',grass2:'#7fae55',grass3:'#a3cc78',leaves:['#5fa043','#8fc96a'],blossom:'#f4b6c8',flowers:true,park:'mow',bed:'plant'},
  summer:{grass:'#7fbf55',grass2:'#6fae48',grass3:'#93cf68',leaves:['#3f8a33','#5fa848'],ambient:'butterflies',flowers:true,park:'mow',bed:'water'},
  fall:FALL,
  halloween:Object.assign({},FALL,{pumpkins:true,spooky:true}),
  winter:{snow:true,park:'snowman'},
  christmas:{snow:true,park:'snowman',lights:true}};
function seasonFor(d){var m=d.getMonth()+1,day=d.getDate();
  if(m===10)return'halloween';if(m===12||(m===11&&day>=15))return'christmas';if(m===11||m===9)return'fall';
  if(m<=2||(m===3&&day<15))return'winter';if(m<=5)return'spring';return'summer';}
/* Open-Meteo WMO codes, the same feed the board's weather box reads */
function wxKind(code){
  if(code==null)return null;
  if((code>=71&&code<=77)||code===85||code===86)return'snow';
  if((code>=51&&code<=67)||(code>=80&&code<=82)||code>=95)return'rain';
  return null;
}
var SE=SEASONS.fall,WX=null;

/* ---------- drawing helpers ---------- */
function person(g,x,y,p,f){f=f||{};x=Math.round(x);y=Math.round(y);var face=f.face||1,dk='#2b2f36';
  if(p.long)rect(g,p.hair,x-1,y,7,8);
  if(p.big){rect(g,p.hair,x-2,y-1,9,9);rect(g,p.hair,x-1,y-2,7,1);rect(g,p.hair,x-3,y+1,1,6);rect(g,p.hair,x+7,y+1,1,6);}
  rect(g,C.skin,x,y+1,5,4);
  rect(g,p.hair,x,y,5,2);
  if(!p.long){rect(g,p.hair,x,y+2,1,1);rect(g,p.hair,x+4,y+2,1,1);}
  rect(g,C.ink,x+1,y+3,1,1);rect(g,C.ink,x+3,y+3,1,1);
  if(p.glasses){rect(g,C.ink,x,y+3,5,1);rect(g,'#bfe2f2',x+1,y+3,1,1);rect(g,'#bfe2f2',x+3,y+3,1,1);}
  if(p.beard)rect(g,p.hair,x+1,y+4,3,1);
  if(p.hood){rect(g,p.shirt,x-1,y,1,5);rect(g,p.shirt,x+5,y,1,5);}
  if(p.headset){rect(g,dk,x,y-1,5,1);rect(g,dk,x-1,y+1,1,2);rect(g,dk,x+5,y+1,1,2);rect(g,dk,face>0?x+4:x,y+4,1,1);}
  if(p.phones){rect(g,p.phones,x,y-1,5,1);rect(g,p.phones,x-1,y+1,1,3);rect(g,p.phones,x+5,y+1,1,3);}
  var cap=f.cap||p.cap;
  if(f.santa){rect(g,C.red,x,y-2,5,3);rect(g,C.red,face>0?x+4:x-1,y-3,2,1);rect(g,C.white,face>0?x+5:x-2,y-3,1,1);rect(g,C.white,x-1,y,7,1);}
  else if(p.pimp){rect(g,'#6b3fa0',x-2,y,9,1);rect(g,'#6b3fa0',x,y-3,5,3);rect(g,C.gold,x,y-1,5,1);rect(g,C.red,face>0?x+4:x,y-5,1,2);rect(g,C.red,face>0?x+5:x-1,y-6,1,1);}
  else if(p.hardhat){rect(g,p.hardhat,x-1,y-1,7,2);rect(g,p.hardhat,x,y-2,5,1);rect(g,'#c99a1e',x-1,y,7,1);}
  else if(p.sunhat){rect(g,'#d8c27a',x-2,y,9,1);rect(g,'#d8c27a',x,y-2,5,2);rect(g,'#a8632a',x,y-1,5,1);}
  else if(cap){rect(g,cap,x,y-1,5,2);rect(g,cap,face>0?x+4:x-2,y,3,1);}
  rect(g,p.shirt,x-1,y+5,7,f.seated?6:4);
  /* long hair falls over the shoulders, so it shows when seated too - big long hair, thick and lower */
  if(p.long){var lw=p.big?2:1,lh=p.big?5:4;rect(g,p.hair,x-lw,y+5,lw,lh);rect(g,p.hair,x+5,y+5,lw,lh);}
  if(p.tie)rect(g,C.red,x+2,y+5,1,f.seated?5:4);
  if(p.chain){rect(g,C.gold,x,y+5,5,1);rect(g,C.gold,x+2,y+6,1,1);}
  if(p.pearls)for(var pq=0;pq<5;pq+=2)rect(g,C.white,x+pq,y+5,1,1);
  if(p.logo)rect(g,'#3cc46f',x+3,y+6,1,1);
  if(p.vest){rect(g,'#e6e4dc',x-1,y+7,7,1);rect(g,'#e6e4dc',x+1,y+5,1,2);rect(g,'#e6e4dc',x+3,y+5,1,2);}
  if(f.seated)return;
  if(p.belt){rect(g,'#6b4a32',x-1,y+8,7,1);rect(g,'#9aa0a6',x+4,y+8,1,2);}
  rect(g,C.skin,x-2,y+6,1,2);
  if(f.wave)rect(g,C.skin,x+6,y+(f.arm?1:2),1,4);else rect(g,C.skin,x+6,y+6-(f.arm?2:0),1,2);
  var s=f.step?1:0,pants=p.pants||'#3a3f47';
  rect(g,pants,x,y+9,2,3-s);rect(g,pants,x+3,y+9,2,2+s);
  rect(g,C.ink,x,y+12-s,2,1);rect(g,C.ink,x+3,y+11+s,2,1);
  if(p.coffee){var cx=face>0?x+7:x-4;rect(g,C.white,cx,y+6,2,2);rect(g,C.wood,cx,y+6,2,1);}
  if(p.cane){var kx=face>0?x+7:x-3;rect(g,'#1d1d1d',kx,y+6,1,7);rect(g,C.gold,kx,y+5,1,1);rect(g,C.gold,face>0?kx-1:kx+1,y+5,1,1);}
  if(f.rake){var rx=face>0?x+7:x-3;rect(g,C.wood,rx,y+3,1,9);rect(g,'#8a8f98',rx-1,y+12,3,1);}
  if(f.can){var wx=face>0?x+7:x-4;rect(g,'#5f8f8f',wx,y+7,3,3);rect(g,'#5f8f8f',face>0?wx+3:wx-1,y+7,1,1);}
}
function drawHouse(g,x,y,s){
  rect(g,'#7a4a3a',x+18,y+1,3,5);
  for(var r=0;r<=8;r++){var o=Math.round(r*1.5),l=x+12-o,w=2+2*o;
    rect(g,SE.snow&&r<4?C.snow:s.roof,l,y+r,w,1);rect(g,s.roof2,l,y+r,1,1);rect(g,s.roof2,l+w-1,y+r,1,1);}
  if(SE.snow)rect(g,C.snow,x+18,y,3,1);
  rect(g,s.wall,x+2,y+9,22,11);rect(g,s.roof2,x+2,y+19,22,1);
  rect(g,C.wood,x+11,y+13,4,6);rect(g,C.light,x+14,y+16,1,1);
  [x+5,x+17].forEach(function(wx){rect(g,C.wood,wx-1,y+11,6,5);rect(g,C.sky,wx,y+12,4,3);rect(g,C.wood,wx+2,y+12,1,3);});
}
function tree(g,cx,cy,r2){
  if(SE.snow){
    rect(g,C.trunk,cx-1,cy+4,2,4);
    for(var i=0;i<8;i++){var w=2+i,x0=cx-Math.floor(w/2);rect(g,i%3===0?'#2f6a3a':'#3a7a45',x0,cy-4+i,w,1);if(i%3===0)rect(g,C.snow,x0,cy-4+i,Math.max(1,w-2),1);}
    return;}
  rect(g,C.trunk,cx-1,cy+3,2,5);
  var lv=SE.leaves,base=lv[0];
  [[-3,-4,6],[-5,-3,10],[-6,-2,12],[-6,-1,12],[-6,0,12],[-6,1,12],[-5,2,10],[-3,3,6]].forEach(function(r){rect(g,base,cx+r[0],cy+r[1],r[2],1);});
  for(var k=0;k<22;k++){var dx=Math.floor(r2()*12)-6,dy=Math.floor(r2()*8)-4;if(Math.abs(dx)+Math.abs(dy)<8)rect(g,lv[Math.floor(r2()*lv.length)],cx+dx,cy+dy,1,1);}
  if(SE.blossom)for(k=0;k<8;k++)rect(g,SE.blossom,cx+Math.floor(r2()*10)-5,cy+Math.floor(r2()*6)-3,1,1);
}
/* the park's trees leave room for the pond in the middle (POND_*) and the JWG lawn at 400..480 */
var TREES=[76,104,132,160,188,216,236,262,380,500,530,570,610];
var POND_X=320,POND_Y=PARK_TOP+27,POND_RX=44,POND_RY=19;
/* houses that fit the town (Jake, 2026-11-03): townhouses in the cities, cottages by
   the lake, a farmhouse and barn out in the country, and a mix everywhere else. Each
   is 12x14 and records its windows in wins so they can light up after dark. */
var CITY=/barrie|orillia|bradford|newmarket|collingwood|midland|wasaga/,LAKE=/innisfil|alcona|lefroy|gilford|big bay|keswick|sutton|beaverton|belle ewart|stroud/,
    FARM=/oro|springwater|essa|clearview|ramara|severn|tay|minesing|elmvale|phelpston|hillsdale|thornton|utopia|edgar|craighurst|anten|shanty/;
var MIXES=[['brick','bungalow'],['big','brick'],['bungalow','big']];
function houseKinds(T){var n=T.name.toLowerCase();
  if(CITY.test(n))return['town','town'];if(LAKE.test(n))return['cottage','cottage'];if(FARM.test(n))return['farm','barn'];
  var h=0;for(var i=0;i<n.length;i++)h=(h*31+n.charCodeAt(i))|0;return MIXES[Math.abs(h)%MIXES.length];}
function roofRow(g,c,x,y,w){rect(g,SE.snow?C.snow:c,x,y,w,1);}
function hwin(g,wins,x,y,w,h){rect(g,C.sky,x,y,w,h);wins.push([x,y,w,h]);}
function drawTownHouse(g,kind,x,y,wins){
  var r;
  if(kind==='town'){var walls=['#e9d6b0','#d4dde4','#e6c39a'],doors=['#c4482b','#2f74c8','#3f8f8f'];
    rect(g,'#3a3f47',x,y+1,12,2);if(SE.snow)rect(g,C.snow,x,y+1,12,1);
    for(r=0;r<3;r++){var ux=x+r*4;rect(g,walls[r],ux,y+3,4,11);hwin(g,wins,ux+1,y+5,2,2);rect(g,doors[r],ux+1,y+10,2,4);}
    rect(g,'#b2ac9c',x+3,y+3,1,11);rect(g,'#b2ac9c',x+7,y+3,1,11);}
  else if(kind==='cottage'){
    for(r=0;r<11;r++){var o=Math.round(r*.55);roofRow(g,r<5?'#7f352a':'#a8483a',x+5-o,y+r,2+2*o);}
    rect(g,'#c49a5a',x+3,y+7,6,4);hwin(g,wins,x+5,y+7,2,2);
    rect(g,'#8b6b4a',x,y+11,12,1);rect(g,'#6b4f36',x,y+12,1,2);rect(g,'#6b4f36',x+11,y+12,1,2);rect(g,'#6b4f36',x+5,y+12,2,2);}
  else if(kind==='farm'){
    for(r=0;r<4;r++)roofRow(g,'#3a3f47',x+3-r,y+1+r,6+2*r);
    rect(g,'#f2efe6',x+1,y+5,10,9);rect(g,'#8b6b4a',x,y+9,12,1);hwin(g,wins,x+2,y+6,2,2);hwin(g,wins,x+8,y+6,2,2);rect(g,'#4f6d8a',x+5,y+10,2,4);}
  else if(kind==='barn'){
    roofRow(g,'#3a3f47',x+3,y,6);roofRow(g,'#3a3f47',x+1,y+1,10);roofRow(g,'#3a3f47',x,y+2,12);
    rect(g,'#b33a2a',x,y+3,12,11);rect(g,'#f2efe6',x+3,y+7,6,7);rect(g,'#b33a2a',x+4,y+8,4,6);
    for(r=0;r<4;r++){rect(g,'#f2efe6',x+4+r,y+8+r,1,1);rect(g,'#f2efe6',x+7-r,y+8+r,1,1);}hwin(g,wins,x+5,y+4,2,2);}
  else if(kind==='brick'){
    for(r=0;r<3;r++)roofRow(g,'#6b5040',x+2-r,y+r,8+2*r);
    rect(g,C.brick,x,y+3,12,11);for(r=y+5;r<y+14;r+=3)rect(g,C.brick2,x,r,12,1);
    hwin(g,wins,x+2,y+4,2,2);hwin(g,wins,x+8,y+4,2,2);hwin(g,wins,x+2,y+9,2,2);rect(g,'#2f6a3a',x+7,y+10,3,4);}
  else if(kind==='bungalow'){
    for(r=0;r<4;r++)roofRow(g,'#4f6d8a',x+3-r,y+4+r,6+2*r);
    rect(g,'#d4dde4',x,y+8,12,6);hwin(g,wins,x+1,y+9,3,2);hwin(g,wins,x+8,y+9,3,2);rect(g,'#c4482b',x+5,y+10,2,4);}
  else{/* big: a house, a garage and a basketball hoop */
    for(r=0;r<4;r++)roofRow(g,'#4f3a2e',x+3-r,y+2+r,4+2*r);
    rect(g,'#e9d6b0',x,y+6,8,8);hwin(g,wins,x+1,y+7,2,2);rect(g,'#2f6a3a',x+5,y+10,2,4);
    roofRow(g,'#4f3a2e',x+8,y+8,4);rect(g,'#d0c4a8',x+8,y+9,4,5);rect(g,'#bdb196',x+8,y+11,4,1);
    rect(g,'#9aa0a6',x+11,y+2,1,7);rect(g,C.white,x+10,y+1,3,2);rect(g,'#e8590c',x+10,y+3,2,1);}
}
/* a town's block: its own lawn, a house or two and a picket fence. The sign, the
   bins and the stop markers change through the day, so drawTowns paints those. */
function drawTownBlock(g,T){
  var B=T.block,x=B.x,w=B.w,top=B.top,fence=SE.snow?'#c9ced4':'#efe9dc';
  rect(g,SE.snow?C.snow2:SE.grass3,x+1,top+10,w-2,BLOCK_H-11);
  for(var px=x+1;px<x+w-1;px+=2)rect(g,fence,px,top+BLOCK_H-1,1,1);
  rect(g,fence,x+1,top+BLOCK_H-2,w-2,1);rect(g,C.wood,x+w-1,top+10,1,BLOCK_H-9);
  var kinds=houseKinds(T);B.wins=[];
  for(var h=0;h<B.houses;h++)drawTownHouse(g,kinds[h],x+2+h*14,top+11,B.wins);
  if(SE.flowers)for(var f=0;f<B.houses*12;f+=3)rect(g,['#f4b6c8','#ffe28a','#ffffff','#c4482b'][f%4],x+3+f,top+26,1,1);
  if(SE.pumpkins)rect(g,'#e8590c',x+3,top+25,3,2);
  if(SE.leafPiles)for(var q=0;q<4;q++)rect(g,SE.leaves[q%4],x+4+q*3,top+26,2,1);
}
/* the parking lot for the vans and pickups, under the board */
function drawParking(g,r2){
  asphalt(g,r2,BOARD_X,LOT_Y,W-BOARD_X-4,RT-LOT_Y-1);
  for(var x=BOARD_X+2;x<W-4;x+=30)rect(g,'#e6e4dc',x,LOT_Y+2,1,22);
  if(SE.snow)rect(g,C.snow,BOARD_X,LOT_Y,W-BOARD_X-4,1);
  sign(g,'PARKING',BOARD_X+24,LOT_Y-8);
}

/* ---------- roads: asphalt, sidewalk, edge lines, a double yellow centre, crosswalks ---------- */
function asphalt(g,r2,x,y,w,h){rect(g,'#4f555f',x,y,w,h);for(var i=0;i<w*h/10;i++)rect(g,r2()<.5?'#5b626d':'#454a53',x+(r2()*w|0),y+(r2()*h|0),1,1);}
function drawRoads(g,r2){
  var x,y;
  /* the main road: two lanes, one each way */
  rect(g,'#cfcabd',0,RT-1,W,2);for(x=0;x<W;x+=8)rect(g,'#b2ac9c',x,RT-1,1,2);
  asphalt(g,r2,0,RT+1,W,17);
  rect(g,'#e6e4dc',0,RT+2,W,1);rect(g,'#e6e4dc',0,RT+16,W,1);
  rect(g,'#e9c23a',0,RT+8,W,1);rect(g,'#e9c23a',0,RT+10,W,1);
  [64+DX,198+DX].forEach(function(cx){for(var k=0;k<5;k++)rect(g,'#f2f0e8',cx+k*4,RT+3,2,13);});   /* office door, yard gate */
  /* the side road down to the lane */
  asphalt(g,r2,0,RT+18,26,LANE_TOP-RT-18);rect(g,'#e6e4dc',25,RT+18,1,LANE_TOP-RT-18);
  for(y=RT+20;y<LANE_TOP;y+=5)rect(g,'#e9c23a',12,y,1,3);
  /* the lane: narrower, with one dashed white centre line */
  rect(g,'#b2ac9c',26,LANE_TOP-1,W,1);asphalt(g,r2,0,LANE_TOP,W,13);rect(g,'#b2ac9c',0,LANE_TOP+13,W,1);
  for(x=30;x<W;x+=10)rect(g,'#e6e4dc',x,LANE_TOP+6,5,1);
  if(SE.snow){rect(g,C.snow,0,RT-2,W,2);rect(g,C.snow,0,RT+18,W,1);rect(g,C.snow,26,LANE_TOP-1,W,1);rect(g,C.snow,0,LANE_TOP+13,W,1);
    for(x=0;x<W;x+=3){rect(g,'#6b727e',x,RT+5,2,1);rect(g,'#6b727e',x+1,RT+13,2,1);}}
}
/* lamps along the sidewalk, drawn after the buildings so they stand in front of them */
function drawStreetBits(g){
  [40,110,170,250,300,390,460,540,620].forEach(function(lx){rect(g,'#3a3f47',lx,RT-10,1,9);rect(g,'#3a3f47',lx-1,RT-11,3,1);rect(g,C.light,lx-1,RT-10,3,1);});
}

/* ---------- the wing's rooms (old coordinates): the fixed parts. drawWing paints Jeff
   at his desk, the desk itself, the whiteboard number and the trophies. ---------- */
var WING_DOORS=[[JEFF_DOOR-2,18],[AISLE-2,16],[FLOOR-2,16]];
function drawWingBG(g){
  var x,y;
  /* the corridor down the right, then the three rooms */
  rect(g,'#d8cdb6',-69,11,73,162);for(y=13;y<173;y+=6)rect(g,'#cbbfa6',RWALL+2,y,17,1);
  rect(g,'#b8a27c',-69,11,54,55);for(x=-66;x<RWALL;x+=6)rect(g,'#ad9670',x,18,1,48);
  rect(g,'#e8dcc4',-69,11,54,7);rect(g,C.base,-69,18,54,1);
  rect(g,'#e6e4dc',-69,69,54,49);for(y=76;y<117;y+=4)for(x=(y%8?-67:-65);x<RWALL;x+=4)rect(g,'#d8d6ce',x,y,1,1);
  rect(g,C.wall,-69,69,54,4);rect(g,C.base,-69,73,54,1);
  rect(g,'#d9cdb4',-69,121,54,52);for(x=-66;x<RWALL;x+=6)rect(g,'#cbbf9f',x,128,1,45);
  rect(g,C.wall,-69,121,54,6);rect(g,C.base,-69,127,54,1);
  /* walls: between the rooms, and between the rooms and the corridor (with a door each) */
  rect(g,C.brick,-69,66,56,3);rect(g,C.brick,-69,118,56,3);
  var y0=11;WING_DOORS.forEach(function(d){rect(g,C.brick,RWALL,y0,2,d[0]-y0);y0=d[0]+d[1];});rect(g,C.brick,RWALL,y0,2,173-y0);
  /* Jeff's office: window, a photo, his sign, filing cabinet, plant, rug and the dogs' beds */
  rect(g,C.wood,-65,12,16,6);rect(g,C.sky,-64,13,14,4);rect(g,C.wood,-57,13,1,4);
  rect(g,'#6b4a32',-46,12,8,5);rect(g,'#9fd3f0',-45,13,6,3);rect(g,C.truck,-44,15,4,1);
  sign(g,'JEFF',-27,10);
  rect(g,'#8a8f98',-24,20,8,13);rect(g,'#6b727e',-24,26,8,1);rect(g,C.dark,-21,23,2,1);rect(g,C.dark,-21,29,2,1);
  rect(g,'#b86b45',-58,26,5,5);rect(g,'#4f8f3a',-59,19,7,7);rect(g,'#6aa84f',-58,18,5,3);
  rect(g,'#7a3f4a',-58,34,32,22);rect(g,'#8c4f5a',-57,35,30,20);
  BEDS.forEach(function(b){rect(g,'#6b4a32',b[0]-1,b[1]+3,16,7);rect(g,'#c49a5a',b[0],b[1]+4,14,5);});
  /* break room: fridge, counter with the coffee pot and microwave, a table with the donuts */
  rect(g,'#c9ced4',-68,72,8,20);rect(g,'#9aa0a6',-68,80,8,1);rect(g,C.dark,-62,74,1,3);rect(g,C.dark,-62,83,1,3);
  rect(g,'#7a5530',-58,74,28,6);rect(g,'#9a6644',-58,74,28,2);
  rect(g,C.dark,-54,69,6,7);rect(g,C.red,-53,70,4,1);rect(g,'#3b2416',-53,73,4,2);
  rect(g,C.white,-42,70,9,5);rect(g,C.dark,-41,71,5,3);rect(g,'#3cc46f',-35,72,1,1);
  rect(g,'#a8714d',-50,100,20,9);rect(g,'#6b4a32',-49,109,2,3);rect(g,'#6b4a32',-33,109,2,3);
  rect(g,C.white,-47,101,2,2);rect(g,'#e3b13a',-40,101,6,4);rect(g,'#d6336c',-39,102,1,1);rect(g,'#8a5a3c',-36,103,1,1);
  sign(g,'BREAK',-42,110);
  /* meeting room: whiteboard and trophy cabinet on the back wall, the table and chairs */
  rect(g,'#9aa0a6',-67,122,21,12);rect(g,C.white,-66,123,19,10);
  rect(g,'#6b4a32',-43,121,27,16);rect(g,'#3a2a1e',-42,122,25,14);rect(g,'#8a6440',-42,129,25,1);rect(g,'#8a6440',-42,135,25,1);
  rect(g,'#8b6b4a',-58,150,26,12);rect(g,'#a07a52',-57,151,24,10);
  for(var c=0;c<3;c++){rect(g,'#3a3f47',-56+c*9,147,5,3);rect(g,'#3a3f47',-56+c*9,162,5,3);}
  sign(g,'MEETING',-45,164);
}

/* ---------- static background: drawn once per showing ---------- */
var bgc=null,bgx=null;
function drawBG(){
  var g=bgx,r2=mulberry32(7),i,x,y;
  var gr=SE.snow?[C.snow,C.snow2,C.white]:[SE.grass,SE.grass2,SE.grass3];
  rect(g,gr[0],0,0,W,H);
  for(i=0;i<1400;i++){x=r2()*W|0;y=r2()*H|0;rect(g,r2()<.5?gr[1]:gr[2],x,y,1,1);}
  drawRoads(g,r2);
  /* from here to the dump, the old coordinates shifted right by DX */
  g.save();g.translate(DX,0);
  /* office shell, wing included: -72..142 x 8..176 */
  rect(g,C.brick,-72,8,215,169);
  for(y=8;y<177;y++)for(x=-72;x<143;x++){if(x>=-69&&x<140&&y>=11&&y<173)continue;var row=Math.floor((y-8)/3);
    if((y-8)%3===2||(x+(row%2?3:0))%6===5)rect(g,C.brick2,x,y,1,1);}
  if(SE.snow)rect(g,C.snow,-72,8,215,2);
  drawWingBG(g);
  rect(g,C.wall,7,11,133,46);rect(g,C.base,7,57,133,1);
  rect(g,C.floor,7,58,133,115);for(y=63;y<173;y+=6)rect(g,C.floor2,7,y,133,1);
  for(y=58;y<173;y+=6)for(x=(y%12?14:26);x<140;x+=24)rect(g,C.floor2,x,y,1,5);
  rect(g,C.floor,64,173,16,4);rect(g,C.curb,64,177,16,1);
  rect(g,'#7a5530',127,28,12,17);rect(g,'#c49a5a',128,29,10,15);
  rect(g,C.white,129,30,4,3);rect(g,'#ffe28a',134,31,3,3);rect(g,C.white,130,35,5,3);rect(g,'#f4b6c8',130,40,4,3);rect(g,C.red,130,30,1,1);rect(g,C.red,135,31,1,1);
  rect(g,C.dark,118,96,13,39);rect(g,'#3a3f47',119,97,11,37);
  rect(g,'#8b6b4a',8,146,19,3);rect(g,'#6b4f36',9,149,2,8);rect(g,'#6b4f36',24,149,2,8);
  rect(g,C.dark,10,137,7,9);rect(g,'#4a4f57',11,138,5,3);rect(g,C.red,15,143,1,1);rect(g,C.white,19,143,2,3);rect(g,C.white,22,144,2,2);
  rect(g,'#9fd3f0',29,135,5,5);rect(g,'#e8eef2',29,140,5,12);rect(g,'#b9c3c9',29,151,5,1);
  rect(g,'#6b4f36',41,150,12,2);rect(g,'#6b4f36',42,152,2,6);rect(g,'#6b4f36',50,152,2,6);
  rect(g,'#c9ced4',40,141,14,9);rect(g,'#9aa0a6',40,141,14,2);rect(g,C.dark,42,145,10,1);rect(g,'#3cc46f',51,147,1,1);
  /* the booking room (Jake, 2026-11-02): tiled floor, walls with a door off the floor
     lane, a ticket wall on the right and the bell on a little table. drawBooking paints
     the tickets and the bell. */
  rect(g,'#ddd1bb',86,138,53,35);for(x=86;x<139;x+=6)rect(g,'#d2c6ae',x,138,1,35);
  rect(g,C.brick,84,136,55,2);rect(g,C.brick,84,136,2,37);rect(g,'#ddd1bb',96,136,11,2);
  rect(g,'#7a5530',110,146,28,25);rect(g,'#c49a5a',111,147,26,23);
  rect(g,'#8b6b4a',87,164,13,2);rect(g,'#6b4f36',88,166,2,6);rect(g,'#6b4f36',97,166,2,6);
  sign(g,'BOOKINGS',118,139);
  rect(g,'#8c3f2e',60,161,22,9);rect(g,'#a8503c',62,163,18,5);
  if(SE.lights){for(i=0;i<10;i++){var w2=1+Math.floor(i*.7);rect(g,'#2f6a3a',70-Math.floor(w2/2),140+i*2,w2+1,2);}
    rect(g,C.wood,69,160,2,3);rect(g,C.gold,69,138,2,2);}
  else{rect(g,'#b86b45',66,152,7,6);rect(g,'#4f8f3a',64,144,11,9);rect(g,'#6aa84f',66,142,6,3);}
  /* the wall between the wing and the office floor, with its door on the aisle */
  rect(g,C.brick,4,11,3,AISLE-3-11);rect(g,C.brick,4,AISLE+14,3,173-AISLE-14);rect(g,C.brick2,4,AISLE-4,3,1);
  sign(g,"JEFF'S JUNK",35,1);
  /* yard: 150..264 x 14..176 */
  var yg=SE.snow?'#e3e8ec':C.gravel,yg2=SE.snow?'#c9c4b6':C.gravel2;
  rect(g,yg,150,14,115,163);
  for(i=0;i<800;i++){x=150+r2()*115|0;y=14+r2()*163|0;rect(g,yg2,x,y,1,1);}
  rect(g,C.fence,150,14,115,1);rect(g,C.fence,150,176,44,1);rect(g,C.fence,231,176,34,1);
  rect(g,C.fence,150,14,1,163);rect(g,C.fence,264,14,1,163);
  for(x=150;x<=264;x+=8){rect(g,C.fence,x,13,1,3);if(x<194||x>230)rect(g,C.fence,x,175,1,3);}
  for(y=14;y<=176;y+=8){rect(g,C.fence,149,y,3,1);rect(g,C.fence,263,y,3,1);}
  rect(g,yg,194,176,37,2);
  /* two rows of truck parking either side of the gate lane */
  [152,182,229,259].forEach(function(px){rect(g,SE.snow?'#c9ced4':'#e9e3d0',px,YARD_Y-16,1,13);rect(g,SE.snow?'#c9ced4':'#e9e3d0',px,YARD_Y-1,1,14);});
  /* yard gear: pallets, a tire stack, a fuel tank, a skid steer */
  rect(g,'#b08a55',236,98,14,2);rect(g,'#b08a55',236,101,14,2);rect(g,'#8a6440',237,100,12,1);rect(g,'#8a6440',237,103,12,1);
  for(i=0;i<4;i++){rect(g,'#22252b',253,92+i*3,8,2);rect(g,'#3a3f47',255,92+i*3,4,1);}
  rect(g,'#d9412b',236,108,20,6);rect(g,'#a8321f',236,113,20,1);rect(g,'#6b727e',238,114,2,2);rect(g,'#6b727e',252,114,2,2);text(g,'FUEL',238,108,C.white);
  rect(g,'#e3b13a',156,121,11,6);rect(g,'#2b2f36',158,118,6,4);rect(g,'#bfe2f2',159,119,4,2);rect(g,'#22252b',156,127,3,2);rect(g,'#22252b',164,127,3,2);rect(g,'#6b727e',167,123,4,1);rect(g,'#6b727e',170,122,2,4);
  /* back shop: 270..326 x 22..176 */
  rect(g,C.metal,270,22,57,155);for(x=270;x<327;x+=3)rect(g,C.metal2,x,22,1,155);
  if(SE.snow)rect(g,C.snow,270,22,57,2);
  rect(g,C.concrete,273,25,51,148);
  for(i=0;i<260;i++){x=273+r2()*51|0;y=25+r2()*148|0;rect(g,C.concrete2,x,y,1,1);}
  rect(g,C.concrete,286,173,24,4);rect(g,C.concrete2,286,177,24,1);
  rect(g,'#8b6b4a',276,36,29,3);rect(g,'#6b4f36',277,39,2,6);rect(g,'#6b4f36',302,39,2,6);
  rect(g,'#9aa0a6',280,30,1,5);rect(g,'#9aa0a6',284,29,2,6);rect(g,'#c45a3a',289,31,4,2);rect(g,'#9aa0a6',296,30,1,5);
  rect(g,'#c9a46c',277,58,14,12);rect(g,'#b08a55',277,63,14,1);rect(g,'#b08a55',283,58,1,12);rect(g,'#c9a46c',280,50,9,8);rect(g,'#b08a55',284,50,1,8);
  rect(g,'#3f6b6b',296,70,25,5);rect(g,'#5f8f8f',296,75,25,5);rect(g,'#3f6b6b',295,71,3,10);rect(g,'#3f6b6b',319,71,3,10);
  rect(g,C.wood,297,81,1,2);rect(g,C.wood,319,81,1,2);
  rect(g,'#8a5a3c',279,80,8,3);rect(g,'#a8714d',279,83,8,3);rect(g,'#6b4a32',279,86,1,5);rect(g,'#6b4a32',286,86,1,5);
  rect(g,'#8a5a3c',277,104,13,16);rect(g,'#6b4a32',278,109,11,1);rect(g,'#6b4a32',278,114,11,1);rect(g,C.gold2,283,106,1,1);rect(g,C.gold2,283,111,1,1);rect(g,C.gold2,283,116,1,1);
  rect(g,'#a8714d',296,108,24,3);rect(g,'#6b4a32',297,111,2,8);rect(g,'#6b4a32',317,111,2,8);
  rect(g,'#e8e2d4',304,126,16,22);rect(g,'#cfc8b8',304,131,16,1);rect(g,'#cfc8b8',304,138,16,1);rect(g,'#cfc8b8',304,144,16,1);
  rect(g,'#c9a46c',278,134,12,10);rect(g,'#b08a55',283,134,1,10);rect(g,'#c9a46c',278,144,16,10);rect(g,'#b08a55',285,144,1,10);
  sign(g,'SHOP',298,13);
  /* dump: 330..399 x 8..176 */
  rect(g,SE.snow?'#d9dcd8':C.dirt,330,8,70,169);
  for(i=0;i<420;i++){x=330+r2()*70|0;y=8+r2()*169|0;rect(g,SE.snow?C.white:C.dirt2,x,y,1,1);}
  for(var rr=0;rr<=88;rr++){var hw=Math.round(Math.sqrt(rr/88)*26)+1,cy=60+rr;
    rect(g,rr<5?(SE.snow?C.snow:C.mound3):C.mound,372-hw,cy,hw*2,1);rect(g,C.mound2,372+hw-6,cy,6,1);}
  var junk=['#c45a3a','#5f7f9e','#d8cfa8','#6b4a32','#e3e3e3','#3f7a2e'];
  for(i=0;i<260;i++){var r=5+r2()*83|0,hw2=Math.round(Math.sqrt(r/88)*26);x=372-hw2+(r2()*hw2*2|0);rect(g,junk[r2()*junk.length|0],x,60+r,1,1);}
  if(SE.snow)for(i=0;i<70;i++){r=4+r2()*40|0;hw2=Math.round(Math.sqrt(r/88)*26);rect(g,C.white,372-hw2+(r2()*hw2*2|0),60+r,1,1);}
  rect(g,'#e7e1d3',336,21,14,12);rect(g,'#7c3f30',335,18,16,3);if(SE.snow)rect(g,C.snow,335,17,16,2);
  rect(g,C.sky,339,24,6,4);rect(g,C.wood,346,27,3,6);
  rect(g,SE.snow?'#d9dcd8':C.dirt,336,176,46,2);
  sign(g,'DUMP',364,1);
  g.restore();
  drawParking(g,r2);
  drawStreetBits(g);
  /* a block for every town with a bin out or a stop today, row A along the road and row B along the lane */
  M.towns.forEach(function(T){drawTownBlock(g,T);});
  if(!M.towns.length)sign(g,'NO BINS OUT AND NO STOPS TODAY',W/2,ROWA+4);
  /* the park: trees, a flower bed and a lawn the JWG crew look after */
  rect(g,SE.snow?C.snow2:SE.grass2,0,PARK_TOP-2,W,1);
  TREES.forEach(function(tx){tree(g,tx,PARK_TOP+8,r2);});
  if(!SE.snow){rect(g,'#7a5a3c',8,PARK_TOP,52,30);for(i=0;i<60;i++)rect(g,'#6a4c32',8+r2()*52|0,PARK_TOP+r2()*30|0,1,1);}
  if(SE.park==='snowman'){var sy=PARK_TOP-1,s0=402-286;
    rect(g,C.white,s0+286,sy+14,9,8);rect(g,C.white,s0+287,sy+7,7,7);rect(g,C.white,s0+288,sy+2,5,5);
    rect(g,C.ink,s0+289,sy+4,1,1);rect(g,C.ink,s0+291,sy+4,1,1);rect(g,'#e8590c',s0+290,sy+5,2,1);rect(g,C.red,s0+287,sy+7,7,1);
    rect(g,C.wood,s0+284,sy+10,3,1);rect(g,C.wood,s0+294,sy+10,3,1);rect(g,C.ink,s0+290,sy+9,1,1);rect(g,C.ink,s0+290,sy+11,1,1);
    rect(g,C.ink,s0+288,sy,5,2);rect(g,C.ink,s0+287,sy+2,7,1);}
  drawPondBG(g);
}
/* the pond in the middle of the park (Jake, 2026-11-03): a grassy bank, water - or ice
   from Dec 1 to the end of February, when it's hockey season - a dock, cattails and a
   bench. drawPond adds what moves. */
function pondFrozen(d){var m=d.getMonth()+1;return m===12||m<=2;}
function inPond(x,y,shrink){var a=(x-POND_X)/(POND_RX-shrink),b=(y-POND_Y)/(POND_RY-shrink);return a*a+b*b<1;}
function drawPondBG(g){
  var ice=M.frozen,y;
  for(y=-POND_RY;y<=POND_RY;y++){var hw=Math.round(POND_RX*Math.sqrt(1-(y*y)/(POND_RY*POND_RY)));
    rect(g,ice?'#b9d4e3':SE.snow?'#c9d6cf':'#6b8f4e',POND_X-hw-2,POND_Y+y,hw*2+4,1);rect(g,ice?'#cfe6f2':'#3f7fb0',POND_X-hw,POND_Y+y,hw*2,1);}
  if(ice){for(var k=0;k<16;k++)rect(g,C.white,POND_X-36+((k*37)%72),POND_Y-12+((k*13)%26),4,1);
    /* the nets */
    [[POND_X-38,1],[POND_X+35,-1]].forEach(function(n){rect(g,C.red,n[0],POND_Y-4,3,1);rect(g,C.red,n[0],POND_Y+4,3,1);rect(g,C.red,n[1]>0?n[0]:n[0]+2,POND_Y-4,1,9);
      for(var q=-3;q<4;q+=2)rect(g,'#e6e4dc',n[1]>0?n[0]+1:n[0]+1,POND_Y+q,1,1);});
    rect(g,C.red,POND_X,POND_Y-POND_RY+3,1,POND_RY*2-6);}
  /* dock on the right, cattails on the left, a bench on the bank */
  rect(g,'#8b6b4a',POND_X+28,POND_Y-12,18,4);for(var p=0;p<4;p++)rect(g,'#6b4f36',POND_X+28+p*5,POND_Y-12,1,4);
  if(!SE.snow)[[-44,-3],[-41,3],[-38,-8],[-44,7]].forEach(function(c){rect(g,'#4f7a3a',POND_X+c[0],POND_Y+c[1],1,7);rect(g,'#6b4a32',POND_X+c[0],POND_Y+c[1]-1,1,3);});
  rect(g,'#6b4f36',POND_X-66,POND_Y+10,14,2);rect(g,'#6b4f36',POND_X-65,POND_Y+12,1,3);rect(g,'#6b4f36',POND_X-54,POND_Y+12,1,3);rect(g,'#6b4f36',POND_X-66,POND_Y+6,14,1);
}

/* ---------- the day, built from the board's snapshot ---------- */
var M=null;       // the model for this showing
var SVC_SHORT={'Bin Rental':'bin rental','Junk Removal':'junk removal','Junk Quote':'junk quote',
  'Furniture Pickup':'furniture pickup','Furniture Delivery':'furniture delivery','Extra Jobs':'extra job'};
function fmtClock(ms){var d=new Date(ms),h=d.getHours(),m=d.getMinutes();return(h%12||12)+':'+(m<10?'0':'')+m+(h>=12?' pm':' am');}
/* the dashboard's emails-to-send rule (app-bookings.js renderTodayBookings): copied, because this page loads no app.js */
function needsEmail(j){return j.status!=='Cancelled'&&!(j.email_sent||j.email_confirmed||j.no_email);}

var BADGE_DEFS=[
  {id:'early',name:'Early start',short:'EARLY START',hint:'A stop done before 8:45',icon:'sun'},
  {id:'ten',name:'Ten by noon',short:'TEN BY NOON',hint:'10 stops done before noon',icon:'clock'},
  {id:'big',name:'Big day',short:'BIG DAY',hint:'15 stops done',icon:'truck'},
  {id:'phone',name:"Phone's ringing",short:'PHONE BUSY',hint:'10 jobs entered today',icon:'phone'},
  {id:'sweep',name:'Clean sweep',short:'CLEAN SWEEP',hint:'Every bin stop done',icon:'star'},
  {id:'nodriver',name:'Nobody waiting',short:'ALL DRIVERS',hint:'Every bin stop has a driver',icon:'person'},
  {id:'inbox',name:'Inbox zero',short:'INBOX ZERO',hint:"Every new job's email sent",icon:'mail'},
  {id:'quotes',name:'Quotes covered',short:'QUOTES DONE',hint:'No quote waiting on a call',icon:'paper'}];

function buildModel(s){
  var m={now:s.now,dayStart:s.dayStart,counts:s.counts,bins:s.bins};
  /* when each job's zone first saw a truck, and when one left it */
  var geo={};
  s.notifs.forEach(function(n){var t=Date.parse(n.created_at),r=geo[n.job_id]||(geo[n.job_id]={any:Infinity,left:Infinity});
    r.any=Math.min(r.any,t);if(n.status==='pickedup')r.left=Math.min(r.left,t);});
  m.stops=s.stops.map(function(e,i){
    var kind=e.kind||(e.service==='Junk Removal'?'junk':/^Furniture/.test(e.service)?'furn':'other');
    var r=geo[e.jobId],doneAt=null;
    if(e.done&&r){var t=kind==='pick'?r.left:r.any;doneAt=isFinite(t)?t:null;}
    return{i:i,jobId:e.jobId,kind:kind,service:e.service,town:e.town||'',time:e.time||'',hasDriver:!!e.hasDriver,done:!!e.done,doneAt:doneAt,cust:CUSTOMERS[i%CUSTOMERS.length]};});
  /* one block per town (Jake, 2026-11-02): every town with a bin out on rental or a
     stop today, the busiest first, half along the main road and half along the lane.
     Blocks narrow as there are more towns, so no town is ever left off. A stop's
     truck parks at its town's block. */
  var towns={},order=[];
  function townOf(name){var nm=String(name||'').trim()||'No town',k=nm.toLowerCase();
    if(!towns[k]){towns[k]={key:k,name:nm,out:0,stops:[]};order.push(towns[k]);}return towns[k];}
  (s.outTowns||[]).forEach(function(c){townOf(c).out++;});
  m.stops.forEach(function(st){var T=townOf(st.town);T.stops.push(st);st.townObj=T;});
  order.sort(function(a,b){return(b.out+b.stops.length)-(a.out+a.stops.length)||a.name.localeCompare(b.name);});
  var perRow=Math.max(8,Math.ceil(order.length/2)),bw=Math.floor((W-4-LOTS_X)/perRow);
  order.forEach(function(T,k){
    var row=k<perRow?0:1,x0=LOTS_X+(row?k-perRow:k)*bw,houses=bw>=50?2:1,tx=clamp(Math.round(x0+bw/2-TRUCK_W/2),LOTS_X-2,W-TRUCK_W-2);
    T.i=k;T.block={x:x0,w:bw,top:row?ROWB:ROWA,houses:houses,binX:x0+3+houses*14};
    T.loc={x:tx,y:row?LANEY:ROADY,ex:tx,lane:!!row};});
  m.towns=order;
  m.stops.forEach(function(st){st.loc=st.townObj.loc;});
  /* trucks, with the zones each one stood in today */
  var byJob={};m.stops.forEach(function(st){(byJob[st.jobId]=byJob[st.jobId]||[]).push(st);});
  /* the hook-lifts park in the yard, two rows each side of the gate lane (x 199), plus
     the shop doorway; the vans and pickups (and any hook-lift past five) in the lot */
  var yardSlots=[[153+DX,YARD_Y],[230+DX,YARD_Y],[153+DX,YARD_Y-15],[230+DX,YARD_Y-15],[288+DX,YARD_Y]];
  var lotSlots=[];for(var ls=BOARD_X+4;ls+TRUCK_W<W-4;ls+=30)lotSlots.push([ls,LOT_Y+12]);
  /* who's who: the driver's name and app colour; a vehicle nobody has driven today goes by its own name */
  var trucks=s.trucks.map(function(t){
    var truckName=vehicleName(t.name);
    return{id:t.id,driver:t.driver||null,label:(t.driver||truckName||'Truck').toUpperCase(),truckName:truckName,kind:vehicleKind(t.name),
           color:(t.driver&&s.crewColor[t.driver])||C.nodriver,state:t.state,visits:[]};});
  var byId={};trucks.forEach(function(T){byId[T.id]=T;});
  var used={};
  s.visits.slice().sort(function(a,b){return Date.parse(a.entered_at)-Date.parse(b.entered_at);}).forEach(function(v){
    var T=byId[v.device_id];if(!T)return;
    var legs=byJob[v.job_id]||[],u=used[v.job_id]||0,st=legs[Math.min(u,legs.length-1)]||null;used[v.job_id]=u+1;
    T.visits.push({tin:Date.parse(v.entered_at),tout:v.exited_at?Date.parse(v.exited_at):null,inside:!!v.inside&&!v.exited_at,stop:st});});
  /* every vehicle the board has today: hook-lifts first, the ones that have worked
     today ahead of the ones that haven't, then by name */
  m.trucks=trucks.slice().sort(function(a,b){return(a.kind==='truck'?0:1)-(b.kind==='truck'?0:1)
      ||(b.visits.length?1:0)-(a.visits.length?1:0)||a.label.localeCompare(b.label);})
    .slice(0,yardSlots.length+lotSlots.length);
  /* hook-lifts take the yard first, everything else the lot first; either spills into the other */
  var yi=0,li=0;
  m.trucks.forEach(function(T){
    var wantYard=T.kind==='truck',inYard=wantYard?yi<yardSlots.length:li>=lotSlots.length,sl=inYard?yardSlots[yi++]:lotSlots[li++],
        gate=!inYard?sl[0]:sl[0]===288+DX?288+DX:199+DX;
    T.yard={x:sl[0],y:sl[1],ex:gate,inPts:[[gate,sl[1]]],outPts:[[gate,sl[1]]]};
    var c=T.color.replace('#',''),lum=(parseInt(c.substr(0,2),16)*299+parseInt(c.substr(2,2),16)*587+parseInt(c.substr(4,2),16)*114)/255000;
    T.ink=lum>.62?C.ink:C.white;});
  /* entered today, for the flip board and the news line */
  m.entered=s.entered.map(function(j){return{t:Date.parse(j.created_at),service:j.service,city:j.city||'',by:String(j.created_by||'').trim()};}).sort(function(a,b){return a.t-b.t;});
  m.emails=s.entered.filter(needsEmail).length;
  /* bin legs only, the same as the bin board's red "Unassigned" card - junk and
     furniture jobs are often not given a driver in the app, so they would cry wolf */
  m.noDriver=m.stops.filter(function(st){return(st.kind==='drop'||st.kind==='pick')&&!st.hasDriver;}).length;
  /* the events, in order */
  var ev=[];
  m.entered.forEach(function(e){var sv=SVC_SHORT[e.service]||'job',who=bookerName(e);
    var what=who?who+' booked a '+sv:'New '+sv;
    ev.push({t:e.t,line:what+(e.city?' · '+e.city:''),flap:what+(e.city?' - '+e.city:''),kind:'new'});});
  m.stops.forEach(function(st){if(st.doneAt==null)return;
    var what=st.kind==='drop'?'Bin dropped off':st.kind==='pick'?'Bin picked up':'Job done';
    ev.push({t:st.doneAt,line:what+(st.town?' · '+st.town:''),flap:what+(st.town?' - '+st.town:''),kind:'done',stop:st});});
  /* team badges, earned from the same numbers */
  var doneT=m.stops.filter(function(st){return st.doneAt!=null;}).map(function(st){return st.doneAt;}).sort(function(a,b){return a-b;});
  var binStops=m.stops.filter(function(st){return st.kind==='drop'||st.kind==='pick';});
  var noon=s.dayStart+12*60*MIN;
  var earned={};
  if(doneT.length&&doneT[0]<s.dayStart+(8*60+45)*MIN)earned.early=doneT[0];
  if(doneT.length>=10&&doneT[9]<noon)earned.ten=doneT[9];
  if(doneT.length>=15)earned.big=doneT[14];
  if(m.entered.length>=10)earned.phone=m.entered[9].t;
  if(binStops.length&&binStops.every(function(st){return st.done;}))earned.sweep=binStops.reduce(function(a,st){return Math.max(a,st.doneAt||s.now);},0);
  if(m.stops.length&&!m.noDriver)earned.nodriver=s.now;
  if(m.entered.length&&!m.emails)earned.inbox=s.now;
  if(!s.counts.quotesDue)earned.quotes=s.now;
  m.earned=earned;
  BADGE_DEFS.forEach(function(b){if(earned[b.id]!=null)ev.push({t:earned[b.id],line:'Team badge: '+b.name,flap:'TEAM BADGE: '+b.name,kind:'badge',badge:b});});
  ev.sort(function(a,b){return a.t-b.t;});
  m.events=ev;
  m.start=Math.min(s.now,s.dayStart+7*60*MIN);
  return m;
}

/* where a truck is at time t: in the yard, at a stop, driving between two places, or out on the road */
function truckAt(T,t){
  var v=T.visits,i;
  if(t>=M.now){
    for(i=0;i<v.length;i++)if(v[i].inside)return{mode:'stop',stop:v[i].stop};
    if(T.state==='yard')return{mode:'yard'};
    return{mode:'road',near:v.length?v[v.length-1].stop:null};
  }
  for(i=0;i<v.length;i++){var a=v[i],end=a.tout!=null?a.tout:(a.inside?Infinity:a.tin+15*MIN);
    if(t>=a.tin&&t<end)return{mode:'stop',stop:a.stop};}
  var prev=null,next=null;
  for(i=0;i<v.length;i++){var e2=v[i].tout!=null?v[i].tout:v[i].tin+15*MIN;if(e2<=t)prev=v[i];else if(v[i].tin>t){next=v[i];break;}}
  if(!prev&&!next)return T.state==='yard'?{mode:'yard'}:{mode:'road',near:null};
  if(!prev){var leave=next.tin-20*MIN;if(t<leave)return{mode:'yard'};return{mode:'drive',from:'yard',to:next.stop,p:(t-leave)/(next.tin-leave)};}
  var pend=prev.tout!=null?prev.tout:prev.tin+15*MIN;
  if(next)return{mode:'drive',from:prev.stop,to:next.stop,p:(t-pend)/(next.tin-pend)};
  if(T.state==='yard'){var arr=pend+20*MIN;if(t>=arr)return{mode:'yard'};return{mode:'drive',from:prev.stop,to:'yard',p:(t-pend)/(arr-pend)};}
  return{mode:'road',near:prev.stop};
}
var EDGE={x:W-TRUCK_W-2,y:ROADY,ex:W-TRUCK_W-2};
function locOf(T,ref){if(ref==='yard')return T.yard;if(ref&&ref.loc)return ref.loc;return EDGE;}
/* yard, shop and row A stops sit on the main road; row B stops on the lane, reached
   down the side road at the left edge (CX) */
function route(from,to){
  if(from===to)return[[to.x,to.y]];
  var pts=[[from.x,from.y]];(from.outPts||[]).forEach(function(p){pts.push(p.slice());});
  var fy=from.lane?LANEY:ROADY,ty=to.lane?LANEY:ROADY;
  pts.push([from.ex,fy]);
  if(fy!==ty){pts.push([CX,fy]);pts.push([CX,ty]);}
  pts.push([to.ex,ty]);
  (to.inPts||[]).forEach(function(p){pts.push(p.slice());});
  pts.push([to.x,to.y]);return pts;
}
function along(pts,p){
  var segs=[],total=0,i;
  for(i=1;i<pts.length;i++){var d=Math.abs(pts[i][0]-pts[i-1][0])+Math.abs(pts[i][1]-pts[i-1][1]);segs.push(d);total+=d;}
  var want=clamp(p,0,1)*total,face=1;
  for(i=0;i<segs.length;i++){var a=pts[i],b=pts[i+1];if(b[0]!==a[0])face=b[0]>a[0]?1:-1;
    if(want<=segs[i]||i===segs.length-1){var f=segs[i]?want/segs[i]:1;return{x:a[0]+(b[0]-a[0])*f,y:a[1]+(b[1]-a[1])*f,face:face};}
    want-=segs[i];}
  return{x:pts[pts.length-1][0],y:pts[pts.length-1][1],face:face};
}
/* on the main road a truck keeps to its own side: eastbound on the near lane, westbound on the far one */
function keepRight(p){if(Math.abs(p.y-ROADY)<.5)p.y+=p.face>0?2:-4;return p;}
/* out on the road but not at a stop (Jake, 2026-11-03: "drive around the town"): laps
   of the town - along the main road and back, down the side road, along the lane and
   back, up again - each truck starting a different way round so they spread out */
var LOOP=[[CX,ROADY],[W-TRUCK_W-2,ROADY],[CX,ROADY],[CX,LANEY],[W-TRUCK_W-2,LANEY],[CX,LANEY],[CX,ROADY]],
    LOOP_LEN=LOOP.reduce(function(s,p,i){return i?s+Math.abs(p[0]-LOOP[i-1][0])+Math.abs(p[1]-LOOP[i-1][1]):0;},0);
function placeTruck(T,t,idx,nowT){
  var st=truckAt(T,t);
  if(st.mode==='yard')return{x:T.yard.x,y:T.yard.y,face:1,st:st};
  if(st.mode==='stop'){var L=locOf(T,st.stop);return keepRight({x:L.x,y:L.y,face:1,st:st});}
  if(st.mode==='drive'){var q=along(route(locOf(T,st.from),locOf(T,st.to)),st.p);return keepRight({x:q.x,y:q.y,face:q.face,st:st,moving:true});}
  var c=along(LOOP,(nowT/1000*SPEED/LOOP_LEN+idx*.29)%1);
  return keepRight({x:c.x,y:c.y,face:c.face,st:st,moving:true});
}
function stopDone(st,t){return st.doneAt!=null?t>=st.doneAt:(st.done&&t>=M.now);}

/* ---------- the flip board ---------- */
var FLAPS=" ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.-'/:!+?",DIG='0123456789';
var flaps={},tick={msg:'',pages:[''],page:0,pageAt:0},boardReady=false;
function setFlap(id,ch,nowT,delay,init){
  var c=flaps[id]||(flaps[id]={shown:' ',target:' ',next:0,flapT:-1e9});
  if(FLAPS.indexOf(ch)<0)ch=' ';
  if(init){c.shown=ch;c.target=ch;return c;}
  if(c.target!==ch){c.target=ch;c.next=Math.max(c.next,nowT+delay);}
  return c;
}
function stepFlap(c,nowT,ms,set){
  if(c.shown===c.target||nowT<c.next)return;
  var i=set.indexOf(c.shown);c.shown=set.charAt((i+1)%set.length);c.flapT=nowT;c.next=nowT+ms;
}
function drawTile(x,y,c,nowT){
  rect(ctx,'#2b2f36',x,y,5,9);rect(ctx,'#3a3f47',x,y,5,1);
  text(ctx,c.shown,x+1,y+2,'#f2f0e6');
  rect(ctx,'#0f1114',x,y+4,1,1);rect(ctx,'#0f1114',x+4,y+4,1,1);
  if(nowT-c.flapT<40){ctx.globalAlpha=.6;rect(ctx,'#0f1114',x,y,5,4);ctx.globalAlpha=1;rect(ctx,'#6b727e',x,y+4,5,1);}
}
function numFlap(lx,y,label,n,tx,id,nowT,init,blink){
  text(ctx,label,lx,y+2,blink&&Math.floor(nowT/160)%2?'#3cc46f':'#f2c14e');
  var s=String(Math.min(99,n));if(s.length<2)s='0'+s;
  for(var d=0;d<2;d++){var c=setFlap(id+d,s.charAt(d),nowT,d*90,init);stepFlap(c,nowT,70,DIG);drawTile(tx+d*6,y,c,nowT);}
}
function wrapPages(msg,n){
  var words=msg.split(' '),pages=[],line='';
  words.forEach(function(w){while(w.length>n){if(line){pages.push(line);line='';}pages.push(w.slice(0,n));w=w.slice(n);}
    if(!line)line=w;else if(line.length+1+w.length<=n)line+=' '+w;else{pages.push(line);line=w;}});
  if(line)pages.push(line);return pages.length?pages:[''];
}
function drawBoard(nowT,vals,news){
  var init=!boardReady;
  rect(ctx,'#5b6270',34,13,92,43);rect(ctx,'#15181c',35,14,90,41);
  rect(ctx,'#8a8f98',36,13,2,1);rect(ctx,'#8a8f98',122,13,2,1);
  var rows=[['ENTERED',vals.entered,'TOMORROW',vals.tomorrow],['WEEK',vals.week,'QUOTES',vals.quotesWeek],['CHASE',vals.quotesDue,'BINS OUT',vals.binsOut]];
  rows.forEach(function(r,i){var y=15+i*10;
    numFlap(37,y,r[0],r[1],65,'n'+i+'a',nowT,init,i===0&&vals.flash>nowT);
    numFlap(82,y,r[2],r[3],114,'n'+i+'b',nowT,init,false);});
  rect(ctx,'#3a3f47',36,45,88,1);
  var msg=String(news||'GOOD MORNING').toUpperCase();
  if(msg!==tick.msg){tick.msg=msg;tick.pages=wrapPages(msg,20);tick.page=0;tick.pageAt=nowT;}
  else if(tick.pages.length>1&&nowT-tick.pageAt>2600){tick.page=(tick.page+1)%tick.pages.length;tick.pageAt=nowT;}
  var line=tick.pages[tick.page];
  text(ctx,'>',37,48,'#3cc46f');
  for(var k=0;k<20;k++){var c=setFlap('t'+k,line.charAt(k)||' ',nowT,k*30,init);stepFlap(c,nowT,26,FLAPS);
    var cx=42+k*4;rect(ctx,'#24282e',cx,47,3,7);text(ctx,c.shown,cx,48,'#f2c14e');if(nowT-c.flapT<30)rect(ctx,'#0f1114',cx,47,3,3);}
  boardReady=true;
}

/* ---------- ambient folk: office crew and yard crew, on their own clock ---------- */
var A=null;   // ambient state
function officeRoute(from,to){
  var fa=from[1]<110,ta=to[1]<110,lane=ta?AISLE:FLOOR,pts=[];
  if(fa===ta)pts.push([to[0],from[1]]);
  else{pts.push([GAPX,from[1]]);pts.push([GAPX,lane]);pts.push([to[0],lane]);}
  if(to[1]!==lane||fa===ta)pts.push(to.slice());
  return pts;
}
function walkPath(o,dt,speed){
  var can=speed*dt;
  while(can>1e-6&&o.pts.length){var p=o.pts[0],dx=p[0]-o.x,dy=p[1]-o.y,d=Math.sqrt(dx*dx+dy*dy);
    if(Math.abs(dx)>0.05)o.face=dx>0?1:-1;
    if(d<=can){o.x=p[0];o.y=p[1];can-=d;o.pts.shift();}else{o.x+=dx/d*can;o.y+=dy/d*can;can=0;}}
  return!o.pts.length;
}
function newAmbient(){
  rng=mulberry32(20261102);
  A={office:OFFICE.map(function(o){return{key:o.key,seat:o.seat,home:o.home,from:o.from,mode:'seat',left:o.left,x:o.home[0],y:o.home[1],face:1,target:null,pts:[]};}),t:0,
     yardR:[176,232,84,118],dogYard:[158,236,84,124],floorR:[10,50,140,158]};
  A.ow={};A.office.forEach(function(w){A.ow[w.key]=w;});
  /* Jeff, Josh and the dogs roam (Jake, 2026-11-03): the yard, Jeff's office, the
     office floor, the break room. The dogs: Sawyer, Vincent and Winnie. */
  A.roam=[
    roamer('jeff',P.jeff,[200,100],[{wander:'yard',dur:[30,70],w:3},{spot:JEFF_SEAT,seated:true,dur:[40,90],w:3},{spot:[33,AISLE],dur:[6,12],w:1},{spot:COFFEE,dur:[6,12],w:1},{spot:MEET3,dur:[20,45],w:1}],6),
    roamer('josh',P.josh,[170,90],[{wander:'yard',dur:[30,70],w:4},{spot:JEFF_VISIT,dur:[8,16],w:1},{spot:COFFEE,dur:[6,12],w:1}],6),
    roamer('sawyer',null,[190,110],dogPlaces(0),14),
    roamer('vincent',null,[30,150],dogPlaces(1),12),
    roamer('winnie',null,BEDS[2].slice(),dogPlaces(2),12)];
  A.roam[0].place=A.roam[0].places[0];A.roam[1].place=A.roam[1].places[0];
  A.roam[2].place=A.roam[2].places[0];A.roam[3].place=A.roam[3].places[1];
  A.roam[4].place=A.roam[4].places[2];A.roam[4].mode='stay';
}
function dogPlaces(i){return[{wander:'yard',dur:[20,50],w:3},{wander:'floor',dur:[15,40],w:2},{spot:BEDS[i],lie:true,dur:[30,80],w:2}];}
function roamer(key,look,at,places,speed){
  return{key:key,look:look,dog:!look,x:at[0],y:at[1],tx:at[0],ty:at[1],face:1,places:places,speed:speed,rest:look?1:.25,
         mode:'wander',place:null,left:8+rng()*20,wait:0,moving:false,pts:[]};}
function regionFor(o,pl){return pl.wander==='yard'?(o.dog?A.dogYard:A.yardR):A.floorR;}
/* Winnie sticks with Jeff half the time (Jake, 2026-11-03): each time she picks what to
   do next it's a coin toss between tagging along at his heels and her own dog things */
/* chance is high because part of each turn goes on catching him up across the yard or
   between buildings: measured on a sample day, this puts her right beside him about half
   the time */
var JEFF_PAL={key:'winnie',chance:.75,dur:[30,70]};
function nextPlace(o){
  if(o.key===JEFF_PAL.key&&rng()<JEFF_PAL.chance){o.mode='follow';o.place={follow:true};o.pts=[];o.goal=null;
    o.left=JEFF_PAL.dur[0]+rng()*(JEFF_PAL.dur[1]-JEFF_PAL.dur[0]);return;}
  var tot=0,i;o.places.forEach(function(p){tot+=p.w;});var r=rng()*tot;
  for(i=0;i<o.places.length-1;i++){r-=o.places[i].w;if(r<=0)break;}
  var pl=o.places[i],to;
  if(pl.wander){var R=regionFor(o,pl);to=[R[0]+rng()*(R[1]-R[0]),R[2]+rng()*(R[3]-R[2])];}else to=pl.spot;
  o.place=pl;o.pts=route2([o.x,o.y],to);o.mode='travel';
}
function updRoamer(o,dt){
  if(o.mode==='follow'){
    /* trot to a spot just behind Jeff, re-aiming whenever he's moved on - but never while
       she's partway through a doorway, since a route planned from there starts back at
       that door and she'd shuffle in place */
    var J=A.roam[0],to=[J.x+(J.face>0?-10:8),J.y+4];o.left-=dt;
    var movedOn=!o.goal||Math.abs(to[0]-o.goal[0])+Math.abs(to[1]-o.goal[1])>8,
        inDoor=o.pts.length&&zoneOf([o.x,o.y])!==zoneOf(o.pts[0]);
    if(movedOn&&!inDoor&&Math.abs(to[0]-o.x)+Math.abs(to[1]-o.y)>6){o.pts=route2([o.x,o.y],to);o.goal=to;}
    o.moving=o.pts.length>0;
    if(o.moving)walkPath(o,dt,o.speed);else o.face=J.x>o.x?1:-1;
    if(o.left<=0)nextPlace(o);
    return;}
  if(o.mode==='travel'){o.moving=true;
    if(walkPath(o,dt,o.speed)){o.mode=o.place.wander?'wander':'stay';o.left=o.place.dur[0]+rng()*(o.place.dur[1]-o.place.dur[0]);
      o.tx=o.x;o.ty=o.y;o.wait=0;o.moving=false;}
    return;}
  o.left-=dt;
  if(o.mode==='wander'){o.region=regionFor(o,o.place);updWander(o,dt);}else o.moving=false;
  if(o.left<=0&&!o.moving)nextPlace(o);
}
/* someone who starts later in the day (from: hour) isn't in the office before then */
function inOffice(w,t){return!w.from||new Date(t).getHours()>=w.from;}
function updWorker(w,dt){
  if(w.mode==='seat'||w.mode==='visit'){w.left-=dt;if(w.left>0)return;
    if(w.mode==='seat'){w.x=w.home[0];w.y=w.home[1];
      w.target=pick(PLACES.filter(function(p){return p.not!==w.key&&(!p.only||p.only===w.key);}));w.pts=route2([w.x,w.y],w.target.p);w.mode='walk';}
    else{w.pts=route2([w.x,w.y],w.home);w.mode='back';}
    return;}
  /* a booking is walked a little quicker than a coffee run */
  if(walkPath(w,dt,w.ticket?14:6)){
    if(w.mode==='walk'){w.mode='visit';var st=w.target&&w.target.stay;
      w.left=w.ticket?1.5:st?st[0]+rng()*(st[1]-st[0]):5+rng()*8;if(w.ticket){pinTicket(w.ticket,performance.now());w.ticket=null;}}
    else{w.mode='seat';w.left=25+rng()*50;}}
}

/* ---------- the booking room: today's tickets on the wall, and new bookings walked in ----------
   Every job records who entered it (jobs.created_by: Kelly, Rachel, Jake... or "system"
   for ones made automatically). Each time the screen comes up, the bookings since the
   last showing join a queue and play one at a time once the replay is done - the person
   who booked it walks the ticket to the room, pins it and rings the bell - so a burst of
   bookings is never missed even though the screen is only up for part of each lap. A
   "system" booking comes out of the printer instead. The wall keeps every ticket all day. */
var BQ=[],bookSeen=null,bookActive=null,bookNextAt=0,bellUntil=0,printUntil=0,bookNews=null;
function bookerName(e){var b=e.by;return b&&!/^system$/i.test(b)?b.charAt(0).toUpperCase()+b.slice(1):'';}
function bookerWorker(e){var k=String(e.by||'').toLowerCase();return A.ow[k]||null;}
function queueBookings(){
  var fresh=bookSeen==null?M.entered.slice(-2)        /* first showing after a reload: walk the latest two */
    :M.entered.filter(function(e){return e.t>bookSeen;});
  BQ=fresh.slice(-6).map(function(e){return{e:e,pinned:false};});
  if(M.entered.length)bookSeen=M.entered[M.entered.length-1].t;
  bookActive=null;bookNextAt=0;
  A.office.forEach(function(w){w.ticket=null;});
}
function pinTicket(q,nowT){
  q.pinned=true;bookActive=null;bookNextAt=nowT+1200;
  bellUntil=nowT+1600;flashUntil=nowT+1200;stamp(118+DX,128,'BOOKED',C.green,nowT);
  var sv=(SVC_SHORT[q.e.service]||'job').toUpperCase(),who=bookerName(q.e);
  bookNews={flap:(who?who.toUpperCase()+' BOOKED A ':'NEW ')+sv+(q.e.city?' - '+q.e.city.toUpperCase():''),until:nowT+8000};
}
function runBookings(nowT){
  if(nowT-showAt<REPLAY_MS+500||nowT<bookNextAt)return;
  if(bookActive){if(bookActive.printAt&&nowT>bookActive.printAt+1500)pinTicket(bookActive,nowT);return;}
  var q=BQ.filter(function(b){return!b.pinned;})[0];if(!q)return;
  bookActive=q;
  var w=bookerWorker(q.e);
  if(w&&!inOffice(w,M.now))w=null;   /* booked before coming in: it comes out of the printer */
  if(w&&onIce(w.key))w=null;          /* out on the pond: the printer again */
  if(w){if(w.mode==='seat'){w.x=w.home[0];w.y=w.home[1];}
    w.ticket=q;w.target=BOOK_SPOT;w.pts=route2([w.x,w.y],BOOK_SPOT.p);w.mode='walk';}
  else{q.printAt=nowT;printUntil=nowT+1500;}
}
var TICKET_COL={'Bin Rental':'#22c55e','Junk Removal':'#a8632a','Junk Quote':'#e39a1c','Furniture Pickup':'#8b5cf6','Furniture Delivery':'#8b5cf6'};
var TICKET_SIZES=[{w:3,h:4,px:4,py:5},{w:2,h:3,px:3,py:4},{w:2,h:2,px:3,py:3}];
function drawBooking(nowT,t){
  /* the wall: every job entered so far, less the queued ones not yet walked in */
  var waiting=BQ.filter(function(b){return!b.pinned;}).map(function(b){return b.e;});
  var tickets=M.entered.filter(function(e){return e.t<=t&&waiting.indexOf(e)<0;});
  var ax=112,ay=149,aw=25,ah=20,sz=TICKET_SIZES[TICKET_SIZES.length-1],k;
  for(k=0;k<TICKET_SIZES.length;k++){var s0=TICKET_SIZES[k];if(Math.floor(aw/s0.px)*Math.floor(ah/s0.py)>=tickets.length){sz=s0;break;}}
  var cols=Math.max(1,Math.floor(aw/sz.px));
  tickets.forEach(function(e,i){var x=ax+(i%cols)*sz.px,y=ay+Math.floor(i/cols)*sz.py;
    rect(ctx,'#f7f5ef',x,y,sz.w,sz.h);rect(ctx,TICKET_COL[e.service]||'#9aa0a6',x,y+1,sz.w,sz.h-1);rect(ctx,C.red,x+Math.floor(sz.w/2),y,1,1);});
  /* the bell, which shakes when a ticket goes up */
  var j=bellUntil>nowT?(Math.floor(nowT/60)%2?1:-1):0;
  rect(ctx,C.gold2,90+j,161,6,2);rect(ctx,C.gold,91+j,159,4,2);rect(ctx,C.gold,92+j,158,2,1);rect(ctx,C.ink,92+j,163,2,1);
  /* the printer, for bookings nobody walked in */
  if(printUntil>nowT){var pr=1-(printUntil-nowT)/1500,ph=Math.round(pr*7);rect(ctx,C.white,43,140-ph,8,ph+1);rect(ctx,'#7d8a82',44,141-ph,5,1);}
}
function updWander(j,dt){
  if(j.wait>0){j.wait-=dt;j.moving=false;return;}
  var dx=j.tx-j.x,dy=j.ty-j.y,d=Math.sqrt(dx*dx+dy*dy),can=j.speed*dt,R=j.region;
  if(d<=can){j.x=j.tx;j.y=j.ty;j.wait=(j.rest||1)*(3+rng()*9);j.tx=R[0]+rng()*(R[1]-R[0]);j.ty=R[2]+rng()*(R[3]-R[2]);j.moving=false;}
  else{j.x+=dx/d*can;j.y+=dy/d*can;j.moving=true;if(Math.abs(dx)>0.05)j.face=dx>0?1:-1;}
}
function stepAmbient(dt){
  while(dt>0){var d=Math.min(.5,dt);dt-=d;A.t+=d;
    A.office.forEach(function(w){updWorker(w,d);});A.roam.forEach(function(o){updRoamer(o,d);});}
}

/* ---------- scenery that keeps the picture busy: gulls over the dump, a loader on the
   pile and the hockey game. None of it is data. (No passing cars - Jake took them out
   2026-11-02: the road is for our trucks. No strangers on the sidewalk either - Jake
   took them out 2026-11-03: only our own people walk about.) ---------- */
var SC=null;
function newScenery(){
  SC={gulls:[0,1.6,3.1,4.4],loader:{x:360,dir:1},hockey:newHockey()};
}
function updScenery(dtR){
  if(M&&M.frozen)updHockey(dtR);
  var L=SC.loader;L.x+=L.dir*4*dtR;if(L.x>378){L.dir=-1;}if(L.x<354){L.dir=1;}
}
/* the dump's own life, in the shifted coordinates: gulls, the loader and (in October) the ghost */
function drawDumpBits(nowT){
  /* gulls circling the dump */
  SC.gulls.forEach(function(ph,i){var a=nowT/1400+ph,gx=372+Math.cos(a)*(18+i*4),gy=42+Math.sin(a*1.3)*10,up=Math.floor(nowT/160+i)%2;
    rect(ctx,'#f2f0e8',gx,gy,1,1);rect(ctx,'#f2f0e8',gx-2,gy-up,2,1);rect(ctx,'#f2f0e8',gx+1,gy-up,2,1);});
  /* the loader pushing the pile */
  var L=SC.loader,lx=Math.round(L.x),ly=128,f=L.dir<0;
  rect(ctx,'#e3b13a',lx,ly,12,5);rect(ctx,'#2b2f36',f?lx+1:lx+5,ly-4,6,4);rect(ctx,C.glass,f?lx+2:lx+6,ly-3,4,2);
  rect(ctx,'#22252b',lx+1,ly+5,3,2);rect(ctx,'#22252b',lx+8,ly+5,3,2);
  rect(ctx,'#9aa0a6',f?lx-4:lx+12,ly+1,4,4);rect(ctx,'#6b727e',f?lx-1:lx+11,ly+2,2,1);
  if(SE.spooky){
    var gy=Math.round(40+Math.sin(nowT/500)*3);
    rect(ctx,C.white,384,gy,7,7);rect(ctx,C.white,384,gy+7,2,1);rect(ctx,C.white,387,gy+7,1,1);rect(ctx,C.white,389,gy+7,2,1);
    rect(ctx,C.ink,386,gy+2,1,2);rect(ctx,C.ink,388,gy+2,1,2);
  }
}

/* ---------- the pond, live: ripples and ducks, leaves in fall, lily pads in spring and
   summer, and in hockey season a game of shinny. Now and then (one showing in five)
   Jeff, Jake and Josh are out there playing (Jake, 2026-11-03) - Josh only while his
   pickup is in the yard. ---------- */
var SKATERS=[{hair:'#3b2416',cap:'#1d1d1d'},{hair:'#d8b46a',cap:'#1d1d1d'},{hair:'#8a5a3c',cap:'#1d1d1d'},{hair:'#2b2b2b',cap:'#1d1d1d'}];
function newHockey(){var offs=[[-18,-7],[16,5],[-8,8],[10,-9]],teams=['#d9412b','#2f74c8','#d9412b','#2f74c8'];
  return{puck:{x:POND_X,y:POND_Y,tx:POND_X,ty:POND_Y},pl:offs.map(function(o,i){return{x:POND_X+o[0]*2,y:POND_Y+o[1],ox:o[0],oy:o[1],team:teams[i],face:1,moving:false};})};}
function updHockey(dt){
  var H=SC.hockey,p=H.puck,dx=p.tx-p.x,dy=p.ty-p.y,d=Math.sqrt(dx*dx+dy*dy),v=40*dt;
  if(d<=v){p.x=p.tx;p.y=p.ty;do{p.tx=POND_X+(Math.random()*2-1)*(POND_RX-8);p.ty=POND_Y+(Math.random()*2-1)*(POND_RY-5);}while(!inPond(p.tx,p.ty,6));}
  else{p.x+=dx/d*v;p.y+=dy/d*v;}
  H.pl.forEach(function(q){var ex=p.x+q.ox-q.x,ey=p.y+q.oy-q.y,e=Math.sqrt(ex*ex+ey*ey),s=22*dt;
    if(e>s){q.x+=ex/e*s;q.y+=ey/e*s;q.moving=true;}else q.moving=false;if(Math.abs(ex)>.5)q.face=ex>0?1:-1;});
}
function onIce(key){return!!(M&&M.hockeyCrew)&&(key==='jeff'||key==='jake'||(key==='josh'&&!M.joshOut));}
function drawPond(nowT){
  var k;
  if(M.frozen){var H=SC.hockey,crew=M.hockeyCrew?[['JEFF',P.jeff],['JAKE',P.jake],M.joshOut?null:['JOSH',P.josh]]:[];
    H.pl.slice().sort(function(a,b){return a.y-b.y;}).forEach(function(q){var i=H.pl.indexOf(q),c=crew[i],
        look=c?c[1]:Object.assign({shirt:q.team},SKATERS[i]),x=q.x-2,y=q.y-12;
      person(ctx,x,y,look,{face:q.face,step:q.moving&&Math.floor(nowT/240+i)%2});
      rect(ctx,'#6b4a32',q.face>0?q.x+4:q.x-5,q.y-3,1,3);rect(ctx,C.ink,q.face>0?q.x+4:q.x-6,q.y,2,1);
      if(c)badge(ctx,c[0],q.x,y-(c[0]==='JOSH'?14:9),q.team);});
    rect(ctx,C.ink,H.puck.x,H.puck.y,2,1);
    return;}
  for(k=0;k<14;k++){var sx=POND_X+Math.cos(k*1.7)*POND_RX*.7,sy=POND_Y+Math.sin(k*2.3)*POND_RY*.6;if(Math.sin(k*2.4+nowT/1600)>.5)rect(ctx,'#5b9ac8',sx,sy,3,1);}
  if(SE.flowers)for(k=0;k<8;k++){var lx=POND_X+Math.cos(k*.9+2)*POND_RX*.75,ly=POND_Y+Math.sin(k*1.9)*POND_RY*.55;rect(ctx,'#4f8f3a',lx,ly,3,2);if(k%3===0)rect(ctx,'#f4b6c8',lx+1,ly,1,1);}
  if(SE.leafPiles)for(k=0;k<9;k++)rect(ctx,SE.leaves[k%4],POND_X+Math.cos(k*.9+2)*POND_RX*.75+Math.sin(nowT/3000+k),POND_Y+Math.sin(k*1.9)*POND_RY*.55,2,1);
  if(!SE.snow)for(var d=0;d<3;d++){var a=nowT/4000+d*2.1,dx=POND_X+Math.cos(a)*30,dy=POND_Y+Math.sin(a)*9,f=Math.sin(a)>0?-1:1;
    rect(ctx,'#7a5a3c',dx,dy,6,3);rect(ctx,d?'#7a5a3c':'#2f6a3a',f>0?dx+5:dx-2,dy-2,3,3);rect(ctx,'#e3b13a',f>0?dx+8:dx-3,dy-1,1,1);rect(ctx,'#5b9ac8',dx-1,dy+3,8,1);}
}

/* ---------- surprise visitors (Jake, 2026-11-03): once a day one of these turns up, at a
   time picked from the date so every showing that day agrees (between 9 am and 4 pm),
   and plays each time the screen comes up in the next 10 minutes so the office catches
   it. Pure fun: nothing goes on the flip board and nothing is saved. Santa is December
   only; the geese have flown south once there's snow. ---------- */
var SUR_LEN={dino:16000,ufo:12000,moose:14000,balloon:30000,geese:10000,bin:14000,bigfoot:14000,santa:12000};
var SUR=null;   // {kind,start}: the one playing on this showing
function surpriseFor(dayStart){
  /* the date, scrambled, seeds the pick - neighbouring dates would otherwise pick alike */
  var d=new Date(dayStart),r=mulberry32(Math.imul(d.getFullYear()*10000+(d.getMonth()+1)*100+d.getDate(),2654435761)^0x5bd1e995),dec=d.getMonth()===11;
  var pool=Object.keys(SUR_LEN).filter(function(k){return k==='santa'?dec:k==='geese'?!SE.snow:true;});
  r();r();r();
  return{kind:pool[Math.floor(r()*pool.length)],at:dayStart+(9*60+Math.floor(r()*7*60))*MIN};
}
function surP(nowT){if(!SUR)return-1;var p=(nowT-SUR.start)/SUR_LEN[SUR.kind];if(p>1){SUR=null;return-1;}return p;}
function surOn(kind,nowT){return surP(nowT)>=0&&SUR.kind===kind;}
/* the dinosaur's footsteps shake the whole picture */
function surShake(nowT){if(!surOn('dino',nowT))return 0;var t=nowT-SUR.start;return Math.floor(t/350)!==Math.floor((t-60)/350)?1:0;}
function mirror(x,w,flip){return function(x0,y0,ww,h,c){rect(ctx,c,flip?x+w-x0-ww:x+x0,y0,ww,h);};}
function drawTrex(x,y,step){var G='#5f9e3f',D='#3f7a2e',L='#a7c96a';
  rect(ctx,G,x+12,y,10,6);rect(ctx,D,x+12,y,10,1);rect(ctx,G,x+14,y+6,8,2);for(var k=15;k<22;k+=2)rect(ctx,C.white,x+k,y+6,1,1);rect(ctx,C.ink,x+18,y+2,1,1);
  rect(ctx,G,x+6,y+5,10,8);rect(ctx,L,x+9,y+9,6,4);rect(ctx,G,x,y+6,6,3);rect(ctx,G,x-4,y+8,4,2);rect(ctx,D,x+6,y+5,8,1);
  rect(ctx,G,x+15,y+9,3,1);rect(ctx,G,x+17,y+10,1,1);
  rect(ctx,D,x+7,y+13,3,step?6:5);rect(ctx,D,x+12,y+13,3,step?5:6);rect(ctx,D,x+7,y+(step?19:18),5,1);rect(ctx,D,x+12,y+(step?18:19),5,1);}
function drawMoose(x,y,step,flip){var r=mirror(x,22,flip),B='#5a3a24',A='#d9c7a0';
  r(0,y+3,16,7,B);r(2,y+2,10,2,'#4a2e1e');r(15,y+1,4,5,B);r(18,y+3,3,3,B);r(19,y+4,1,1,C.ink);r(16,y+6,2,3,B);
  r(14,y-2,2,3,A);r(12,y-3,3,1,A);r(18,y-2,2,3,A);r(19,y-3,3,1,A);
  [1,4,11,14].forEach(function(lx,i){r(lx,y+10,1,(i+step)%2?7:6,'#3a2416');});}
function drawGoose(x,y,up){rect(ctx,'#8a8f98',x,y+2,6,3);rect(ctx,'#5b6270',x,y+2,6,1);rect(ctx,'#1d1d1d',x+5,y-1+up,1,3);rect(ctx,'#1d1d1d',x+5,y-2+up,3,2);
  rect(ctx,C.white,x+6,y-1+up,1,1);rect(ctx,'#2b2f36',x+1,y+5,1,1);rect(ctx,'#2b2f36',x+4,y+5,1,1);}
function drawBigfoot(x,y,step,look){var F='#4a3020',F2='#3a2416';
  rect(ctx,F,x,y,7,5);rect(ctx,F,x-1,y+5,9,7);rect(ctx,F2,x-1,y+5,1,7);rect(ctx,'#8a6a50',x+(look?2:4),y+2,3,2);
  rect(ctx,C.ink,x+(look?2:4),y+2,1,1);rect(ctx,C.ink,x+(look?4:6),y+2,1,1);
  rect(ctx,F,x-2,y+6,1,5);rect(ctx,F,x+8,y+6,1,5);rect(ctx,F,x,y+12,3,step?3:4);rect(ctx,F,x+4,y+12,3,step?4:3);}
function shout(s,x,y,nowT){if(Math.floor(nowT/250)%2)badge(ctx,s,x,y,C.sign);}
/* Darrin is out chasing the runaway bin, so he's not at his bench */
function darrinOut(nowT){return surOn('bin',nowT);}
function drawSurprise(nowT){
  var p=surP(nowT);if(p<0)return;
  var t=nowT-SUR.start,k=SUR.kind,x,y;
  if(k==='dino'){x=-30+p*(W+60);var step=Math.floor(t/350)%2;drawTrex(x,ROADY-14,step);
    if(surShake(nowT))for(var d=0;d<3;d++)parts.push({x:x+6+d*4,y:ROADY+6,vx:(d-1)*6,vy:-4,life:.5,c:'#cfcabd'});}
  else if(k==='ufo'){var px=DX+362,cy=26,cx;
    if(p<.25)cx=-20+p/.25*(px+20);else if(p<.7)cx=px+Math.sin(t/300)*2;else{cx=px+(p-.7)/.3*300;cy=26-(p-.7)*80;}
    var beam=p>.3&&p<.68,lift=beam?(p-.3)/.38:p>=.68?1:0;
    if(beam){ctx.globalAlpha=.35;for(var b=0;b<44;b++)rect(ctx,C.light,cx+10-(6+b*.5)/2,cy+8+b,6+b*.5,1);ctx.globalAlpha=1;}
    if(p<.68){var couchY=72-lift*(72-cy-6);rect(ctx,'#8c3f2e',px+3,couchY,14,4);rect(ctx,'#a8503c',px+4,couchY-2,12,2);rect(ctx,'#8c3f2e',px+3,couchY-3,2,3);rect(ctx,'#8c3f2e',px+15,couchY-3,2,3);}
    rect(ctx,'#9aa3ad',cx,cy+4,20,3);rect(ctx,'#6b727e',cx+2,cy+7,16,1);rect(ctx,C.glass,cx+6,cy,8,4);rect(ctx,'#3cc46f',cx+9,cy+1,2,2);rect(ctx,C.ink,cx+9,cy+1,1,1);
    for(var l=0;l<4;l++)rect(ctx,(Math.floor(t/200)+l)%2?C.gold:C.red,cx+2+l*5,cy+5,2,1);}
  else if(k==='moose'){var mid=W/2-11,mv=true;
    if(p<.35)x=W+10-p/.35*(W+10-mid);else if(p<.65){x=mid;mv=false;}else x=mid-(p-.65)/.35*(mid+40);
    drawMoose(x,ROADY-8,mv?Math.floor(t/400)%2:0,true);if(!mv)shout('HONK',x+28,ROADY-16,nowT);}
  else if(k==='balloon'){var bx=-20+p*(W+40),by=18+Math.sin(t/900)*2,cols=[C.red,C.gold,C.blue,C.gold,C.red];
    ctx.globalAlpha=.2;rect(ctx,C.ink,bx+2,by+90,12,3);ctx.globalAlpha=1;
    [[4,0,8],[2,1,12],[1,2,14],[0,3,16],[0,4,16],[0,5,16],[0,6,16],[0,7,16],[1,8,14],[1,9,14],[2,10,12],[3,11,10],[4,12,8],[5,13,6]].forEach(function(rw){
      for(var q=0;q<rw[2];q++)rect(ctx,cols[Math.floor((rw[0]+q)/3.2)%5],bx+rw[0]+q,by+rw[1],1,1);});
    rect(ctx,'#6b4a32',bx+5,by+14,1,4);rect(ctx,'#6b4a32',bx+10,by+14,1,4);rect(ctx,'#8b6b4a',bx+5,by+18,6,4);rect(ctx,'#6b4a32',bx+5,by+18,6,1);rect(ctx,C.skin,bx+7,by+16,2,2);}
  else if(k==='geese'){x=-10+p*(W+60);
    person(ctx,x+30,RT-13,{hair:'#d8b46a',shirt:'#5f7f9e'},{step:Math.floor(t/120)%2,wave:true,arm:Math.floor(t/120)%2});
    for(var g=0;g<3;g++)drawGoose(x+12-g*9,RT-7+(g%2)*2,Math.floor(t/150+g)%2);shout('HONK',x+4,RT-22,nowT);}
  else if(k==='bin'){var gate=DX+212,bxx=p<.6?gate+p/.6*(W+20-gate):W+40,dx=p<.6?bxx-26:(W+14)-(p-.6)/.4*(W+14-gate),roll=Math.floor(t/100)%2;
    if(p<.6){y=ROADY+1;rect(ctx,'#1d2a22',bxx,y,16,8);rect(ctx,C.bin,bxx+1,y+1,14,6);rect(ctx,C.bin2,bxx+1,y+5,14,1);
      rect(ctx,C.tire,bxx+2,y+8,3,2);rect(ctx,C.tire,bxx+11,y+8,3,2);rect(ctx,C.rim,bxx+(roll?3:4),y+8,1,1);rect(ctx,C.rim,bxx+(roll?12:13),y+8,1,1);}
    person(ctx,dx,ROADY-4,P.shop,{face:p<.6?1:-1,step:Math.floor(t/110)%2});if(p<.6)shout('HEY',dx+2,ROADY-14,nowT);}
  else if(k==='bigfoot'){var stop=236,look=false,mv2=true;
    if(p<.4)x=-10+p/.4*(stop+10);else if(p<.62){x=stop;look=true;mv2=false;}else x=stop+(p-.62)/.38*(W-stop+20);
    drawBigfoot(x,PARK_TOP-1,mv2&&Math.floor(t/260)%2,look);}
  else if(k==='santa'){var sx=-60+p*(W+120),sy=26+Math.sin(t/500)*3;
    for(var s=0;s<10;s++)if(Math.random()<.6)rect(ctx,s%2?C.gold:C.white,sx-2-s*3,sy+4+((s*5)%5),1,1);
    rect(ctx,C.red,sx,sy+2,12,5);rect(ctx,'#a8321f',sx,sy+6,12,1);rect(ctx,C.gold,sx-1,sy+7,14,1);rect(ctx,'#8b6b4a',sx+3,sy,6,3);
    rect(ctx,C.red,sx+8,sy-2,4,4);rect(ctx,C.white,sx+8,sy-2,4,1);rect(ctx,C.skin,sx+9,sy-1,2,2);rect(ctx,C.white,sx+9,sy+1,3,1);
    for(var r=0;r<2;r++){var rx=sx+16+r*11,up=Math.floor(t/180+r)%2;
      rect(ctx,'#8a5a3c',rx,sy+3-up,7,3);rect(ctx,'#8a5a3c',rx+6,sy+1-up,3,3);rect(ctx,'#6b4a32',rx+7,sy-1-up,1,2);rect(ctx,'#6b4a32',rx+1,sy+6-up,1,2);rect(ctx,'#6b4a32',rx+5,sy+6-up,1,2);
      if(r===1)rect(ctx,Math.floor(t/300)%2?'#ff3b3b':'#a8321f',rx+9,sy+2-up,1,1);}
    rect(ctx,'#d9c7a0',sx+12,sy+4,5,1);}
}

/* ---------- weather and particles ---------- */
var wx=[],parts=[],conf=[],stamps=[],banner=null;
function weatherNow(){return WX||SE.ambient||null;}
function resetWeather(){wx=[];var w=weatherNow(),n=Math.round((w==='snow'?190:w==='rain'?110:w==='leaves'?30:w==='butterflies'?5:0)*W/400);
  for(var i=0;i<n;i++)wx.push(newFlake(w,true));}
function newFlake(w,anyY){var f={x:Math.random()*W,y:anyY?Math.random()*H:-4,ph:Math.random()*6.28};
  if(w==='snow'){f.vy=6+Math.random()*8;f.c=Math.random()<.7?'#ffffff':'#dbe4ec';}
  else if(w==='rain'){f.vy=110+Math.random()*40;f.c='#9fc3e0';}
  else if(w==='leaves'){f.vy=5+Math.random()*6;f.c=SE.leaves[Math.floor(Math.random()*SE.leaves.length)];}
  else{f.x=170+Math.random()*150;f.y=PARK_TOP+Math.random()*18;f.vy=0;f.c=['#f2c14e','#ffffff','#f4b6c8','#e8590c'][Math.floor(Math.random()*4)];}
  return f;}
function updWeather(dtR){
  var w=weatherNow();
  wx.forEach(function(f,i){
    if(w==='butterflies'){f.ph+=dtR*3;f.x+=Math.cos(f.ph*.7)*10*dtR;f.y+=Math.sin(f.ph)*8*dtR;f.x=clamp(f.x,4,W-4);f.y=clamp(f.y,PARK_TOP-4,H-4);return;}
    f.ph+=dtR*2;f.y+=f.vy*dtR;if(w!=='rain')f.x+=Math.sin(f.ph)*(w==='leaves'?10:5)*dtR+(w==='leaves'?3*dtR:0);
    if(f.y>H+2||f.x>W+4)wx[i]=newFlake(w,false);
  });
  for(var i=0;i<parts.length;i++){var p=parts[i];p.x+=p.vx*dtR;p.y+=p.vy*dtR;p.life-=dtR*.9;}
  parts=parts.filter(function(p){return p.life>0;});
  for(i=0;i<conf.length;i++){var c=conf[i];c.x+=c.vx*dtR;c.y+=c.vy*dtR;c.vy+=10*dtR;c.life-=dtR;}
  conf=conf.filter(function(c){return c.life>0&&c.y<H+4;});
}
function drawWeather(nowT){
  var w=weatherNow();
  wx.forEach(function(f){
    if(w==='rain')rect(ctx,f.c,f.x,f.y,1,3);
    else if(w==='butterflies'){var o=Math.floor(nowT/120+f.ph)%2;rect(ctx,f.c,f.x-1,f.y-o,1,1);rect(ctx,f.c,f.x+1,f.y-o,1,1);rect(ctx,C.ink,f.x,f.y,1,1);}
    else if(w==='leaves')rect(ctx,f.c,f.x,f.y,2,1);
    else rect(ctx,f.c,f.x,f.y,1,1);
  });
  parts.forEach(function(p){ctx.globalAlpha=clamp(p.life,0,1);var s=p.life>.6?2:1;rect(ctx,p.c,p.x,p.y,s,s);});
  conf.forEach(function(c){ctx.globalAlpha=clamp(c.life,0,1);rect(ctx,c.c,c.x,c.y,2,1);});ctx.globalAlpha=1;
}
function stamp(x,y,txt,col,nowT){stamps.push({x:x,y:y,txt:txt,col:col,born:nowT});}
function drawStamps(nowT){
  stamps=stamps.filter(function(s){return nowT-s.born<1600;});
  stamps.forEach(function(s){var a=(nowT-s.born)/1600,y=s.y-Math.round(a*8),w=tw(s.txt)+6,x=Math.round(s.x-w/2);
    ctx.globalAlpha=a>.75?(1-a)*4:1;rect(ctx,s.col,x,y,w,9);rect(ctx,C.white,x+1,y+1,w-2,7);text(ctx,s.txt,x+3,y+2,s.col);ctx.globalAlpha=1;});
}
function burstConfetti(){var cols=['#f2c14e','#d9412b','#2f74c8','#16a34a','#8b5cf6','#ffffff'];
  for(var i=0;i<110;i++)conf.push({x:Math.random()*W,y:-Math.random()*40,vx:(Math.random()-.5)*20,vy:20+Math.random()*30,life:3.5+Math.random(),c:cols[i%cols.length]});}

/* ---------- badge icons ---------- */
var ICONS={
  sun:{pal:{Y:'#f2c14e',O:'#e8590c'},rows:["....Y....",".Y..Y..Y.","..YYYYY..","..YOOOY..","YYYOOOYYY","..YOOOY..","..YYYYY..",".Y..Y..Y.","....Y...."]},
  clock:{pal:{K:'#1d2a22',W:'#ffffff',R:'#d9412b'},rows:["..KKKKK..",".KWWWWWK.","KWWWKWWWK","KWWWKWWWK","KWWWKRRWK","KWWWWWWWK","KWWWWWWWK",".KWWWWWK.","..KKKKK.."]},
  phone:{pal:{R:'#16a34a',K:'#0c3d1d'},rows:[".........",".RRRRRRR.","RR.....RR","RR.RRR.RR","..RRRRR..",".RRKRKRR.",".RRRRRRR.",".RRKRKRR.",".RRRRRRR."]},
  paper:{pal:{W:'#ffffff',K:'#7d8a82',A:'#e39a1c'},rows:["..AAAAA..",".WWWWWWW.",".WKKKKKW.",".WWWWWWW.",".WKKKKKW.",".WWWWWWW.",".WKKKWWW.",".WWWWWWW.",".WWWWWWW."]},
  truck:{pal:{G:'#3d9b4f',K:'#22252b',B:'#bfe2f2'},rows:[".........",".....GGG.",".....GBG.","GGGGGGGGG","GGGGGGGGG","GGGGGGGGG",".KK...KK.",".KK...KK.","........."]},
  person:{pal:{H:'#5a4030',S:'#f0c39a',G:'#2f8f46'},rows:["...HHH...","..HSSSH..","..SSSSS..","...SSS...",".GGGGGGG.","GGGGGGGGG","G.GGGGG.G","..GG.GG..","..GG.GG.."]},
  mail:{pal:{B:'#2f74c8',W:'#ffffff'},rows:[".........","BBBBBBBBB","BBWWWWWBB","BWBWWWBWB","BWWBWBWWB","BWWWBWWWB","BWWWWWWWB","BBBBBBBBB","........."]},
  star:{pal:{Y:'#f2c14e',O:'#b7791f'},rows:["....Y....","....Y....","...YYY...","YYYYOYYYY",".YYYYYYY.","..YYYYY..","..YY.YY..",".YY...YY.","Y.......Y"]}};
function drawBanner(nowT){
  if(!banner)return;var a=(nowT-banner.born)/3200;if(a>=1){banner=null;return;}
  var line1='TEAM BADGE!',line2=banner.name,w=Math.max(tw(line1),tw(line2))+30,x=Math.round(W/2-w/2),y=a<.08?Math.round(-24+a/.08*30):6;
  ctx.globalAlpha=a>.85?(1-a)/.15:1;
  rect(ctx,C.gold2,x-1,y-1,w+2,24);rect(ctx,C.gold,x,y,w,22);rect(ctx,'#fff3c4',x+1,y+1,w-2,1);
  var ic=ICONS[banner.icon];spr(ctx,ic.rows,ic.pal,x+5,y+6,false);
  text(ctx,line1,x+20,y+4,'#5a3a0a');text(ctx,line2,x+20,y+13,C.ink);
  ctx.globalAlpha=1;
}

/* ---------- one frame ---------- */
var cv=null,ctx=null,raf=0,showAt=0,lastFrame=0,lastEv=-1,flashUntil=0;
function sceneTime(nowT){
  var p=clamp((nowT-showAt)/REPLAY_MS,0,1),e=p<1?1-Math.pow(1-p,2):1;
  return{t:M.start+(M.now-M.start)*e,replaying:p<1};
}
function hand(cx,cy,ang,len,c){for(var i=1;i<=len;i++)rect(ctx,c,cx+Math.round(Math.cos(ang)*i),cy+Math.round(Math.sin(ang)*i),1,1);}
function cloudIn(bx,bw,cx,cy){[[1,0,4],[0,1,6]].forEach(function(p){var x0=Math.max(bx,Math.round(cx+p[0])),x1=Math.min(bx+bw,Math.round(cx+p[0]+p[2]));
  if(x1>x0)rect(ctx,C.white,x0,cy+p[1],x1-x0,1);});}
function drawWindow(nowT,t){
  var x=10,y=15,ww=21,hh=30,w=weatherNow();
  rect(ctx,C.wood,x-1,y-1,ww+2,hh+2);rect(ctx,SE.snow?'#c9dbe8':w==='rain'?'#8aa3b8':C.sky,x,y,ww,hh);
  if(w==='snow'){for(var i=0;i<12;i++){var fx=x+((i*7+Math.floor(nowT/90)*(i%3+1))%ww),fy=y+((i*5+Math.floor(nowT/120))%hh);rect(ctx,C.white,fx,fy,1,1);}}
  else{var span=ww+12,off=((nowT/1000*1.2)%span)-6;cloudIn(x,ww,x+off,y+4);cloudIn(x,ww,x+((off+17)%span)-6,y+14);}
  rect(ctx,SE.snow?'#e8eef2':'#7fae55',x,y+24,ww,6);
  var n=nightLevel(t);if(n>0){ctx.globalAlpha=n*.75;rect(ctx,'#0b1a3a',x,y,ww,hh);ctx.globalAlpha=1;}
  rect(ctx,C.wood,x+10,y,1,hh);rect(ctx,C.wood,x,y+12,ww,1);
}
function drawClock(t){
  var d=new Date(t),m=d.getMinutes(),h=d.getHours()%12+m/60;
  rect(ctx,'#3b2a1e',128,15,9,9);rect(ctx,'#f7f5ef',129,16,7,7);
  hand(132,19,m/60*Math.PI*2-Math.PI/2,3,C.ink);hand(132,19,h/12*Math.PI*2-Math.PI/2,2,C.red);
}
function desk(x,top,w,name){rect(ctx,C.deskTop,x,top,w,3);rect(ctx,C.desk,x,top+3,w,10);rect(ctx,C.desk2,x,top+13,w,1);sign(ctx,name,x+w/2,top+4);}
function monitor(x,y){rect(ctx,C.dark,x,y,11,9);rect(ctx,'#cfeedd',x+1,y+1,9,6);rect(ctx,C.truck,x+2,y+2,5,1);
  rect(ctx,'#7d8a82',x+2,y+4,6,1);rect(ctx,'#7d8a82',x+2,y+6,4,1);rect(ctx,C.dark,x+4,y+9,3,1);}
function arms(x,y,f){rect(ctx,C.skin,x-2,f===1?y-1:y,2,1);rect(ctx,C.skin,x+5,f===0?y-1:y,2,1);}
function pile(x,base,n,col){
  var h=Math.min(n,12),i;
  for(i=0;i<h;i++)rect(ctx,i%2?C.paper2:C.paper,x+(i%3===1?1:0),base-i,8,1);
  if(n>0)rect(ctx,col,x+2,base-h,4,1);
  badge(ctx,String(n),x+4,base-h-9,col);
}
function phone(x,y){rect(ctx,C.dark,x+1,y+1,5,3);rect(ctx,C.dark,x,y,7,1);}
function drawSeat(w,t){
  if(w.mode==='seat'&&inOffice(w,t)&&!onIce(w.key)){person(ctx,w.seat[0],w.seat[1],P[w.key],{seated:true});return true;}
  rect(ctx,'#3a3f47',w.seat[0]-1,w.seat[1]+4,7,7);return false;
}
function drawWalkers(nowT,t,lower){
  A.office.filter(function(w){return w.mode!=='seat'&&inOffice(w,t)&&!onIce(w.key)&&(w.y>=110)===lower;}).sort(function(a,b){return a.y-b.y;}).forEach(function(w){
    person(ctx,w.x,w.y,P[w.key],{face:w.face,step:w.mode!=='visit'&&Math.floor(nowT/180)%2});
    if(w.ticket){var tx=w.face>0?w.x+6:w.x-3;rect(ctx,C.white,tx,w.y+4,3,4);rect(ctx,TICKET_COL[w.ticket.e.service]||'#9aa0a6',tx,w.y+5,3,1);}
    badge(ctx,w.key.toUpperCase(),w.x+2,w.y-9,C.sign);});   /* away from the desk nameplate, they carry their name */
}
function drawOffice(nowT,t,vals,news){
  var O=A.ow,tk=Math.floor(nowT/200)%2,tr=Math.floor(nowT/230)%2,tb=Math.floor(nowT/260)%2,tj=Math.floor(nowT/150)%2,ts=Math.floor(nowT/400)%2;
  drawWindow(nowT,t);drawBoard(nowT,vals,news);drawClock(t);
  var sk=drawSeat(O.kelly,t),sr=drawSeat(O.rachel,t),ss=drawSeat(O.sam,t);
  desk(12,80,39,'KELLY');desk(54,80,39,'RACHEL');desk(96,80,39,'SAM');
  if(sk)arms(26,79,tk);if(sr)arms(68,79,tr);if(ss)arms(110,79,ts);
  monitor(35,70);monitor(77,70);monitor(119,70);
  pile(14,79,M.noDriver,C.red);pile(56,79,M.emails,C.blue);
  phone(46,76);phone(88,76);phone(98,76);
  drawWalkers(nowT,t,false);
  var sb=drawSeat(O.barb,t),sj=drawSeat(O.jake,t);
  desk(12,122,39,'BARB');desk(60,122,52,'JAKE');
  if(sb)arms(26,121,tb);if(sj)arms(74,121,tj);
  monitor(35,112);monitor(84,112);monitor(96,112);
  rect(ctx,C.grey,63,120,8,2);rect(ctx,C.dark,64,116,6,4);rect(ctx,'#7fd1ff',65,117,4,2);
  pile(14,121,M.counts.quotesDue,C.amber);
  rect(ctx,C.white,47,119,3,3);
  for(var r=0;r<9;r++)for(var c=0;c<3;c++){var on=((r*3+c)*7+Math.floor(nowT/(180+c*70)))%5<2;rect(ctx,on?(c===1?'#f2c14e':'#3cc46f'):'#1d2a22',121+c*3,99+r*4,2,1);}
  drawWalkers(nowT,t,true);
  if(Math.floor(nowT/400)%2)rect(ctx,'#e8eef2',20,140,1,2);else rect(ctx,'#e8eef2',21,139,1,2);
  if(SE.lights){var cols=['#d9412b','#f2c14e','#3cc46f','#2f74c8'],sh=Math.floor(nowT/500);
    for(var lx=6;lx<142;lx+=4)rect(ctx,cols[(lx/4+sh)%4|0],lx,10,1,1);
    for(var q=0;q<8;q++)rect(ctx,cols[(q+sh)%4],67+(q*3)%6,142+q*2,1,1);}
}
function drawYard(nowT,t){
  /* every bin in the yard: ready ones in the main stack, then down the right-hand
     side the ones being prepped (amber tag) and the ones out of rotation (grey, red tag) */
  var b=M.bins,k;
  for(k=0;k<b.ready;k++)spr(ctx,BIN,binPal,153+(k%7)*13,19+Math.floor(k/7)*7,false);
  for(k=0;k<b.prep;k++){spr(ctx,BIN,binPal,250,19+k*7,false);rect(ctx,C.amber,258,20+k*7,2,2);}
  for(k=0;k<b.off;k++){var oy=19+(b.prep+k)*7;spr(ctx,BIN,offPal,250,oy,false);rect(ctx,C.red,258,oy+1,2,2);}
  /* the sign: bins in the yard out of every bin we have (Jake, 2026-11-03) */
  sign(ctx,'YARD '+(b.ready+b.prep+b.off)+'/'+b.total,207,9);
  if(!darrinOut(nowT)){person(ctx,290,44,P.shop,{arm:Math.floor(nowT/300)%2});badge(ctx,'DARRIN',292,33,C.sign);}
}
/* the wing, live: the dogs asleep on their beds, Jeff behind his desk, tomorrow's job
   count on the whiteboard (a real number), and a trophy for every team badge - gold
   once it's earned today */
function drawWing(nowT,t){
  A.roam.forEach(function(o){if(roamerShown(o)&&o.mode==='stay'&&o.place.lie)drawDog(o.key,o.x,o.y,o.face,false,nowT,true);});
  var jeff=A.roam[0],sat=roamerShown(jeff)&&jeff.mode==='stay'&&jeff.place.seated;
  if(sat)person(ctx,JEFF_SEAT[0],JEFF_SEAT[1],P.jeff,{seated:true,santa:SE.lights});
  rect(ctx,C.deskTop,-54,38,24,3);rect(ctx,C.desk,-54,41,24,9);rect(ctx,C.desk2,-54,50,24,1);
  if(sat)arms(JEFF_SEAT[0],37,Math.floor(nowT/400)%2);
  monitor(-38,29);rect(ctx,'#3b2416',-50,36,3,2);rect(ctx,C.white,-50,35,3,1);
  var n=nightLevel(t);if(n>0){ctx.globalAlpha=n*.75;rect(ctx,'#0b1a3a',-64,13,14,4);ctx.globalAlpha=1;}
  text(ctx,'TMRW',-65,123,C.blue);text(ctx,String(M.counts.tomorrow),-65,128,C.red);
  BADGE_DEFS.forEach(function(b,i){var at=M.earned[b.id],got=at!=null&&at<=t,x=-41+(i%4)*6,y=i<4?125:131,
      c=got?C.gold:'#4a4f57',c2=got?C.light:'#5b6270';
    rect(ctx,c,x,y,4,2);rect(ctx,c2,x,y,1,1);rect(ctx,c,x+1,y+2,2,1);rect(ctx,c,x,y+3,4,1);});
}
/* Jeff, Josh and the dogs, wherever they are, in front-to-back order. Josh is only
   about while his pickup is in the yard (it is on the GPS feed); out on the road he is
   in its cab. Seated and lying ones in the wing are drawn by drawWing, behind the desk. */
function roamerShown(o){return!(o.key==='josh'&&M.joshOut)&&!onIce(o.key);}
function drawRoamers(nowT){
  A.roam.filter(function(o){return roamerShown(o)&&!(o.mode==='stay'&&o.place&&(o.place.seated||o.place.lie));})
    .sort(function(a,c){return a.y-c.y;}).forEach(function(o){
      if(o.dog){var d=DOGS[o.key];drawDog(o.key,o.x,o.y+5,o.face,o.moving,nowT,false);badge(ctx,o.key.toUpperCase(),o.x+d.w/2,o.y+3-d.h,C.sign);return;}
      person(ctx,o.x,o.y,o.look,{face:o.face,step:o.moving&&Math.floor(nowT/180)%2,santa:SE.lights&&o.key==='jeff'});
      badge(ctx,o.key.toUpperCase(),o.x+2,o.y-(o.key==='josh'?14:9),C.sign);});
}
/* the dogs (Jake, 2026-11-03), each facing right unless face<0:
   Sawyer - big brown German shepherd / husky / golden mix: shepherd saddle, husky ears
     and curled tail, golden feathering
   Vincent - medium white labradoodle: curly white coat, floppy ears, pom tail
   Winnie - small Australian doodle, brown (Jake, 2026-11-03): darker brown patches, white chest */
var DOGS={sawyer:{w:14,h:9},vincent:{w:12,h:8},winnie:{w:9,h:6}};
function drawDog(key,x,y,face,moving,nowT,lying){
  x=Math.round(x);y=Math.round(y);var flip=face<0,D=DOGS[key],ly=lying?2:0;
  function r(x0,y0,w,h,c){rect(ctx,c,flip?x+D.w-x0-w:x+x0,y+y0+ly,w,h);}
  var run=moving?Math.floor(nowT/110)%2:2,wag=moving&&Math.floor(nowT/90)%2?1:0;
  ctx.globalAlpha=.3;r(1,D.h-ly,D.w-3,1,C.ink);ctx.globalAlpha=1;
  /* legs: stretched, then tucked - a gallop; standing still, square; lying, tucked away */
  function legs(y0,xs,c){if(lying)return;var a=xs[0],b=xs[1],f1=xs[2],f2=xs[3];
    if(run===0){r(a-2,y0,1,2,c);r(b-2,y0,1,2,c);r(f1+2,y0,1,2,c);r(f2+2,y0-1,1,2,c);}
    else if(run===1){r(a+1,y0,1,2,c);r(b,y0,1,1,c);r(f1-1,y0,1,2,c);r(f2-1,y0,1,1,c);}
    else{r(a,y0,1,2,c);r(b,y0,1,2,c);r(f1,y0,1,2,c);r(f2,y0,1,2,c);}}
  if(key==='sawyer'){var coat='#a8713f',saddle='#4a3426',light='#e0b77e';
    r(0,1-wag,2,2,'#c8904f');r(1,3,2,1,'#c8904f');r(0,1-wag,1,1,light);
    r(2,3,8,4,coat);r(3,3,6,2,saddle);r(3,6,6,1,light);
    r(9,1,3,4,coat);r(9,0,1,1,saddle);r(11,0,1,1,saddle);r(10,3,2,2,light);r(12,2,2,2,light);r(13,2,1,1,C.ink);r(11,2,1,1,C.ink);
    r(9,4,2,3,light);legs(7,[3,5,8,10],'#7a5230');}
  else if(key==='vincent'){var fur='#f4f1ea',curl='#d9d2c2';
    r(0,1-wag,2,2,fur);r(1,3,1,1,curl);
    r(2,2,8,4,fur);r(3,2,1,1,curl);r(6,3,1,1,curl);r(8,2,1,1,curl);r(4,5,1,1,curl);r(7,5,1,1,curl);
    r(8,0,4,4,fur);r(11,2,2,2,fur);r(8,1,1,3,curl);r(9,1,1,1,curl);r(10,1,1,1,C.ink);r(12,2,1,1,C.ink);
    legs(6,[3,5,7,9],'#e6dfd0');}
  else{var brown='#8a5a3c',patch='#5a3a24',white='#f2f0e8',tan='#c8904f';
    r(0,2-wag,1,1,brown);
    r(1,2,6,3,brown);r(2,2,2,1,patch);r(5,3,1,1,patch);r(3,3,1,1,patch);r(2,4,4,1,white);
    r(6,0,3,3,brown);r(6,0,1,2,patch);r(7,2,2,1,white);r(7,1,1,1,C.ink);r(8,2,1,1,tan);r(8,1,1,1,C.ink);
    legs(5,[2,3,5,6],patch);}
}
/* whether the hook is carrying a bin, read off the stops: on the way to a drop-off,
   or on the way out of a pick-up - the only times a bin has to be on the truck */
function carrying(st,t){
  if(st.mode==='drive')return!!((st.to&&st.to.kind==='drop')||(st.from&&st.from.kind==='pick'));
  if(st.mode==='stop'&&st.stop)return st.stop.kind==='drop'?!stopDone(st.stop,t):st.stop.kind==='pick'&&stopDone(st.stop,t);
  if(st.mode==='road')return!!(st.near&&st.near.kind==='pick');
  return false;
}
function drawTruck(T,pos,t,nowT){
  var x=Math.round(pos.x),y=Math.round(pos.y),flip=pos.face<0,st=pos.st,atStop=st.mode==='stop',hook=T.kind==='truck',carry=hook&&carrying(st,t);
  ctx.globalAlpha=.3;rect(ctx,C.ink,x+2,y+TRUCK_H,TRUCK_W-4,1);ctx.globalAlpha=1;
  if(hook){
    spr(ctx,TRUCK,{O:C.out,W:C.glass,G:C.truck,g:C.truck2,d:'#1f5e2c',S:T.color,Y:C.light,K:C.tire,k:C.rim},x,y,flip);
    if(pos.moving&&Math.floor(nowT/120)%2)[5,15,25].forEach(function(c){rect(ctx,C.tire,flip?x+TRUCK_W-1-c:x+c,y+10,1,1);});
  }else drawSmallVehicle(T.kind,x,y,flip,T.color);
  if(SE.snow)rect(ctx,C.snow,flip?x+3:x+(hook?19:15),y+(hook?0:2),6,1);
  if(carry)spr(ctx,BIGBIN,binPal,flip?x+12:x+1,y-2,false);
  /* the driver sits in the cab, except out at a stop or parked up in the yard */
  if(!atStop&&st.mode!=='yard'){var cx0=hook?20:T.kind==='van'?18:19,cy0=hook?1:3,hx=flip?x+TRUCK_W-cx0-3:x+cx0;
    rect(ctx,T.color,hx,y+cy0,3,1);rect(ctx,C.skin,hx,y+cy0+1,3,1);rect(ctx,C.ink,flip?hx:hx+2,y+cy0+1,1,1);
    if(T.driver==='Josh'){rect(ctx,'#6b3fa0',hx-1,y+cy0,5,1);rect(ctx,'#6b3fa0',hx,y+cy0-1,3,1);rect(ctx,C.gold,hx,y+cy0,3,1);}}   /* the hat shows through the window */
  if(pos.moving&&Math.random()<.18)parts.push({x:flip?x+TRUCK_W:x-1,y:y+7,vx:(flip?1:-1)*5,vy:-3,life:.9,c:'#a8adb4'});
  /* who it is, in their colour */
  var lbl=T.label,bw=tw(lbl)+4,tx=Math.round(x+TRUCK_W/2-bw/2),ty=y-(carry?13:9);
  rect(ctx,T.color,tx,ty,bw,7);text(ctx,lbl,tx+2,ty+1,T.ink);rect(ctx,T.color,tx+Math.floor(bw/2),ty+7,1,1);
  if(atStop)person(ctx,x+TRUCK_W+1,y-1,{hair:'#5a4030',cap:T.color,shirt:C.staff,pants:'#3a3f47'},{face:-1,arm:Math.floor(nowT/300)%2});
}
/* bins out in a town at time t: what is out now, wound back through today's drop-offs
   and pick-ups still to happen at t - so the replay moves the bins with the trucks */
function binsAtTown(T,t){
  var n=T.out;
  T.stops.forEach(function(st){if(st.doneAt!=null&&st.doneAt>t){if(st.kind==='drop')n--;else if(st.kind==='pick')n++;}});
  return Math.max(0,n);
}
/* bin sizes to try, biggest first, so every bin a town has fits its block */
var TOWN_BINS=[{w:5,h:3,px:6,py:4},{w:3,h:2,px:4,py:3},{w:2,h:2,px:3,py:3}];
function drawTowns(nowT,t,replaying){
  M.towns.forEach(function(T){
    var B=T.block,n=binsAtTown(T,t),ax=B.binX,aw=B.x+B.w-3-ax,ay=B.top+11,ah=BLOCK_H-22,k,sz=TOWN_BINS[TOWN_BINS.length-1];
    /* the sign: the town's name, and its bins out in green */
    var cnt=String(n),cw=tw(cnt)+4,nm=T.name.toUpperCase(),room=Math.floor((B.w-cw-9)/4);
    if(nm.length>room)nm=nm.slice(0,room);
    var sw=tw(nm)+6;rect(ctx,C.sign,B.x+1,B.top,sw,9);text(ctx,nm,B.x+4,B.top+2,C.signText);
    badge(ctx,cnt,B.x+B.w-2-cw/2,B.top+1,n?'#15803d':'#6b727e');
    /* a bright green bin for every bin out there */
    for(k=0;k<TOWN_BINS.length;k++){var s0=TOWN_BINS[k];if(Math.floor(aw/s0.px)*Math.floor(ah/s0.py)>=n){sz=s0;break;}}
    var cols=Math.max(1,Math.floor(aw/sz.px));
    for(k=0;k<n;k++){var bx=ax+(k%cols)*sz.px,by=ay+Math.floor(k/cols)*sz.py;rect(ctx,C.bin,bx,by,sz.w,sz.h-1);rect(ctx,C.bin2,bx,by+sz.h-1,sz.w,1);}
    /* today's stops: green done, white to do, red a bin stop with no driver */
    var per=Math.max(1,Math.floor((B.w-4)/4));
    T.stops.forEach(function(st,j){
      var done=stopDone(st,t),c=done?'#16a34a':((st.kind==='drop'||st.kind==='pick')&&!st.hasDriver?C.red:'#f2f0e6');
      var sx=B.x+3+(j%per)*4,sy=B.top+BLOCK_H-11+Math.floor(j/per)*4;rect(ctx,C.ink,sx,sy+1,3,3);rect(ctx,c,sx,sy,3,3);});
    /* someone steps out and waves when a stop in their town is done */
    if(T.stops.some(function(st){return st.doneAt!=null&&t>=st.doneAt&&t<st.doneAt+(replaying?25*MIN:10*MIN);}))
      person(ctx,B.x+B.houses*14-4,B.top+12,CUSTOMERS[T.i%CUSTOMERS.length],{face:1,wave:true,arm:Math.floor(nowT/200)%2});
  });
  if(SE.lights){var cols2=['#d9412b','#f2c14e','#3cc46f','#2f74c8'],sh=Math.floor(nowT/450);
    M.towns.forEach(function(T,q){for(var h=0;h<T.block.houses;h++)for(var i2=0;i2<10;i2+=3)rect(ctx,cols2[(i2/3+sh+q+h)%4|0],T.block.x+3+h*14+i2,T.block.top+16,1,1);});}
}
function drawJWG(nowT,t){
  var top=PARK_TOP,amb=A.t,f;
  if(SE.park==='mow'){
    var hr=new Date(t).getHours()+new Date(t).getMinutes()/60,p=clamp((hr-9)/6,0,1),N=5,rows=Math.floor(p*N),frac=p*N-rows,x0=400,x1=480;
    for(var r=0;r<N;r++){if(r<rows||(r===rows&&frac>0)){var len=r<rows?80:Math.round(frac*80),rx=r%2===0?x0:x1-len;rect(ctx,r%2?SE.grass2:SE.grass3,rx,top+r*4,len,4);}}
    var cr=Math.min(rows,N-1),cx=p>=1?x1:(cr%2===0?x0+frac*80:x1-frac*80),cy=top+cr*4-6;
    rect(ctx,'#e8590c',cx-4,cy+8,9,4);rect(ctx,C.tire,cx-4,cy+12,2,2);rect(ctx,C.tire,cx+3,cy+12,2,2);
    person(ctx,cx-2,cy,P.jwg1,{face:cr%2===0?1:-1,seated:true});
  }
  if(SE.bed){
    var grown=SE.bed==='plant'?Math.floor(clamp((new Date(t).getHours()-8)/7,0,1)*24):24;
    for(f=0;f<grown;f++){var fx=11+(f%8)*6,fy=top+2+Math.floor(f/8)*7;rect(ctx,'#3f7a2e',fx,fy+1,1,2);rect(ctx,['#f4b6c8','#ffe28a','#ffffff','#c4482b'][f%4],fx-1,fy,3,1);}
    var mx=10+((Math.floor(amb/2))%40);if(Math.floor(amb/80)%2===0)mx=50-((Math.floor(amb/2))%40);
    person(ctx,mx,top+4,P.jwg2,{face:Math.floor(amb/80)%2?1:-1,step:Math.floor(nowT/200)%2,can:SE.bed==='water'});
  }
  if(SE.park==='rake'){
    var piles=Math.floor(clamp((new Date(t).getHours()-9)/6,0,1)*5);
    for(f=0;f<5;f++){var px=408+f*15,big=f<piles?1:0;rect(ctx,SE.leaves[f%4],px,top+17-big,6+big*2,2+big);rect(ctx,SE.leaves[(f+1)%4],px+2,top+16-big,3,1);}
    var rx2=405+(Math.floor(amb)%70);if(Math.floor(amb/70)%2)rx2=475-(Math.floor(amb)%70);
    person(ctx,rx2,top+2,P.jwg2,{face:Math.floor(amb/70)%2?-1:1,step:Math.floor(nowT/220)%2,rake:true});
  }
  if(weatherNow()==='snow'){
    var span=560,pos=(amb*18)%span,dir=Math.floor(amb*18/span)%2,px2=dir?W+80-pos:pos-80,flip=!!dir;
    spr(ctx,TRUCK,{O:C.out,W:C.glass,G:'#e8590c',g:'#b8440a',S:'#ffe28a',Y:C.light,K:C.tire,k:C.rim},px2,ROADY,flip);
    rect(ctx,'#9aa0a6',flip?px2-3:px2+20,ROADY+4,3,6);
    if(Math.floor(nowT/250)%2)rect(ctx,C.amber,flip?px2+4:px2+15,ROADY-1,2,1);
    if(Math.random()<.5)parts.push({x:flip?px2-3:px2+23,y:ROADY+5,vx:(flip?-1:1)*(8+Math.random()*10),vy:-(6+Math.random()*8),life:.8,c:C.white});
  }
  if(SE.spooky){
    for(var b=0;b<3;b++){var bx=(nowT/40*(1+b*.3)+b*140)%(W+40)-20,by=12+b*12+Math.sin(nowT/300+b)*4,up=Math.floor(nowT/120+b)%2;
      rect(ctx,'#2b1d3a',bx,by,2,2);rect(ctx,'#2b1d3a',bx-3,by-up,3,1);rect(ctx,'#2b1d3a',bx+2,by-up,3,1);}
  }
  if(SE.snow&&M.towns.length&&Math.random()<.08){var B=M.towns[Math.floor(Math.random()*M.towns.length)].block;parts.push({x:B.x+8,y:B.top+11,vx:3+Math.random()*3,vy:-(4+Math.random()*3),life:1.6,c:'#c9ced4'});}
}
/* ---------- the light through the day (Jake, 2026-11-03): golden hour 3-4 pm, sunset at
   4, dark by 5, every day of the year. Only outdoors - the office and the shop keep
   their lights on - and after dark the house windows, street lamps and headlights glow. */
var INDOOR=[[DX-69,11,209,162],[DX+273,25,51,148],[BOARD_X,4,W-4-BOARD_X,BOARD_H]];   /* office, shop, and the who's-out board stays readable */
function minuteOf(t){var d=new Date(t);return d.getHours()*60+d.getMinutes();}
function nightLevel(t){return clamp((minuteOf(t)-16*60-10)/50,0,1);}
function outdoors(col,a){if(a<=0)return;
  ctx.globalAlpha=a;ctx.fillStyle=col;ctx.beginPath();ctx.rect(0,0,W,H);
  INDOOR.forEach(function(r){ctx.rect(r[0],r[1],r[2],r[3]);});ctx.fill('evenodd');ctx.globalAlpha=1;}
function drawTint(t){
  var m=minuteOf(t);
  if(weatherNow()==='rain')outdoors('#34495e',.12);
  if(m<8*60)outdoors('#3d5aff',clamp((8*60-m)/30*.12,0,.2));
  outdoors('#ffb347',m<15*60?0:m<16*60?(m-15*60)/60*.2:.2-(m-16*60)/30*.2);   /* golden hour, fading at sunset */
  if(m>=16*60&&m<16*60+40)outdoors('#ff5a5f',.12*Math.sin((m-16*60)/40*Math.PI));   /* the sunset itself */
  if(SE.spooky&&m>15*60)outdoors('#4b2a86',Math.min(.26,(m-15*60)/120*.26));
  outdoors('#0b1a3a',nightLevel(t)*.45);   /* dark, but the bins and stops in town still read */
}
function drawLights(t,placed){
  var n=nightLevel(t);if(n<=0)return;
  ctx.globalAlpha=n;
  M.towns.forEach(function(T){T.block.wins.forEach(function(w){rect(ctx,C.light,w[0],w[1],w[2],w[3]);});});
  [40,110,170,250,300,390,460,540,620].forEach(function(lx){rect(ctx,C.light,lx-1,RT-10,3,1);
    ctx.globalAlpha=n*.3;for(var k=0;k<8;k++)rect(ctx,C.light,lx-1-k*.5,RT-9+k,3+k,1);ctx.globalAlpha=n;});
  placed.forEach(function(o){var p=o.pos;if(!p.moving)return;var fx=p.face>0?p.x+TRUCK_W:p.x-1,y=p.y+6;
    rect(ctx,C.light,fx,y,1,2);ctx.globalAlpha=n*.4;for(var k=1;k<7;k++)rect(ctx,C.light,p.face>0?fx+k:fx-k-1,y-Math.floor(k/3),1,2+Math.floor(k/3)*2);ctx.globalAlpha=n;});
  ctx.globalAlpha=1;
}
function draw(nowT){
  var tt=sceneTime(nowT),t=tt.t;
  /* events the replay has reached since the last frame: stamps, flips and badges */
  var reached=-1;for(var i=0;i<M.events.length;i++)if(M.events[i].t<=t)reached=i;
  if(reached>lastEv){
    for(var k=lastEv+1;k<=reached;k++){var e=M.events[k];
      if(!tt.replaying&&k<reached)continue;
      if(e.kind==='done'&&e.stop){var SB=e.stop.townObj.block;stamp(SB.x+SB.w/2,SB.top-2,'DONE',C.red,nowT);}
      if(e.kind==='new')flashUntil=nowT+1200;
      if(e.kind==='badge'&&nowT-showAt<=REPLAY_MS+500){banner={name:e.badge.name,icon:e.badge.icon,born:nowT};burstConfetti();}}
    lastEv=reached;}
  var entered=0;M.entered.forEach(function(e){if(e.t<=t)entered++;});
  var vals={entered:entered,tomorrow:M.counts.tomorrow,week:M.counts.week,quotesWeek:M.counts.quotesWeek,quotesDue:M.counts.quotesDue,binsOut:M.counts.binsOut,flash:flashUntil};
  var news=null;
  if(reached>=0){
    if(tt.replaying)news=M.events[reached].flap;
    else{var recent=M.events.slice(Math.max(0,reached-4),reached+1),n=Math.floor((nowT-showAt-REPLAY_MS)/4000);news=recent[recent.length-1-((n%recent.length)+recent.length)%recent.length].flap;}
  }
  if(bookNews&&nowT<bookNews.until)news=bookNews.flap;   /* a booking just pinned takes the news line */
  var joshTruck=M.trucks.filter(function(T){return T.driver==='Josh';})[0];
  M.joshOut=!!joshTruck&&truckAt(joshTruck,t).mode!=='yard';
  runBookings(nowT);
  var shake=surShake(nowT);ctx.save();if(shake)ctx.translate(Math.random()<.5?-1:1,1);
  ctx.drawImage(bgc,0,0);
  ctx.save();ctx.translate(DX,0);
  drawOffice(nowT,t,vals,news);drawBooking(nowT,t);drawWing(nowT,t);drawYard(nowT,t);drawRoamers(nowT);drawDumpBits(nowT);
  ctx.restore();
  drawWhoBoard(t);
  drawJWG(nowT,t);drawPond(nowT);drawTowns(nowT,t,tt.replaying);
  var placed=M.trucks.map(function(T,idx){return{T:T,pos:placeTruck(T,t,idx,nowT)};}).sort(function(a,b){return a.pos.y-b.pos.y;});
  placed.forEach(function(o){drawTruck(o.T,o.pos,t,nowT);});
  drawSurprise(nowT);
  drawWeather(nowT);drawStamps(nowT);drawTint(t);drawLights(t,placed);drawBanner(nowT);
  ctx.restore();
  return tt;
}

/* ---------- the right-hand block, in the world itself: the "who's out" board (every
   vehicle's colour, name in big letters, what it is doing, stops done) and the badge wall ---------- */
function boardStatus(T,t){
  var s=truckAt(T,t);
  function town(st){return st&&st.town?String(st.town).toUpperCase():'';}
  if(s.mode==='stop')return'AT '+(town(s.stop)||'A STOP');
  if(s.mode==='drive')return s.to==='yard'?'BACK TO BASE':'TO '+(town(s.to)||'A STOP');
  if(s.mode==='yard')return T.kind==='truck'?'IN THE YARD':'PARKED';
  return'ON THE ROAD';
}
function stopsDoneBy(T,t){return T.visits.filter(function(v){return v.tout!=null&&v.tout<=t;}).length;}
function boardFrame(x0,y0,w,h,title){
  rect(ctx,'#6b4a32',x0,y0,w,h);rect(ctx,'#15181c',x0+2,y0+2,w-4,h-4);
  rect(ctx,'#6b4a32',x0+10,y0+h,2,LOT_Y-y0-h-9);rect(ctx,'#6b4a32',x0+w-12,y0+h,2,LOT_Y-y0-h-9);
  text(ctx,title,x0+6,y0+5,'#f2c14e');rect(ctx,'#3a3f47',x0+4,y0+12,w-8,1);
}
/* every vehicle on one row each: colour, name big, what it's doing, stops done -
   ten rows fit, which is the whole fleet on the map */
function drawWhoBoard(t){
  var x0=BOARD_X,y0=4,w=156,h=BOARD_H;
  boardFrame(x0,y0,w,h,"WHO'S OUT");text(ctx,'STOPS',x0+w-25,y0+5,'#8a8f98');
  if(!M.trucks.length){text(ctx,'NO TRUCKS REPORTING',x0+6,y0+20,'#cfc6a6');return;}
  M.trucks.slice(0,Math.floor((h-18)/11)).forEach(function(T,i){
    var ry=y0+16+i*11,n=String(stopsDoneBy(T,t));
    rect(ctx,T.color,x0+5,ry,5,10);
    text2(ctx,T.label.slice(0,7),x0+13,ry,'#f2f0e6');
    text(ctx,boardStatus(T,t).slice(0,13),x0+72,ry+3,'#cfc6a6');
    text2(ctx,n,x0+w-5-n.length*8,ry,'#3cc46f');
  });
}
function badgeCount(){return BADGE_DEFS.filter(function(b){return M.earned[b.id]!=null;}).length;}

function frame(nowT){
  var dtR=Math.min(.1,Math.max(0,(nowT-lastFrame)/1000));lastFrame=nowT;
  stepAmbient(dtR*AMBIENT_MIN_PER_SEC);updWeather(dtR);updScenery(dtR);
  draw(nowT);
  raf=requestAnimationFrame(frame);
}

window.JJHQ={
  /* opts: {canvas} - the board's own canvas; everything else is drawn in the world */
  mount:function(opts){
    if(!opts||!opts.canvas)throw new Error('JJHQ.mount needs a canvas');
    cv=opts.canvas;ctx=cv.getContext('2d');
    bgc=document.createElement('canvas');bgc.width=W;bgc.height=H;bgx=bgc.getContext('2d');
    newAmbient();newScenery();
  },
  /* snap: the board's data for this showing (built in office-tv.html hqSnapshot) */
  show:function(snap){
    if(!cv)throw new Error('JJHQ.show before JJHQ.mount');
    SE=SEASONS[seasonFor(new Date(snap.now))];WX=wxKind(snap.wx);
    M=buildModel(snap);
    M.frozen=pondFrozen(new Date(snap.now));M.hockeyCrew=M.frozen&&Math.random()<.2;M.joshOut=false;
    /* the yard crew walk below however many bins are stacked today */
    var ytop=clamp(19+Math.ceil(M.bins.ready/7)*7+2,84,118);
    A.yardR=[176,232,ytop,118];A.dogYard=[158,236,ytop,124];
    drawBG();resetWeather();
    stamps=[];parts=[];conf=[];banner=null;boardReady=false;flaps={};tick={msg:'',pages:[''],page:0,pageAt:0};lastEv=-1;flashUntil=0;
    bookNews=null;bellUntil=0;printUntil=0;queueBookings();
    cancelAnimationFrame(raf);
    showAt=lastFrame=performance.now();
    /* today's surprise plays on this showing if it's due within the last 10 minutes, once the replay is done */
    var sp=surpriseFor(snap.dayStart);SUR=snap.now>=sp.at&&snap.now<sp.at+10*MIN?{kind:sp.kind,start:showAt+REPLAY_MS+1500}:null;
    /* a hidden tab gets no animation frames - draw the end state once so the screen is never blank */
    if(document.hidden){showAt-=REPLAY_MS;draw(showAt+REPLAY_MS);return;}
    raf=requestAnimationFrame(frame);
  },
  hide:function(){cancelAnimationFrame(raf);raf=0;},
  /* play one surprise now, whatever the time (for the preview page) */
  surprise:function(kind){if(!SUR_LEN[kind])throw new Error('JJHQ.surprise: no surprise called '+kind);SUR={kind:kind,start:performance.now()};},
  badgeCount:function(){return M?badgeCount():0;}
};
})();
