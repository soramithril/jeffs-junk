// ═══════════════════════════════════════
//  ONBOARDING — visual manual + spotlight walkthroughs (v=292)
// ═══════════════════════════════════════
// One engine. Every page is a spotlight SEQUENCE of steps; each step rings a real
// element and explains it. The manual lists every page; clicking one plays that
// page's sequence. "Take the full tour" chains them all in sidebar order. Search
// jumps straight to the matching element. Admin pages (section 'Admin') only appear
// for users who pass canAccessAnalytics(). Depends on go(), canAccessAnalytics(),
// openM()/closeM() from app.js.

function _helpEsc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

var PAGE_TOURS = [
  { view:'dashboard', label:'Dashboard', icon:'📊', section:'Daily', summary:'Your daily command center.', steps:[
    { sel:'#global-search-input', title:'Global search box', body:'Type a customer name, job number, or address here to instantly find any job or client anywhere in the system.' },
    { sel:'#dash-bin-by-size', title:'Bins available now', body:"Shows how many bins of each size are still in the yard versus out on jobs, plus a 'fleet deployed' bar so you know at a glance whether you can book another bin drop-off today." },
    { sel:'#dash-vehicle-status', title:'Vehicles & crew status', body:"Pills here show which trucks and crew members are working today and what they're assigned to, so you can see who is free to take the next job." },
    { sel:'.djj-jumpbar', title:'Jump-to bar', body:"Quick shortcut buttons that scroll you straight to the section you need — Needs You, Today's Jobs, Bins Out, Waiting on call, or Booked — with a live count badge on each." },
    { sel:'#card-today-jobs', title:"Today's Jobs card", body:'The heart of the dashboard — every job scheduled for the selected day, grouped by type, with buttons to assign a bin, confirm, mark picked up, or email the customer.' },
    { sel:'#card-will-call', title:'Waiting on Customer Call card', body:"Lists 'waiting on call' bin rentals where the customer calls us when the bin is ready — no set pickup date — so you can schedule the pickup once they ring in." },
    { sel:'#sec-binsout', title:'Bins Currently Out section', body:'A roster of every bin deployed in the field grouped by size, with how many days each has been out, so nothing gets left at a site and forgotten.' },
    { sel:'#sec-bookings', title:'Booked Today section', body:'Shows the new jobs that were entered into the system today and flags any confirmation emails still owed to those customers.' }
  ]},
  { view:'jobs', label:'All Jobs', icon:'📋', section:'Daily', summary:'The master list of every service order.', steps:[
    { sel:'[data-tour="jobs-email-presets"]', title:'Email Presets button', body:'Opens the editor for your saved email templates, so the canned messages you send to customers (confirmations, reminders) stay consistent.' },
    { sel:'#jobs-show-seg', title:'Show: status views', body:'Switch what the list shows: Active (open jobs), Completed (extra jobs), Cancelled (scrapped jobs you can restore), Bins out (every bin currently deployed), or Recurring (repeat customers).' },
    { sel:'#jobs-filters-btn', title:'Filters', body:'Open this for the advanced filters — Service (Bin, Junk, Quote, Pickup, Extra Jobs), Date, and Bin Drop. Anything you pick shows as a removable chip below.' },
    { sel:'#jsort-toggle', title:'Sort toggle', body:'One click flips the list between sorting By Date and Recently Added, so you can see either the schedule order or the newest bookings first.' },
    { sel:'#jobs-bin-count', title:'Service sections', body:'Each service has its own collapsible table with a live count pill showing how many jobs match your filters — Bin Rentals, Junk Removal, Quotes, Furniture and Extra Jobs. Click any row to open the full job.' }
  ]},
  { view:'clients', label:'Clients', icon:'👥', section:'Daily', summary:'Your searchable address book of every customer.', steps:[
    { sel:'#view-clients button.btn-primary[onclick="openAddClient()"]', title:'Add Client button', body:'Opens a form to create a brand-new client record with their name, phone, address and other details. Use this for any customer not in the system yet.' },
    { sel:'#atabs-csort', title:'Sort', body:'Reorders the list by A–Z, Most Jobs, or Recent — handy for surfacing your busiest accounts or the newest bookings.' },
    { sel:'#atabs-cshow', title:'Show', body:'Filters who appears: Everyone, 🏗️ Contractors (repeat trade accounts), 😴 Dormant (no jobs in 6+ months), or 🚫 Blacklisted. Blacklisted clients stay hidden from Everyone.' },
    { sel:'[data-tour="clients-range-filter"]', title:'Filter by Job Count', body:'Click to expand min/max filters for bin rentals, junk removals, furniture jobs and total jobs, so you can find, say, every client who has booked 5+ bin rentals.' },
    { sel:'#clients-list', title:'Client list', body:'The main list of client cards — each shows contact info and a job breakdown by type (🚛 bin · 🧹 junk · 🛋️ furniture), with a 🏗️ contractor badge for trade accounts. Click a card for the full profile, or ✏ Edit to update.' }
  ]},
  { view:'livejobs', label:'Live Jobs', icon:'⏱️', section:'Operations', summary:"A real-time control board for today's work.", steps:[
    { sel:'#lj-pulse', title:'Live pulse', body:'The green pulsing dot and timestamp tell you the board is live and when it last refreshed — it updates itself every minute.' },
    { sel:'#lj-map', title:'Live job map', body:"A live map of all of today's jobs and the trucks out doing them, so you can see where crews are and which stops are still ahead." },
    { sel:'#lj-focus-toggle', title:'Auto-focus toggle', body:'When ticked, the map automatically jumps to a truck the moment it arrives at or leaves a job site, so you do not have to hunt for the action.' },
    { sel:'#lj-overtime-min', title:'Over-time threshold', body:'Set how many minutes a crew can be on a site before the job is flagged as running over time, so long stops jump out at you.' },
    { sel:'#lj-stats', title:'Stats bar', body:'Your scoreboard for the day: total jobs booked, how many are still Pending, how many crews are currently On Site, and how many are Completed.' },
    { sel:'#lj-list', title:'Job list', body:'Every job for today, split into sections like Bin Drop-offs, Pick-ups, Junk Removals and Furniture, with a count on each. Click a row to focus it on the map and open the booking.' }
  ]},
  { view:'dispatch', label:'Dispatch', icon:'🚚', section:'Operations', summary:'The daily route-planning board for bin trips.', steps:[
    { sel:'[data-tour="dispatch-summary"]', title:'Day summary', body:'The header shows which day you are planning and a quick tally — how many bin jobs there are, the rough total time, and how many money-saving paired trips were found.' },
    { sel:'[data-tour="dispatch-fill"]', title:'Fill unassigned button', body:'Auto-assigns only the jobs that still have no driver, leaving any you set by hand untouched. The grey button beside it wipes everything and reshuffles from scratch.' },
    { sel:'[data-tour="dispatch-combo-info"]', title:'Paired trips', body:'A PAIRED trip handles both a pickup and a delivery in one run, so the empty bin goes straight to the next customer instead of back to the yard — about 6–10 minutes saved.' },
    { sel:'[data-tour="dispatch-working"]', title:'Working today', body:'Click a crew member to toggle whether they are working this day; only the ones turned on get a route lane and become assignable.' },
    { sel:'[data-tour="dispatch-unassigned"]', title:'Unassigned pool', body:'Holds every stop with no driver yet, with a count in the header. Tap 👤 Assign on a card and pick a driver — the stop jumps to that lane (dragging a card still works too).' },
    { sel:'[data-tour="dispatch-lanes"]', title:'Driver lanes', body:'One column per working driver, with an avatar and a load bar (green → amber → red) showing how full their day is. Stops list in order with a running clock; tap 🧭 Maps to open the lane route in Google Maps.' }
  ]},
  { view:'vehicles', label:'Vehicles', icon:'🚛', section:'Operations', summary:'The fleet command center for your trucks.', steps:[
    { sel:'#fleet-add-vehicle-btn', title:'Add Vehicle button', body:'Add a new truck or van to the fleet so you can start tracking its oil changes, maintenance and availability.' },
    { sel:'#fleet-tab-btn-vehicles', title:'Vehicles / Maintenance tabs', body:'Switch between the per-vehicle Vehicles view and the fleet-wide Maintenance schedule. You will spend most of your time on the Vehicles tab.' },
    { sel:'#vehicle-inbox', title:'Needs-attention banner', body:'Surfaces trucks needing attention — oil overdue or due soon, and safety stickers expiring — each with a one-tap ✅ Mark serviced.' },
    { sel:'#vehicle-filters', title:'Filter + view', body:'Filter chips — All, Good, Needs service, or In the shop, each with a live count — plus a Cards / List view toggle.' },
    { sel:'#vehicles-list', title:'Vehicle cards', body:'Each truck is a card: name, a plain-language health pill (All good / Attention soon / Service due / In the shop), and its Oil change, Safety sticker and Odometer. Use 🔧 Send to shop (reason + back-by date) or ✅ Mark serviced right on the card.' }
  ]},
  { view:'crew', label:'Crew Schedule', icon:'👷', section:'Operations', summary:'A weekly grid of who is on which job.', steps:[
    { sel:'#crew-page-sub', title:'Page summary', body:'The subtitle under the title shows how many employees you have and that you are viewing a weekly schedule.' },
    { sel:'#view-crew button[onclick="openCrewManager()"]', title:'Manage Crew Members', body:'Opens the crew manager so you can add new staff or edit existing people. Anyone you add shows up as a row in the schedule below.' },
    { sel:'[data-tour="crew-howto"]', title:'How it works', body:'Each row is an employee and each column a day; coloured chips are jobs pulled from the jobs board, and you click + off to book time off.' },
    { sel:'[data-tour="crew-grid"]', title:'Schedule grid', body:'One row per crew member, one column per day. Each cell shows that person job chips for the day, so you can see who is busy and who is free. Click a chip to open that job.' },
    { sel:'#crew-page-list td div[onclick^="openCrewBookoff"]', title:'+ off (book time off)', body:'Click + off in any day cell to book that person time off — a whole day or a window — tagged with a reason like vacation or an appointment.' }
  ]},
  { view:'damage', label:'Damage Reports', icon:'⚠️', section:'Operations', summary:'A log of property-damage incidents.', steps:[
    { sel:'#damage-sub', title:'Reports summary', body:'The line under the title updates live to show how many reports exist and how many are still open versus resolved.' },
    { sel:'#view-damage .page-header button', title:'+ New Damage Report', body:'Click whenever a crew damages something on a job — a fence, a wall, a driveway. It opens a form to log what happened, attach photos, and record the cost.' },
    { sel:'#damage-filters', title:'Status filter chips', body:'Toggle between All, Open, and Resolved reports. Each chip shows a live count so you can focus on the claims that still need follow-up.' },
    { sel:'#damage-list', title:'Report list', body:'Every logged incident appears as a card with a photo thumbnail, status badge, customer, crew, date and cost. Click a card to open it or mark it resolved.' }
  ]},
  { view:'bininventory', label:'Bin Fleet', icon:'🗑️', section:'Bins', summary:'The master list of every rental bin you own.', steps:[
    { sel:'[data-tour="bininventory-addbin"]', title:'Add Bin button', body:'Opens a form to register a brand-new bin into the fleet — set its number, size, colour and type. Use this whenever Jeff buys or builds another bin.' },
    { sel:'#fleet-summary', title:'Fleet summary', body:'Two progress bars — Fleet deployed (how many bins are out) and All-green conversion — plus three clickable tiles flagging bins that need decals, need repaint, or have sat idle 90+ days. A fast health check.' },
    { sel:'#fleet-chips', title:'Filter chips', body:'Filter the roster by status (In yard, Out, Out of service, Not for rent), colour (Green/Black) or size — each chip shows a live count. Click the active chip again to clear it.' },
    { sel:'#fleet-sorts', title:'Sort', body:'Reorder by Bin number, Size, or Status — click once to sort, again to flip direction.' },
    { sel:'#fleet-cards', title:'Bin roster', body:'Each bin is a card grouped by size: colour dot, number, an In yard/Out toggle, idle days or current location, condition flags and a notes line. Use the Cards/Table toggle to switch views; 🕘 opens history and ⋯ has Book / Edit / Delete.' },
    { sel:'#timeline-table', title:'Availability Forecast', body:'A 14-day grid showing how many bins of each size are free to rent each day, green (lots free) to red (fully booked). Check before promising a bin on a date.' }
  ]},
  { view:'binmap', label:'Bin Map', icon:'🗺️', section:'Bins', summary:'A live map of every bin out on a rental.', steps:[
    { sel:'#map-container', title:'Bin Map', body:'A live map of every bin currently out on a rental — each pin is a bin at a customer site. Click a pin (or a row in the side list) to see who has it, the size, and when it is due for pickup. Only bins out on active rentals show here, not your whole fleet.' }
  ]},
  { view:'pricing', label:'Pricing', icon:'💲', section:'Quotes & Pricing', summary:'Set your prices and quote customers.', steps:[
    { sel:'#view-pricing .page-header button.btn-ghost', title:'Set your prices', body:'Open Edit Our Prices to set your own rates — bin and junk prices and the dump fee per area. Everything on this page is calculated from these.' },
    { sel:'#pv-rail-host', title:'Quote a customer', body:'Click any bin price on the left to build the quote: the all-in price (bin + $135/tonne dump fee + HST), competitor prices for that size, and a script you can read out on the phone.' }
  ]},
  { view:'analytics', label:'Analytics', icon:'📈', section:'Admin', restricted:true, summary:'Business insights across all your jobs.', steps:[
    { sel:'#report-month', title:'Monthly Reports', body:'Pick a month and generate a polished business report with month-over-month and year-over-year comparisons, or email it straight out.' },
    { sel:'#atabs-analytics', title:'Period tabs', body:'The master control for the page — choose Week, Month, Year, or All Time and every stat and chart below recalculates for that window.' },
    { sel:'#yoy-tracker', title:'Year-over-year pills', body:'A quick scoreboard comparing this month bins, junk and furniture pickups against the same month last year, with a BEAT! badge when you are ahead.' },
    { sel:'.an-compare-btn', title:'Compare periods', body:'Adds a second date picker so you can put two periods side by side — for example this week versus last week — and the charts show both.' },
    { sel:'#analytics-metrics', title:'Key metrics row', body:'The headline counters for the selected period: Total Jobs, Bin Rentals, Junk Removal, Furniture Pickup and Furniture Delivery.' },
    { sel:'#busiest-grid', title:'Busiest Days chart', body:'Shows how many jobs land on each day of the week so you can spot your busiest days and staff accordingly.' },
    { sel:'.analytics-grid', title:'Insight charts', body:'The deeper-dive charts: Bins by Size, Jobs by City, Referral Sources, Customer Loyalty, Jobs Over Time, Service Mix and Bin Turnover.' }
  ]},
  { view:'leaderboard', label:'Driver Leaderboard', icon:'🏆', section:'Admin', restricted:true, summary:'Ranks drivers by safety and efficiency.', steps:[
    { sel:'#lb-page-tab-vehicles', title:'Vehicles / Crew toggle', body:'Switches the whole page between scoring individual trucks and scoring crews. Flip to Crew to see how each team is doing instead of each vehicle.' },
    { sel:'.lb-period-btn.active', title:'Time period selector', body:'Choose the window the scores cover — Today, Week, Month, Quarter, Year, or Custom. Everything below recalculates for the period you pick.' },
    { sel:'#lb-winner-banner', title:'Top performer banner', body:'Highlights the safest driver or crew for the period, with their average safety score, kilometres driven, and number of events.' },
    { sel:'#lb-stat-cards', title:'Summary stat cards', body:'Fleet-wide totals: average safety score, total events, how many had a clean record, total distance, and total drive time.' },
    { sel:'#lb-charts-row', title:'Safety & events charts', body:'The left chart tracks how each truck safety score has moved over time; the right breaks down incidents (hard braking, speeding) by type.' },
    { sel:'#lb-extra-charts-row', title:'Efficiency charts', body:'Idle time versus actual drive time, and total kilometres driven per truck — useful for spotting wasted fuel and uneven workloads.' },
    { sel:'#lb-improvement-section', title:'Improvement Tracker', body:'Compares the first half of the period against the second half to show whether each driver is getting safer or sliding.' },
    { sel:'#page-leaderboard', title:'Rankings list', body:'The main scoreboard — every truck or crew ranked by safety score, top three with medals, each row expandable to see event counts.' }
  ]},
  { view:'utilization', label:'Bin Utilization', icon:'📉', section:'Admin', restricted:true, summary:'How hard your bins are working.', steps:[
    { sel:'#util-reco-top', title:'Recommendation banner', body:'The headline verdict — like Healthy utilization or Low utilization, consider promotions — based on how busy the fleet is. Read this first.' },
    { sel:'#utm-util', title:'Overall Utilization', body:'What share of your fleet available days were actually rented over the last 90 days. Higher means your bins are out earning instead of sitting in the yard.' },
    { sel:'#util-metrics .metric-box:last-child', title:'Fleet deployment', body:'A live snapshot of right now: how many bins are out on jobs, how many are back in the yard, and your total fleet, with a percentage-deployed bar.' },
    { sel:'#util-by-size', title:'Utilization by size', body:'A bar chart of what percent of the time each size (4, 7, 14, 20 yard) is rented. Tells you which sizes are workhorses and which are underused.' },
    { sel:'#util-by-city', title:'Utilization by city', body:'Ranks the cities where your bins spend the most rented days, so you can see where demand is strongest.' },
    { sel:'#util-idle', title:'Idle vs Active', body:'Lists any bin sizes not rented in 30 days, with a count of idle bins, so you can act on dead inventory.' },
    { sel:'#util-summary', title:'Fleet Planning Summary', body:'The full breakdown: the bin-days math, a per-size scorecard, plus your highest-utilization size and average rental length.' }
  ]},
  { view:'advisor', label:'AI Advisor', icon:'💡', section:'Admin', restricted:true, summary:'Actionable ideas to grow the business.', steps:[
    { sel:'#advisor-run-btn', title:'Run / Refresh Analysis', body:'Kicks off the analysis by pulling the latest job, fleet and customer data and rebuilding the recommendations. It also runs automatically the first time you open the page.' },
    { sel:'#advisor-snapshot', title:'Business snapshot', body:'A row of headline numbers: total jobs, year-over-year growth, repeat customer rate, average days between visits, fleet size, and 14-yard demand share.' },
    { sel:'#advisor-filter', title:'Filter chips', body:'Filter the recommendations by type: All, Urgent, Opportunities, and Good news, each with a count so you can jump straight to what needs attention.' },
    { sel:'#advisor-cards', title:'Recommendation cards', body:'A prioritized stack of advice cards. Each has a title, a priority tag, a plain-English explanation, and a concrete Next step to take.' },
    { sel:'#advisor-showall', title:'Show all', body:'The list shows the top 8 by default; this button expands it to reveal every recommendation that matches the current filter.' }
  ]}
];

