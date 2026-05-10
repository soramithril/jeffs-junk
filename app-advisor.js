// ─── AI ADVISOR ───
// Depends on app.js globals: db, toast, jobs, etc.
// Loaded via its own script tag before app.js.

// ─── AI ADVISOR ───────────────────────────────────────────────────
var _advisorHasRun = false;
function renderAdvisor(){
  if(!_advisorHasRun){ _advisorHasRun=true; runAdvisor(); }
}
function advisorShowState(state){
  ['idle','loading','results','error'].forEach(function(s){
    var el=document.getElementById('advisor-'+s);
    if(el) el.style.display=(s===state)?'block':'none';
  });
}
function advisorProgress(pct,msg){
  var bar=document.getElementById('advisor-progress-bar');
  var lbl=document.getElementById('advisor-loading-msg');
  if(bar) bar.style.width=pct+'%';
  if(lbl&&msg) lbl.textContent=msg;
}
async function runAdvisor(){
  advisorShowState('loading');
  advisorProgress(10,'Connecting to database...');
  try{
    advisorProgress(30,'Pulling business data...');
    var rpcRes = await db.rpc('get_advisor_data');
    if(rpcRes.error) throw new Error('DB error: '+rpcRes.error.message);
    var d = rpcRes.data;

    advisorProgress(60,'Crunching numbers...');

    var monthly = d.monthly || [];
    var yoy = d.yoy || [];
    var cities = d.cities || [];
    var binDemand = d.bin_demand || [];
    var binDuration = d.bin_duration || [];
    var fleet = d.fleet || [];
    var repeat = d.repeat || {};
    var totalJobs = d.total_jobs || 0;
    var yoyGrowth = d.yoy_growth || {};
    var thisMonth = d.this_month || {};
    var topCustomers = d.top_customers || [];
    var lapsedCustomers = d.lapsed_customers || [];
    var cancellations = d.cancellations || {};
    var confirmation = d.confirmation || {};
    var newCustMonthly = d.new_customers_monthly || [];
    var serviceMix = d.service_mix || [];
    var quoteConversion = d.quote_conversion || {};
    var dayOfWeek = d.day_of_week || [];
    var leadTime = d.lead_time || {};
    var peakDays = d.peak_days || [];
    var overdueBins = d.overdue_bins || {};
    var commercial = d.commercial || {};
    var binSwaps = d.bin_swaps || {};
    var quarterly = d.quarterly || [];
    var cityGrowth = d.city_growth || [];

    var yoyPct = yoyGrowth.prev12 ? Math.round((yoyGrowth.last12 - yoyGrowth.prev12) / yoyGrowth.prev12 * 100) : 0;
    var repeatRate = repeat.total_clients ? Math.round(repeat.repeat_clients / repeat.total_clients * 100) : 0;
    var avgGap = repeat.avg_gap_days || 0;

    var totalDemand = binDemand.reduce(function(a,b){return a+b.rentals;},0) || 1;
    var demandMap = {};
    binDemand.forEach(function(b){ demandMap[b.bin_size] = b.rentals; });

    var durMap = {};
    binDuration.forEach(function(b){ durMap[b.bin_size] = b.avg_days; });

    var fleetMap = {};
    fleet.forEach(function(f){ fleetMap[f.size] = f; });

    var mNames = ['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    var avgByMo = {};
    yoy.forEach(function(row){
      avgByMo[row.mo] = Math.round(((row.y2023||0)+(row.y2024||0)+(row.y2025||0))/3);
    });
    var curMo = new Date().getMonth()+1;
    var nextMo = curMo===12?1:curMo+1;
    var nextMonthAvg = avgByMo[nextMo]||0;
    var curMonthAvg = avgByMo[curMo]||0;
    var slowMonths = Object.keys(avgByMo).map(Number).filter(function(m){return avgByMo[m]<110;}).sort(function(a,b){return avgByMo[a]-avgByMo[b];});
    var peakMonths = Object.keys(avgByMo).map(Number).filter(function(m){return avgByMo[m]>230;}).sort(function(a,b){return avgByMo[b]-avgByMo[a];});

    var curCount = thisMonth.current || 0;
    var lastYearCount = thisMonth.last_year || 0;
    var monthVsLY = lastYearCount ? Math.round((curCount - lastYearCount) / lastYearCount * 100) : 0;

    var junkOpCities = cities.filter(function(c){
      return c.total >= 30 && c.bin > 20 && c.city !== 'Barrie' && (c.junk/c.total) < 0.10;
    }).slice(0,4);
    var growthCities = cities.filter(function(c){
      return c.total >= 50 && c.city !== 'Barrie' && c.city !== 'Innisfil';
    }).slice(0,5);

    var f14 = fleetMap['14 yard'] || {};
    var f20 = fleetMap['20 yard'] || {};
    var demand14pct = Math.round((demandMap['14 yard']||0)/totalDemand*100);
    var demand20pct = Math.round((demandMap['20 yard']||0)/totalDemand*100);
    var dur20 = durMap['20 yard'] || 0;
    var dur14 = durMap['14 yard'] || 0;

    advisorProgress(80,'Building recommendations...');

    var recs = [];

    // YoY growth/decline
    if(yoyPct >= 10){
      recs.push({category:'OPERATIONS',priority:'LOW',status:'positive',
        title:'Business Growing '+yoyPct+'% Year Over Year',
        detail:'Job volume is up '+yoyPct+'% compared to the prior 12 months ('+yoyGrowth.last12+' vs '+yoyGrowth.prev12+' jobs). Growth is being driven primarily by bin rentals. The business is in a healthy expansion phase.',
        action:'Document what\'s working — referral sources, pricing, service areas — so you can double down on the highest-ROI growth drivers.'
      });
    } else if(yoyPct <= -10){
      recs.push({category:'MARKETING',priority:'HIGH',status:'urgent',
        title:'Volume Down '+Math.abs(yoyPct)+'% — Action Needed',
        detail:'Job volume has declined '+Math.abs(yoyPct)+'% year over year ('+yoyGrowth.last12+' vs '+yoyGrowth.prev12+' jobs). This warrants reviewing pricing, marketing spend, and competitor activity in core markets.',
        action:'Survey recent customers on how they found you and whether they considered competitors — identify where leads are being lost.'
      });
    }

    // This month vs last year (pro-rated by day of month)
    if(curCount > 0 && lastYearCount > 0){
      var today = new Date();
      var dayOfMonth = today.getDate();
      var daysInMonth = new Date(today.getFullYear(), today.getMonth()+1, 0).getDate();
      var proRatedTarget = Math.round(lastYearCount * dayOfMonth / daysInMonth);
      var proRatedPct = proRatedTarget ? Math.round((curCount - proRatedTarget) / proRatedTarget * 100) : 0;
      var projectedTotal = dayOfMonth > 0 ? Math.round(curCount / dayOfMonth * daysInMonth) : 0;
      var remainingDays = daysInMonth - dayOfMonth;
      var neededPerDay = remainingDays > 0 ? Math.round((lastYearCount - curCount) / remainingDays * 10) / 10 : 0;
      if(proRatedPct <= -20){
        recs.push({category:'MARKETING',priority:'HIGH',status:'urgent',
          title:mNames[curMo]+' Tracking Behind Last Year\'s Pace',
          detail:'Through '+mNames[curMo]+' '+dayOfMonth+': '+curCount+' jobs vs ~'+proRatedTarget+' at this point last year ('+lastYearCount+' total). At current pace you\'d finish with ~'+projectedTotal+' jobs. To match last year you need ~'+neededPerDay+' jobs/day for the remaining '+remainingDays+' days.',
          action:'Push a promotional offer or targeted social media post this week to accelerate bookings for the rest of the month.'
        });
      } else if(proRatedPct >= 20){
        recs.push({category:'OPERATIONS',priority:'MEDIUM',status:'positive',
          title:mNames[curMo]+' Running Ahead of Last Year\'s Pace',
          detail:'Through '+mNames[curMo]+' '+dayOfMonth+': '+curCount+' jobs vs ~'+proRatedTarget+' at this point last year ('+lastYearCount+' total). On pace for ~'+projectedTotal+' jobs this month.',
          action:'Confirm all crew schedules and verify bin inventory levels are adequate for the rest of the month.'
        });
      }
    }

    // Upcoming slow/peak month
    if(nextMonthAvg < 110){
      recs.push({category:'SEASONAL',priority:'MEDIUM',status:'urgent',
        title:'Slow Month Ahead — Plan Now',
        detail:mNames[nextMo]+' historically averages only '+nextMonthAvg+' jobs/month based on 3 years of data. Slowest months: '+slowMonths.slice(0,3).map(function(m){return mNames[m]+' (avg '+avgByMo[m]+'/mo)';}).join(', ')+'.',
        action:'Prepare a targeted email to past customers and consider a limited-time discount to fill the calendar for '+mNames[nextMo]+'.'
      });
    } else if(nextMonthAvg > 230){
      recs.push({category:'SEASONAL',priority:'HIGH',status:'opportunity',
        title:'Peak Season Approaching — Staff Up',
        detail:mNames[nextMo]+' historically averages '+nextMonthAvg+' jobs/month — one of your busiest periods. Peak months: '+peakMonths.slice(0,3).map(function(m){return mNames[m]+' (avg '+avgByMo[m]+'/mo)';}).join(', ')+'. Demand spikes 3x vs slow months.',
        action:'Confirm bin inventory is fully serviced and crewed — book any part-time help now before peak demand hits.'
      });
    }

    // 20yd duration insight — longer rentals = more daily revenue + free advertising on-site
    if(dur20 >= 8){
      recs.push({category:'FLEET',priority:'LOW',status:'positive',
        title:'20 Yard Bins Averaging '+dur20+' Day Rentals',
        detail:'20 yard bins average '+dur20+' days per rental vs '+dur14+' days for 14 yard. Longer rentals mean more daily revenue per job and every bin on-site is a free billboard for your business. Since your fleet isn\'t maxed out, this is pure upside.',
        action:'Keep encouraging longer rentals — consider promoting 2-week packages for renovation projects. Every extra day is revenue plus free advertising in the neighbourhood.'
      });
    } else if(dur20 > 0 && dur20 < 5){
      recs.push({category:'FLEET',priority:'MEDIUM',status:'opportunity',
        title:'20 Yard Bins Coming Back Fast ('+dur20+' days avg)',
        detail:'20 yard bins average only '+dur20+' days. Quick returns mean less daily revenue per job and less time for neighbours to see your brand on-site. Since your fleet has spare capacity, longer rentals would be pure profit.',
        action:'Consider messaging that encourages customers to keep bins longer — "no rush to return" or bundled weekly rates. Every extra day on-site is revenue plus free advertising.'
      });
    }

    // 14yd dominance
    if(demand14pct >= 75){
      recs.push({category:'FLEET',priority:'MEDIUM',status:'opportunity',
        title:'14 Yard Bins Drive '+demand14pct+'% of Rentals',
        detail:'14 yard bins account for '+demand14pct+'% of all bin demand with '+(demandMap['14 yard']||0).toLocaleString()+' total rentals. Your fleet of '+(f14.total||54)+' bins in this size is your most critical asset.',
        action:'Prioritize maintenance and fast turnaround on 14yd bins — any bin sitting unrepaired in the yard is directly costing you bookings.'
      });
    }

    // Junk removal cross-sell
    if(junkOpCities.length >= 2){
      var cityNames = junkOpCities.map(function(c){return c.city+' ('+c.junk+' junk / '+c.total+' total)';}).join(', ');
      recs.push({category:'SERVICE MIX',priority:'MEDIUM',status:'opportunity',
        title:'Junk Removal Untapped in Bin Cities',
        detail:'Several top bin rental markets have very low junk removal penetration: '+cityNames+'. These customers already trust you for bins — they\'re the easiest upsell.',
        action:'When booking bin rentals in these cities, mention junk removal and add it as an add-on option in your booking confirmation.'
      });
    }

    // Repeat rate
    if(repeatRate < 25){
      recs.push({category:'CUSTOMER RETENTION',priority:'HIGH',status:'urgent',
        title:'Only '+repeatRate+'% of Customers Return',
        detail:'Just '+repeatRate+'% of your '+repeat.total_clients.toLocaleString()+' clients have booked more than once. Average time between first and second booking is '+avgGap+' days. Most customers are one-time visits.',
        action:'Set up a follow-up message at '+Math.round(avgGap*0.8)+' days after a job to remind past customers and prompt a second booking.'
      });
    } else if(repeatRate >= 35){
      recs.push({category:'CUSTOMER RETENTION',priority:'LOW',status:'positive',
        title:repeatRate+'% Repeat Rate — Strong Loyalty',
        detail:repeatRate+'% of your '+repeat.total_clients.toLocaleString()+' clients have returned, averaging '+avgGap+' days between visits. This is a strong indicator of satisfaction and word-of-mouth referrals.',
        action:'Ask your highest-frequency customers for a Google review — loyal customers are your best source of new business.'
      });
    } else {
      recs.push({category:'CUSTOMER RETENTION',priority:'MEDIUM',status:'opportunity',
        title:'Grow Your '+repeatRate+'% Repeat Rate',
        detail:repeatRate+'% of clients have returned, averaging '+avgGap+' days between bookings. Each percentage point of repeat rate represents roughly '+(Math.round(repeat.total_clients*0.01))+' additional jobs per year.',
        action:'Add a post-job follow-up at '+Math.round(avgGap*0.75)+' days asking if they need the bin picked up or have more junk to remove.'
      });
    }

    // Geographic concentration
    var barrieData = cities.find(function(c){return c.city==='Barrie';});
    if(barrieData){
      var barriePct = Math.round(barrieData.total / totalJobs * 100);
      if(barriePct >= 50){
        recs.push({category:'CITY TARGETING',priority:'MEDIUM',status:'opportunity',
          title:'Barrie Is '+barriePct+'% of All Jobs',
          detail:'Barrie accounts for '+barrieData.total.toLocaleString()+' of '+totalJobs.toLocaleString()+' total jobs. Heavy concentration means any local downturn impacts the whole business. Markets like '+growthCities.slice(0,3).map(function(c){return c.city+' ('+c.total+' jobs)';}).join(', ')+' show real growth potential.',
          action:'Allocate a small marketing budget specifically to Innisfil, Wasaga Beach, and Angus to grow these secondary markets.'
        });
      }
    }

    // ── Additional deeper insights ──────────────────────────────

    // Busiest day of week insight
    var dayCount=[0,0,0,0,0,0,0];
    var dayNames=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    jobs.forEach(function(j){if(j.date&&j.status!=='Cancelled'){var d=new Date(j.date+'T12:00:00').getDay();dayCount[d]++;}});
    var busiestDay=dayCount.indexOf(Math.max.apply(null,dayCount));
    var slowestDay=dayCount.indexOf(Math.min.apply(null,dayCount));
    if(dayCount[busiestDay]>50){
      recs.push({category:'OPERATIONS',priority:'LOW',status:'positive',
        title:dayNames[busiestDay]+' Is Your Busiest Day ('+dayCount[busiestDay]+' jobs total)',
        detail:'Job distribution by day: '+dayNames.map(function(d,i){return d.substring(0,3)+': '+dayCount[i];}).join(', ')+'. '+dayNames[slowestDay]+' is the slowest with '+dayCount[slowestDay]+' jobs.',
        action:'Run promotions specifically for '+dayNames[slowestDay]+' bookings to even out your workload. Offer a small discount for '+dayNames[slowestDay]+' drop-offs/pickups.'
      });
    }

    // Referral source insight
    var refCounts={};
    jobs.forEach(function(j){if(j.referral&&j.status!=='Cancelled'){refCounts[j.referral]=(refCounts[j.referral]||0)+1;}});
    var refEntries=Object.keys(refCounts).map(function(k){return{src:k,count:refCounts[k]};}).sort(function(a,b){return b.count-a.count;});
    if(refEntries.length>=2){
      recs.push({category:'MARKETING',priority:'MEDIUM',status:'opportunity',
        title:'Top Lead Source: '+refEntries[0].src+' ('+refEntries[0].count+' jobs)',
        detail:'Lead sources ranked: '+refEntries.slice(0,5).map(function(e){return e.src+' ('+e.count+')';}).join(', ')+'. Understanding which channels drive bookings helps you allocate marketing spend effectively.',
        action:'Double down on '+refEntries[0].src+' — it\'s your #1 lead source. If '+refEntries[0].src+' is organic (Word of Mouth), consider a referral incentive program to amplify it.'
      });
    }

    // ── NEW: Cancellation rate trend ──────────────────────────
    if(cancellations.last90_total > 0 && cancellations.prev90_total > 0){
      var cancelRate = Math.round(cancellations.last90_cancelled / cancellations.last90_total * 100);
      var prevCancelRate = Math.round(cancellations.prev90_cancelled / cancellations.prev90_total * 100);
      if(cancelRate >= 8){
        recs.push({category:'OPERATIONS',priority:'HIGH',status:'urgent',
          title:cancelRate+'% Cancellation Rate (Last 90 Days)',
          detail:cancellations.last90_cancelled+' of '+cancellations.last90_total+' jobs cancelled in the last 90 days ('+cancelRate+'%), vs '+prevCancelRate+'% the prior 90 days. High cancellation rates hurt scheduling efficiency and crew morale.',
          action:'Review cancelled jobs for patterns — are specific services, areas, or days more prone to cancellations? Consider a deposit policy or confirmation call 48 hours before the job.'
        });
      } else if(cancelRate > prevCancelRate + 3){
        recs.push({category:'OPERATIONS',priority:'MEDIUM',status:'urgent',
          title:'Cancellations Trending Up: '+cancelRate+'% vs '+prevCancelRate+'%',
          detail:'Cancellation rate rose from '+prevCancelRate+'% to '+cancelRate+'% over the last quarter. Even small increases compound into lost revenue and wasted scheduling slots.',
          action:'Introduce a confirmation text/call 24-48 hours before the scheduled date. This reduces no-shows by 30-50% industry-wide.'
        });
      }
    }

    // ── NEW: Confirmation rate ─────────────────────────────────
    if(confirmation.total > 0){
      var cfmRate = Math.round(confirmation.confirmed / confirmation.total * 100);
      if(cfmRate < 50){
        recs.push({category:'OPERATIONS',priority:'HIGH',status:'urgent',
          title:'Only '+cfmRate+'% of Recent Jobs Confirmed',
          detail:'Of '+confirmation.total+' bin/furniture jobs in the last 90 days, only '+confirmation.confirmed+' are confirmed ('+cfmRate+'%). Unconfirmed jobs create day-of surprises — wrong address, no access, customer not home.',
          action:'Set a goal of 80%+ confirmation rate. Call or text customers 2-3 days before their scheduled date. Unconfirmed jobs the night before should get a priority morning call.'
        });
      } else if(cfmRate < 75){
        recs.push({category:'OPERATIONS',priority:'MEDIUM',status:'opportunity',
          title:'Confirmation Rate at '+cfmRate+'% — Room to Improve',
          detail:confirmation.confirmed+' of '+confirmation.total+' recent bin/furniture jobs confirmed. Industry best practice is 85%+. Every unconfirmed job risks a wasted trip or rescheduling.',
          action:'Automate confirmation reminders via text 3 days before the job. A simple "Reply YES to confirm" converts 60-70% of unconfirmed jobs.'
        });
      }
    }

    // ── NEW: Lapsed high-value customers (only recent lapsed — under 2 years) ──
    var recentLapsed = (lapsedCustomers||[]).filter(function(c){return c.days_since <= 730;});
    if(recentLapsed.length >= 3){
      var topLapsed = recentLapsed.slice(0,5);
      var lapsedNames = topLapsed.map(function(c){return c.name+' ('+c.total_jobs+' jobs, last '+Math.round(c.days_since/30)+' months ago)';}).join(', ');
      recs.push({category:'CUSTOMER RETENTION',priority:'MEDIUM',status:'opportunity',
        title:recentLapsed.length+' Repeat Customers Inactive 6-24 Months',
        detail:'These customers booked 3+ times but haven\'t called in a while: '+lapsedNames+'. Some may have moved or no longer need service, but others might just need a reminder you exist.',
        action:'Review the list — if any are worth re-engaging, a quick personal text or call can go a long way. A "We miss you" message with a small incentive converts 15-25% of lapsed customers.'
      });
    }

    // ── NEW: Top customer concentration ──────────────────────
    if(topCustomers.length >= 5 && totalJobs > 100){
      var top5Jobs = topCustomers.slice(0,5).reduce(function(a,c){return a+c.jobs;},0);
      var top5Pct = Math.round(top5Jobs / totalJobs * 100);
      if(top5Pct >= 10){
        recs.push({category:'CUSTOMER RETENTION',priority:'MEDIUM',status:'opportunity',
          title:'Top 5 Customers = '+top5Pct+'% of All Jobs',
          detail:'Your biggest customers: '+topCustomers.slice(0,5).map(function(c){return c.name+' ('+c.jobs+' jobs)';}).join(', ')+'. These VIPs drive a significant share of volume — losing even one would be felt.',
          action:'Give your top 5 customers VIP treatment — priority scheduling, personal check-ins, and first-call access to new services. A loyalty program or annual discount keeps them locked in.'
        });
      } else {
        recs.push({category:'CUSTOMER RETENTION',priority:'LOW',status:'positive',
          title:'Healthy Customer Diversification',
          detail:'Your top 5 customers account for only '+top5Pct+'% of jobs — no single customer dominates. This is a healthy, low-risk customer base.',
          action:'Keep growing your customer base broadly. This diversification protects you from losing any single client.'
        });
      }
    }

    // ── NEW: Quote-to-job conversion ─────────────────────────
    if(quoteConversion.quotes_total > 10 && quoteConversion.junk_total > 10){
      var convRatio = (quoteConversion.junk_total / (quoteConversion.quotes_total + quoteConversion.junk_total) * 100).toFixed(0);
      var recentRatio = quoteConversion.quotes_last90 > 0 ? (quoteConversion.junk_last90 / (quoteConversion.quotes_last90 + quoteConversion.junk_last90) * 100).toFixed(0) : 0;
      if(convRatio < 50){
        recs.push({category:'SALES',priority:'HIGH',status:'urgent',
          title:'Only '+convRatio+'% of Junk Leads Convert to Jobs',
          detail:'Out of '+(quoteConversion.quotes_total+quoteConversion.junk_total)+' junk enquiries, '+quoteConversion.junk_total+' became actual removals ('+convRatio+'%). Recent 90-day rate: '+recentRatio+'%. Unconverted quotes are lost revenue.',
          action:'Follow up on quotes within 2 hours — leads contacted within that window convert 7x better. Add a follow-up step for quotes that don\'t convert within 48 hours: "Still need that junk gone?"'
        });
      } else {
        recs.push({category:'SALES',priority:'LOW',status:'positive',
          title:'Strong '+convRatio+'% Quote-to-Job Conversion',
          detail:quoteConversion.junk_total+' junk removals from '+(quoteConversion.quotes_total+quoteConversion.junk_total)+' total enquiries. Recent 90-day rate: '+recentRatio+'%. This is solid performance.',
          action:'Document your current quoting process — it\'s working well. Consider raising prices 5-10% on junk removal; high conversion suggests you may be underpriced.'
        });
      }
    }

    // ── NEW: Booking lead time ───────────────────────────────
    if(leadTime.avg_days != null){
      var avgLead = Math.round(leadTime.avg_days);
      var sameDayPct = leadTime.same_day_pct || 0;
      var weekPlusPct = leadTime.week_plus_pct || 0;
      if(sameDayPct >= 30){
        recs.push({category:'OPERATIONS',priority:'MEDIUM',status:'opportunity',
          title:sameDayPct+'% of Jobs Booked Same-Day',
          detail:'Average booking lead time is '+avgLead+' days, but '+sameDayPct+'% of jobs are booked same-day and '+weekPlusPct+'% book a week or more out. High same-day bookings mean you\'re operating reactively — this limits route optimization and crew planning.',
          action:'Offer a small discount (5-10%) for bookings made 3+ days in advance. This shifts demand into your scheduling window and enables better route planning, saving fuel and time.'
        });
      } else if(weekPlusPct >= 60){
        recs.push({category:'OPERATIONS',priority:'LOW',status:'positive',
          title:'Customers Book '+avgLead+' Days Ahead on Average',
          detail:weekPlusPct+'% of jobs are booked a week or more in advance. This gives you excellent visibility for crew scheduling, route planning, and bin logistics.',
          action:'Use this lead time to optimize daily routes by geography — clustering jobs by area can save 1-2 hours of drive time per crew per day.'
        });
      }
    }

    // ── NEW: Peak day capacity planning ──────────────────────
    if(peakDays.length >= 3){
      var peakAvg = Math.round(peakDays.slice(0,5).reduce(function(a,p){return a+p.jobs;},0)/5);
      var busiestEver = peakDays[0];
      recs.push({category:'CAPACITY',priority:'MEDIUM',status:'opportunity',
        title:'Peak Days Hit '+busiestEver.jobs+' Jobs — Plan for Surges',
        detail:'Your 5 busiest days averaged '+peakAvg+' jobs. Busiest single day: '+busiestEver.date+' with '+busiestEver.jobs+' jobs. If a crew handles ~6 jobs/day, you need '+(Math.ceil(peakAvg/6))+' crews on peak days vs maybe '+(Math.ceil(peakAvg/6/2))+' on average days.',
        action:'Build a "surge plan" — identify 1-2 part-time crew members or subcontractors you can call on 48 hours notice for peak days. Having this in your back pocket prevents missed bookings.'
      });
    }

    // ── NEW: Service diversification risk ────────────────────
    if(serviceMix.length >= 2){
      var topService = serviceMix[0];
      if(topService && topService.pct >= 70){
        recs.push({category:'STRATEGY',priority:'MEDIUM',status:'opportunity',
          title:topService.pct+'% of Business Is '+topService.service,
          detail:'Your service mix is heavily weighted toward '+topService.service+' ('+topService.cnt.toLocaleString()+' jobs). Other services: '+serviceMix.slice(1).map(function(s){return s.service+' ('+s.pct+'%)';}).join(', ')+'. High concentration in one service increases risk if that market shifts.',
          action:'Diversify by cross-promoting complementary services. Bin rental customers are prime candidates for junk removal — mention it during drop-off calls. A 5% shift in mix adds resilience.'
        });
      }
    }

    // ── NEW: New customer acquisition trend ──────────────────
    if(newCustMonthly.length >= 6){
      var recent3 = newCustMonthly.slice(-3).reduce(function(a,m){return a+m.new_clients;},0);
      var prev3 = newCustMonthly.slice(-6,-3).reduce(function(a,m){return a+m.new_clients;},0);
      var acqTrend = prev3 > 0 ? Math.round((recent3 - prev3) / prev3 * 100) : 0;
      if(acqTrend <= -20){
        recs.push({category:'MARKETING',priority:'HIGH',status:'urgent',
          title:'New Customer Acquisition Down '+Math.abs(acqTrend)+'%',
          detail:'You acquired '+recent3+' new customers in the last 3 months vs '+prev3+' in the prior 3 months — a '+Math.abs(acqTrend)+'% drop. If this trend continues, it will compress volume within 2-3 quarters.',
          action:'Audit your marketing channels: Is Google Ads spend the same? Are you getting fewer referrals? Check if competitor activity increased in your area. Consider a limited-time promotion to stimulate new bookings.'
        });
      } else if(acqTrend >= 20){
        recs.push({category:'MARKETING',priority:'LOW',status:'positive',
          title:'New Customer Acquisition Up '+acqTrend+'%',
          detail:'You acquired '+recent3+' new customers in the last 3 months vs '+prev3+' prior — a '+acqTrend+'% increase. Your marketing and word-of-mouth are generating strong new business.',
          action:'Capitalize on this momentum — ask new customers how they found you and double down on that channel. This is also the right time to raise prices slightly while demand is strong.'
        });
      }
    }

    // ── NEW: Overdue bins ────────────────────────────────────
    if(overdueBins.count > 0){
      recs.push({category:'FLEET',priority:overdueBins.count>=5?'HIGH':'MEDIUM',status:'urgent',
        title:overdueBins.count+' Bin'+(overdueBins.count!==1?'s':'')+' Overdue (14+ Days Out)',
        detail:overdueBins.count+' bin'+(overdueBins.count!==1?'s are':' is')+' still on-site after 14+ days. Average: '+overdueBins.avg_days_out+' days, longest: '+overdueBins.max_days_out+' days. Every day a bin sits idle is a day it can\'t generate revenue for another customer.',
        action:'Call these customers today to schedule pickup. If they need more time, ensure overage fees are being applied per your rental terms. Each bin returned = potential same-week re-rental.'
      });
    }

    // ── NEW: Day-of-week optimization (exclude Sunday — not a working day) ──
    if(dayOfWeek.length >= 5){
      var dNames=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
      var workDays = dayOfWeek.filter(function(d){return d.dow !== 0;}); // exclude Sunday
      var dowSorted = workDays.slice().sort(function(a,b){return b.cnt-a.cnt;});
      var busiest = dowSorted[0];
      var slowest = dowSorted[dowSorted.length-1];
      var spread = busiest.cnt > 0 ? Math.round((busiest.cnt - slowest.cnt) / busiest.cnt * 100) : 0;
      if(spread >= 40 && slowest.cnt > 0){
        recs.push({category:'SCHEDULING',priority:'MEDIUM',status:'opportunity',
          title:dNames[busiest.dow]+' Has '+Math.round(busiest.cnt/slowest.cnt)+'x More Jobs Than '+dNames[slowest.dow],
          detail:'Job volume by working day: '+workDays.map(function(d){return dNames[d.dow]+': '+d.cnt;}).join(', ')+'. '+dNames[slowest.dow]+' is your slowest working day — '+spread+'% fewer jobs than '+dNames[busiest.dow]+'.',
          action:'Offer a "'+dNames[slowest.dow]+' Special" — a 10% discount or priority booking for your slow day. Evening out your weekly schedule means fewer missed bookings on peak days and less idle time on slow days.'
        });
      }
    }

    // ── NEW: City growth momentum ────────────────────────────
    var growingCities = cityGrowth.filter(function(c){return c.same_period_ly > 0 && c.recent > c.same_period_ly * 1.25;});
    var shrinkingCities = cityGrowth.filter(function(c){return c.same_period_ly > 5 && c.recent < c.same_period_ly * 0.75;});
    if(growingCities.length > 0){
      recs.push({category:'EXPANSION',priority:'MEDIUM',status:'opportunity',
        title:growingCities.length+' Cit'+(growingCities.length!==1?'ies':'y')+' Growing Fast',
        detail:'These areas are trending up (year-over-year, same period): '+growingCities.slice(0,5).map(function(c){
          var pct = Math.round((c.recent - c.same_period_ly)/c.same_period_ly*100);
          return c.city+' (+'+pct+'%, '+c.recent+' recent vs '+c.same_period_ly+' same period last year)';
        }).join(', ')+'. Growth markets deserve investment before competitors notice.',
        action:'Increase visibility in growing markets — local flyers, Google Ads geo-targeting, or partnerships with local contractors and realtors in these areas.'
      });
    }
    if(shrinkingCities.length > 0){
      recs.push({category:'EXPANSION',priority:'MEDIUM',status:'urgent',
        title:shrinkingCities.length+' Cit'+(shrinkingCities.length!==1?'ies':'y')+' Losing Momentum',
        detail:'These areas are slowing (year-over-year, same period): '+shrinkingCities.slice(0,5).map(function(c){
          var pct = Math.round((c.same_period_ly - c.recent)/c.same_period_ly*100);
          return c.city+' (-'+pct+'%, '+c.recent+' recent vs '+c.same_period_ly+' same period last year)';
        }).join(', ')+'. Declining markets may signal competitor entry or market saturation.',
        action:'Investigate: Is a new competitor active in these areas? Has construction/renovation activity slowed? Adjust marketing spend accordingly — don\'t throw money at a declining market without understanding why.'
      });
    }

    // ── NEW: Fleet right-sizing ──────────────────────────────
    if(fleet.length >= 2 && binDemand.length >= 2){
      var totalFleet = fleet.reduce(function(a,f){return a+f.total;},0);
      var fleetMismatches = [];
      fleet.forEach(function(f){
        var fleetPct = Math.round(f.total/totalFleet*100);
        var demandPctVal = Math.round((demandMap[f.size]||0)/totalDemand*100);
        var diff = demandPctVal - fleetPct;
        if(Math.abs(diff) >= 15) fleetMismatches.push({size:f.size,fleetPct:fleetPct,demandPct:demandPctVal,diff:diff});
      });
      if(fleetMismatches.length > 0){
        recs.push({category:'FLEET',priority:'MEDIUM',status:'opportunity',
          title:'Fleet Mix Doesn\'t Match Demand',
          detail:'Demand vs fleet allocation mismatch: '+fleetMismatches.map(function(m){
            return m.size+' ('+m.demandPct+'% demand vs '+m.fleetPct+'% fleet — '+(m.diff>0?'underserved':'over-allocated')+')';
          }).join(', ')+'. When fleet allocation doesn\'t track demand, you either turn away bookings or have idle bins.',
          action:'Gradually shift fleet composition toward demand: sell or retire underutilized sizes and invest in high-demand sizes. Even 2-3 bins reallocated can unlock meaningful revenue.'
        });
      }
    }

    // ── NEW: Quarterly growth trajectory ─────────────────────
    if(quarterly.length >= 4){
      var lastQ = quarterly[quarterly.length-1];
      var prevQ = quarterly[quarterly.length-2];
      var twoQago = quarterly[quarterly.length-3];
      if(prevQ && twoQago){
        var qGrowth1 = prevQ.total > 0 ? Math.round((lastQ.total - prevQ.total)/prevQ.total*100) : 0;
        var qGrowth2 = twoQago.total > 0 ? Math.round((prevQ.total - twoQago.total)/twoQago.total*100) : 0;
        if(qGrowth1 < qGrowth2 - 10 && qGrowth1 < 5){
          recs.push({category:'STRATEGY',priority:'MEDIUM',status:'urgent',
            title:'Growth Decelerating: '+lastQ.quarter+' at '+qGrowth1+'% vs '+qGrowth2+'%',
            detail:'Quarter-over-quarter growth slowed from '+qGrowth2+'% ('+twoQago.quarter+'→'+prevQ.quarter+') to '+qGrowth1+'% ('+prevQ.quarter+'→'+lastQ.quarter+'). Volume: '+lastQ.total+' jobs in '+lastQ.quarter+'. Decelerating growth is an early warning — easier to fix now than after a plateau.',
            action:'This is the time to invest in growth: test a new marketing channel, expand into an adjacent city, or launch a referral program. Small bets now prevent a stall later.'
          });
        } else if(qGrowth1 > qGrowth2 + 10 && qGrowth1 > 10){
          recs.push({category:'STRATEGY',priority:'LOW',status:'positive',
            title:'Growth Accelerating: '+lastQ.quarter+' at +'+qGrowth1+'%',
            detail:'Quarter-over-quarter growth jumped from '+qGrowth2+'% to '+qGrowth1+'%. Volume: '+lastQ.total+' jobs in '+lastQ.quarter+'. Accelerating growth means your recent investments are paying off.',
            action:'Don\'t coast — reinvest in what\'s working. Ensure you have the crew capacity and bin inventory to sustain this trajectory. Growth without capacity = missed bookings.'
          });
        }
      }
    }

    // ── NEW: Bin swap upsell ─────────────────────────────────
    if(binSwaps.jobs_with_swaps > 5){
      var swapPct = Math.round(binSwaps.jobs_with_swaps / binSwaps.total_bin_jobs * 100);
      recs.push({category:'SALES',priority:swapPct>=10?'MEDIUM':'LOW',status:'opportunity',
        title:swapPct+'% of Bin Rentals Involve Swaps',
        detail:binSwaps.jobs_with_swaps+' of '+binSwaps.total_bin_jobs+' bin jobs needed at least one swap (avg '+binSwaps.avg_swaps+' swaps). '+binSwaps.multi_swap+' jobs had 2+ swaps. Customers needing swaps often underestimate their project scope.',
        action:'When booking, ask: "How big is your project? Customers doing X usually need a [larger size]." Proactively upsizing prevents swaps, reduces your trips, and increases customer satisfaction.'
      });
    }

    // Sort: HIGH > MEDIUM > LOW, urgent > opportunity > positive
    var priOrder = {HIGH:0,MEDIUM:1,LOW:2};
    var statOrder = {urgent:0,opportunity:1,positive:2};
    recs.sort(function(a,b){
      var p = priOrder[a.priority] - priOrder[b.priority];
      return p !== 0 ? p : statOrder[a.status] - statOrder[b.status];
    });

    advisorProgress(90,'Rendering...');

    // Snapshot bar
    var snap = document.getElementById('advisor-snapshot');
    if(snap){
      var snapItems = [
        {label:'Total Jobs',val:totalJobs.toLocaleString()},
        {label:'YoY Growth',val:(yoyPct>=0?'+':'')+yoyPct+'%'},
        {label:'Repeat Rate',val:repeatRate+'%'},
        {label:'Avg Days to Return',val:avgGap+' days'},
        {label:'Fleet (14yd)',val:(f14.total||54)+' bins'},
        {label:'14yd Demand',val:demand14pct+'%'}
      ];
      snap.innerHTML = snapItems.map(function(s){
        return '<div style="flex:1;min-width:110px;text-align:center;">'
          +'<div style="font-family:\'Bebas Neue\',sans-serif;font-size:22px;letter-spacing:1px;color:var(--text);">'+s.val+'</div>'
          +'<div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.8px;">'+s.label+'</div>'
          +'</div>';
      }).join('');
    }

    // Recommendation cards
    var cards = document.getElementById('advisor-cards');
    if(cards){
      var statusColors = {urgent:'#dc3545',opportunity:'#e67e22',positive:'#22c55e'};
      var priorityBg = {HIGH:'rgba(220,53,69,.06)',MEDIUM:'rgba(230,126,34,.05)',LOW:'rgba(34,197,94,.05)'};
      var priorityBorder = {HIGH:'rgba(220,53,69,.22)',MEDIUM:'rgba(230,126,34,.18)',LOW:'rgba(34,197,94,.14)'};
      var catIcons = {FLEET:'🚛',MARKETING:'📣',SEASONAL:'📅','CITY TARGETING':'📍','SERVICE MIX':'⚖️','CUSTOMER RETENTION':'🔁',OPERATIONS:'⚙️',SALES:'💰',CAPACITY:'📊',STRATEGY:'🧭',EXPANSION:'🗺️',SCHEDULING:'📆'};
      cards.innerHTML = recs.map(function(r){
        var col = statusColors[r.status]||'#22c55e';
        var bg = priorityBg[r.priority]||'var(--surface)';
        var bord = priorityBorder[r.priority]||'var(--border)';
        var icon = catIcons[r.category]||'💡';
        return '<div style="background:'+bg+';border:1px solid '+bord+';border-left:4px solid '+col+';border-radius:12px;padding:18px 20px;">'
          +'<div style="display:flex;align-items:flex-start;gap:12px;">'
          +'<div style="font-size:24px;flex-shrink:0;margin-top:2px;">'+icon+'</div>'
          +'<div style="flex:1;">'
          +'<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px;">'
          +'<span style="font-family:\'Bebas Neue\',sans-serif;font-size:18px;letter-spacing:1px;color:var(--text);">'+r.title+'</span>'
          +'<span style="font-size:10px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:'+col+';background:'+col+'22;padding:2px 8px;border-radius:10px;">'+r.priority+'</span>'
          +'<span style="font-size:10px;color:var(--muted);letter-spacing:.5px;text-transform:uppercase;">'+r.category+'</span>'
          +'</div>'
          +'<p style="font-size:13px;color:var(--text);line-height:1.6;margin:0 0 10px;">'+r.detail+'</p>'
          +'<div style="display:flex;align-items:flex-start;gap:8px;background:rgba(0,0,0,.04);border-radius:8px;padding:10px 12px;">'
          +'<span style="font-size:13px;flex-shrink:0;">&#8594;</span>'
          +'<span style="font-size:12px;color:var(--muted);line-height:1.5;"><strong style="color:var(--text);">Next step:</strong> '+r.action+'</span>'
          +'</div>'
          +'</div>'
          +'</div>'
          +'</div>';
      }).join('');
    }

    var ts = document.getElementById('advisor-timestamp');
    if(ts) ts.textContent = 'Generated '+new Date().toLocaleString('en-CA',{dateStyle:'medium',timeStyle:'short'});
    advisorProgress(100,'');
    advisorShowState('results');

  }catch(err){
    console.error('Advisor error:',err);
    var errEl = document.getElementById('advisor-error-msg');
    if(errEl) errEl.textContent = err.message||'Unknown error';
    advisorShowState('error');
  }
}

