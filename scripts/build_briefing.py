#!/usr/bin/env python3
"""
Builds the office TV's 9 AM spoken briefing.

Runs in GitHub Actions, not in Supabase: Kokoro is a PyTorch model and Supabase
edge functions are Deno sandboxes with no GPU, so they cannot host it. The runner
is free and we only need it once a day.

  1. sign in to Supabase as the officetv display account (read-only)
  2. count today's work
  3. write it as something worth listening to
  4. speak it with Kokoro-82M (Apache 2.0, free, no API key)
  5. leave briefing.mp3 + briefing.json for the workflow to publish

The voice is a licensed open model, NOT a clone of any real person.
"""

import datetime
import json
import os
import random
import sys
import urllib.request

SUPABASE_URL = "https://okoqzbdyfjfgcdgmcamq.supabase.co"
# Same publishable key the office TV ships with — it grants nothing on its own;
# the display account's login is what authorises the reads. This was the legacy
# JWT anon key until the project disabled legacy keys, after which every run
# from 2026-09-07 died at sign-in with a 401 and the TV went a month silent.
# A publishable key is not a JWT, so it only ever goes in the apikey header;
# Authorization carries the signed-in user's token and nothing else.
ANON_KEY = "sb_publishable_zN3Npl7I-6qUjilF_fhLnQ_5aMtilJk"

VOICE = "af_heart"      # ROSE's voice (American female) — Jake 2026-11-12, replaces bm_daniel
# Kokoro's accent is the voice name's first letter: a = American, b = British
SPEED = 0.9             # a touch slower than Kokoro's 1.0 — Jake found 1.0 fast on the TV (2026-10-16)

# Truck -> regular driver, mirroring AUTO_ASSIGNMENTS in app-leaderboard.js and
# TRUCK_DRIVERS in office-tv.html. Kept in step with those by hand; there is no
# single source for it in the database.
TRUCK_DRIVERS = [("L7 2023", "Kevin"), ("2020", "Neil")]


