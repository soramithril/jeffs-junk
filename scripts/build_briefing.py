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
import sys
import urllib.request

SUPABASE_URL = "https://okoqzbdyfjfgcdgmcamq.supabase.co"
# Same publishable anon key the office TV ships with — it grants nothing on its
# own; the display account's login is what authorises the reads.
ANON_KEY = (
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9rb3F6"
    "YmR5ZmpmZ2NkZ21jYW1xIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2NDYyNzEsImV4cCI6MjA4"
    "ODIyMjI3MX0.SQQD5HN2h179Lsqb-gxqnuTZcIXUyxrtmBP6VLOO57w"
)

VOICE = "bm_daniel"     # British male — Jake picked it by ear over george/fable/lewis
LANG = "b"              # British English

# Truck -> regular driver, mirroring AUTO_ASSIGNMENTS in app-leaderboard.js and
# TRUCK_DRIVERS in office-tv.html. Kept in step with those by hand; there is no
# single source for it in the database.
TRUCK_DRIVERS = [("L7 2023", "Kevin"), ("2020", "Neil")]


def post(path, payload, token=None):
    req = urllib.request.Request(
        SUPABASE_URL + path,
        data=json.dumps(payload).encode(),
        headers={
            "Content-Type": "application/json",
            "apikey": ANON_KEY,
            "Authorization": "Bearer " + (token or ANON_KEY),
        },
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
    """'Monday the twentieth of July' — dates read aloud, not printed."""
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
    return "%s the %s of %s" % (
        d.strftime("%A"), ordinals[d.day], d.strftime("%B")
    )


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


def write_script(s, today):
    """
    Plain sentences, read aloud. No headings, no bullets — this is heard once,
    across a room, not read. Singular/plural matters more here than on screen:
    "There are 1 bin movements" is invisible in a table and jarring out loud.
    """
    lines = ["Good morning. %s." % spoken_date(today)]

    movements = s["drops"] + s["picks"]
    if movements:
        # "none" rather than "0" reads better aloud, but it can open the sentence,
        # so capitalise whatever lands first.
        split = "%s out, %s back." % (s["drops"] or "none", s["picks"] or "none")
        lines.append(
            "%s today. %s"
            % (plural(movements, "bin movement", "bin movements"),
               split[0].upper() + split[1:])
        )
    else:
        # Degraded, but deliberate — the room's real question on an empty day is
        # "is it empty, or is the board broken?"
        lines.append("The board is empty of bin movements today, "
                     "which I have verified rather than assumed.")

    # The line each driver is listening for. A tricolon so a half-listener catches
    # their own name and number without holding anything in memory.
    if s.get("drivers"):
        who = ["%s with %d" % (n, c) for n, c in s["drivers"]]
        lines.append(
            "The legs fall to %s."
            % (", ".join(who[:-1]) + ", and " + who[-1] if len(who) > 1 else who[0])
        )

    # The only line that should change anyone's morning. Short and flat, straight
    # after the longer driver sentence, so the contrast does the emphasis.
    if s.get("unassigned"):
        lines.append(
            "%s no driver. Kindly correct that before the trucks leave the yard."
            % plural(s["unassigned"], "job has", "jobs have")
        )
    elif movements:
        lines.append("Nothing is unassigned. I checked twice.")

    tail = []
    if s["bins_out"]:
        tail.append("%s out in the field" % plural(s["bins_out"], "bin is", "bins are"))
    if s["junk"]:
        tail.append("%s booked" % plural(s["junk"], "junk removal is", "junk removals are"))
    if tail:
        lines.append((" and ".join(tail) + ".").capitalize())

    w = s.get("weather")
    if w:
        lines.append("Outside, %d degrees%s." % (w["high"], " and " + w["sky"] if w["sky"] else ""))

    lines.append("The fleet is yours. Do carry on.")
    return " ".join(lines)


def speak(text, out_wav):
    from kokoro import KPipeline
    import soundfile as sf
    import numpy as np

    voice = os.environ.get("BRIEFING_VOICE", "").strip() or VOICE
    print("voice: %s" % voice)
    pipeline = KPipeline(lang_code=LANG)
    chunks = [audio for _, _, audio in pipeline(text, voice=voice)]
    if not chunks:
        sys.exit("Kokoro produced no audio")
    sf.write(out_wav, np.concatenate(chunks), 24000)


def main():
    today = datetime.date.today()

    # BRIEFING_TEXT bypasses the database entirely, so the voice can be auditioned
    # before the Supabase secrets exist — and so the pipeline (model download,
    # phonemiser, encode, publish) is proven separately from the data side.
    override = os.environ.get("BRIEFING_TEXT", "").strip()
    if override:
        print("BRIEFING_TEXT set — speaking that instead of today's numbers.")
        stats, text = {"sample": True}, override
    else:
        token = sign_in()
        stats = collect(token, today.isoformat())
        text = write_script(stats, today)

    print("--- briefing script ---")
    print(text)
    print("-----------------------")

    speak(text, "briefing.wav")

    with open("briefing.json", "w", encoding="utf-8") as f:
        json.dump({"date": today.isoformat(), "text": text, "stats": stats}, f, indent=1)


if __name__ == "__main__":
    main()
