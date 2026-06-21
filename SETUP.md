# 🗄️ SHARIL — Setup & Usage Guide

There are two ways to read this:
- **Normal user** → just the first two sections. You'll be done in 2 minutes.
- **Advanced user** → keep going for the curator tiers, safety-net moves, and config.

---

# 👤 NORMAL USER

## What this actually does (plain words)

You talk to Claude Code. Normally, when you close the window, it forgets everything.
Next time you have to re-explain. SHARIL fixes that:

- **It quietly writes down every turn** as you go (costs nothing, all on your computer).
- **When you close**, a little butler called **AL-FARID** tidies those notes into a short
  board: your decisions, ideas, to-dos.
- **Next time you open Claude Code**, it reads that board first — so it remembers what
  you were doing. No re-explaining.

Run 3 windows at once? They all write to the **same memory**, so they stay in sync
automatically. You don't have to copy-paste between them.

## Install (2 minutes)

```bash
npm install -g sharil-plugin
cd /path/to/your/project
sharil init
```

`sharil init` will ask one question:

```
Set up Ollama now? [y]es / [s]kip for now / [a]pi-key info:
```

- Press **s** (skip) → done. It works right now with the built-in memory.
- Press **y** (yes) → it helps you set up a free local AI for *smarter* notes (see below).

Then restart Claude Code. That's it. **You never have to think about it again.**

## How to use it (you basically don't)

Just work normally. It runs in the background. But three things are handy to know:

1. **Want to see what it remembers?** Open the file `.sharil/khazanah.md` in your
   project — that's the memory board, in plain English.
2. **Want to peek at the live state?** Run `sharil status`.
3. **Want to be extra safe before closing something important?** You *don't need to* —
   it saves automatically — but if you want belt-and-braces, run `sharil curate`
   (think of it as *"Al-Farid, tidy everything up now."*). Optional. The auto-save
   already has you covered.

---

# 🧠 ADVANCED USER

## The two layers (and why nothing is ever lost)

| Layer | What | Cost | When |
|---|---|---|---|
| **Capture** | mirrors each turn to `.sharil/raw.log` (append-only) | 0 tokens, pure file write | every turn (Stop hook) |
| **Curate** | AL-FARID folds raw → the board in `.sharil/khazanah.md` | free/cheap (see tiers) | on close + before auto-compaction |

The data lives in `raw.log` and is **never** read-modified — only ever appended. The
board is a *derived, disposable* summary. So even if curation is skipped, crashes, or
3 windows write at once, **the raw data is safe**. The board can always be rebuilt
from it. (Proven with a 20-process concurrent-write test: zero lines lost.)

## Curator tiers (auto-selected, best available wins)

| Tier | Setup | Quality | Cost | Privacy | When to choose |
|---|---|---|---|---|---|
| 🥇 **Ollama (local)** | install + 1 model | Smart | **Free** | **100% local** | **Recommended for almost everyone** |
| 🥈 **Haiku (API)** | `ANTHROPIC_API_KEY` | Smart | ~cents/mo | summary text → API | already have a key, won't install |
| 🥉 **Heuristic** | nothing | Basic | Free | 100% local | starting out / locked-down box |

SHARIL picks the best one you have, automatically. No config needed to switch.

### Recommended: set up Ollama
```bash
# during init, press 'y' — or anytime:
sharil upgrade                 # pulls llama3.2, wires it, verifies
sharil upgrade qwen2.5:14b     # sharper summaries if you have 16GB+ RAM
```
`sharil upgrade` checks for the Ollama binary, pulls the model, writes
`.sharil/config.json`, and verifies. If Ollama isn't installed it tells you where to
get it, then you re-run `sharil upgrade`.

### Or use Haiku
```bash
export ANTHROPIC_API_KEY=sk-ant-...   # persist in your shell profile
sharil doctor                          # should show Haiku ✓
```

## Using it as a safety net (the "Al-Farid, make sure it's clean" move)

Day to day you do nothing — capture + curate are automatic, including a flush right
before Claude auto-compacts near the context limit (so you never lose the early part
of a long session). But if you want manual control:

| You want… | Command | Notes |
|---|---|---|
| Force a tidy-up now | `sharil curate` | *"Al-Farid, fold everything into the board."* Optional. |
| See the memory | open `.sharil/khazanah.md` | the board (top) is the readable summary |
| Audit raw history | open `.sharil/raw.log` | every turn, append-only — the safety net |
| Check health | `sharil doctor` | curator status, hooks wired, model pulled? |
| Live state | `sharil status` | raw size, last capture/curation, curator in use |

## Config (`.sharil/config.json`)
```json
{ "curator": "ollama", "ollamaModel": "qwen2.5:14b" }
```
Keys: `curator` (`auto`|`ollama`|`haiku`|`heuristic`|`none`), `ollamaModel`,
`ollamaUrl`, `haikuModel`, `anthropicVersion`, `khazanah`, `rawLog`.
Env overrides: `SHARIL_CURATOR`, `SHARIL_OLLAMA_MODEL`, `SHARIL_OLLAMA_URL`,
`ANTHROPIC_API_KEY`, `SHARIL_KHAZANAH`, `SHARIL_ROOT`.

## Multi-window / monorepo notes
- Each chat window has its own transcript → SHARIL tracks each independently (no
  cross-window thrash), but all curate into one shared board → they stay in sync.
- Monorepo with sub-projects? Set `SHARIL_ROOT` per project so they don't share one
  Khazanah unintentionally.

## Privacy & security (quick version — full details in SECURITY.md)
- Capture + heuristic + Ollama curation: **100% local**.
- Haiku (cloud) curation is **opt-in**: in `auto` mode nothing is sent to the API
  unless you set `SHARIL_ALLOW_CLOUD=1` (or `curator:"haiku"`). Default: off.
- `.sharil/` is **auto-gitignored** (it holds plaintext conversation) — keep it that way.
- The injected memory board is treated by Claude as **untrusted data** (framed +
  defanged) so poisoned notes can't hijack a session. See SECURITY.md.

## Troubleshooting
| Symptom | Fix |
|---|---|
| `doctor`: model `✗ NOT pulled` | `sharil upgrade <model>` or fix `ollamaModel` in config |
| Board empty after a chat | it only keeps salient lines (decisions/ideas/todos); run `sharil curate` |
| Hooks not firing | re-run `sharil init`, fully restart Claude Code |
| First Ollama summary slow | cold model load; later calls are seconds |
| Turn off summaries | config `{ "curator": "none" }` (capture still runs) |

---

*Normal users: install and forget. Advanced users: it's all files and one CLI — own it.*
