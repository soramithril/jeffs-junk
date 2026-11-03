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
  3. Any changed file that an HTML entry point loads with ?v= got its ?v=
     bumped - every page at the repo root, not just index.html. Each page
     carries its OWN number for the same file, so bumping index.html does
     nothing for the others. Forgetting this is silent: the pushed file is
     correct, the browser simply never asks for it. inventory.html (the
     back-shop kiosk) sat 47 versions behind index.html on
     app-jwg-scheduler.js this way, from 2026-08-17 until it was caught on
     2026-08-28 - the check only ever looked at index.html.

  4. All of the above is read from the folder the push RUNS IN: the hook
     follows a `cd` / `Set-Location` / `pushd` before the push, or
     `git -C <folder> push`, starting from the session's folder. It used to
     read only the clone this script lives in. Sessions push from their own
     git worktrees, so one session's unfinished branch in the shared clone
     blocked every other session's push (2026-11-03), and a broken worktree
     would have been judged on the shared clone instead of on itself. A
     folder it cannot work out (a $variable, one that doesn't exist) blocks
     the push: write the folder out in full.

On failure it prints a PreToolUse deny decision and the push never runs.
Fixing the problem and pushing again is the only path through - by design.
"""
import json
import os
import re
import shlex
import subprocess
import sys

# The repository being pushed; main() sets it for each push in the command.
REPO = None

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


PUSH_RE = re.compile(r'\bgit\s+(?:\S+\s+)*?push\b')
CD_RE = re.compile(r'^\s*\(?\s*(?:cd|chdir|pushd|set-location|sl|push-location)'
                   r'\s+(?:-(?:literal)?path\s+)?(.+?)\s*\)?\s*$', re.I)
# git options that take the next token as their value
GIT_OPT_ARGS = {'-C', '-c', '--git-dir', '--work-tree', '--namespace',
                '--exec-path', '--super-prefix', '--config-env'}


def resolve_dir(base, path):
    """The folder `path` names, seen from `base`; None if it can't be known
    here (a shell variable) or doesn't exist."""
    if base is None:
        return None
    path = path.strip().strip('"\'')
    if not path or re.search(r'[$%`]', path):
        return None
    m = re.match(r'^/([a-zA-Z])(/.*)?$', path)  # Git Bash /c/Users -> C:/Users
    if os.name == 'nt' and m:
        path = m.group(1).upper() + ':' + (m.group(2) or '/')
    full = os.path.normpath(os.path.join(base, os.path.expanduser(path)))
    return full if os.path.isdir(full) else None


def push_folder(seg, here):
    """For a command segment that runs `git push`, the folder git runs in
    (None when it can't be worked out). False when it isn't a push."""
    try:
        # posix=False keeps Windows backslash paths whole (resolve_dir strips
        # the quotes it leaves on).
        toks = shlex.split(seg.strip().strip('()'), posix=False)
    except ValueError:  # quotes cut in half by the segment split
        return here if PUSH_RE.search(seg) else False
    for i, t in enumerate(toks):
        if re.sub(r'\.exe$', '', os.path.basename(t)) != 'git':
            continue
        where, j = here, i + 1
        while j < len(toks) and toks[j].startswith('-'):
            if toks[j] == '-C' and j + 1 < len(toks):
                where = resolve_dir(where, toks[j + 1])
            j += 2 if toks[j] in GIT_OPT_ARGS else 1
        if j < len(toks) and toks[j] == 'push':
            return where
    return False


def push_targets(cmd, start):
    """Every folder the command runs `git push` in, following any change of
    folder before it. None marks a push whose folder can't be worked out."""
    here, targets = start, []
    for seg in re.split(r'[;&|\n]+', cmd):
        m = CD_RE.match(seg)
        if m:
            here = resolve_dir(here, m.group(1))
            continue
        if not PUSH_RE.search(seg):
            continue
        where = push_folder(seg, here)
        if where is not False:
            targets.append(where)
    return targets


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

    def parse(label, src):
        try:
            ctx.eval('new Function(' + json.dumps(src) + '); 0')
        except Exception as e:
            deny('%s does not parse: %s. This would blank the live site - '
                 'fix the syntax error and commit before pushing.'
                 % (label, str(e)[:400]))

    for path in changed:
        src = file_at('HEAD', path)
        if src is None:  # deleted in this push
            continue
        if path.endswith('.js') and os.path.basename(path) not in SKIP_PARSE:
            parse(path, src)
        elif path.endswith('.html'):
            # The script INSIDE a page counts too. jeff.html carried an
            # unescaped apostrophe from 2026-08-22 to 2026-09-06 and served a
            # blank page on every phone for two weeks, because this check only
            # ever looked at separate .js files and walked straight past it.
            for i, m in enumerate(re.finditer(
                    r'<script(?![^>]*src=)[^>]*>(.*?)</script>', src, re.S)):
                block = m.group(1)
                if block.strip():
                    parse('%s (script block %d)' % (path, i + 1), block)


def html_entry_points():
    """Every tracked HTML page at the repo root, discovered rather than listed
    so a new entry point is guarded the day it lands instead of the day
    someone remembers it."""
    r = sh('git', 'ls-tree', '--name-only', 'HEAD')
    return sorted(n.strip() for n in r.stdout.splitlines()
                  if n.strip().endswith('.html'))


def check_cache_busters(changed):
    for page in html_entry_points():
        new_page = file_at('HEAD', page)
        old_page = file_at('origin/main', page)
        if new_page is None or old_page is None:
            continue  # page added in this push; nothing cached to go stale
        for path in changed:
            if path == page:
                continue
            ref = re.escape(path) + r'\?v=([^"\']+)'
            m_new = re.search(ref, new_page)
            if not m_new:
                continue  # this page doesn't load it with a cache-buster
            m_old = re.search(ref, old_page)
            if m_old and m_old.group(1) == m_new.group(1):
                deny('%s changed but %s still loads %s?v=%s - bump its ?v= '
                     'in %s or browsers will keep serving the old cached '
                     'file. Each page carries its own number.'
                     % (path, page, path, m_new.group(1), page))


def main():
    try:
        payload = json.load(sys.stdin)
    except Exception:
        sys.exit(0)
    cmd = (payload.get('tool_input') or {}).get('command') or ''
    start = payload.get('cwd') or os.getcwd()
    for folder in push_targets(cmd, start):
        if folder is None:
            deny('cannot tell which folder this git push runs in (a $variable '
                 'or a folder that does not exist). Write the folder out in '
                 'full - cd "C:/path/to/worktree" && git push ... - so the '
                 'check reads what is actually being pushed.')
        check_repo(folder)
    sys.exit(0)


def check_repo(folder):
    global REPO
    r = subprocess.run(['git', 'rev-parse', '--show-toplevel'], cwd=folder,
                       capture_output=True, text=True)
    if r.returncode != 0:
        return  # not a git folder; git push will refuse on its own
    REPO = r.stdout.strip()

    index_html = file_at('HEAD', 'index.html')
    if index_html is None:
        return  # not this repo's layout; nothing to guard

    check_lockstep(index_html)

    r = sh('git', 'diff', '--name-only', 'origin/main...HEAD')
    if r.returncode == 0:
        changed = [ln.strip() for ln in r.stdout.splitlines() if ln.strip()]
        check_js_parses(changed)
        check_cache_busters(changed)


if __name__ == '__main__':
    main()
