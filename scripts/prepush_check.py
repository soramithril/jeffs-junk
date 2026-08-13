#!/usr/bin/env python3
"""Pre-push tripwire. Blocks a git push when the committed site would break.

Runs as a Claude Code PreToolUse hook on every Bash/PowerShell command and
exits silently unless the command contains a git push. For pushes it checks
the content that would actually go live (HEAD, not the working tree):

  1. Every .js file changed since origin/main parses cleanly in V8 (the
     mini-racer package - the same engine Chrome runs, so it judges syntax
     exactly the way the live site will; esprima was tried first and
     false-flagged modern syntax like catch-without-binding). A syntax error
     in app.js blanks the whole site and there is no staging environment -
     this happened once for 20 hours (v487-488).
  2. index.html's app.js?v=, APP_VERSION in app.js, and version.txt all
     carry the same number. Out of step = users keep cached JS and the
     auto-update banner misfires.
  3. Any changed file that index.html loads with ?v= got its ?v= bumped.
     Forgetting this ships new markup against stale cached CSS/JS.

On failure it prints a PreToolUse deny decision and the push never runs.
Fixing the problem and pushing again is the only path through - by design.
"""
import json
import os
import re
import subprocess
import sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Vendored, minified, never edited by hand - not worth a slow parse.
SKIP_PARSE = {'motion.min.js'}


def sh(*args):
    return subprocess.run(args, cwd=REPO, capture_output=True, text=True,
                          encoding='utf-8', errors='replace')


def file_at(rev, path):
    r = sh('git', 'show', rev + ':' + path)
    return r.stdout if r.returncode == 0 else None


def deny(reason):
    print(json.dumps({
        'hookSpecificOutput': {
            'hookEventName': 'PreToolUse',
            'permissionDecision': 'deny',
            'permissionDecisionReason':
                'PUSH BLOCKED by scripts/prepush_check.py - ' + reason,
        }
    }))
    sys.exit(0)


def is_push(cmd):
    for seg in re.split(r'[;&|\n]+', cmd):
        if re.search(r'\bgit\s+(?:\S+\s+)*?push\b', seg):
            return True
    return False


def check_lockstep(index_html):
    m_idx = re.search(r'app\.js\?v=(\d+)', index_html)
    app_js = file_at('HEAD', 'app.js')
    m_app = re.search(r"APP_VERSION\s*=\s*'(\d+)'", app_js or '')
    version_txt = (file_at('HEAD', 'version.txt') or '').strip()
    if not (m_idx and m_app and version_txt):
        deny('could not read the three version numbers '
             '(index.html app.js?v / APP_VERSION / version.txt)')
    trio = {m_idx.group(1), m_app.group(1), version_txt}
    if len(trio) != 1:
        deny('version numbers out of lockstep: index.html app.js?v=%s, '
             'APP_VERSION=%s, version.txt=%s - bump all three to the same '
             'number' % (m_idx.group(1), m_app.group(1), version_txt))


def check_js_parses(changed):
    try:
        from py_mini_racer import MiniRacer  # only pay V8 startup on a push
    except ImportError:
        deny('the JS parser is missing (pip install mini-racer). Not '
             'checking would risk pushing a syntax error that blanks the '
             'live site, so the push is blocked until the parser is back.')
    ctx = MiniRacer()
    for path in changed:
        if not path.endswith('.js') or os.path.basename(path) in SKIP_PARSE:
            continue
        src = file_at('HEAD', path)
        if src is None:  # deleted in this push
            continue
        try:
            ctx.eval('new Function(' + json.dumps(src) + '); 0')
        except Exception as e:
            deny('%s does not parse: %s. This would blank the live site - '
                 'fix the syntax error and commit before pushing.'
                 % (path, str(e)[:400]))


def check_cache_busters(changed, index_html):
    old_index = file_at('origin/main', 'index.html')
    if old_index is None:
        return
    for path in changed:
        if path == 'index.html':
            continue
        ref = re.escape(path) + r'\?v=([^"\']+)'
        m_new = re.search(ref, index_html)
        if not m_new:
            continue  # not loaded via index.html with a cache-buster
        m_old = re.search(ref, old_index)
        if m_old and m_old.group(1) == m_new.group(1):
            deny('%s changed but index.html still loads %s?v=%s - bump its '
                 '?v= or browsers will keep serving the old cached file.'
                 % (path, path, m_new.group(1)))


def main():
    try:
        payload = json.load(sys.stdin)
    except Exception:
        sys.exit(0)
    cmd = (payload.get('tool_input') or {}).get('command') or ''
    if not is_push(cmd):
        sys.exit(0)

    index_html = file_at('HEAD', 'index.html')
    if index_html is None:
        sys.exit(0)  # not this repo's layout; nothing to guard

    check_lockstep(index_html)

    r = sh('git', 'diff', '--name-only', 'origin/main...HEAD')
    if r.returncode == 0:
        changed = [ln.strip() for ln in r.stdout.splitlines() if ln.strip()]
        check_js_parses(changed)
        check_cache_busters(changed, index_html)

    sys.exit(0)


if __name__ == '__main__':
    main()
