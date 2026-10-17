// Furniture Bank price list and pickup pricing, shared by the dashboard (index.html) and
// the crew's pickup iPad page (fb-pickup.html) so both work out the same price the same way.
// Load it BEFORE app.js. Plain globals, no DOM, no database: each page fetches the
// furniture_prices and our_prices rows itself and hands them to applyFurniturePrices /
// applyOurPrices.

// Ontario HST, used for every price shown with tax.
var HST_RATE = 0.13;

// Price-sheet areas from the our_prices table, keyed by area name.
var ourPricesV2 = {};
function applyOurPrices(rows){
  ourPricesV2 = {};
  rows.forEach(function(r){
    // bin_fuel is intentionally NOT loaded — we stopped charging a fuel surcharge (July 2026)
    ourPricesV2[r.area||'Default'] = {bins:r.bins||{}, junk:r.junk||{}, binTonne:(r.bins&&r.bins._tonne!=null)?String(r.bins._tonne):'', towns:r.towns||'',
                                      zone:r.zone||'', driveTime:r.drive_time||''};
  });
}

function getAreaPrices(area){ return ourPricesV2[area] || {bins:{},junk:{},binTonne:'',towns:'',zone:'',driveTime:''}; }

// Each item carries two prices plus Redwood 2026 taxonomy data:
//   fee = Pick Up Fee  → what the customer pays
//   val = Tax Receipt Value → donation-receipt value (kept as the historical `val`)
//   vol = cubic feet (Redwood 2026 Master Taxonomy)
//   grp / sub = Redwood group / sub-category
// IMPORTANT: array order is FIXED. Saved Furniture Pickup jobs store DRD
// quantities positionally (quantities[i] ↔ DRD_ITEMS[i]), so existing items must
// keep their index. New items are APPENDED at the end. Display is alphabetised
// separately via DRD_ORDER below — never re-sort this array in place.
// hidden:true items were retired in the Redwood 2026 alignment (2026-07-09) but
// keep their original fee/val so totals on old saved jobs stay correct.
// The Furniture Bank "Product Pricing & Tax Receipt Value" sheet (scanned
// 2026-08-07) brought six of those back — Bed Frame Double/Twin, Bed Frame Queen,
// Television - Tube, Trunk, Wall Unit, Wardrobe — at the fee/val they already had.
// That sheet carries no cubic feet. The two Bed Frames take the metal frames' size
// and picture (Jake, 2026-09-28: same item); the other four sit at vol:0 and the
// truck-fill visual does not count them until someone measures one.
// Everything NOT on that sheet is hidden (Jake, 2026-09-28): the list is the sheet.
// Names and prices of the sheet's 74 items follow that sheet exactly (Jake,
// 2026-09-28). applyFurniturePrices matches furniture_prices rows by NAME, so a
// rename here must land together with the same rename in that table.
var DRD_ITEMS = [
  {name:'Air Conditioner',fee:10,val:100,vol:5,grp:'Electronics',sub:'Electronics & Appliances'},{name:'Armchair',fee:60,val:100,vol:26,grp:'Living Room',sub:'Armchairs'},{name:'Armoire',fee:90,val:200,vol:28,grp:'Bedroom',sub:'Armoires & Wardrobes'},
  {name:'Artificial Plant / Christmas Tree',fee:15,val:50,vol:19,grp:'Accents',sub:'Housewares & Home Decor'},{name:'Linens (per bag)',fee:0,val:25,vol:10,grp:'Accents',sub:'Housewares & Home Decor'},{name:'Bar Fridge',fee:30,val:100,vol:6,grp:'Electronics',sub:'Electronics & Appliances'},
  {name:'Bed Frame (Double/Twin)',fee:30,val:75,vol:8,grp:'Bedroom',sub:'Mattresses & Bed Frames'},{name:'Bed Frame (Queen)',fee:30,val:100,vol:12,grp:'Bedroom',sub:'Mattresses & Bed Frames'},{name:'Bench',fee:30,val:50,vol:16,grp:'Living Room',sub:'Benches'},
  {name:'Box - Assorted Home Goods',fee:15,val:25,vol:5,grp:'Accents',sub:'Housewares & Home Decor'},{name:'Box - Cookware',fee:15,val:25,vol:5,grp:'Accents',sub:'Housewares & Home Decor'},{name:'Box - Dishware',fee:15,val:25,vol:5,grp:'Accents',sub:'Housewares & Home Decor'},
  {name:'Boxspring - Double',fee:60,val:150,vol:22,grp:'Bedroom',sub:'Mattresses & Bed Frames'},{name:'Boxspring - Queen',fee:60,val:150,vol:34,grp:'Bedroom',sub:'Mattresses & Bed Frames'},{name:'Boxspring - Twin',fee:60,val:100,vol:21,grp:'Bedroom',sub:'Mattresses & Bed Frames'},
  {name:'Buffet and Hutch',fee:90,val:150,vol:51,grp:'Kitchen/Dining',sub:'Buffets & Hutches'},{name:'Cabinet',fee:60,val:150,vol:23,grp:'Living Room',sub:'Cabinets & Storage'},{name:'CD Stand',fee:15,val:25,vol:9,grp:'Living Room',sub:'TV Stands & Entertainment'},
  {name:'Chair - Dining/Kitchen/Occasional',fee:15,val:50,vol:11,grp:'Kitchen/Dining',sub:'Chairs & Stools'},{name:'Chest',fee:30,val:100,vol:21,grp:'Bedroom',sub:'Dressers & Vanities'},{name:'Clock',fee:15,val:25,hidden:true},
  {name:'Coat Rack',fee:15,val:25,vol:12,grp:'Accents',sub:'Housewares & Home Decor'},{name:'Computer Monitor',fee:15,val:100,hidden:true},{name:'Credenza',fee:60,val:150,vol:21,grp:'Kitchen/Dining',sub:'Sideboards & Credenzas'},
  {name:'Desk',fee:60,val:100,vol:22,grp:'Study/Office',sub:'Desks'},{name:'Dresser',fee:60,val:100,vol:21,grp:'Bedroom',sub:'Dressers & Vanities'},{name:'DVD/VCR Player',fee:15,val:25,vol:1,grp:'Electronics',sub:'Electronics & Appliances'},
  {name:'Electric Fireplace',fee:30,val:50,hidden:true},{name:'Entertainment Unit',fee:90,val:150,vol:31,grp:'Living Room',sub:'TV Stands & Entertainment'},{name:'Fan',fee:15,val:25,vol:1,grp:'Electronics',sub:'Electronics & Appliances'},
  {name:'Filing Cabinet - Small',fee:15,val:50,vol:5,grp:'Study/Office',sub:'Filing & Storage'},{name:'Folding Chair',fee:15,val:25,vol:11,grp:'Kitchen/Dining',sub:'Chairs & Stools'},{name:'Folding Table',fee:15,val:50,vol:45,grp:'Kitchen/Dining',sub:'Dining Tables'},
  {name:'Futon - Complete',fee:90,val:150,vol:51,grp:'Living Room',sub:'Sofas'},{name:'Headboard',hidden:true,fee:25,val:50,vol:34,grp:'Bedroom',sub:'Headboards'},{name:'Ironing Board',fee:15,val:25,vol:19,grp:'Accents',sub:'Housewares & Home Decor'},
  {name:'Lamp',fee:15,val:25,vol:2,grp:'Accents',sub:'Lighting'},{name:'Laundry Hamper',fee:15,val:25,vol:4,grp:'Accents',sub:'Housewares & Home Decor'},{name:'Loveseat',fee:75,val:150,vol:34,grp:'Living Room',sub:'Sofas'},
  {name:'Magazine Rack',fee:15,val:25,hidden:true},{name:'Mattress (Double)',fee:60,val:150,vol:22,grp:'Bedroom',sub:'Mattresses & Bed Frames'},{name:'Mattress (Queen)',fee:60,val:150,vol:34,grp:'Bedroom',sub:'Mattresses & Bed Frames'},
  {name:'Mattress (Twin)',fee:60,val:100,vol:21,grp:'Bedroom',sub:'Mattresses & Bed Frames'},{name:'Microwave',fee:15,val:50,vol:7,grp:'Electronics',sub:'Electronics & Appliances'},{name:'Microwave Stand',fee:30,val:50,vol:13,grp:'Kitchen/Dining',sub:'Carts & Stands'},
  {name:'Mirror',fee:15,val:50,vol:1,grp:'Accents',sub:'Mirrors'},{name:'Office Chair',fee:15,val:50,vol:9,grp:'Study/Office',sub:'Office Chairs'},{name:'Ottoman',fee:15,val:50,vol:7,grp:'Living Room',sub:'Ottomans'},
  {name:'Picture (Art)',fee:10,val:25,vol:1,grp:'Accents',sub:'Art'},{name:'Recliner',fee:60,val:100,vol:32,grp:'Living Room',sub:'Armchairs'},{name:'Rocking Chair',fee:30,val:75,vol:23,grp:'Living Room',sub:'Occasional Chairs'},
  {name:'Room Divider',fee:15,val:25,vol:4,grp:'Accents',sub:'Housewares & Home Decor'},{name:'Rug',fee:30,val:75,vol:14,grp:'Accents',sub:'Area Rugs'},{name:'Sofa - Sectional',fee:150,val:350,vol:121,grp:'Living Room',sub:'Sofas'},
  {name:'Shelf - Large',fee:60,val:100,vol:15,grp:'Living Room',sub:'Shelves'},{name:'Shelf - Small',fee:30,val:75,vol:9,grp:'Living Room',sub:'Shelves'},{name:'Shoe Rack',fee:15,val:25,vol:3,grp:'Accents',sub:'Housewares & Home Decor'},
  {name:'Sideboard',fee:90,val:150,vol:21,grp:'Kitchen/Dining',sub:'Sideboards & Credenzas'},{name:'Small Appliance (per box)',fee:15,val:25,vol:5,grp:'Electronics',sub:'Electronics & Appliances'},{name:'Sofa',fee:100,val:250,vol:51,grp:'Living Room',sub:'Sofas'},
  {name:'Sofa - Luxury',fee:100,val:500,hidden:true},{name:'Sofabed',fee:150,val:300,vol:51,grp:'Living Room',sub:'Sofas'},{name:'Space Heater',fee:15,val:25,vol:2,grp:'Electronics',sub:'Electronics & Appliances'},
  {name:'Stereo',fee:15,val:25,vol:1,grp:'Electronics',sub:'Electronics & Appliances'},{name:'Stool - Dining/Kitchen',fee:15,val:25,vol:4,grp:'Kitchen/Dining',sub:'Chairs & Stools'},{name:'Suitcase',fee:15,val:25,hidden:true},
  {name:'Table - Coffee',fee:30,val:100,vol:10,grp:'Living Room',sub:'Tables'},{name:'Table - Dining/Kitchen',fee:60,val:150,vol:45,grp:'Kitchen/Dining',sub:'Dining Tables'},{name:'Table - Night',fee:15,val:50,vol:6,grp:'Bedroom',sub:'Nightstands'},
  {name:'Table - Side',fee:15,val:50,vol:6,grp:'Living Room',sub:'Tables'},{name:'Television - Tube',fee:30,val:50,vol:0,grp:'Electronics',sub:'Electronics & Appliances'},{name:'Television Stand',fee:30,val:75,vol:10,grp:'Living Room',sub:'TV Stands & Entertainment'},
  {name:'Throw Rug',hidden:true,fee:15,val:25,vol:2,grp:'Accents',sub:'Area Rugs'},{name:'Trunk',fee:30,val:75,vol:0,grp:'Living Room',sub:'Cabinets & Storage'},{name:'Television - Large Flat Screen (Over 32")',fee:30,val:150,vol:3,grp:'Electronics',sub:'Electronics & Appliances'},
  {name:'Television - Small Flat Screen (Under 32")',fee:15,val:100,vol:2,grp:'Electronics',sub:'Electronics & Appliances'},{name:'TV Tray',fee:15,val:25,vol:4,grp:'Accents',sub:'Housewares & Home Decor'},{name:'Vacuum Cleaner',fee:15,val:75,vol:5,grp:'Electronics',sub:'Electronics & Appliances'},
  {name:'Vanity',fee:60,val:150,vol:16,grp:'Bedroom',sub:'Dressers & Vanities'},{name:'Wall Unit',fee:90,val:100,vol:0,grp:'Living Room',sub:'TV Stands & Entertainment'},{name:'Wardrobe',fee:90,val:200,vol:0,grp:'Bedroom',sub:'Armoires & Wardrobes'},
  {name:'Waste Basket',fee:15,val:25,vol:5,grp:'Accents',sub:'Housewares & Home Decor'},
  // ── Appended 2026-07-09 (Redwood 2026 alignment — keep at end to preserve indices) ──
  {name:'Metal Bed Frame - Twin',hidden:true,fee:30,val:75,vol:5,grp:'Bedroom',sub:'Mattresses & Bed Frames'},{name:'Metal Bed Frame - Double',hidden:true,fee:30,val:75,vol:8,grp:'Bedroom',sub:'Mattresses & Bed Frames'},
  {name:'Metal Bed Frame - Queen',hidden:true,fee:30,val:75,vol:12,grp:'Bedroom',sub:'Mattresses & Bed Frames'},{name:'Complete Bed Frame - Twin',hidden:true,fee:60,val:100,vol:23,grp:'Bedroom',sub:'Mattresses & Bed Frames'},{name:'Complete Bed Frame - Double',hidden:true,fee:75,val:125,vol:23,grp:'Bedroom',sub:'Mattresses & Bed Frames'},
  {name:'Complete Bed Frame - Queen',hidden:true,fee:90,val:150,vol:39,grp:'Bedroom',sub:'Mattresses & Bed Frames'},{name:'Small Cabinet',hidden:true,fee:30,val:100,vol:21,grp:'Living Room',sub:'Cabinets & Storage'},{name:'Sofa - Extra Large',hidden:true,fee:150,val:350,vol:84,grp:'Living Room',sub:'Sofas'},
  {name:'Recliner Sofa',hidden:true,fee:150,val:350,vol:94,grp:'Living Room',sub:'Sofas'},{name:'Garment Rack',hidden:true,fee:15,val:25,vol:12,grp:'Accents',sub:'Housewares & Home Decor'},{name:'Plastic Storage Unit',hidden:true,fee:15,val:25,vol:4,grp:'Accents',sub:'Housewares & Home Decor'},
  {name:'Stepstool / Footstool',hidden:true,fee:15,val:25,vol:2,grp:'Accents',sub:'Housewares & Home Decor'},{name:'Air Fryer',hidden:true,fee:15,val:25,vol:7,grp:'Electronics',sub:'Electronics & Appliances'},{name:'Blender',hidden:true,fee:15,val:25,vol:7,grp:'Electronics',sub:'Electronics & Appliances'},
  {name:'Coffee Maker',hidden:true,fee:15,val:25,vol:7,grp:'Electronics',sub:'Electronics & Appliances'},{name:'Countertop Dishwasher',hidden:true,fee:15,val:25,vol:7,grp:'Electronics',sub:'Electronics & Appliances'},{name:'Freezer',hidden:true,fee:15,val:50,vol:7,grp:'Electronics',sub:'Electronics & Appliances'},
  {name:'Humidifier / Dehumidifier',hidden:true,fee:15,val:25,vol:5,grp:'Electronics',sub:'Electronics & Appliances'},{name:'Indoor Grill',hidden:true,fee:15,val:25,vol:7,grp:'Electronics',sub:'Electronics & Appliances'},{name:'Juicer',hidden:true,fee:15,val:25,vol:7,grp:'Electronics',sub:'Electronics & Appliances'},
  {name:'Sewing Machine',hidden:true,fee:15,val:75,vol:10,grp:'Electronics',sub:'Electronics & Appliances'},{name:'Steam Cleaner',hidden:true,fee:15,val:75,vol:5,grp:'Electronics',sub:'Electronics & Appliances'},{name:'Kitchen Cart / Tea Cart / Bar Cart',hidden:true,fee:30,val:75,vol:9,grp:'Kitchen/Dining',sub:'Carts & Stands'},
  {name:'Table - Nesting Set',hidden:true,fee:15,val:50,vol:6,grp:'Living Room',sub:'Tables'},{name:'Table - Console',hidden:true,fee:60,val:100,vol:22,grp:'Living Room',sub:'Tables'},{name:'Patio Table',hidden:true,fee:60,val:100,vol:45,grp:'Outdoor',sub:'Outdoor Furniture'},
  {name:'Patio Chair / Side Table',hidden:true,fee:15,val:25,vol:11,grp:'Outdoor',sub:'Outdoor Furniture'}
];
// Display order only — indices into DRD_ITEMS sorted alphabetically by name,
// excluding hidden items. Grids render in this order; storage/recalc still use
// the real index. Rebuild after price overrides change the list.
var DRD_ORDER = [];
function rebuildDrdOrder(){
  DRD_ORDER = DRD_ITEMS.map(function(_,i){return i;})
    .filter(function(i){ return !DRD_ITEMS[i].hidden; })
    .sort(function(a,b){ return DRD_ITEMS[a].name.localeCompare(DRD_ITEMS[b].name); });
}
rebuildDrdOrder();