// Task guides that open the real New Job form and walk it field-by-field, one per
// pickable service type. Played via _startJobGuide (opens the form + sets the service,
// then spotlights the fields). The full page tour does NOT include these.
var JOB_GUIDES = [
  { id:'job-bin', label:'Create a bin rental', icon:'🚛', service:'Bin Rental', steps:[
    { sel:'#f-svc-picker', title:'Pick the service', body:'Open New Job, then choose Bin Rental here — the rest of the form changes to match.' },
    { sel:'#f-client-search', title:'Existing customer?', body:'If they have booked before, search their name or phone here and pick them to autofill all their saved details.' },
    { sel:'#f-names-wrap', title:'New customer', body:"Otherwise type the customer's name here, adding phone and email rows as needed." },
    { sel:'#f-addr', title:'Address', body:'Enter the drop-off address and city — this is where the bin goes, and it pins on the Bin Map.' },
    { sel:'#bin-extra', title:'Bin, dates & price', body:'Pick the bin size, set the drop-off and pickup dates (or mark it Will Call), and assign a specific bin. The price fills in from your rates.' },
    { sel:'#f-notes', title:'Notes', body:'Add any access notes or special instructions for the driver.' },
    { sel:'#save-btn', title:'Save the job', body:"Save and it lands on today's board, the calendar, and the bin fleet." }
  ]},
  { id:'job-junk', label:'Create a junk removal', icon:'🗑️', service:'Junk Removal', steps:[
    { sel:'#f-svc-picker', title:'Pick the service', body:'Open New Job and choose Junk Removal.' },
    { sel:'#f-client-search', title:'Existing customer?', body:'If they have booked before, search their name or phone here and pick them to autofill their details.' },
    { sel:'#f-names-wrap', title:'New customer', body:"Otherwise type the customer's name, phone and email here." },
    { sel:'#f-addr', title:'Address', body:'Enter the job address and city.' },
    { sel:'#junk-schedule-wrap', title:'Job date & time', body:'Set when the crew is booked to do the haul.' },
    { sel:'#items-wrap', title:'What you are hauling', body:'List the items or load so the crew knows what to expect and how big the job is.' },
    { sel:'#junk-removal-pricing-wrap', title:'Price', body:'Enter the quoted and actual price for the removal.' },
    { sel:'#save-btn', title:'Save the job', body:'Save and it shows on the board and the calendar.' }
  ]},
  { id:'job-quote', label:'Create a junk quote', icon:'📋', service:'Junk Quote', steps:[
    { sel:'#f-svc-picker', title:'Pick the service', body:'Open New Job and choose Junk Quote — for when a customer wants an on-site estimate before booking.' },
    { sel:'#f-client-search', title:'Existing customer?', body:'If they have booked before, search their name or phone here and pick them to autofill their details.' },
    { sel:'#f-names-wrap', title:'New customer', body:"Otherwise type the customer's name and contact details here." },
    { sel:'#f-addr', title:'Address', body:'Enter where the quote visit happens.' },
    { sel:'#junk-schedule-wrap', title:'Quote date & time', body:'Set when someone goes out to look at the job.' },
    { sel:'#quote-amount-wrap', title:'Quote amount', body:'Record the estimate you gave so it is ready if they book.' },
    { sel:'#save-btn', title:'Save the quote', body:'Save and it is tracked under Quotes on the All Jobs page.' }
  ]},
  { id:'job-furn', label:'Create a furniture pickup', icon:'🛋️', service:'Furniture Pickup', steps:[
    { sel:'#f-svc-picker', title:'Pick the service', body:'Open New Job and choose Furniture Pickup.' },
    { sel:'#f-client-search', title:'Existing customer?', body:'If they have booked before, search their name or phone here and pick them to autofill their details.' },
    { sel:'#f-names-wrap', title:'New customer', body:"Otherwise type the customer's name and contact details here." },
    { sel:'#f-addr', title:'Address', body:'Enter the pickup address and city.' },
    { sel:'#fb-schedule-wrap', title:'Pickup date & time', body:'Set when the crew collects the furniture.' },
    { sel:'#items-wrap', title:'Items', body:'List the pieces being picked up and their condition.' },
    { sel:'#drd-inline-wrap', title:'Donate / dispose', body:'Work out what gets donated versus dumped, and the disposal cost.' },
    { sel:'#save-btn', title:'Save the job', body:'Save and it lands on the board and the calendar.' }
  ]},
  { id:'job-land', label:'Create an extra job', icon:'🌿', service:'Extra Jobs', steps:[
    { sel:'#f-svc-picker', title:'Pick the service', body:'Open New Job and choose Extra Jobs.' },
    { sel:'#f-client-search', title:'Existing customer?', body:'If they have booked before, search their name or phone here and pick them to autofill their details.' },
    { sel:'#f-names-wrap', title:'New customer', body:"Otherwise type the customer's name and contact details here." },
    { sel:'#f-addr', title:'Address', body:'Enter the job address and city.' },
    { sel:'#junk-schedule-wrap', title:'Job date', body:'Set the job date — or tick the no-date-yet box to keep it as a possible job until scheduled.' },
    { sel:'#items-wrap', title:'Work & materials', body:'Note the work to be done and any materials needed.' },
    { sel:'#save-btn', title:'Save the job', body:'Save and it shows on the board and the calendar.' }
  ]}
];

