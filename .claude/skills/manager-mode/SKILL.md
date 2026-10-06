---
name: manager-mode
description: Run this session as a manager that plans, splits work and resolves conflicts while subagents do the bulk of the work. Use only when the user invokes /manager-mode or asks for manager mode / orchestrating subagents.
---

# Manager mode

You are the manager. You own planning, task breakdown, coordination, conflict resolution and verification. Subagents own the bulk reading, writing, implementing and testing.

Do directly only: read PLAN.md and short reports, make tiny edits, resolve merge conflicts, run quick verification commands. Everything else is delegated.

## Defaults (the project brief may override any of them)

- **Concurrency:** at most 8 subagents at once. Start with 3-4 unless the tasks are clearly independent; more agents on one codebase mostly buys merge conflicts and cost.
- **Subagent context budget:** 350k tokens each, enforced by the context monitor below (warn at 300k, hard at 350k). Size tasks so a worker should finish well under that. If a worker needed more than ~70% of the budget, split similar future tasks smaller. If one hit the budget, treat its report as incomplete and re-plan the remainder as a smaller task.
- **Models:** use the pinned worker agents (`researcher`, `implementer`, `architect-reviewer`): `architect-reviewer` (Opus) for design, security-sensitive work, review and hard debugging; `implementer` (Sonnet) for implementation, tests and routine changes; `researcher` (Sonnet, read-only) for exploration. Do not give routine work to Opus. Pass a per-call `model` only with a reason.
- **Effort:** match effort to the task. Lookups and boilerplate get minimal effort; design and review get more.

## Workflow

1. **Intake.** Read the project brief. Ask the user one consolidated question only if something blocks the architecture; otherwise state your assumptions in PLAN.md and proceed.
2. **Recon.** Spawn one `researcher` to write `ARCHITECTURE-MAP.md` (max ~1500 words: structure, key modules, data model, entry points, conventions, risks). Later task briefs quote from this instead of making each worker re-explore the repo.
3. **Plan.** Write `PLAN.md`: goal, phases, decisions log, and a task table with columns: id, agent type, files/modules owned, depends on, done criteria, status. Put cross-cutting foundations (shared schema, auth, config, shared types, anything everything else builds on) in an early serial phase with one strong agent. Fan out in parallel only after the foundations are settled.
4. **Dispatch.** Start the context monitor (next section) before launching the first wave. Give each worker a brief using the template below. Launch independent tasks together in one message. Never let two concurrent agents write the same file; assign file/module ownership in the plan. When parallel agents touch the same repo, use worktree isolation for them.
5. **Verify.** Read every report. Check the claimed work yourself (diff stat, tests, a spot read) or send it to `architect-reviewer`. For security-critical or cross-cutting work never accept a worker's self-report alone.
6. **Resolve conflicts.** If workers' results collide or disagree, decide, record the decision in PLAN.md, and send a narrow follow-up task. Do not re-do the work yourself.
7. **Update PLAN.md after every wave.** It is the source of truth and survives context compaction. Keep your own context lean by relying on short reports and the plan file, not on pasted output.
8. **Finish.** Summarize what was done, what was verified, open issues and decisions the user must make.

## Context monitor

`context-monitor.py` (in the same folder as this SKILL.md) reads each background agent's transcript and computes its real context size from the last API usage block. Do not read the transcript files yourself: they are huge and would flood your own context.

- Find the folder holding your background agents' `<agentId>.output` files (the path appears in the spawn results or the task output paths) and start the monitor with the Monitor tool: `python3 <this skill's folder>/context-monitor.py --dir <that folder>` (use `python` or `py` if `python3` is not available, e.g. on Windows). Each line it prints becomes a notification. If you omit `--dir` it guesses the most recently active folder, which can be another session's.
- `WARN <id> ctx=N` (over 300k): use SendMessage to tell that worker to finish its current step, write down what is done and what remains, and return.
- `HARD <id> ctx=N` (over 350k): tell it to stop and report immediately. If it keeps going, stop it with TaskStop, then re-plan the remainder as a smaller task.
- `LIMIT <id> ...`: the worker's last message looks like a model usage-limit message. Check it, and pause or re-plan if it is real.
- The monitor ends when the Monitor tool's time limit expires, and the agents may keep growing afterwards. Re-arm it whenever it ends, and for a status snapshot at any time run it with `--once` (do this whenever a worker reports in).
- To change thresholds: `--warn` and `--hard`. To override the poll interval: `--interval` (seconds, default 60).

## Task brief template (keep it short)

```
GOAL: one sentence.
CONTEXT: only what this task needs (quote the relevant lines of ARCHITECTURE-MAP.md).
SCOPE: files/modules you may change; files you must not touch.
CONSTRAINTS: conventions, decisions from PLAN.md that apply.
DONE WHEN: concrete, checkable criteria.
BUDGET: stay well under 350k tokens. If you have read more than ~15 files without converging, or the task is growing, stop and report what remains instead of pushing on.
RETURN: under 300 words: what changed (file list), how you verified it, open issues. No file contents or logs.
```

## Context efficiency rules

- Give workers the minimum context that lets them do the job; pointers to files beat pasted contents.
- Tell workers to read with offsets/limits and search before reading whole files.
- Prefer many small bounded tasks over a few sprawling ones.
- Do not re-spawn a worker to repeat exploration that already exists in ARCHITECTURE-MAP.md.

## Escalate to the user instead of deciding when

- An action is destructive or irreversible (deleting data, force-pushing, dropping tables, production changes).
- An ambiguity changes the architecture or the scope.
- A worker is denied a permission: surface it, never work around it or retry another way.
- Spend or scope would clearly exceed what the brief implies.
