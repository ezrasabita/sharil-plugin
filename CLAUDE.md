# CLAUDE.md — SHARIL Plugin

Architecture reference for AI assistants (Claude Code, Cursor, etc.) contributing to this repo.

---

## What SHARIL is

SHARIL (Session History And Retained Intelligence Layer) gives Claude Code persistent memory across sessions. It captures every turn to disk at zero token cost, curates captures into a navigable board with a free local model (or a fallback heuristic), and injects the board on the next session start — warm start, no re-explaining.

## How to run

```bash
npm install    # dev deps only — zero runtime dependencies
npm test       # 39 tests — must all pass
npm run harden-check  # security invariants
npm run sec:deps      # npm audit
```

## Architecture

### The two files

SHARIL writes to exactly two files (inside `.sharil/` in the user's project):

| File | Written by | How | Purpose |
|---|---|---|---|
| `raw.log` | `appendRaw()` in `khazanah.js` | `fs.appendFileSync` — atomic O_APPEND | Durable capture of every turn. Never truncated. |
| `khazanah.md` | `setBoard()` in `khazanah.js` | `atomicWrite()` — tmp + rename | AL-FARID's curated board. Injected on startup. |

This separation removes all race conditions: the hot path (append per turn) never reads, and the cold path (board rewrite on curation) never appends.

### Key modules

| File | Role |
|---|---|
| `lib/alfred.js` | AL-FARID curator. Builds LLM prompt, calls llm.js, falls back to heuristic.js |
| `lib/khazanah.js` | Vault operations: ensure, appendRaw, setBoard, rawSince (with trust gate) |
| `lib/capture.js` | Reads transcript.jsonl, advances cursor, calls appendRaw for new turns |
| `lib/state.js` | Locked JSON state file: cursor, lastCuratedTs, boardMac, lastUntrusted |
| `lib/llm.js` | Ollama + Haiku backends. Returns `{ text, via }` |
| `lib/heuristic.js` | Pure JS curation — no model, no tokens, always works |
| `lib/provenance.js` | HMAC key generation + line stamping + verification |
| `lib/util.js` | `atomicWrite`, `withLock` (Atomics.wait sleep), `defangInjection` |
| `lib/config.js` | Config resolution: env vars > config.json > defaults |
| `hooks/` | Entry points wired into Claude Code's `.claude/settings.json` |

### Curator chain (never break this invariant)

```
Ollama local model (free) → Haiku via ANTHROPIC_API_KEY (cheap) → built-in heuristic (always)
```

AL-FARID **must not touch the board** if no curator is reachable — raw log stays intact, only un-summarised. See `lib/alfred.js` `curate()`.

### Trust gate

Every line written to `raw.log` is HMAC-stamped with a per-project key stored in `.sharil/state.json`. On curation, `rawSince()` verifies each line before passing it to AL-FARID. Unsigned or tampered lines are excluded and counted (`untrustedCount`). This prevents prompt injection from outside the session.

### Board integrity

The MAC of the board content is stored in `state.json`. On next curation, if the MAC doesn't match, the board is treated as tampered and rebuilt clean from `raw.log`.

## Tests

```bash
npm test     # runs test/run.js — 39 unit tests
```

Tests cover: capture cursor logic, curation output format, provenance stamp/verify, board integrity MAC, config resolution, defangInjection, heuristic section classification.

## Common gotchas

- `withLock` uses `Atomics.wait()` — valid on the Node.js main thread (hooks are sync scripts). Do not replace with async patterns.
- `appendRaw()` caps each line at 3500 bytes to stay under POSIX `PIPE_BUF` (~4096 bytes). Do not remove this cap.
- `atomicWrite` uses `O_EXCL` on the temp file to block symlink attacks. Do not simplify to a plain `fs.writeFileSync`.
- The board file (`khazanah.md`) is **derived** — it is always regenerable from `raw.log`. Never treat it as the source of truth for curation input; always read from `rawSince()`.