var _helpSection = 'All';
var _helpQuery = '';
var _seq = [];
var _seqI = 0;
var _seqView = null;
var _seqDir = 1;
var _ringRect = null;

function helpSections(){
  var order = ['Create a job','Daily','More tools','Operations','Bins','Quotes & Pricing','Admin'];
  var present = {};
  if(JOB_GUIDES.length) present['Create a job'] = 1;
  accessiblePages().forEach(function(p){ present[p.section] = 1; });
  return ['All'].concat(order.filter(function(s){ return present[s]; }));
}

function accessiblePages(){
  var allowed = (typeof canAccessAnalytics==='function') && canAccessAnalytics();
  return PAGE_TOURS.filter(function(p){ return !p.restricted || allowed; });
}

function openHelp(){
  _helpSection = 'All';
  _helpQuery = '';
  var s = document.getElementById('hm-search'); if(s) s.value = '';
  renderHelpChips();
  renderHelpGrid();
  openM('help-modal');
}

function renderHelpChips(){
  var host = document.getElementById('hm-chips'); if(!host) return;
  host.innerHTML = helpSections().map(function(c,i){
    return '<button class="hm-chip'+(c===_helpSection?' active':'')+'" onclick="setHelpSectionIdx('+i+')">'+_helpEsc(c)+'</button>';
  }).join('');
}

