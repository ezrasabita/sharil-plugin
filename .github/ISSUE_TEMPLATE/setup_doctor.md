---
name: Setup / Not Working
about: SHARIL installed but hooks aren't firing, memory isn't loading, or curation isn't running
labels: setup
---

## What's not working?

- [ ] Memory isn't loading on session start (Claude Code starts cold every time)
- [ ] Turns aren't being captured (raw.log stays empty)
- [ ] Curation isn't running (AL-FARID never summarizes)
- [ ] `sharil init` failed
- [ ] `sharil doctor` shows errors
- [ ] Something else

## sharil doctor output

```
<!-- Run `sharil doctor` in your project folder and paste the full output here. This is the most useful thing. -->
```

## How did you install?

```bash
# paste the exact install command you used
```

## Is Claude Code installed and running?

- [ ] Yes — Claude Code is installed and I've opened it in this project at least once after `sharil init`
- [ ] Not sure

## .claude/settings.json hooks section

```json
// paste the "hooks" section from .claude/settings.json (in your project folder) if it exists
```

## Environment

| Item | Value |
|---|---|
| OS | |
| Node.js version | <!-- node --version --> |
| SHARIL version | <!-- sharil --version --> |
| `SHARIL_CURATOR` | <!-- auto / ollama / haiku / none / not set --> |
| Ollama installed? | <!-- yes / no --> |
| Ollama model pulled? | <!-- ollama list output --> |
