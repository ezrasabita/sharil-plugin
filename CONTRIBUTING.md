# Contributing to SHARIL

Thanks for showing interest. SHARIL is MIT-licensed and contributions are welcome.

## Quick start

```bash
git clone https://github.com/ezrasabita/sharil-plugin.git
cd sharil-plugin
npm install          # installs dev deps (eslint, fast-check)
npm test             # 39 tests — all must pass before a PR
npm run harden-check # security invariants check
```

## Architecture overview

```
sharil-plugin/
├── bin/sharil.js          ← CLI entry point (init / status / doctor / curate)
├── hooks/                 ← Hook scripts wired by `sharil init` into .claude/settings.json
│   ├── session-start.js   ← Curates orphaned raw on open, injects board as context
│   ├── stop.js            ← Appends each turn to raw.log (zero cost, mechanical)
│   ├── session-end.js     ← Captures final turns, runs AL-FARID curation
│   └── pre-compact.js     ← Flushes facts before compaction so nothing is lost
├── lib/
│   ├── alfred.js          ← AL-FARID curator: reads raw deltas → writes board
│   ├── khazanah.js        ← The vault: raw.log (append-only) + khazanah.md (board)
│   ├── capture.js         ← Turn extraction from transcript, cursor tracking
│   ├── state.js           ← Locked JSON state (cursor, last curated timestamp, MACs)
│   ├── llm.js             ← Ollama / Haiku backends for curation
│   ├── heuristic.js       ← Universal curation floor (no model, no tokens, always works)
│   ├── provenance.js      ← HMAC stamping + verification of raw.log lines
│   ├── transcript.js      ← Claude Code transcript (.jsonl) reader
│   ├── config.js          ← Config resolution (env vars → config.json → defaults)
│   └── util.js            ← atomicWrite, withLock, defangInjection
└── templates/
    └── khazanah.template.md  ← Default Khazanah file written by `sharil init`
```

## Curator chain (important before touching lib/alfred.js or lib/llm.js)

```
Ollama (local, free) → Haiku (cheap, needs ANTHROPIC_API_KEY) → built-in heuristic (always)
```

AL-FARID always falls back to the heuristic — curation never fails even with no model installed. Any change to the curator must preserve this guarantee.

## Making a change

1. Fork → clone → `npm install`
2. Make your change
3. `npm test` — all 39 tests must pass
4. `npm run harden-check` — security invariants must pass
5. Open a PR against `master`

## Reporting bugs

Use the [Bug Report](.github/ISSUE_TEMPLATE/bug_report.md) template. The `sharil doctor` output (run `sharil doctor` in your project) is the most useful thing you can include.

## Questions

Open a GitHub Discussion or DM [@ezrasabita](https://x.com/ezrasabita) on X.