function setHelpSectionIdx(i){ _helpSection = helpSections()[i]; renderHelpChips(); renderHelpGrid(); }

function onHelpSearch(v){ _helpQuery = (v||'').trim().toLowerCase(); renderHelpGrid(); }

function _helpTile(onclick, icon, label, count){
  return '<button class="hm-tile" onclick="'+onclick+'">'+
    '<div class="hm-thumb">'+icon+'</div>'+
    '<div class="hm-tile-body"><h4>'+_helpEsc(label)+'</h4>'+
    '<div class="hm-tile-meta"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>'+count+' steps</div></div>'+
    '</button>';
}

function renderHelpGrid(){
  var grid = document.getElementById('hm-grid'); if(!grid) return;
  var pages = accessiblePages();
  if(_helpQuery){
    var results = [];
    JOB_GUIDES.forEach(function(g,ji){
      g.steps.forEach(function(st,si){
        var hay = (g.label+' '+st.title+' '+st.body).toLowerCase();
        if(hay.indexOf(_helpQuery)!==-1) results.push({job:true, idx:ji, si:si, icon:g.icon, title:st.title, label:g.label});
      });
    });
    pages.forEach(function(p,pi){
      p.steps.forEach(function(st,si){
        var hay = (p.label+' '+st.title+' '+st.body).toLowerCase();
        if(hay.indexOf(_helpQuery)!==-1) results.push({job:false, idx:pi, si:si, icon:p.icon, title:st.title, label:p.label});
      });
    });
    document.getElementById('hm-chips').style.display = 'none';
    if(!results.length){ grid.className='hm-results'; grid.innerHTML = '<div class="hm-empty">No matches. Try another word.</div>'; return; }
    grid.className = 'hm-results';
    grid.innerHTML = results.slice(0,40).map(function(r){
      var oc = r.job ? ('playFromJobResult('+r.idx+','+r.si+')') : ('playFromResult('+r.idx+','+r.si+')');
      return '<button class="hm-result" onclick="'+oc+'">'+
        '<span class="hm-result-ico">'+r.icon+'</span>'+
        '<span class="hm-result-txt"><span class="hm-result-title">'+_helpEsc(r.title)+'</span>'+
        '<span class="hm-result-page">'+_helpEsc(r.label)+'</span></span>'+
        '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>'+
        '</button>';
    }).join('');
    return;
  }
  document.getElementById('hm-chips').style.display = '';
  grid.className = 'hm-grid';
  var html = '';
  if(_helpSection==='All' || _helpSection==='Create a job'){
    JOB_GUIDES.forEach(function(g,ji){ html += _helpTile('playJobGuide('+ji+')', g.icon, g.label, g.steps.length); });
  }
  if(_helpSection!=='Create a job'){
    pages.filter(function(p){ return _helpSection==='All' || p.section===_helpSection; }).forEach(function(p){
      html += _helpTile('playPageIdx('+PAGE_TOURS.indexOf(p)+')', p.icon, p.label, p.steps.length);
    });
  }
  grid.innerHTML = html;
}