// Merge price overrides from the furniture_prices table into DRD_ITEMS.
// Existing names override fee/val/hidden IN PLACE (index preserved so saved
// receipts stay correct); unknown names are appended (new, stable indices).
function applyFurniturePrices(rows){
  if(!rows||!rows.length){ rebuildDrdOrder(); return; }
  var byName={};
  DRD_ITEMS.forEach(function(it){ byName[it.name.toLowerCase()]=it; });
  rows.slice().sort(function(a,b){
    var so=(a.sort_order||0)-(b.sort_order||0);
    return so!==0?so:String(a.name||'').localeCompare(String(b.name||''));
  }).forEach(function(r){
    var nm=String(r.name||'').trim(); if(!nm) return;
    var existing=byName[nm.toLowerCase()];
    if(existing){
      existing.fee=Number(r.fee)||0;
      existing.val=Number(r.val)||0;
      existing.hidden=(r.active===false);
      // vol/grp/subcategory only come from DB rows — the Settings editor saves
      // without them, so only overwrite when the row actually carries them.
      if(r.vol!==undefined) existing.vol=Number(r.vol)||0;
      if(r.grp!==undefined) existing.grp=r.grp||'';
      if(r.subcategory!==undefined) existing.sub=r.subcategory||'';
    } else if(r.active!==false){
      var ni={name:nm, fee:Number(r.fee)||0, val:Number(r.val)||0, vol:Number(r.vol)||0, grp:r.grp||'', sub:r.subcategory||''};
      DRD_ITEMS.push(ni);
      byName[nm.toLowerCase()]=ni;
    }
  });
  rebuildDrdOrder();
}

