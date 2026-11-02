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
var W=400,H=312,RT=178,ROADY=RT+5,YARD_Y=150,SPEED=14;
/* below the main road (Jake, 2026-11-02: "all info on the board", no "+N more"):
   row A of today's stops, a lane, row B, every bin out on rental, then the park */
var ROWA=198,LANE_TOP=217,LANEY=LANE_TOP+2,ROWB=232,OUT_TOP=252,PARK_TOP=290,CX=3,LOTS_X=28;
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
var P={
  kelly:{hair:'#3b2416',long:true,shirt:C.staff},
  rachel:{hair:'#c4703a',long:true,shirt:C.staff},
  sam:{hair:'#2b2b2b',shirt:'#3a5168',pants:'#2b2f36'},
  barb:{hair:'#d8cfc0',shirt:C.staff},
  jake:{hair:'#5a4030',shirt:'#2b2f36'},
  shop:{hair:'#2b2b2b',shirt:'#56606e',pants:'#3a3f47'},
  yard1:{hair:'#5a4030',cap:'#1f7a33',shirt:C.staff,pants:'#3a3f47',coffee:true},
  yard2:{hair:'#3b2416',cap:'#2b2f36',shirt:C.staff,pants:'#3a3f47',clip:true},
  jwg1:{hair:'#6b4a32',cap:'#e8590c',shirt:'#e8590c',pants:'#3a3f47'},
  jwg2:{hair:'#8a5a3c',long:true,shirt:'#6b8e23',pants:'#4f3a2e'}};
var CUSTOMERS=[{hair:'#3b2416',shirt:'#c4482b'},{hair:'#d8b46a',shirt:'#5f7f9e'},{hair:'#2b2b2b',shirt:'#e3b13a'},{hair:'#8a5a3c',shirt:'#8b5cf6'},
  {hair:'#c9c2b8',shirt:'#3f8f8f'},{hair:'#5a4030',shirt:'#d6336c'},{hair:'#2b2b2b',shirt:'#6b8e23'},{hair:'#a07a52',shirt:'#4f6d8a'}];
/* office walkways: aisle between the desk rows (y 96), the gap between Barb's and Jake's desks (x 54), the floor at the bottom (y 134) */
var AISLE=96,FLOOR=134,GAPX=54;
var OFFICE=[
  {key:'kelly',seat:[26,69],home:[30,AISLE],left:40},
  {key:'rachel',seat:[68,69],home:[72,AISLE],left:15},
  {key:'sam',seat:[110,69],home:[114,AISLE],left:22},
  {key:'barb',seat:[26,111],home:[30,FLOOR],left:55},
  {key:'jake',seat:[74,111],home:[80,FLOOR],left:32}];