function _stepsFor(p){
  return p.steps.map(function(s){ return { view:p.view, sel:s.sel, title:s.title, body:s.body }; });
}

function playPageIdx(gi){
  var p = PAGE_TOURS[gi]; if(!p) return;
  closeM('help-modal');
  var steps = _stepsFor(p);
  setTimeout(function(){ playSequence(steps, 0); }, 200);
}

function playFromResult(pi, si){
  var p = accessiblePages()[pi]; if(!p) return;
  closeM('help-modal');
  var steps = _stepsFor(p);
  setTimeout(function(){ playSequence(steps, si); }, 200);
}

// Job guides open the real New Job form, set the service, then spotlight its fields.
// Steps carry no view (view:null) so the engine never navigates away from the form.
function _startJobGuide(g, startIdx){
  if(typeof newJob === 'function') newJob();
  if(typeof setFormSvc === 'function') setFormSvc(g.service);
  var steps = g.steps.map(function(s){ return { view:null, sel:s.sel, title:s.title, body:s.body }; });
  setTimeout(function(){ playSequence(steps, startIdx || 0); }, 240);
}

function playJobGuide(ji){
  var g = JOB_GUIDES[ji]; if(!g) return;
  closeM('help-modal');
  setTimeout(function(){ _startJobGuide(g, 0); }, 220);
}

