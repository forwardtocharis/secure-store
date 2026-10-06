#!/usr/bin/env python3
"""Context monitor for background subagents (used by the manager-mode skill).

Reads each background agent's transcript (<agentId>.output, JSONL), takes the
usage block of its most recent API response and sums input + cache_read +
cache_creation tokens. That is the size of the agent's latest request, i.e. its
real context. Prints one line per alert so the Monitor tool can turn each line
into a notification:

    WARN  <agentId> ctx=NNNNNN     first time an agent passes --warn
    HARD  <agentId> ctx=NNNNNN     first time an agent passes --hard
    LIMIT <agentId> <text>         agent's LAST message looks like a usage-limit message

Usage:
    context-monitor.py --dir <tasks dir>           # watch until killed
    context-monitor.py --dir <tasks dir> --once    # print current status and exit

If --dir is omitted it uses the most recently active folder matching
/tmp/claude-*/*/*/tasks (also /private/tmp and $TMPDIR). Pass --dir explicitly
when you know it: auto-detection can pick another session's folder.
"""
import argparse, glob, json, os, re, sys, tempfile, time

LIMIT_RE = re.compile(r"(usage limit|weekly limit|rate limit|limit reached|resets at)", re.I)
TAIL_BYTES = 4 * 1024 * 1024


def candidate_dirs():
    pats = ["/tmp/claude-*/*/*/tasks", "/private/tmp/claude-*/*/*/tasks"]
    if os.environ.get("TMPDIR"):
        pats.append(os.path.join(os.environ["TMPDIR"], "claude-*/*/*/tasks"))
    found = []
    for p in pats:
        found += [d for d in glob.glob(p) if os.path.isdir(d)]
    return found


def newest_mtime(d):
    files = glob.glob(os.path.join(d, "*.output"))
    return max((os.path.getmtime(f) for f in files), default=0)


def pick_dir():
    dirs = candidate_dirs()
    return max(dirs, key=newest_mtime) if dirs else None


def parse(path, full=False):
    """Return (ctx_tokens, last_assistant_text); ctx is None if no usage found."""
    size = os.path.getsize(path)
    with open(path, "rb") as fh:
        if size > TAIL_BYTES and not full:
            fh.seek(size - TAIL_BYTES)
            fh.readline()  # drop partial line
        data = fh.read().decode("utf-8", "replace")
    last_usage, last_text = None, ""
    for line in data.splitlines():
        try:
            o = json.loads(line)
        except Exception:
            continue
        m = o.get("message")
        if not isinstance(m, dict):
            continue
        u = m.get("usage")
        if u:
            last_usage = u
        if o.get("type") == "assistant":
            parts = [c.get("text", "") for c in (m.get("content") or [])
                     if isinstance(c, dict) and c.get("type") == "text"]
            if parts:
                last_text = " ".join(parts)
    if last_usage is None:
        if size > TAIL_BYTES and not full:
            return parse(path, full=True)
        return None, last_text
    ctx = sum(last_usage.get(k, 0) or 0 for k in
              ("input_tokens", "cache_read_input_tokens", "cache_creation_input_tokens"))
    return ctx, last_text


def load_state(path):
    try:
        return set(json.load(open(path)))
    except Exception:
        return set()


def save_state(path, state):
    try:
        json.dump(sorted(state), open(path, "w"))
    except Exception:
        pass


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir")
    ap.add_argument("--warn", type=int, default=300000)
    ap.add_argument("--hard", type=int, default=350000)
    ap.add_argument("--interval", type=int, default=60)
    ap.add_argument("--active-within", type=int, default=900,
                    help="ignore transcripts not modified in this many seconds (finished agents)")
    ap.add_argument("--state", default=os.path.join(tempfile.gettempdir(), "context-monitor-state.json"),
                    help="remembers alerts across restarts so re-arming does not repeat them")
    ap.add_argument("--once", action="store_true")
    a = ap.parse_args()

    d = a.dir or pick_dir()
    if not d or not os.path.isdir(d):
        print("ERROR no tasks directory found; pass --dir", flush=True)
        sys.exit(1)
    if not a.once:
        print(f"MONITORING {d} warn={a.warn} hard={a.hard}", flush=True)

    state = set() if a.once else load_state(a.state)
    while True:
        now = time.time()
        for f in sorted(glob.glob(os.path.join(d, "*.output"))):
            if not a.once and now - os.path.getmtime(f) > a.active_within:
                continue
            aid = os.path.basename(f)[:-len(".output")]
            ctx, text = parse(f)
            if ctx is None:
                continue
            if a.once:
                print(f"{aid[:12]} ctx={ctx}")
                continue
            if ctx >= a.hard and f"{aid}:hard" not in state:
                state |= {f"{aid}:hard", f"{aid}:warn"}
                print(f"HARD {aid[:12]} ctx={ctx}", flush=True)
            elif ctx >= a.warn and f"{aid}:warn" not in state:
                state.add(f"{aid}:warn")
                print(f"WARN {aid[:12]} ctx={ctx}", flush=True)
            if text and LIMIT_RE.search(text) and f"{aid}:limit" not in state:
                state.add(f"{aid}:limit")
                print(f"LIMIT {aid[:12]} {text[:160]!r}", flush=True)
        if a.once:
            return
        save_state(a.state, state)
        time.sleep(a.interval)


if __name__ == "__main__":
    main()
