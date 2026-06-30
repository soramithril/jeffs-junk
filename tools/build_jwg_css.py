# -*- coding: utf-8 -*-
# Generate app-jwg-scheduler.css from the standalone scheduler's styles.css.
# - Scope every rule under #view-jwgscheduler (no bleed into the dashboard).
# - Keep the scheduler's own (readable) green color system; unify font to Inter.
# - Make mobile mirror desktop: drop the scheduler's bespoke mobile media queries
#   and its bottom mobile-nav, let wide content scroll horizontally.
# Source of truth is the standalone repo; do NOT hand-edit the generated css.
import os, re

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)                                   # .../jeffs-junk
SRC = os.path.join(os.path.dirname(REPO), "jwg schedule", "css", "styles.css")
OUT = os.path.join(REPO, "app-jwg-scheduler.css")
PREFIX = "#view-jwgscheduler"

css = open(SRC, "r", encoding="utf-8").read()
css = re.sub(r'/\*.*?\*/', '', css, flags=re.S)               # strip comments

kf_names = set(re.findall(r'@keyframes\s+([A-Za-z_][\w-]*)', css))

def split_top_commas(sel):
    out, depth, cur = [], 0, ""
    for ch in sel:
        if ch == '(': depth += 1; cur += ch
        elif ch == ')': depth -= 1; cur += ch
        elif ch == ',' and depth == 0: out.append(cur); cur = ""
        else: cur += ch
    if cur.strip(): out.append(cur)
    return out

def scope_one(s):
    s = s.strip()
    if not s: return s
    if s == ':root': return PREFIX
    m = re.match(r'^(html|body)(?![\w-])', s)
    if m:
        rest = s[m.end():].lstrip()
        return PREFIX + ((' ' + rest) if rest else '')
    return PREFIX + ' ' + s

def scope_selectors(sel):
    return ", ".join(scope_one(x) for x in split_top_commas(sel))

def parse_blocks(text):
    blocks, i, n = [], 0, len(text)
    while i < n:
        j = text.find('{', i)
        if j == -1:
            tail = text[i:].strip()
            if tail: blocks.append(('text', tail, None))
            break
        prelude = text[i:j].strip()
        depth, k = 1, j + 1
        while k < n and depth > 0:
            if text[k] == '{': depth += 1
            elif text[k] == '}': depth -= 1
            k += 1
        blocks.append(('rule', prelude, text[j+1:k-1]))
        i = k
    return blocks

def is_mobile_media(p):
    low = p.lower()
    if 'hover: none' in low or 'hover:none' in low: return True
    if 'min-width' in low: return False          # ranges/desktop -> keep
    m = re.search(r'max-width\s*:\s*(\d+)', low)
    return bool(m and int(m.group(1)) <= 767)

dropped = [0]
unwrapped = [0]
def transform(text):
    out = []
    for kind, prelude, body in parse_blocks(text):
        if kind == 'text': continue
        p = prelude; low = p.lower()
        if low.startswith('@keyframes'):
            nm = p.split(None, 1)[1].strip()
            out.append(f"@keyframes jwg-{nm} {{{body}}}")
        elif low.startswith('@media') or low.startswith('@supports'):
            if low.startswith('@media') and is_mobile_media(p):
                dropped[0] += 1
                continue                          # drop bespoke mobile layer
            if low.startswith('@media') and ('min-width' in low) and ('max-width' not in low):
                unwrapped[0] += 1
                out.append(transform(body))       # promote desktop rules to ALL widths
                continue
            out.append(f"{p} {{\n{transform(body)}\n}}")
        elif low.startswith('@font-face'):
            out.append(f"{p} {{{body}}}")
        elif low.startswith('@page'):
            continue
        elif low.startswith('@'):
            out.append(f"{p} {{{body}}}")
        else:
            out.append(f"{scope_selectors(p)} {{{body}}}")
    return "\n".join(out)

scoped = transform(css)

def fix_anim(m):
    seg = m.group(0)
    for kf in kf_names:
        seg = re.sub(r'\b' + re.escape(kf) + r'\b', 'jwg-' + kf, seg)
    return seg
scoped = re.sub(r'animation(?:-name)?\s*:[^;}]*', fix_anim, scoped)

OVERRIDES = """
/* ===== embed overrides + alignment ===== */
/* Font unified to the dashboard's Inter; scheduler keeps its own green system.
   Mobile mirrors desktop: bespoke mobile-nav hidden, wide content scrolls. */
#view-jwgscheduler{position:relative;min-height:60vh;font-family:'Inter',system-ui,-apple-system,sans-serif;}
#view-jwgscheduler #header{position:static;left:auto;right:auto;width:auto;flex-wrap:wrap;height:auto;}
#view-jwgscheduler #app{padding-top:0;overflow-x:auto;}
#view-jwgscheduler #split-overlay{display:none;}
#view-jwgscheduler #mobile-nav{display:none !important;}
"""

out = ("/* app-jwg-scheduler.css -- generated; rebuild via tools/build_jwg_css.py */\n"
       + scoped + "\n" + OVERRIDES)

with open(OUT, "w", encoding="utf-8", newline="\n") as f:
    f.write(out)

print("keyframes prefixed:", len(kf_names))
print("mobile media blocks dropped:", dropped[0])
print("desktop media blocks unwrapped:", unwrapped[0])
print("brace balance:", out.count('{') - out.count('}'))
print("bytes:", len(out), "lines:", out.count(chr(10)) + 1)
print("wrote:", OUT)