function playFromJobResult(ji, si){
  var g = JOB_GUIDES[ji]; if(!g) return;
  closeM('help-modal');
  setTimeout(function(){ _startJobGuide(g, si); }, 220);
}

function playFullTour(){
  closeM('help-modal');
  var steps = [];
  accessiblePages().forEach(function(p){ steps = steps.concat(_stepsFor(p)); });
  steps.push({ view:null, sel:'#help-fab', title:'Help is always here', body:"That's the whole tour. Tap this button any time to reopen the guides, replay any page, or search for how to do something." });
  setTimeout(function(){ playSequence(steps, 0); }, 200);
}

function playSequence(steps, startIdx){
  if(!steps || !steps.length) return;
  _seq = steps;
  _seqI = startIdx || 0;
  _seqView = null;
  _seqDir = 1;
  document.getElementById('tour-overlay').classList.add('open');
  renderSeqStep();
}

function renderSeqStep(){
  if(_seqI < 0){ _seqI = 0; }
  if(_seqI >= _seq.length){ endTour(); return; }
  var step = _seq[_seqI];
  if(step.view && step.view !== _seqView){
    _seqView = step.view;
    if(typeof go === 'function') go(step.view);
    setTimeout(function(){ anchorSeqStep(true); }, 150);
  } else {
    anchorSeqStep(false);
  }
}

