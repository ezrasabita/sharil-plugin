# 🗄️ SHARIL — Heritage Edition

### Session History And Retained Intelligence Layer — cross-session memory for Claude Code

> *Built at 3am by a man who was tired of explaining himself to his own AI.*

**The crew** (three independent modules, one mission — never forget, never get fooled):
- 🤵 **Al-Farid** — the butler. Curates your captured turns into a clean memory board.
- 🗄️ **Hafiz** — the guardian. Provenance + defang + untrusted-data frame keep
  outside-injected or tampered memory out, and flag it to you.
- 🐦 **Khatib** — the sidekick. Captures every turn (free) and keeps parallel chat
  windows in sync.

`sharil crew` shows them anytime.

Claude Code starts every session cold. It forgets what you decided yesterday, what
the other chat window is doing, and everything that scrolled out of the context
window. So you re-explain. And re-explain. SHARIL fixes that.

SHARIL auto-captures every turn (**zero token cost**), curates it into a navigable
board with a free local model (**AL-FARID**), and injects that board the next time
you open Claude Code — so it wakes up **warm**, knowing what happened across all
your sessions and chat windows.

---

## Why it's different

| | SHARIL |
|---|---|
| **Runs automatically** | Hooks fire on every turn, on close, and before compaction — no manual trigger |
| **Costs ~nothing** | Capture is mechanical (a script, not the model). Curation runs on a free local model (Ollama) or cheap Haiku |
| **Never loses data** | Every turn is mirrored to disk as it happens. Hard-kill, crash, or context-limit — it's already saved |
| **Cross-chatbox** | 3 windows? They all write to one Khazanah. Any session reads what all of them did |
| **Free forever** | MIT license |

---

## The core idea: separate SAVE from CURATE

The trick that makes "never forget" and "minimum tokens" stop fighting:

```
SAVE   →  a hook script appends each turn to disk   →  0 model tokens
CURATE →  AL-FARID summarizes into a board            →  cheap (local model / Haiku)
LOAD   →  next session reads the ~500-token board   →  warm start
```

Your AI tokens are spent only on **thinking** — never on **remembering**.

---

## Install

```bash
npm install -g sharil-plugin     # (or: npx sharil-plugin init)
cd /path/to/your/project
sharil init                      # wires hooks into .claude/settings.json
sharil doctor                    # check curator availability
```

Restart Claude Code in that project. Done — it now has memory.

> **Curation works out of the box for everyone** — a built-in heuristic curator
> (pure JavaScript, no model, no tokens, no internet) is the universal floor.
> If you *also* have [Ollama](https://ollama.com) (`ollama pull llama3.2`, free) or
> set `ANTHROPIC_API_KEY` (Haiku), AL-FARID automatically upgrades to LLM-quality
> summaries. Nothing to configure either way.

### Curation tiers (auto-selected, best available wins)

| You have… | Capture (never lose data) | Board quality |
|---|---|---|
| Nothing | ✅ | ✅ basic — built-in heuristic |
| Ollama (free, local) | ✅ | ✅✅ smart, free |
| `ANTHROPIC_API_KEY` | ✅ | ✅✅ smart, ~cents |

> **👉 Recommended: install Ollama** (free, local, private, smart). Full step-by-step
> for all three tiers in **[SETUP.md](./SETUP.md)**.

---

## How it works

### The Khazanah (`.sharil/khazanah.md`)
One file, two zones:

- **AL-FARID's Board** — curated, sectioned (Projects / Ideas / Facts / Decisions /
  Open Loops / Council Verdicts). This is what gets injected on startup.
- **Raw Capture Log** — append-only mirror of every turn. The safety net. Never read
  in full at startup (too big); used for recovery and curation.

### The four hooks

| Hook | Fires when | What it does |
|---|---|---|
| **SessionStart** | session opens/resumes | Curates any orphaned raw (e.g. after a crash), injects the board as context |
| **Stop** | after each Claude reply | Appends the new turn to the raw log (mechanical, instant) |
| **SessionEnd** | graceful close | Captures final turns, runs AL-FARID curation |
| **PreCompact** | before compaction (incl. auto near the context limit) | Flushes durable facts to disk **before** old turns are dropped — no loss at the wall |

### AL-FARID
The butler. Reads new raw capture since the last curation and folds it into the
board. Curator chain: **Ollama (free) → Haiku (cheap) → built-in heuristic (always
available, no model)**. So curation never fails — worst case you still get a
keyword-sorted board with zero dependencies. Never invents, never loses.

---

## Commands

```bash
sharil init      # wire hooks + create the Khazanah
sharil status    # memory state, raw size, curator availability, board preview
sharil doctor    # diagnose setup (node, hooks, model pulled?)
sharil curate    # run AL-FARID now (fold raw → board)
sharil sync      # alias for curate
sharil help
```

---

## Configuration

All optional. Defaults work out of the box.

**Env vars:**
- `SHARIL_CURATOR` — `auto` (default) | `ollama` | `haiku` | `none`
- `SHARIL_OLLAMA_MODEL` — default `llama3.2` (use any you've pulled, e.g. `qwen2.5:14b`)
- `SHARIL_OLLAMA_URL` — default `http://localhost:11434`
- `SHARIL_HAIKU_MODEL` — verify the current Haiku model id for your account
- `SHARIL_KHAZANAH` — point at a custom Khazanah path
- `SHARIL_ROOT` — override project root detection
- `ANTHROPIC_API_KEY` — enables the Haiku fallback

**Or** `.sharil/config.json`:
```json
{ "curator": "ollama", "ollamaModel": "qwen2.5:14b" }
```

---

## FAQ

**Does this send my data anywhere?**
No — capture and (with Ollama) curation are 100% local. Only the optional Haiku
fallback makes a network call, and only if you set an API key.

**What if I close the terminal without exiting cleanly?**
Covered. Every turn was already written by the Stop hook. The next SessionStart
detects the un-curated tail and folds it in. Nothing is lost.

**What about the context-window limit?**
The PreCompact hook (which fires on auto-compaction near the limit) flushes durable
facts to the Khazanah *before* old turns are dropped. The window is working memory;
the Khazanah is the disk.

**Does it cost tokens?**
Capture: zero. Curation: zero with the built-in heuristic, zero on Ollama (local),
or a few cents on Haiku. Startup injection: ~500 tokens of board, far less than
re-reading files or re-explaining yourself.

**Do I need Ollama or an API key?**
No. The built-in heuristic curator works with nothing installed. Ollama/Haiku are
optional upgrades for smarter summaries.

---

## 💛 Support (totally optional)

SHARIL is free forever (MIT). No paywall, no nag. But it's built by a family man,
one log at a time — if it saves you time, you can tip **$1**. Skip it freely; using
and starring the project helps just as much.

- ☕ Ko-fi / Buy Me a Coffee: **https://ko-fi.com/ezrasabita**
- 💬 Hit a snag, or wish a tool like this existed? DM me on X: **[@ezrasabita](https://x.com/ezrasabita)** — some ideas become the next free drop.
- 💖 GitHub Sponsors: the **Sponsor** button at the top of the repo
- Every dollar keeps my Claude subscription running so I can keep shipping free tools.

## License

MIT © 2026 Mohd Sharil. Built because we needed it. Shared because you do too.