def post(path, payload):
    req = urllib.request.Request(
        SUPABASE_URL + path,
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json", "apikey": ANON_KEY},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def get(path, token):
    req = urllib.request.Request(
        SUPABASE_URL + path,
        headers={"apikey": ANON_KEY, "Authorization": "Bearer " + token},
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def sign_in():
    email = os.environ.get("OFFICETV_EMAIL")
    password = os.environ.get("OFFICETV_PASSWORD")
    if not email or not password:
        sys.exit(
            "Missing OFFICETV_EMAIL / OFFICETV_PASSWORD repo secrets.\n"
            "Add them under Settings > Secrets and variables > Actions."
        )
    res = post(
        "/auth/v1/token?grant_type=password",
        {"email": email, "password": password},
    )
    return res["access_token"]


def spoken_date(d):
    """'Monday the twentieth' — dates read aloud, not printed."""
    ordinals = {
        1: "first", 2: "second", 3: "third", 4: "fourth", 5: "fifth", 6: "sixth",
        7: "seventh", 8: "eighth", 9: "ninth", 10: "tenth", 11: "eleventh",
        12: "twelfth", 13: "thirteenth", 14: "fourteenth", 15: "fifteenth",
        16: "sixteenth", 17: "seventeenth", 18: "eighteenth", 19: "nineteenth",
        20: "twentieth", 21: "twenty-first", 22: "twenty-second",
        23: "twenty-third", 24: "twenty-fourth", 25: "twenty-fifth",
        26: "twenty-sixth", 27: "twenty-seventh", 28: "twenty-eighth",
        29: "twenty-ninth", 30: "thirtieth", 31: "thirty-first",
    }
    return "%s the %s" % (d.strftime("%A"), ordinals[d.day])


def weather():
    """
    Open-Meteo — free, no key, same source and yard coordinates the board uses.
    Never fatal: a briefing without the forecast beats no briefing.
    """
    try:
        url = ("https://api.open-meteo.com/v1/forecast?latitude=44.3683&longitude=-79.6831"
               "&current=temperature_2m,weather_code&daily=temperature_2m_max"
               "&forecast_days=1&timezone=auto")
        with urllib.request.urlopen(url, timeout=15) as r:
            w = json.load(r)
        code = w["current"]["weather_code"]
        high = round(w["daily"]["temperature_2m_max"][0])
        sky = ("clear", "mostly sunny", "partly cloudy", "overcast")[min(code, 3)] if code <= 3 else {
            45: "foggy", 48: "foggy", 51: "drizzly", 53: "drizzly", 55: "drizzly",
            61: "rainy", 63: "rainy", 65: "wet", 71: "snowy", 73: "snowy", 75: "snowy",
            80: "showery", 81: "showery", 82: "showery", 95: "stormy", 96: "stormy",
        }.get(code, "")
        return {"high": high, "sky": sky}
    except Exception as e:
        print("weather unavailable: %s" % e)
        return None


def collect(token, today):
    """Today's shape, counted the same way the board counts it."""
    live = "status=neq.Cancelled"

    def rows(query):
        return get("/rest/v1/jobs?" + query, token)

    drop_rows = rows("bin_dropoff=eq.%s&%s&select=city,dropoff_crew_id" % (today, live))
    pick_rows = rows("bin_pickup=eq.%s&%s&select=city,pickup_crew_id" % (today, live))
    junk_rows = rows("service=eq.Junk%%20Removal&junk_date=eq.%s&%s&select=assigned_crew_ids"
                     % (today, live))
    out_now = len(rows("service=eq.Bin%20Rental&bin_instatus=eq.dropped&" + live + "&select=job_id"))

    crew = {c["id"]: c["name"] for c in get("/rest/v1/crew_members?select=id,name", token)}

    # Legs per driver, and — the line that actually changes someone's morning —
    # anything still without one.
    per_driver, unassigned = {}, 0
    for r, key in ((drop_rows, "dropoff_crew_id"), (pick_rows, "pickup_crew_id")):
        for row in r:
            name = crew.get(row.get(key))
            if name:
                per_driver[name] = per_driver.get(name, 0) + 1
            else:
                unassigned += 1
    for row in junk_rows:
        if not (row.get("assigned_crew_ids") or []):
            unassigned += 1

    towns = sorted({r["city"] for r in drop_rows + pick_rows if r.get("city")})

    return {
        "drops": len(drop_rows), "picks": len(pick_rows), "junk": len(junk_rows),
        "bins_out": out_now, "towns": towns, "unassigned": unassigned,
        "drivers": sorted(per_driver.items(), key=lambda kv: -kv[1]),
        "weather": weather(),
    }


def join_towns(towns):
    if not towns:
        return ""
    if len(towns) == 1:
        return towns[0]
    if len(towns) <= 4:
        return ", ".join(towns[:-1]) + " and " + towns[-1]
    return ", ".join(towns[:3]) + " and %d other towns" % (len(towns) - 3)


def plural(n, one, many):
    """'1 bin' / '7 bins'. Grammar that only shows up when it's spoken."""
    return "%d %s" % (n, one if n == 1 else many)


def week_start(d):
    return d - datetime.timedelta(days=d.weekday())


def collect_driving(token, today):
    """
    Geotab driving from driver_scores, from the Monday of LAST week up to yesterday.
    driver_scores has one row per truck per day (driver_name holds the TRUCK's name);
    only speeding, idling and distance are real there - braking, seatbelt, fuel and
    jobs_completed always read 0 (checked 2026-11-12).
    """
    since = week_start(today) - datetime.timedelta(days=7)
    rows = get("/rest/v1/driver_scores?period_date=gte.%s&period_date=lt.%s"
               "&select=period_date,driver_name,speeding_events,idle_minutes,distance_km"
               % (since.isoformat(), today.isoformat()), token)
    return [{"day": r["period_date"], "truck": r["driver_name"], "speeding": r["speeding_events"] or 0,
             "idle": r["idle_minutes"] or 0, "km": r["distance_km"] or 0} for r in rows]


# Who drives what (Jake, 2026-11-13). Max and Jordan share three trucks with no fixed
# split, so they are reported as one pair. A truck not listed here is left out.
PEOPLE = [
    ("Kevin", ["Hino L7 2023"]),
    ("Neil", ["Hino 2020"]),
    ("Max and Jordan", ["Hino 2019", "Hino 2016", "Furniture Bank Van"]),
    ("Tyler", ["2022 - 2500 SILVERADO"]),
    ("Darrin", ["TRACTOR 4 - DARRIN"]),
]
MIN_KM = 50   # nobody is named off less driving than this in the period


def totals(rows, d0, d1):
    """Per person: km, speeding alerts, alerts per 100 km and idle minutes, days d0..d1 inclusive."""
    out = {}
    for name, trucks in PEOPLE:
        mine = [r for r in rows if r["truck"] in trucks and d0.isoformat() <= r["day"] <= d1.isoformat()]
        km = sum(r["km"] for r in mine)
        sp = sum(r["speeding"] for r in mine)
        out[name] = {"km": km, "speeding": sp, "idle": sum(r["idle"] for r in mine),
                     "rate": (100.0 * sp / km) if km else 0.0}
    return out


# ---- Wording that changes every day (Jake 2026-11-12) ----
# The numbers are always said plainly and in the same order; only the greeting,
# the sign-off and the remarks around them change. Each list is walked in a fixed
# shuffled order, one step per week for the weekday lists and one per day for
# the others, so a line only comes back after every other line in its list has
# had a turn. Nothing is stored: the date alone picks the line.

OPENERS = {
    0: ["Good morning, it's {date}. Fresh week, let's set the pace.",
        "Morning, team. It's {date}, a brand new week.",
        "Happy Monday, everyone. It's {date}.",
        "Good morning. It's {date}, and the week starts now.",
        "Morning, all. It's {date}. Let's start the week strong.",
        "Good morning, team. New week, it's {date}.",
        "Rise and shine, it's {date}.",
        "Morning, everyone. It's {date}, let's get the week rolling."],
    1: ["Good morning, it's {date}.",
        "Morning, team. It's {date}, day two of the week.",
        "Good morning, everyone. {date} is here.",
        "Morning, all. It's {date}, let's keep it going.",
        "Happy Tuesday. It's {date}.",
        "Good morning, team. It's {date}, here's the day."],
    2: ["Good morning, it's {date}. Halfway there.",
        "Morning, team. It's {date}, the middle of the week.",
        "Happy Wednesday, everyone. It's {date}.",
        "Good morning. It's {date}, hump day.",
        "Morning, all. It's {date}, the week is half done.",
        "Good morning, team. It's {date}, over the hump we go."],
    3: ["Good morning, it's {date}. Almost Friday.",
        "Morning, team. It's {date}, one more after this.",
        "Happy Thursday, everyone. It's {date}.",
        "Good morning. It's {date}, the weekend is in sight.",
        "Morning, all. It's {date}, let's have a good one.",
        "Good morning, team. It's {date}, the home stretch."],
    4: ["Happy Friday! It's {date}.",
        "Good morning, it's {date}. Last push before the weekend.",
        "Morning, team. It's {date}, the weekend is almost here.",
        "Good morning, everyone. Friday is finally here, it's {date}.",
        "Morning, all. It's {date}, let's finish the week strong.",
        "Happy Friday, team. It's {date}, one more day."],
}
CLOSERS = {
    0: ["Have a great Monday.", "Let's make it a good week.", "Have a good one.",
        "Let's get after it.", "Good luck out there."],
    1: ["Have a good one.", "Have a great Tuesday.", "Let's keep it rolling.",
        "Good luck out there.", "Drive safe."],
    2: ["Have a good one.", "Have a great Wednesday.", "Downhill from here.",
        "Drive safe out there.", "Let's keep it moving."],
    3: ["Have a good one.", "Have a great Thursday.", "One more day after this.",
        "Drive safe out there.", "Finish strong."],
    4: ["Have a great weekend.", "Finish strong and enjoy the weekend.",
        "Drive safe, and have a good weekend.", "Last one of the week, let's make it count.",
        "Enjoy the weekend, everyone."],
}
WEEKEND_BACK = "Welcome back from the long weekend. It's {date}."

WET = ["Mind the driveways.", "Wet one out there, take it easy on the lawns.",
       "Roads will be slick, give yourselves extra room."]
SNOW = ["Snow on the way, take it slow out there.", "Snowy one today, mind the driveways.",
        "Watch the roads, it's a snowy one."]
COLD = ["Bundle up, it's a cold one.", "Dress warm out there."]
HOT = ["Hot one today, drink lots of water.", "Stay hydrated out there."]
BUSY = ["Big day on the board.", "Busy one, let's stay ahead of it.",
        "Full board today, let's keep it moving."]
QUIET = ["Nice and light today.", "Easy board today, a good day to catch up.",
         "Light one today."]


def pick(lines, key, step):
    order = list(lines)
    random.Random(key).shuffle(order)
    return order[step % len(order)]


def cap(s):
    return s[0].upper() + s[1:]


def spoken_minutes(m):
    h, mm = divmod(int(m), 60)
    if not h:
        return plural(mm, "minute", "minutes")
    hours = "an hour" if h == 1 else "%d hours" % h
    return hours + ("" if mm < 5 else " and %s" % plural(mm, "minute", "minutes"))


def easter(y):
    a, b, c = y % 19, y // 100, y % 100
    d, e = b // 4, b % 4
    g = (8 * b + 13) // 25
    h = (19 * a + b - d - g + 15) % 30
    i, k = c // 4, c % 4
    l = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 19 * l) // 433
    month = (h + l - 7 * m + 90) // 25
    return datetime.date(y, month, (h + l - 7 * m + 33 * month + 19) % 32)


def nth_monday(y, month, n):
    first = datetime.date(y, month, 1)
    return first + datetime.timedelta(days=(0 - first.weekday()) % 7 + 7 * (n - 1))


def ontario_holidays(y):
    may24 = datetime.date(y, 5, 24)
    return {
        datetime.date(y, 1, 1): "New Year's Day",
        nth_monday(y, 2, 3): "Family Day",
        easter(y) - datetime.timedelta(days=2): "Good Friday",
        may24 - datetime.timedelta(days=may24.weekday()): "Victoria Day",
        datetime.date(y, 7, 1): "Canada Day",
        nth_monday(y, 8, 1): "the Civic Holiday",
        nth_monday(y, 9, 1): "Labour Day",
        nth_monday(y, 10, 2): "Thanksgiving",
        datetime.date(y, 12, 25): "Christmas Day",
        datetime.date(y, 12, 26): "Boxing Day",
    }


def holiday_name(d):
    return ontario_holidays(d.year).get(d)


JOKES = [
    "{n}, the dump will still be there if you get there two minutes later.",
    "Easy, {n}. It's a junk truck, not a race car.",
    "{n}, the bins aren't going to run away.",
    "Slow down, {n}. The couch in the back would like to arrive in one piece.",
    "{n}, we haul junk, not lap records.",
    "{n}, the speed limit signs are not suggestions.",
    "{n}, if the truck had a lap timer you'd be winning. It doesn't.",
    "Easy on the gas, {n}. The fuel bill has feelings too.",
]


def joke(name, key, day_step):
    return pick(JOKES, key, day_step).format(n=name)


def per100(x, short=False):
    return "about %d per 100" % round(x) if short else "about %d per 100 kilometres" % round(x)


def last_week_lines(rows, today, day_step):
    """Mondays: last week's driving, people first (Jake, 2026-11-13)."""
    mon = week_start(today) - datetime.timedelta(days=7)
    t = totals(rows, mon, mon + datetime.timedelta(days=6))
    fleet = sum(v["km"] for v in t.values())
    if fleet < 1:
        return []
    named = {n: v for n, v in t.items() if v["km"] >= MIN_KM}
    lines = ["Last week's driving: %d kilometres." % round(fleet)]
    if not named:
        return lines
    best = min(named, key=lambda n: named[n]["rate"])
    lines.append("Best driver: %s, %d kilometres with %s speeding alerts per 100. %s, %s."
                 % (best, round(named[best]["km"]), "about %d" % round(named[best]["rate"]),
                    pick(["Great job", "Nice work", "Keep it up"], "best", day_step), best))
    most = max(named, key=lambda n: named[n]["speeding"])
    if most != best:
        lines.append("Most speeding alerts: %s, with %d. %s" % (most, named[most]["speeding"], joke(most, "most", day_step)))
    worst = max(named, key=lambda n: named[n]["rate"])
    if worst not in (best, most):
        lines.append("Needs a reminder: %s, %s speeding alerts per 100 kilometres. %s"
                     % (worst, "about %d" % round(named[worst]["rate"]), joke(worst, "worst", day_step + 3)))
    idler = max(named, key=lambda n: named[n]["idle"])
    if named[idler]["idle"] >= 180:
        lines.append("Idling: %s's trucks sat running for %s. Shut it off when you're parked." % (idler, spoken_minutes(named[idler]["idle"])))
    return lines


def this_week_lines(rows, today, day_step):
    """Tuesday to Friday: this week so far, against last week (Jake, 2026-11-13)."""
    mon = week_start(today)
    now = totals(rows, mon, today - datetime.timedelta(days=1))
    then = totals(rows, mon - datetime.timedelta(days=7), mon - datetime.timedelta(days=1))
    fleet = sum(v["km"] for v in now.values())
    if fleet < 1:
        return []
    lines = ["This week so far: %d kilometres." % round(fleet)]
    both = {n: now[n]["rate"] - then[n]["rate"] for n in now
            if now[n]["km"] >= MIN_KM and then[n]["km"] >= MIN_KM}
    better = sorted((n for n in both if both[n] <= -2), key=lambda n: both[n])
    worse = sorted((n for n in both if both[n] >= 2), key=lambda n: -both[n])
    for i, n in enumerate(better):
        lead = "Most improved: %s, down to" % n if i == 0 else "%s too, down to" % n
        lines.append("%s %s, from %d last week.%s" % (lead, per100(now[n]["rate"], i > 0), round(then[n]["rate"]),
                     " %s, %s." % (pick(["Nice work", "Great job", "Keep it up"], "imp", day_step), n) if i == 0 else ""))
    for i, n in enumerate(worse):
        lead = "Needs a reminder: %s, up to" % n if i == 0 else "%s is up too, to" % n
        lines.append("%s %s, from %d last week. %s" % (lead, per100(now[n]["rate"], bool(better) or i > 0), round(then[n]["rate"]),
                     joke(n, "up%d" % i, day_step + i * 3)))
    if not better and not worse and both:
        best = min(both, key=lambda n: now[n]["rate"])
        lines.append("Cleanest so far: %s, %s." % (best, per100(now[best]["rate"])))
    return lines


def driving_lines(rows, today, day_step):
    if not rows:
        return []
    return last_week_lines(rows, today, day_step) if today.weekday() == 0 else this_week_lines(rows, today, day_step)


REPORT_OPEN = ["Afternoon, team. Time for the driving report.",
               "Quick one, everyone. Here's the driving report.",
               "Hi team, it's driving report time."]
REPORT_CLOSE = ["That's the driving report. Drive safe.", "That's it. Drive safe out there.",
                "Thanks, everyone. Drive safe."]


def write_driving_report(rows, today):
    """The driving report on its own, played in the afternoon (Jake, 2026-11-13).
    Mondays cover last week; Tuesday to Friday cover this week so far."""
    day_step = today.toordinal()
    body = driving_lines(rows, today, day_step)
    if not body:
        return None
    return " ".join([pick(REPORT_OPEN, "ropen", day_step)] + body + [pick(REPORT_CLOSE, "rclose", day_step)])


def remark(s, today, day_step):
    """At most one extra line: whatever matters most today."""
    nxt = today + datetime.timedelta(days=1)
    monday = today + datetime.timedelta(days=3)
    if today.weekday() == 4 and holiday_name(monday):
        return "Long weekend coming up. Monday is %s." % holiday_name(monday)
    if nxt.weekday() < 5 and holiday_name(nxt):
        return "Heads up, tomorrow is %s." % holiday_name(nxt)

    w = s.get("weather")
    if w:
        if w["sky"] == "snowy":
            return pick(SNOW, "snow", day_step)
        if w["sky"] in ("drizzly", "rainy", "wet", "showery", "stormy"):
            return pick(WET, "wet", day_step)
        if w["high"] <= -10:
            return pick(COLD, "cold", day_step)
        if w["high"] >= 28:
            return pick(HOT, "hot", day_step)

    movements = s["drops"] + s["picks"]
    if movements >= 12:
        return pick(BUSY, "busy", day_step)
    if 1 <= movements <= 3:
        return pick(QUIET, "quiet", day_step)

    xmas = datetime.date(today.year, 12, 25)
    if datetime.date(today.year, 11, 1) <= today < xmas and (today.month == 12 or today.weekday() == 4):
        return "%s till Christmas." % plural((xmas - today).days, "day", "days")
    return None


def write_script(s, today):
    """
    Read aloud once across a room. The numbers are always said plainly and in
    the same order - they are what people listen for, and Jake found the long
    witty version too much (2026-10-16). Around them, the greeting, sign-off
    and remarks change every day so it never sounds like a recording
    (Jake 2026-11-12). Singular/plural still matters: "1 bins" is jarring out loud.
    """
    wd = min(today.weekday(), 4)
    week_step, day_step = today.toordinal() // 7, today.toordinal()
    date = spoken_date(today)

    yesterday = today - datetime.timedelta(days=1)
    if today.weekday() == 1 and holiday_name(yesterday):
        lines = [WEEKEND_BACK.format(date=date)]
    else:
        lines = [pick(OPENERS[wd], "open%d" % wd, week_step).format(date=date)]

    movements = s["drops"] + s["picks"]
    if movements:
        lines.append("%s today: %s out, %s back."
                     % (plural(movements, "bin", "bins"), s["drops"] or "none", s["picks"] or "none"))
    else:
        # Said outright so an empty day never sounds like a broken board.
        lines.append("No bins on the board today.")

    if s.get("drivers"):
        lines.append(", ".join("%s has %d" % (n, c) for n, c in s["drivers"]) + ".")

    # The only line that should change anyone's morning, so it stays.
    if s.get("unassigned"):
        lines.append("%s no driver. Kindly correct that before the trucks leave the yard."
                     % plural(s["unassigned"], "job has", "jobs have"))

    tail = []
    if s["bins_out"]:
        tail.append("%s in the field" % plural(s["bins_out"], "bin", "bins"))
    if s["junk"]:
        tail.append(plural(s["junk"], "junk removal", "junk removals"))
    if tail:
        lines.append(", ".join(tail) + ".")

    w = s.get("weather")
    if w:
        lines.append("%d degrees%s." % (w["high"], " and " + w["sky"] if w["sky"] else ""))

    r = remark(s, today, day_step)
    if r:
        lines.append(r)

    lines.append(pick(CLOSERS[wd], "close%d" % wd, week_step))
    return " ".join(lines)


def speak(text, out_wav):
    from kokoro import KPipeline
    import soundfile as sf
    import numpy as np

    voice = os.environ.get("BRIEFING_VOICE", "").strip() or VOICE
    print("voice: %s" % voice)
    pipeline = KPipeline(lang_code=voice[0])
    chunks = [audio for _, _, audio in pipeline(text, voice=voice, speed=SPEED)]
    if not chunks:
        sys.exit("Kokoro produced no audio")
    sf.write(out_wav, np.concatenate(chunks), 24000)


def main():
    today = datetime.date.today()

    # BRIEFING_TEXT bypasses the database entirely, so the voice can be auditioned
    # before the Supabase secrets exist — and so the pipeline (model download,
    # phonemiser, encode, publish) is proven separately from the data side.
    # BRIEFING_KIND picks which announcement this run makes: the morning briefing, or
    # the afternoon driving report. Each is its own file on the release.
    kind = os.environ.get("BRIEFING_KIND", "").strip() or "briefing"
    if kind not in ("briefing", "driving"):
        sys.exit("BRIEFING_KIND must be briefing or driving, not %r" % kind)
    override = os.environ.get("BRIEFING_TEXT", "").strip()
    if override:
        print("BRIEFING_TEXT set — speaking that instead of today's numbers.")
        stats, text = {"sample": True}, override
    elif kind == "briefing":
        token = sign_in()
        stats = collect(token, today.isoformat())
        text = write_script(stats, today)
    else:
        rows = collect_driving(sign_in(), today)
        stats, text = {"rows": len(rows)}, write_driving_report(rows, today)
        if not text:
            sys.exit("No driving to report for %s" % today)

    print("--- %s script ---" % kind)
    print(text)
    print("-----------------------")

    speak(text, kind + ".wav")

    with open(kind + ".json", "w", encoding="utf-8") as f:
        json.dump({"date": today.isoformat(), "text": text, "stats": stats}, f, indent=1)


if __name__ == "__main__":
    main()