// ── Furniture Pickup zone minimum ────────────────────────────────────────────
// Driving out to a pickup has a floor by price-sheet zone: the customer pays the items
// or the zone minimum, whichever is higher, and zone 1 has none (Jake, 2026-09-03).
// Read-only: nothing here is saved with the job.
var FURN_ZONE_MIN = {1:0, 2:150, 3:250, 4:300, 5:350};
// Town -> {zone, min}, or null when the town isn't on the price sheet.
function furnitureZoneMin(town){
  var area=_priceAreaForCity(town);
  if(!area) return null;
  var m=/zone\s*(\d)/i.exec(getAreaPrices(area).zone||'');
  if(!m) throw new Error('Price sheet area "'+area+'" has no zone');
  var z=parseInt(m[1],10);
  if(!(z in FURN_ZONE_MIN)) throw new Error('No furniture minimum set for zone '+z);
  return {zone:z, min:FURN_ZONE_MIN[z]};
}
// What the customer pays for a furniture pickup: the items, lifted to the zone minimum.
// Returns {pay, note}; the note says why the number is what it is, and every screen
// that shows the number shows the note beside it.
function furnitureCustomerPays(itemsTotal, town){
  town=String(town||'').trim();
  if(!town) return {pay:itemsTotal, note:'No town yet, so no zone minimum'};
  var z=furnitureZoneMin(town);
  if(!z) return {pay:itemsTotal, note:town+' is not on the price sheet, so no zone minimum'};
  if(!z.min) return {pay:itemsTotal, note:'Zone '+z.zone+', no minimum'};
  if(itemsTotal<z.min) return {pay:z.min, note:'Zone '+z.zone+' minimum of $'+z.min+' applies (items come to $'+itemsTotal.toFixed(2)+')'};
  return {pay:itemsTotal, note:'Items are over the zone '+z.zone+' minimum of $'+z.min+', so no trip charge'};
}

// The sheet is one row per town, with an area's other towns listed in `towns`.
function _priceAreaForCity(city){
  var c=String(city||'').trim().toLowerCase();
  if(!c || typeof ourPricesV2==='undefined') return null;
  var areas=Object.keys(ourPricesV2||{});
  for(var i=0;i<areas.length;i++) if(areas[i].trim().toLowerCase()===c) return areas[i];
  for(var j=0;j<areas.length;j++){
    var towns=String(ourPricesV2[areas[j]].towns||'').split(',').map(function(s){return s.trim().toLowerCase();});
    if(towns.indexOf(c)!==-1) return areas[j];
  }
  return null;
}