// justNavigated: we just switched views, so the DOM may need one more frame to render
// the target — allow a single retry. On the same page a missing element is genuinely
// absent (an empty-data step), so skip it immediately; otherwise the tooltip would sit
// frozen on the previous step while the index advances underneath.
function anchorSeqStep(justNavigated){
  var step = _seq[_seqI];
  var el = step.sel ? document.querySelector(step.sel) : null;
  if(!el){
    if(justNavigated){ setTimeout(function(){ anchorSeqStep(false); }, 220); return; }
    _skipMissing(); return;
  }
  if(el.scrollIntoView){
    // Tall targets align to the top so the highlight starts where the content does.
    var pre = el.getBoundingClientRect();
    el.scrollIntoView({ block: (pre.height > window.innerHeight*0.7 ? 'start' : 'center'), inline:'nearest' });
  }
  // getBoundingClientRect() forces synchronous layout, so no requestAnimationFrame is
  // needed — and not depending on a frame firing keeps the tour working even when the
  // browser throttles rAF (background tab, heavy page).
  var r = el.getBoundingClientRect();
  if(r.width === 0 && r.height === 0){
    if(justNavigated){ setTimeout(function(){ anchorSeqStep(false); }, 220); return; }
    _skipMissing(); return;
  }
  _placeRing(r);
  _placeTip();
  _updateChrome();
}