var PLACES=[{p:[38,FLOOR]},{p:[46,FLOOR]},{p:[86,AISLE],not:'jake'},{p:[33,AISLE],not:'kelly'},
  {p:[75,AISLE],not:'rachel'},{p:[108,AISLE],not:'sam'},{p:[22,FLOOR],not:'barb'}];

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
function person(g,x,y,p,f){f=f||{};x=Math.round(x);y=Math.round(y);var face=f.face||1;
  if(p.long)rect(g,p.hair,x-1,y,7,8);
  rect(g,C.skin,x,y+1,5,4);
  rect(g,p.hair,x,y,5,2);
  if(!p.long){rect(g,p.hair,x,y+2,1,1);rect(g,p.hair,x+4,y+2,1,1);}
  rect(g,C.ink,x+1,y+3,1,1);rect(g,C.ink,x+3,y+3,1,1);
  var cap=f.cap||p.cap;
  if(f.santa){rect(g,C.red,x,y-2,5,3);rect(g,C.red,face>0?x+4:x-1,y-3,2,1);rect(g,C.white,face>0?x+5:x-2,y-3,1,1);rect(g,C.white,x-1,y,7,1);}
  else if(cap){rect(g,cap,x,y-1,5,2);rect(g,cap,face>0?x+4:x-2,y,3,1);}
  rect(g,p.shirt,x-1,y+5,7,f.seated?6:4);
  if(f.seated)return;
  rect(g,C.skin,x-2,y+6,1,2);
  if(f.wave)rect(g,C.skin,x+6,y+(f.arm?1:2),1,4);else rect(g,C.skin,x+6,y+6-(f.arm?2:0),1,2);
  var s=f.step?1:0,pants=p.pants||'#3a3f47';
  rect(g,pants,x,y+9,2,3-s);rect(g,pants,x+3,y+9,2,2+s);
  rect(g,C.ink,x,y+12-s,2,1);rect(g,C.ink,x+3,y+11+s,2,1);
  if(p.coffee){var cx=face>0?x+7:x-4;rect(g,C.white,cx,y+6,2,2);rect(g,C.wood,cx,y+6,2,1);}
  if(p.clip){var kx=face>0?x+6:x-4;rect(g,'#8a6440',kx,y+5,3,4);rect(g,C.white,kx,y+6,3,2);}
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
var HSTYLE=[{roof:'#a8483a',roof2:'#7f352a',wall:'#e6c39a'},{roof:'#4f6d8a',roof2:'#3a5168',wall:'#d4dde4'},{roof:'#6b5040',roof2:'#4f3a2e',wall:'#e9d6b0'}];
var TREES=[76,104,132,160,188,216,236,344,372];
var MINIBIN=[
"OOOOOOO",
"OBBBBBO",
".OBBBO.",
"..OOO.."];
/* a small house that fits a lot of any width */
function drawMiniHouse(g,x,y,w,s){
  var rh=Math.min(6,Math.ceil(w/2)-1);
  for(var r=0;r<rh;r++){var inset=Math.round((rh-1-r)*(w/2-1)/rh);rect(g,SE.snow&&r<2?C.snow:s.roof,x+inset,y+r,w-2*inset,1);}
  rect(g,s.wall,x+1,y+rh,w-2,14-rh);rect(g,s.roof2,x+1,y+13,w-2,1);
  rect(g,C.wood,x+Math.floor(w/2)-1,y+rh+3,2,14-rh-4);
  if(w>=14){rect(g,C.sky,x+3,y+rh+2,2,2);rect(g,C.sky,x+w-5,y+rh+2,2,2);}
}
function drawLot(g,st){
  var L=st.lot;
  drawMiniHouse(g,L.x+1,L.top+1,L.hw,HSTYLE[st.i%3]);
  /* a front path, a picket fence along the lot and a post between neighbours */
  rect(g,'#cfcabd',L.x+Math.floor(L.hw/2),L.top+15,2,2);
  for(var px=L.x;px<L.x+L.w-1;px+=2)rect(g,SE.snow?'#c9ced4':'#efe9dc',px,L.top+17,1,1);
  rect(g,SE.snow?'#c9ced4':'#efe9dc',L.x,L.top+16,L.w-1,1);rect(g,C.wood,L.x+L.w-1,L.top+12,1,6);
  if(SE.flowers)for(var f=0;f<L.hw-2;f+=3)rect(g,['#f4b6c8','#ffe28a','#ffffff','#c4482b'][f%4],L.x+2+f,L.top+15,1,1);
  if(SE.pumpkins&&L.w-L.hw>5){rect(g,'#e8590c',L.x+L.hw+1,L.top+12,3,2);rect(g,'#2f6a3a',L.x+L.hw+2,L.top+11,1,1);}
  if(SE.leafPiles)for(var q=0;q<5;q++)rect(g,SE.leaves[q%4],L.x+2+q*2,L.top+16,2,1);
}
/* every bin out on rental, as a field of little bins with the count beside it */
function drawOutBins(g,n){
  sign(g,'OUT ON RENTAL',36,OUT_TOP+3);badge(g,String(n),36,OUT_TOP+15,C.bin);
  for(var k=0;k<n;k++)spr(g,MINIBIN,binPal,70+(k%36)*9,OUT_TOP+2+Math.floor(k/36)*7,false);
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
  [64,198].forEach(function(cx){for(var k=0;k<5;k++)rect(g,'#f2f0e8',cx+k*4,RT+3,2,13);});   /* office door, yard gate */
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
  [40,110,170,250,300,390].forEach(function(lx){rect(g,'#3a3f47',lx,RT-10,1,9);rect(g,'#3a3f47',lx-1,RT-11,3,1);rect(g,C.light,lx-1,RT-10,3,1);});
}

/* ---------- static background: drawn once per showing ---------- */
var bgc=null,bgx=null;
function drawBG(){
  var g=bgx,r2=mulberry32(7),i,x,y;
  var gr=SE.snow?[C.snow,C.snow2,C.white]:[SE.grass,SE.grass2,SE.grass3];
  rect(g,gr[0],0,0,W,H);
  for(i=0;i<1400;i++){x=r2()*W|0;y=r2()*H|0;rect(g,r2()<.5?gr[1]:gr[2],x,y,1,1);}
  drawRoads(g,r2);
  /* office shell: 4..142 x 8..176 */
  rect(g,C.brick,4,8,139,169);
  for(y=8;y<177;y++)for(x=4;x<143;x++){if(x>=7&&x<140&&y>=11&&y<173)continue;var row=Math.floor((y-8)/3);
    if((y-8)%3===2||(x+(row%2?3:0))%6===5)rect(g,C.brick2,x,y,1,1);}
  if(SE.snow)rect(g,C.snow,4,8,139,2);
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
  rect(g,'#9a6644',86,146,42,3);rect(g,C.desk,86,149,42,8);rect(g,C.desk2,86,157,42,1);
  for(x=90;x<128;x+=8)rect(g,C.desk2,x,150,1,6);
  rect(g,C.gold2,121,144,3,2);rect(g,C.gold,122,143,1,1);
  rect(g,'#8c3f2e',60,161,24,9);rect(g,'#a8503c',62,163,20,5);
  if(SE.lights){for(i=0;i<12;i++){var w2=1+Math.floor(i*.7);rect(g,'#2f6a3a',135-Math.floor(w2/2),142+i*2,w2+1,2);}
    rect(g,C.wood,134,166,2,4);rect(g,C.gold,134,140,2,2);}
  else{rect(g,'#b86b45',132,162,7,7);rect(g,'#4f8f3a',130,153,11,9);rect(g,'#6aa84f',132,151,6,3);}
  sign(g,"JEFF'S JUNK",73,1);
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
  sign(g,'YARD',207,9);
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
  drawStreetBits(g);
  /* a lot for every stop today, row A along the road and row B along the lane */
  M.stops.forEach(function(st){drawLot(g,st);});
  if(!M.stops.length)sign(g,'NO STOPS TODAY',W/2,ROWA+4);
  /* every bin out on rental */
  rect(g,SE.snow?C.snow2:SE.grass2,0,OUT_TOP-2,W,1);rect(g,SE.snow?C.snow2:SE.grass2,0,PARK_TOP-2,W,1);
  drawOutBins(g,M.counts.binsOut);
  /* the park: trees, a flower bed and a lawn the JWG crew look after */
  TREES.forEach(function(tx){tree(g,tx,PARK_TOP+6,r2);});
  if(!SE.snow){rect(g,'#7a5a3c',8,PARK_TOP,52,21);for(i=0;i<50;i++)rect(g,'#6a4c32',8+r2()*52|0,PARK_TOP+r2()*21|0,1,1);}
  if(SE.park==='snowman'){var sy=PARK_TOP-1;
    rect(g,C.white,286,sy+14,9,8);rect(g,C.white,287,sy+7,7,7);rect(g,C.white,288,sy+2,5,5);
    rect(g,C.ink,289,sy+4,1,1);rect(g,C.ink,291,sy+4,1,1);rect(g,'#e8590c',290,sy+5,2,1);rect(g,C.red,287,sy+7,7,1);
    rect(g,C.wood,284,sy+10,3,1);rect(g,C.wood,294,sy+10,3,1);rect(g,C.ink,290,sy+9,1,1);rect(g,C.ink,290,sy+11,1,1);
    rect(g,C.ink,288,sy,5,2);rect(g,C.ink,287,sy+2,7,1);}
}

/* ---------- the day, built from the board's snapshot ---------- */
var M=null;       // the model for this showing
var SVC_SHORT={'Bin Rental':'bin rental','Junk Removal':'junk removal','Junk Quote':'junk quote',
  'Furniture Pickup':'furniture pickup','Furniture Delivery':'furniture delivery','Extra Jobs':'extra job'};
function fmtClock(ms){var d=new Date(ms),h=d.getHours(),m=d.getMinutes();return(h%12||12)+':'+(m<10?'0':'')+m+(h>=12?' pm':' am');}
/* the dashboard's emails-to-send rule (app-bookings.js renderTodayBookings): copied, because this page loads no app.js */
function needsEmail(j){return j.status!=='Cancelled'&&!(j.email_sent||j.email_confirmed||j.no_email);}

var BADGE_DEFS=[
  {id:'early',name:'Early start',hint:'A stop done before 8:45',icon:'sun'},
  {id:'ten',name:'Ten by noon',hint:'10 stops done before noon',icon:'clock'},
  {id:'big',name:'Big day',hint:'15 stops done',icon:'truck'},
  {id:'phone',name:"Phone's ringing",hint:'10 jobs entered today',icon:'phone'},
  {id:'sweep',name:'Clean sweep',hint:'Every bin stop done',icon:'star'},
  {id:'nodriver',name:'Nobody waiting',hint:'Every bin stop has a driver',icon:'person'},
  {id:'inbox',name:'Inbox zero',hint:"Every new job's email sent",icon:'mail'},
  {id:'quotes',name:'Quotes covered',hint:'No quote waiting on a call',icon:'paper'}];

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
  /* every stop gets a lot, in time order: the first half along the main road, the rest
     along the lane. Lots narrow as the day gets busier, so nothing is ever left off. */
  var perRow=Math.max(8,Math.ceil(m.stops.length/2)),lotW=Math.floor((W-4-LOTS_X)/perRow);
  m.stops.forEach(function(st,k){
    var row=k<perRow?0:1,x0=LOTS_X+(row?k-perRow:k)*lotW,tx=clamp(Math.round(x0+lotW/2-TRUCK_W/2),LOTS_X-2,W-TRUCK_W-2);
    st.lot={x:x0,w:lotW,top:row?ROWB:ROWA,hw:clamp(lotW-13,10,24)};
    st.loc={x:tx,y:row?LANEY:ROADY,ex:tx,lane:!!row};});
  /* trucks, with the zones each one stood in today */
  var byJob={};m.stops.forEach(function(st){(byJob[st.jobId]=byJob[st.jobId]||[]).push(st);});
  /* two rows each side of the gate lane (x 199), and the shop doorway for a fifth */
  var yardSlots=[[153,YARD_Y],[230,YARD_Y],[153,YARD_Y-15],[230,YARD_Y-15],[288,YARD_Y]];
  /* who's who: the driver's name and app colour; a truck nobody has driven today goes by its own name */
  var trucks=s.trucks.map(function(t){
    var truckName=String(t.name||'').replace(/[^A-Za-z0-9 ]/g,'').trim().slice(0,10);
    return{id:t.id,driver:t.driver||null,label:(t.driver||truckName||'Truck').toUpperCase(),truckName:truckName,
           color:(t.driver&&s.crewColor[t.driver])||C.nodriver,state:t.state,visits:[]};});
  var byId={};trucks.forEach(function(T){byId[T.id]=T;});
  var used={};
  s.visits.slice().sort(function(a,b){return Date.parse(a.entered_at)-Date.parse(b.entered_at);}).forEach(function(v){
    var T=byId[v.device_id];if(!T)return;
    var legs=byJob[v.job_id]||[],u=used[v.job_id]||0,st=legs[Math.min(u,legs.length-1)]||null;used[v.job_id]=u+1;
    T.visits.push({tin:Date.parse(v.entered_at),tout:v.exited_at?Date.parse(v.exited_at):null,inside:!!v.inside&&!v.exited_at,stop:st});});
  m.trucks=trucks.filter(function(T){return T.visits.length||T.state!=='yard';}).slice(0,yardSlots.length);
  m.trucks.forEach(function(T,i){var sl=yardSlots[i],gate=sl[0]===288?288:199;
    T.yard={x:sl[0],y:sl[1],ex:gate,inPts:[[gate,sl[1]]],outPts:[[gate,sl[1]]]};
    var c=T.color.replace('#',''),lum=(parseInt(c.substr(0,2),16)*299+parseInt(c.substr(2,2),16)*587+parseInt(c.substr(4,2),16)*114)/255000;
    T.ink=lum>.62?C.ink:C.white;});
  /* entered today, for the flip board and the news line */
  m.entered=s.entered.map(function(j){return{t:Date.parse(j.created_at),service:j.service,city:j.city||''};}).sort(function(a,b){return a.t-b.t;});
  m.emails=s.entered.filter(needsEmail).length;
  /* bin legs only, the same as the bin board's red "Unassigned" card - junk and
     furniture jobs are often not given a driver in the app, so they would cry wolf */
  m.noDriver=m.stops.filter(function(st){return(st.kind==='drop'||st.kind==='pick')&&!st.hasDriver;}).length;
  /* the events, in order */
  var ev=[];
  m.entered.forEach(function(e){var sv=SVC_SHORT[e.service]||'job';ev.push({t:e.t,line:'New '+sv+(e.city?' · '+e.city:''),flap:'NEW '+sv+(e.city?' - '+e.city:''),kind:'new'});});
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
function placeTruck(T,t,idx){
  var st=truckAt(T,t);
  if(st.mode==='yard')return{x:T.yard.x,y:T.yard.y,face:1,st:st};
  if(st.mode==='stop'){var L=locOf(T,st.stop);return keepRight({x:L.x,y:L.y,face:1,st:st});}
  if(st.mode==='drive'){var q=along(route(locOf(T,st.from),locOf(T,st.to)),st.p);return keepRight({x:q.x,y:q.y,face:q.face,st:st,moving:true});}
  var nx=st.near&&st.near.loc?st.near.loc.x+TRUCK_W+4:60+idx*70;
  return keepRight({x:clamp(nx+idx*3,4,W-TRUCK_W-2),y:ROADY,face:1,st:st,moving:T.state==='moving'});
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
function wanderer(x,y,region,speed){return{x:x,y:y,tx:x,ty:y,wait:1,face:1,moving:false,region:region,speed:speed};}
function newAmbient(){
  rng=mulberry32(20261102);
  A={office:OFFICE.map(function(o){return{key:o.key,seat:o.seat,home:o.home,mode:'seat',left:o.left,x:o.home[0],y:o.home[1],face:1,target:null,pts:[]};}),
     yard:[wanderer(200,100,[156,248,84,132],5),wanderer(170,90,[156,232,82,128],4)],t:0};
  A.ow={};A.office.forEach(function(w){A.ow[w.key]=w;});
}
function updWorker(w,dt){
  if(w.mode==='seat'||w.mode==='visit'){w.left-=dt;if(w.left>0)return;
    if(w.mode==='seat'){w.x=w.home[0];w.y=w.home[1];
      w.target=pick(PLACES.filter(function(p){return p.not!==w.key;}));w.pts=officeRoute([w.x,w.y],w.target.p);w.mode='walk';}
    else{w.pts=officeRoute([w.x,w.y],w.home);w.mode='back';}
    return;}
  if(walkPath(w,dt,6)){if(w.mode==='walk'){w.mode='visit';w.left=5+rng()*8;}else{w.mode='seat';w.left=25+rng()*50;}}
}
function updWander(j,dt){
  if(j.wait>0){j.wait-=dt;j.moving=false;return;}
  var dx=j.tx-j.x,dy=j.ty-j.y,d=Math.sqrt(dx*dx+dy*dy),can=j.speed*dt,R=j.region;
  if(d<=can){j.x=j.tx;j.y=j.ty;j.wait=3+rng()*9;j.tx=R[0]+rng()*(R[1]-R[0]);j.ty=R[2]+rng()*(R[3]-R[2]);j.moving=false;}
  else{j.x+=dx/d*can;j.y+=dy/d*can;j.moving=true;if(Math.abs(dx)>0.05)j.face=dx>0?1:-1;}
}
function stepAmbient(dt){
  while(dt>0){var d=Math.min(.5,dt);dt-=d;A.t+=d;
    A.office.forEach(function(w){updWorker(w,d);});A.yard.forEach(function(j){updWander(j,d);});}
}

/* ---------- scenery that keeps the picture busy: passing cars, people on the
   sidewalk, gulls over the dump and a loader on the pile. None of it is data. ---------- */
var SC=null;
function newScenery(){
  var cols=['#c4482b','#2f74c8','#e3b13a','#e6e4dc','#3a3f47','#8b5cf6','#5f8f8f','#a3a3a3'];
  SC={cars:[
      {x:40,y:RT+11,v:26,c:cols[0]},{x:230,y:RT+11,v:22,c:cols[1]},{x:330,y:RT+3,v:-24,c:cols[2]},
      {x:120,y:RT+3,v:-30,c:cols[3]},{x:300,y:LANE_TOP+3,v:16,c:cols[4]},{x:90,y:LANE_TOP+3,v:-14,c:cols[5]}],
    peds:[{x:20,v:7,look:{hair:'#3b2416',shirt:'#c4482b',pants:'#2b2f36'}},{x:260,v:-6,look:{hair:'#d8b46a',shirt:'#4f6d8a',pants:'#3a3f47'}},
      {x:150,v:5,look:{hair:'#2b2b2b',shirt:'#e3b13a',pants:'#3a3f47'},dog:true}],
    gulls:[0,1.6,3.1,4.4],loader:{x:360,dir:1}};
}
function updScenery(dtR){
  SC.cars.forEach(function(c){c.x+=c.v*dtR;if(c.v>0&&c.x>W+10)c.x=-24;if(c.v<0&&c.x<-24)c.x=W+10;});
  SC.peds.forEach(function(p){p.x+=p.v*dtR;if(p.x>W+6)p.x=-8;if(p.x<-8)p.x=W+6;});
  var L=SC.loader;L.x+=L.dir*4*dtR;if(L.x>378){L.dir=-1;}if(L.x<354){L.dir=1;}
}
function drawCar(c,nowT){
  var x=Math.round(c.x),y=c.y,left=c.v<0;
  ctx.globalAlpha=.25;rect(ctx,C.ink,x+1,y+7,13,1);ctx.globalAlpha=1;
  rect(ctx,c.c,x,y+3,15,3);rect(ctx,c.c,left?x+5:x+3,y+1,7,2);
  rect(ctx,C.glass,left?x+6:x+4,y+1,2,2);rect(ctx,C.glass,left?x+9:x+7,y+1,2,2);
  rect(ctx,C.light,left?x:x+14,y+3,1,1);rect(ctx,C.red,left?x+14:x,y+3,1,1);
  rect(ctx,C.tire,x+2,y+6,3,2);rect(ctx,C.tire,x+10,y+6,3,2);
}
function drawScenery(nowT){
  SC.cars.forEach(function(c){drawCar(c,nowT);});
  SC.peds.forEach(function(p){
    person(ctx,p.x,RT-13,p.look,{face:p.v>0?1:-1,step:Math.floor(nowT/220)%2});
    if(p.dog){var dx=p.x+(p.v>0?9:-6);rect(ctx,'#8a5a3c',dx,RT-4,5,2);rect(ctx,'#8a5a3c',p.v>0?dx+4:dx-1,RT-5,2,2);rect(ctx,'#5a3a24',dx,RT-2,1,1);rect(ctx,'#5a3a24',dx+4,RT-2,1,1);}});
  /* gulls circling the dump */
  SC.gulls.forEach(function(ph,i){var a=nowT/1400+ph,gx=372+Math.cos(a)*(18+i*4),gy=42+Math.sin(a*1.3)*10,up=Math.floor(nowT/160+i)%2;
    rect(ctx,'#f2f0e8',gx,gy,1,1);rect(ctx,'#f2f0e8',gx-2,gy-up,2,1);rect(ctx,'#f2f0e8',gx+1,gy-up,2,1);});
  /* the loader pushing the pile */
  var L=SC.loader,lx=Math.round(L.x),ly=128,f=L.dir<0;
  rect(ctx,'#e3b13a',lx,ly,12,5);rect(ctx,'#2b2f36',f?lx+1:lx+5,ly-4,6,4);rect(ctx,C.glass,f?lx+2:lx+6,ly-3,4,2);
  rect(ctx,'#22252b',lx+1,ly+5,3,2);rect(ctx,'#22252b',lx+8,ly+5,3,2);
  rect(ctx,'#9aa0a6',f?lx-4:lx+12,ly+1,4,4);rect(ctx,'#6b727e',f?lx-1:lx+11,ly+2,2,1);
}

/* ---------- weather and particles ---------- */
var wx=[],parts=[],conf=[],stamps=[],banner=null;
function weatherNow(){return WX||SE.ambient||null;}
function resetWeather(){wx=[];var w=weatherNow(),n=w==='snow'?190:w==='rain'?110:w==='leaves'?30:w==='butterflies'?5:0;
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
    if(w==='butterflies'){f.ph+=dtR*3;f.x+=Math.cos(f.ph*.7)*10*dtR;f.y+=Math.sin(f.ph)*8*dtR;f.x=clamp(f.x,4,396);f.y=clamp(f.y,PARK_TOP-4,H-4);return;}
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
var cv=null,ctx=null,els={},raf=0,showAt=0,lastFrame=0,lastSide=0,lastEv=-1,flashUntil=0;
function sceneTime(nowT){
  var p=clamp((nowT-showAt)/REPLAY_MS,0,1),e=p<1?1-Math.pow(1-p,2):1;
  return{t:M.start+(M.now-M.start)*e,replaying:p<1};
}
function hand(cx,cy,ang,len,c){for(var i=1;i<=len;i++)rect(ctx,c,cx+Math.round(Math.cos(ang)*i),cy+Math.round(Math.sin(ang)*i),1,1);}
function cloudIn(bx,bw,cx,cy){[[1,0,4],[0,1,6]].forEach(function(p){var x0=Math.max(bx,Math.round(cx+p[0])),x1=Math.min(bx+bw,Math.round(cx+p[0]+p[2]));
  if(x1>x0)rect(ctx,C.white,x0,cy+p[1],x1-x0,1);});}
function drawWindow(nowT){
  var x=10,y=15,ww=21,hh=30,w=weatherNow();
  rect(ctx,C.wood,x-1,y-1,ww+2,hh+2);rect(ctx,SE.snow?'#c9dbe8':w==='rain'?'#8aa3b8':C.sky,x,y,ww,hh);
  if(w==='snow'){for(var i=0;i<12;i++){var fx=x+((i*7+Math.floor(nowT/90)*(i%3+1))%ww),fy=y+((i*5+Math.floor(nowT/120))%hh);rect(ctx,C.white,fx,fy,1,1);}}
  else{var span=ww+12,off=((nowT/1000*1.2)%span)-6;cloudIn(x,ww,x+off,y+4);cloudIn(x,ww,x+((off+17)%span)-6,y+14);}
  rect(ctx,SE.snow?'#e8eef2':'#7fae55',x,y+24,ww,6);
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
function drawSeat(w,f){
  if(w.mode==='seat'){person(ctx,w.seat[0],w.seat[1],P[w.key],{seated:true});return true;}
  rect(ctx,'#3a3f47',w.seat[0]-1,w.seat[1]+4,7,7);return false;
}
function drawWalkers(nowT,lower){
  A.office.filter(function(w){return w.mode!=='seat'&&(w.y>=110)===lower;}).sort(function(a,b){return a.y-b.y;}).forEach(function(w){
    person(ctx,w.x,w.y,P[w.key],{face:w.face,step:w.mode!=='visit'&&Math.floor(nowT/180)%2});
    badge(ctx,w.key.toUpperCase(),w.x+2,w.y-9,C.sign);});   /* away from the desk nameplate, they carry their name */
}
function drawOffice(nowT,t,vals,news){
  var O=A.ow,tk=Math.floor(nowT/200)%2,tr=Math.floor(nowT/230)%2,tb=Math.floor(nowT/260)%2,tj=Math.floor(nowT/150)%2,ts=Math.floor(nowT/400)%2;
  drawWindow(nowT);drawBoard(nowT,vals,news);drawClock(t);
  var sk=drawSeat(O.kelly),sr=drawSeat(O.rachel),ss=drawSeat(O.sam);
  desk(12,80,39,'KELLY');desk(54,80,39,'RACHEL');desk(96,80,39,'SAM');
  if(sk)arms(26,79,tk);if(sr)arms(68,79,tr);if(ss)arms(110,79,ts);
  monitor(35,70);monitor(77,70);monitor(119,70);
  pile(14,79,M.noDriver,C.red);pile(56,79,M.emails,C.blue);
  phone(46,76);phone(88,76);phone(98,76);
  drawWalkers(nowT,false);
  var sb=drawSeat(O.barb),sj=drawSeat(O.jake);
  desk(12,122,39,'BARB');desk(60,122,52,'JAKE');
  if(sb)arms(26,121,tb);if(sj)arms(74,121,tj);
  monitor(35,112);monitor(84,112);monitor(96,112);
  rect(ctx,C.grey,63,120,8,2);rect(ctx,C.dark,64,116,6,4);rect(ctx,'#7fd1ff',65,117,4,2);
  pile(14,121,M.counts.quotesDue,C.amber);
  rect(ctx,C.white,47,119,3,3);
  for(var r=0;r<9;r++)for(var c=0;c<3;c++){var on=((r*3+c)*7+Math.floor(nowT/(180+c*70)))%5<2;rect(ctx,on?(c===1?'#f2c14e':'#3cc46f'):'#1d2a22',121+c*3,99+r*4,2,1);}
  drawWalkers(nowT,true);
  if(Math.floor(nowT/400)%2)rect(ctx,'#e8eef2',20,140,1,2);else rect(ctx,'#e8eef2',21,139,1,2);
  if(SE.lights){var cols=['#d9412b','#f2c14e','#3cc46f','#2f74c8'],sh=Math.floor(nowT/500);
    for(var lx=6;lx<142;lx+=4)rect(ctx,cols[(lx/4+sh)%4|0],lx,10,1,1);
    for(var q=0;q<8;q++)rect(ctx,cols[(q+sh)%4],132+(q*3)%6,145+q*3,1,1);}
}
function drawYard(nowT){
  /* every bin in the yard: ready ones in the main stack, then down the right-hand
     side the ones being prepped (amber tag) and the ones out of rotation (grey, red tag) */
  var b=M.bins,k;
  for(k=0;k<b.ready;k++)spr(ctx,BIN,binPal,153+(k%7)*13,19+Math.floor(k/7)*7,false);
  for(k=0;k<b.prep;k++){spr(ctx,BIN,binPal,250,19+k*7,false);rect(ctx,C.amber,258,20+k*7,2,2);}
  for(k=0;k<b.off;k++){var oy=19+(b.prep+k)*7;spr(ctx,BIN,offPal,250,oy,false);rect(ctx,C.red,258,oy+1,2,2);}
  A.yard.slice().sort(function(a,c){return a.y-c.y;}).forEach(function(j,i){
    person(ctx,j.x,j.y,i===0?P.yard1:P.yard2,{face:j.face,step:j.moving&&Math.floor(nowT/180)%2});});
  person(ctx,290,44,P.shop,{arm:Math.floor(nowT/300)%2});
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
  var x=Math.round(pos.x),y=Math.round(pos.y),flip=pos.face<0,st=pos.st,atStop=st.mode==='stop',carry=carrying(st,t);
  ctx.globalAlpha=.3;rect(ctx,C.ink,x+2,y+TRUCK_H,TRUCK_W-4,1);ctx.globalAlpha=1;
  spr(ctx,TRUCK,{O:C.out,W:C.glass,G:C.truck,g:C.truck2,d:'#1f5e2c',S:T.color,Y:C.light,K:C.tire,k:C.rim},x,y,flip);
  if(pos.moving&&Math.floor(nowT/120)%2)[5,15,25].forEach(function(c){rect(ctx,C.tire,flip?x+TRUCK_W-1-c:x+c,y+10,1,1);});
  if(SE.snow)rect(ctx,C.snow,flip?x+3:x+19,y,6,1);
  if(carry)spr(ctx,BIGBIN,binPal,flip?x+12:x+1,y-2,false);
  /* the driver sits in the cab, except out at a stop or parked up in the yard */
  if(!atStop&&st.mode!=='yard'){var hx=flip?x+5:x+20;rect(ctx,T.color,hx,y+1,3,1);rect(ctx,C.skin,hx,y+2,3,1);rect(ctx,C.ink,flip?hx:hx+2,y+2,1,1);}
  if(pos.moving&&Math.random()<.18)parts.push({x:flip?x+TRUCK_W:x-1,y:y+7,vx:(flip?1:-1)*5,vy:-3,life:.9,c:'#a8adb4'});
  /* who it is, in their colour */
  var lbl=T.label,bw=tw(lbl)+4,tx=Math.round(x+TRUCK_W/2-bw/2),ty=y-(carry?13:9);
  rect(ctx,T.color,tx,ty,bw,7);text(ctx,lbl,tx+2,ty+1,T.ink);rect(ctx,T.color,tx+Math.floor(bw/2),ty+7,1,1);
  if(atStop)person(ctx,x+TRUCK_W+1,y-1,{hair:'#5a4030',cap:T.color,shirt:C.staff,pants:'#3a3f47'},{face:-1,arm:Math.floor(nowT/300)%2});
}
function drawLots(nowT,t,replaying){
  M.stops.forEach(function(st){
    var L=st.lot,done=stopDone(st,t),bx=L.x+L.hw+2,by=L.top+9,small=L.w-L.hw-3<11;
    if((st.kind==='drop'&&done)||(st.kind==='pick'&&!done))spr(ctx,small?MINIBIN:BIN,binPal,bx,by+(small?1:0),false);
    if((st.kind==='junk'||st.kind==='furn'||st.kind==='other')&&!done){
      var hc=['#8a6d4f','#a3a3a3','#c45a3a','#d8cfa8','#5f7f9e'];for(var i=0;i<8;i++)rect(ctx,hc[i%5],bx+(i%4)*2,by+2-Math.floor(i/4),2,1);}
    if((st.kind==='drop'||st.kind==='pick')&&!st.hasDriver&&!done)badge(ctx,'!',L.x+Math.round(L.hw/2)+1,L.top-6,C.red);
    var waving=st.doneAt!=null&&t>=st.doneAt&&t<st.doneAt+(replaying?25*MIN:10*MIN);
    if(waving)person(ctx,L.x+Math.round(L.hw/2)-1,L.top+4,st.cust,{face:1,wave:true,arm:Math.floor(nowT/200)%2});
  });
  if(SE.lights){var cols=['#d9412b','#f2c14e','#3cc46f','#2f74c8'],sh=Math.floor(nowT/450);
    M.stops.forEach(function(st,k){var L=st.lot;for(var i2=0;i2<L.hw-2;i2+=3)rect(ctx,cols[(i2/3+sh+k)%4|0],L.x+2+i2,L.top+6,1,1);});}
}
function drawJWG(nowT,t){
  var top=PARK_TOP,amb=A.t,f;
  if(SE.park==='mow'){
    var hr=new Date(t).getHours()+new Date(t).getMinutes()/60,p=clamp((hr-9)/6,0,1),N=5,rows=Math.floor(p*N),frac=p*N-rows,x0=250,x1=330;
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
    for(f=0;f<5;f++){var px=258+f*15,big=f<piles?1:0;rect(ctx,SE.leaves[f%4],px,top+17-big,6+big*2,2+big);rect(ctx,SE.leaves[(f+1)%4],px+2,top+16-big,3,1);}
    var rx2=255+(Math.floor(amb)%70);if(Math.floor(amb/70)%2)rx2=325-(Math.floor(amb)%70);
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
    var gy=Math.round(40+Math.sin(nowT/500)*3);
    rect(ctx,C.white,384,gy,7,7);rect(ctx,C.white,384,gy+7,2,1);rect(ctx,C.white,387,gy+7,1,1);rect(ctx,C.white,389,gy+7,2,1);
    rect(ctx,C.ink,386,gy+2,1,2);rect(ctx,C.ink,388,gy+2,1,2);
    for(var b=0;b<3;b++){var bx=(nowT/40*(1+b*.3)+b*140)%(W+40)-20,by=12+b*12+Math.sin(nowT/300+b)*4,up=Math.floor(nowT/120+b)%2;
      rect(ctx,'#2b1d3a',bx,by,2,2);rect(ctx,'#2b1d3a',bx-3,by-up,3,1);rect(ctx,'#2b1d3a',bx+2,by-up,3,1);}
  }
  if(SE.snow&&M.stops.length&&Math.random()<.08){var L=M.stops[Math.floor(Math.random()*M.stops.length)].lot;parts.push({x:L.x+L.hw/2,y:L.top,vx:3+Math.random()*3,vy:-(4+Math.random()*3),life:1.6,c:'#c9ced4'});}
}
function drawTint(t){
  var d=new Date(t),m=d.getHours()*60+d.getMinutes(),a=0,col=null;
  if(SE.spooky&&m>15*60){a=Math.min(.26,(m-15*60)/120*.26);col='#4b2a86';}
  else if(m>15.5*60){a=Math.min(.18,(m-15.5*60)/90*.18);col='#ff8a3d';}
  else if(m<8*60){a=clamp((8*60-m)/30*.12,0,.2);col='#3d5aff';}
  if(weatherNow()==='rain'){ctx.globalAlpha=.12;ctx.fillStyle='#34495e';ctx.fillRect(0,0,W,H);ctx.globalAlpha=1;}
  if(a>0){ctx.globalAlpha=a;ctx.fillStyle=col;ctx.fillRect(0,0,W,H);ctx.globalAlpha=1;}
}
function draw(nowT){
  var tt=sceneTime(nowT),t=tt.t;
  /* events the replay has reached since the last frame: stamps, flips and badges */
  var reached=-1;for(var i=0;i<M.events.length;i++)if(M.events[i].t<=t)reached=i;
  if(reached>lastEv){
    for(var k=lastEv+1;k<=reached;k++){var e=M.events[k];
      if(!tt.replaying&&k<reached)continue;
      if(e.kind==='done'&&e.stop)stamp(e.stop.lot.x+e.stop.lot.w/2,e.stop.lot.top-4,'DONE',C.red,nowT);
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
  ctx.drawImage(bgc,0,0);
  drawOffice(nowT,t,vals,news);drawYard(nowT);
  drawJWG(nowT,t);drawLots(nowT,t,tt.replaying);drawScenery(nowT);
  M.trucks.map(function(T,idx){return{T:T,pos:placeTruck(T,t,idx)};}).sort(function(a,b){return a.pos.y-b.pos.y;})
    .forEach(function(o){drawTruck(o.T,o.pos,t,nowT);});
  drawWeather(nowT);drawStamps(nowT);drawTint(t);drawBanner(nowT);
  return tt;
}

/* ---------- the side column: who's who in the trucks, badges and today's story, in the board's own type ---------- */
function truckLine(T,t){
  var s=truckAt(T,t);
  if(s.mode==='stop')return'At a stop'+(s.stop&&s.stop.town?' in '+s.stop.town:'');
  if(s.mode==='drive')return s.to==='yard'?'Heading back to the yard':'Driving to '+(s.to&&s.to.town?s.to.town:'a stop');
  if(s.mode==='yard')return'In the yard';
  return'Out on the road';
}
function stopsDoneBy(T,t){return T.visits.filter(function(v){return v.tout!=null&&v.tout<=t;}).length;}
var sideKey='';
function renderSide(t){
  var lines=M.trucks.map(function(T){return truckLine(T,t)+'|'+stopsDoneBy(T,t);});
  var key=M.events.filter(function(e){return e.t<=t;}).length+'|'+(t>=M.now)+'|'+lines.join(',');
  if(key===sideKey)return;sideKey=key;
  if(els.trucks){
    els.trucks.innerHTML=M.trucks.length?M.trucks.map(function(T){var n=stopsDoneBy(T,t);
      return'<li><i style="background:'+T.color+'"></i><b>'+escH(T.driver||T.truckName||'Truck')+'</b><span>'+escH(truckLine(T,t))+'</span><em>'
        +n+' stop'+(n===1?'':'s')+'</em></li>';}).join('')
      :'<li class="empty"><span>No trucks out yet</span></li>';
  }
  if(els.badges){
    els.badges.innerHTML=BADGE_DEFS.map(function(b){var at=M.earned[b.id],got=at!=null&&at<=t;
      return'<div class="hq-badge'+(got?' got':'')+'"><canvas width="9" height="9" data-icon="'+b.icon+'"></canvas><b>'+b.name+'</b><span>'
        +(got?(at>=M.now-MIN?'Earned':'Earned '+fmtClock(at)):b.hint)+'</span></div>';}).join('');
    [].forEach.call(els.badges.querySelectorAll('canvas'),function(c){var ic=ICONS[c.getAttribute('data-icon')];spr(c.getContext('2d'),ic.rows,ic.pal,0,0,false);});
  }
  if(els.story){
    var seen=M.events.filter(function(e){return e.t<=t;}).slice(-5).reverse();
    els.story.innerHTML=seen.length?seen.map(function(e){return'<li class="'+e.kind+'"><time>'+fmtClock(e.t)+'</time><span>'+escH(e.line)+'</span></li>';}).join('')
      :'<li class="empty"><span>Nothing yet today</span></li>';
  }
}
function escH(s){return String(s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
function badgeCount(){return BADGE_DEFS.filter(function(b){return M.earned[b.id]!=null;}).length;}

function frame(nowT){
  var dtR=Math.min(.1,Math.max(0,(nowT-lastFrame)/1000));lastFrame=nowT;
  stepAmbient(dtR*AMBIENT_MIN_PER_SEC);updWeather(dtR);updScenery(dtR);
  var tt=draw(nowT);
  if(nowT-lastSide>250){lastSide=nowT;renderSide(tt.t);}
  raf=requestAnimationFrame(frame);
}

window.JJHQ={
  /* opts: {canvas, trucks, badges, story} - the board's own elements */
  mount:function(opts){
    if(!opts||!opts.canvas)throw new Error('JJHQ.mount needs a canvas');
    cv=opts.canvas;ctx=cv.getContext('2d');els={trucks:opts.trucks,badges:opts.badges,story:opts.story};
    bgc=document.createElement('canvas');bgc.width=W;bgc.height=H;bgx=bgc.getContext('2d');
    newAmbient();newScenery();
  },
  /* snap: the board's data for this showing (built in office-tv.html hqSnapshot) */
  show:function(snap){
    if(!cv)throw new Error('JJHQ.show before JJHQ.mount');
    SE=SEASONS[seasonFor(new Date(snap.now))];WX=wxKind(snap.wx);
    M=buildModel(snap);
    /* the yard crew walk below however many bins are stacked today */
    var ytop=clamp(19+Math.ceil(M.bins.ready/7)*7+2,84,118);
    A.yard.forEach(function(j){j.region=[176,232,ytop,118];j.x=clamp(j.x,176,232);j.y=clamp(j.y,ytop,118);j.tx=clamp(j.tx,176,232);j.ty=clamp(j.ty,ytop,118);});
    drawBG();resetWeather();
    stamps=[];parts=[];conf=[];banner=null;boardReady=false;flaps={};tick={msg:'',pages:[''],page:0,pageAt:0};lastEv=-1;flashUntil=0;sideKey='';
    cancelAnimationFrame(raf);
    showAt=lastFrame=performance.now();lastSide=0;
    /* a hidden tab gets no animation frames - draw the end state once so the screen is never blank */
    if(document.hidden){showAt-=REPLAY_MS;draw(showAt+REPLAY_MS);renderSide(M.now);return;}
    raf=requestAnimationFrame(frame);
  },
  hide:function(){cancelAnimationFrame(raf);raf=0;},
  badgeCount:function(){return M?badgeCount():0;}
};
})();
