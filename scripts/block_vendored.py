#!/usr/bin/env python3
"""Block hand-edits to vendored files.

motion.min.js is vendored motion.dev v12.43.0 - 140 KB of minified code that
CLAUDE.md says to never edit, only replace wholesale to upgrade. A hand-edit
there is invisible in review and lost the next time the library is replaced.
Until now that rule was an honour system.

Wired as a PreToolUse hook on Edit/Write in .claude/settings.json.
"""
import json
import os
import sys

PROTECTED = {'motion.min.js'}


def main():
    try:
        payload = json.load(sys.stdin)
    except Exception:
        sys.exit(0)
    name = os.path.basename((payload.get('tool_input') or {}).get('file_path') or '')
    if name not in PROTECTED:
        sys.exit(0)
    print(json.dumps({
        'hookSpecificOutput': {
            'hookEventName': 'PreToolUse',
            'permissionDecision': 'deny',
            'permissionDecisionReason':
                'EDIT BLOCKED by scripts/block_vendored.py - %s is vendored '
                '(motion.dev v12.43.0). CLAUDE.md: never edit it by hand; '
                'replace the whole file to upgrade.' % name,
        }
    }))
    sys.exit(0)


if __name__ == '__main__':
    main()
