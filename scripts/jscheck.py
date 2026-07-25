"""Rough JS balance check: strips comments/strings, then verifies bracket nesting.
Not a parser - but it catches the errors that actually blank the site."""
import sys

PAIRS = {')': '(', ']': '[', '}': '{'}
KEYWORDS = ('return', 'typeof', 'case', 'in', 'of', 'new', 'delete', 'do', 'else', 'yield')


def _regex_ok(s, i):
    """True if a '/' at i starts a regex rather than a division."""
    j = i - 1
    while j >= 0 and s[j] in ' \t\n\r':
        j -= 1
    if j < 0:
        return True
    p = s[j]
    if p in '(,=:[!&|?{};+-*%~^<>':
        return True
    if p.isalnum() or p == '_':
        k = j
        while k >= 0 and (s[k].isalnum() or s[k] == '_'):
            k -= 1
        return s[k + 1:j + 1] in KEYWORDS
    return False


def check(fn):
    s = open(fn, encoding='utf-8', errors='replace').read()
    i, n = 0, len(s)
    stack = []
    line = 1
    while i < n:
        c = s[i]
        if c == '\n':
            line += 1
            i += 1
            continue
        # line comment
        if c == '/' and i + 1 < n and s[i + 1] == '/':
            while i < n and s[i] != '\n':
                i += 1
            continue
        # block comment
        if c == '/' and i + 1 < n and s[i + 1] == '*':
            i += 2
            while i + 1 < n and not (s[i] == '*' and s[i + 1] == '/'):
                if s[i] == '\n':
                    line += 1
                i += 1
            i += 2
            continue
        # string / template literal
        if c in '"\'`':
            q = c
            start = line
            i += 1
            while i < n:
                if s[i] == '\\':
                    i += 2
                    continue
                if s[i] == '\n':
                    line += 1
                    if q != '`':
                        print('  ! unterminated %s string opened at line %d' % (q, start))
                        return False
                if s[i] == q:
                    break
                i += 1
            i += 1
            continue
        # regex literal — only where a value may start, else it's division.
        # Without this, /^rgba?\(/ and /"/g read as stray brackets/quotes.
        if c == '/' and _regex_ok(s, i):
            i += 1
            in_class = False
            while i < n:
                if s[i] == '\\':
                    i += 2
                    continue
                if s[i] == '[':
                    in_class = True
                elif s[i] == ']':
                    in_class = False
                elif s[i] == '/' and not in_class:
                    break
                elif s[i] == '\n':
                    break
                i += 1
            i += 1
            continue
        if c in '([{':
            stack.append((c, line))
            i += 1
            continue
        if c in ')]}':
            if not stack:
                print('  ! stray %s at line %d' % (c, line))
                return False
            o, ol = stack.pop()
            if o != PAIRS[c]:
                print('  ! %s at line %d closes %s opened at line %d' % (c, line, o, ol))
                return False
            i += 1
            continue
        i += 1
    if stack:
        o, ol = stack[-1]
        print('  ! unclosed %s opened at line %d' % (o, ol))
        return False
    return True


ok = True
for f in sys.argv[1:]:
    r = check(f)
    ok = ok and r
    print(('OK   ' if r else 'FAIL ') + f)
sys.exit(0 if ok else 1)