function _skipMissing(){
  if(_seqDir < 0){ if(_seqI > 0){ _seqI--; renderSeqStep(); } else { endTour(); } }
  else { if(_seqI < _seq.length-1){ _seqI++; renderSeqStep(); } else { endTour(); } }
}

// Position the highlight ring. For very tall targets the ring is capped so a strip of
// dimmed screen stays free below it for the tooltip — otherwise a full-height element
// fills the viewport, nothing is dimmed, and the tooltip (and its Next button) get lost.
function _placeRing(r){
  var pad = 6, m = 8;
  var vh = window.innerHeight, vw = window.innerWidth;
  var top = Math.max(m, r.top - pad);
  var left = Math.max(m, r.left - pad);
  var h = Math.min(r.height + pad*2, vh - top - m);
  var w = Math.min(r.width + pad*2, vw - left - m);
  var maxH = vh - 160 - top;
  if(maxH > 110 && h > maxH) h = maxH;
  var ring = document.getElementById('tour-ring');
  ring.style.top = top+'px';
  ring.style.left = left+'px';
  ring.style.width = w+'px';
  ring.style.height = h+'px';
  _ringRect = { top:top, left:left, width:w, height:h, right:left+w, bottom:top+h };
}

// Position the tooltip relative to the (possibly capped) ring: right, else left, else
// below, else above, else pinned bottom-right — always fully on screen.
function _placeTip(){
  var tip = document.getElementById('tour-tip');
  var tw = tip.offsetWidth || 300;
  var th = tip.offsetHeight || 170;
  var gap = 12, m = 10;
  var vw = window.innerWidth, vh = window.innerHeight;
  var r = _ringRect || { top:0, left:0, right:0, bottom:0 };
  var left, top;
  if(r.right + gap + tw <= vw - m){ left = r.right + gap; top = r.top; }
  else if(r.left - gap - tw >= m){ left = r.left - gap - tw; top = r.top; }
  else if(r.bottom + gap + th <= vh - m){ left = Math.min(Math.max(m, r.left), vw - tw - m); top = r.bottom + gap; }
  else if(r.top - gap - th >= m){ left = Math.min(Math.max(m, r.left), vw - tw - m); top = r.top - gap - th; }
  else { left = vw - tw - m; top = vh - th - m; }
  if(top + th > vh - m) top = vh - th - m;
  if(top < m) top = m;
  if(left + tw > vw - m) left = vw - tw - m;
  if(left < m) left = m;
  tip.style.left = left+'px';
  tip.style.top = top+'px';
}

function _updateChrome(){
  var step = _seq[_seqI];
  document.getElementById('tour-n').textContent = _seqI+1;
  document.getElementById('tour-tot').textContent = _seq.length;
  document.getElementById('tour-title').textContent = step.title;
  document.getElementById('tour-body').textContent = step.body;
  document.getElementById('tour-back').style.visibility = _seqI===0 ? 'hidden' : 'visible';
  document.getElementById('tour-next').textContent = _seqI===_seq.length-1 ? 'Done' : 'Next';
  var fill = document.getElementById('tour-prog-fill');
  if(fill) fill.style.width = Math.round((_seqI+1)/_seq.length*100)+'%';
}

function tourNext(){ _seqDir = 1; if(_seqI < _seq.length-1){ _seqI++; renderSeqStep(); } else { endTour(); } }
function tourPrev(){ _seqDir = -1; if(_seqI > 0){ _seqI--; renderSeqStep(); } }
function endTour(){ var o = document.getElementById('tour-overlay'); if(o) o.classList.remove('open'); }

function _repositionTour(){
  var step = _seq[_seqI]; if(!step) return;
  var el = step.sel ? document.querySelector(step.sel) : null; if(!el) return;
  var r = el.getBoundingClientRect();
  if(r.width || r.height){ _placeRing(r); _placeTip(); }
}

document.addEventListener('keydown', function(e){
  if(e.key === 'Escape'){
    var o = document.getElementById('tour-overlay');
    if(o && o.classList.contains('open')) endTour();
  }
});
window.addEventListener('resize', function(){
  var o = document.getElementById('tour-overlay');
  if(o && o.classList.contains('open')) _repositionTour();
});
