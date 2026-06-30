# -*- coding: utf-8 -*-
# Generate app-jwg-scheduler.js from the standalone scheduler's js/ modules.
# Source of truth is the standalone repo; do NOT hand-edit the generated bundle.
import os, re

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)                                   # .../jeffs-junk
SRC = os.path.join(os.path.dirname(REPO), "jwg schedule", "js")
OUT = os.path.join(REPO, "app-jwg-scheduler.js")

# Load order; auth.js intentionally excluded (dashboard owns auth)
MODULES = ["config","state","utils","ui","settings","shifts","multi","schedule",
           "analytics","history","team","tasks","summer","winter","inventory",
           "clothing","realtime","app"]

def read(m):
    with open(f"{SRC}/{m}.js","r",encoding="utf-8") as f:
        return f.read()

src = {m: read(m) for m in MODULES}
report = []

def sub1(name, text, pat, repl, flags=0):
    new, n = re.subn(pat, repl, text, flags=flags)
    report.append(f"  {name}: {n} replace(s)" + ("  !! EXPECTED 1" if n != 1 else ""))
    return new

# ---- config.js: repoint to the dashboard's own Supabase (no hardcoded keys) ----
src["config"] = sub1("config supabase", src["config"],
    r'const SUPABASE_URL=.*?USE_SUPABASE=!!\(SUPABASE_URL&&SUPABASE_ANON_KEY\);',
    'const SUPABASE_URL=window.SUPABASE_URL,SUPABASE_ANON_KEY=window.SUPABASE_KEY,USE_SUPABASE=true;')

# ---- utils.js: rewrite sbF to use the dashboard session token via db.auth ----
NEW_SBF = (
'async function sbF(m,p,b){\n'
'  let token=SUPABASE_ANON_KEY;\n'
'  try{const _s=await db.auth.getSession();if(_s&&_s.data&&_s.data.session&&_s.data.session.access_token)token=_s.data.session.access_token;}catch(e){}\n'
'  const isUpsert=m==="POST"&&p.includes("on_conflict");\n'
'  const prefer=isUpsert?"return=representation,resolution=merge-duplicates":m==="POST"?"return=representation":"";\n'
'  const r=await fetch(`${SUPABASE_URL}/rest/v1/${p}`,{method:m,headers:{apikey:SUPABASE_ANON_KEY,Authorization:`Bearer ${token}`,"Content-Type":"application/json",...(prefer?{Prefer:prefer}:{})},body:b?JSON.stringify(b):undefined});\n'
'  if(!r.ok)throw new Error(await r.text());\n'
'  return r.status===204?null:r.json();\n'
'}')
src["utils"] = sub1("utils sbF", src["utils"],
    r'async function sbF\(m,p,b\)\{[\s\S]*?\n\}', NEW_SBF)
# toast id appears twice (toast + dismissToast); replace all
src["utils"], ntoast = re.subn(r'getElementById\("toast"\)', 'getElementById("jwg-toast")', src["utils"])
report.append(f"  utils toast id -> jwg-toast: {ntoast}")
# mount modals inside the scoped section (not document.body) so scoped CSS + .modal apply
src["utils"] = sub1("utils modal mount", src["utils"],
    r'document\.body\.appendChild\(ov\);',
    '(document.getElementById("view-jwgscheduler")||document.body).appendChild(ov);')

# ---- ui.js: drop popstate + pushState (host owns routing) ----
src["ui"] = sub1("ui popstate", src["ui"],
    r'window\.addEventListener\("popstate"[\s\S]*?\}\);\n',
    '/* popstate disabled: host owns routing */\n')
src["ui"] = sub1("ui pushState", src["ui"],
    r'\s*history\.pushState\(\{tab:t\},"","#"\+t\);', '')

# ---- app.js: strip session timers + replace the boot gate ----
src["app"] = sub1("app keepalive", src["app"], r'\s*startSessionKeepAlive\(\);', '')
src["app"] = sub1("app inactivity", src["app"], r'\s*startInactivityTimer\(\);', '')
NEW_BOOT = (
'let _jwgBooted=false;\n'
'function renderJwgScheduler(){\n'
'  if(_jwgBooted){render();return;}\n'
'  _jwgBooted=true;\n'
'  bootApp();\n'
'  initRealtime();\n'
'}')
src["app"] = sub1("app boot gate", src["app"],
    r'\(async\(\)=>\{[\s\S]*?\}\)\(\);', NEW_BOOT)

# ---- realtime.js: reuse the dashboard's authed client ----
src["realtime"] = sub1("realtime client", src["realtime"],
    r'_sbClient=window\.supabase\.createClient\(SUPABASE_URL,SUPABASE_ANON_KEY\);',
    '_sbClient=db;')
src["realtime"] = sub1("realtime guard", src["realtime"],
    r'if\(!USE_SUPABASE\|\|!window\.supabase\)return;', 'if(!db)return;')

# ---- assemble ----
body = "\n".join(f"/* ===== {m}.js ===== */\n{src[m]}" for m in MODULES)

# ---- table rename to jwg_* (ONLY inside REST path strings; never JS property access) ----
TABLES = ["employee_clothing","inventory_categories","location_services",
          "service_locations","service_types","inventory_items","workshop_tasks",
          "app_settings","salt_bins","schedules","employees"]
_alt = "|".join(sorted(TABLES, key=len, reverse=True))
# (1) leading table of a quoted path, and realtime table:"..." (preceded by a quote)
body, _n1 = re.subn(r'"(' + _alt + r')', lambda mm: '"jwg_' + mm.group(1), body)
# (2) embedded FK refs inside a path: preceded by , & or ( and followed by ( ! or .
#     NOTE: a preceding '.' is deliberately excluded so JS like S.employees.length is untouched.
body, _n2 = re.subn(r'(?<=[,&(])(' + _alt + r')(?=[(!.])', lambda mm: 'jwg_' + mm.group(1), body)
report.append(f"table refs renamed -> jwg_*: {_n1} path + {_n2} embed")
# guard: no table should have landed on a JS property (.jwg_table)
_badprop = len(re.findall(r'\.jwg_(?:' + _alt + r')\b', body))
report.append(f"BAD property renames (.jwg_*): {_badprop}" + ("  !! FIX" if _badprop else ""))

# ---- inline-handler namespace rewrite ----
FUNCS = ("addCategory addEmp addShiftEntry addSummerServiceType addWinterServiceType "
"adjustInventory adjustWinterSalt applyMultiAssign applyMultiClear applyWH cancelEditShift "
"clearDayStatus clDelete clOpenAdd clOpenEdit clSaveForm clSetCompany clSetFilter clSetPeriod "
"closeModal closeSaveShift deleteCategory deleteInventoryItem deleteSummerLocation "
"deleteSummerServiceType deleteWinterLocation deleteWinterServiceType dismissToast "
"editInventoryItem editSummerLocation editWinterLocation filterAndSortSummer filterAndSortWinter "
"filterInventory goToday maPick maToggleAllDays maToggleDay maToggleEmp maToggleEveryone "
"markDayOff markDaySick markOrdered mcPickTask mcToggleAllDays mcToggleDay mcToggleEmp "
"mcToggleEveryone nextW openAddInventoryItem openAddSummerLocation openAddWinterLocation "
"openManageCategories openManageSummerServiceTypes openManageWinterServiceTypes openMultiAssign "
"openMultiClear openShiftModal openTaskMgr openWHSettings pickTask prevW removeEmp removeShiftEntry "
"restockItem saveDayNote saveEditShift saveInventoryItem saveSummerLocation saveWinterLocation "
"setMobileDay startEditShift switchTab tmAdd tmCC tmDel tmLC toggleAlphaSort toggleDay "
"toggleHistoryWeek updateInventoryItem updateSummerLocation updateWinterLocation wtDelete "
"wtMarkDone wtOpenAdd wtOpenEdit wtPickPrio wtReopen wtSaveForm wtSetFilter wtTogglePerson").split()
STATE = ["S","SUM","WIN","INV","CL","WT","render"]
NAMES = FUNCS + STATE
names_alt = "|".join(sorted(NAMES, key=len, reverse=True))
name_re = re.compile(r'(?<![\w.$])(' + names_alt + r')(?![\w$])')

hcount = [0]
def rewrite_attr(m):
    pre, code, post = m.group(1), m.group(2), m.group(3)
    new = name_re.sub(r'JWG.\1', code)
    if new != code: hcount[0] += 1
    return pre + new + post

body = re.sub(r'(on\w+=")([^"]*)(")', rewrite_attr, body)
body = re.sub(r"(on\w+=')([^']*)(')", rewrite_attr, body)
report.append(f"inline handlers rewritten: {hcount[0]}")

# ---- verify every export name is actually defined in the bundle ----
missing = []
for n in NAMES:
    if n in STATE and n != "render":
        if not re.search(r'\b(?:let|const|var)\s+' + re.escape(n) + r'\b', body): missing.append(n)
    else:
        if not re.search(r'function\s+' + re.escape(n) + r'\b', body): missing.append(n)
report.append("MISSING definitions: " + (", ".join(missing) if missing else "none"))

# ---- build exports ----
exports = ("window.renderJwgScheduler=renderJwgScheduler;\nwindow.JWG={" +
           ",".join(f"{n}:{n}" for n in NAMES) + "};")

out = ("/* app-jwg-scheduler.js -- generated bundle; rebuild via build_jwg_js.py */\n"
       "(function(){\n" + body + "\n\n/* ===== JWG exports ===== */\n" + exports + "\n})();\n")

# ---- sanity checks ----
def bal(s, a, b): return s.count(a) - s.count(b)
report.append(f"brace balance {{}}: {bal(out,'{','}')}   paren balance (): {bal(out,'(',')')}   bracket []: {bal(out,'[',']')}")
report.append(f"output lines: {out.count(chr(10))+1}   bytes: {len(out)}")

# ---- leftover-handler scan: any known name still called bare (not JWG.-prefixed) inside on* attrs ----
leftover = set()
for m in re.finditer(r'on\w+="([^"]*)"', out):
    code = m.group(1)
    for nm in re.finditer(r'(?<![\w.$])([A-Za-z_]\w*)\s*\(', code):
        fn = nm.group(1)
        if fn in NAMES:
            leftover.add(fn)
report.append("LEFTOVER bare handler calls: " + (", ".join(sorted(leftover)) if leftover else "none"))

with open(OUT, "w", encoding="utf-8", newline="\n") as f:
    f.write(out)

print("=== BUILD REPORT ===")
print("\n".join(report))
print("wrote:", OUT)
