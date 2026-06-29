# Changelog

All notable changes to SHARIL are documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)
Versioning: [Semantic Versioning](https://semver.org/spec/v2.0.0.html)

---

## [1.0.1] — 2026-06-30

### Fixed
- Removed committed dev artifact `.claude-flow/data/pending-insights.jsonl` that exposed local file paths (privacy leak)
- Added `.claude-flow/` to `.gitignore` to prevent re-occurrence
- Synced `package.json` version to `1.0.1` (was `1.0.0`, mismatch with `.claude-plugin/plugin.json`)
- Completed heritage rebrand: renamed all internal `ALFRED` references to `AL-FARID` in `lib/alfred.js` comments and LLM prompt
- Renamed board markers from `<!-- ALFRED-BOARD-START/END -->` to `<!-- SHARIL-BOARD-START/END -->` with automatic migration for existing installs
- Renamed `templates/batcave.template.md` → `templates/khazanah.template.md`; updated Batman-themed content to heritage theme
- Replaced busy-spin lock (`while (Date.now() < until) {}`) with `Atomics.wait()` in `lib/util.js` — eliminates CPU burn on lock retry
- Added 3500-byte cap per line in `appendRaw()` to guarantee POSIX `O_APPEND` atomicity under concurrent writers; updated comments to be honest about the `PIPE_BUF` contract

### Added
- `CLAUDE.md` in repo root — architecture context for AI assistants contributing to the project
- `CONTRIBUTING.md` — contributor guide
- `CHANGELOG.md` — this file
- `CODE_OF_CONDUCT.md` — Contributor Covenant
- `.github/ISSUE_TEMPLATE/` — bug report, feature request, setup/doctor templates
- `.github/PULL_REQUEST_TEMPLATE.md` — PR checklist
- `.github/workflows/ci.yml` — automated test + security audit on every push and PR
- `.github/workflows/publish.yml` — automated npm publish on `v*` tags
- `.github/dependabot.yml` — weekly automated dependency updates
- README badges (npm version, license, Node.js, CI status)

---

## [1.0.0] — 2026-06-20

### Added
- Initial release of SHARIL — Session History And Retained Intelligence Layer
- Zero-dependency hook system that auto-captures every Claude Code turn to disk
- `AL-FARID` curator chain: Ollama (local, free) → Haiku (cheap) → built-in heuristic (always available)
- Cross-chatbox sync: multiple Claude Code windows write to one Khazanah
- Provenance stamping: HMAC per line in `raw.log` — detects outside injection and tampering
- Board integrity MAC: detects hand-edits to `khazanah.md`
- `sharil init` — wires hooks into `.claude/settings.json`, creates Khazanah
- `sharil status` — memory state, curator availability, board preview
- `sharil doctor` — diagnoses setup (Node, hooks, model availability)
- `sharil curate` / `sharil sync` — run AL-FARID on demand
- PreCompact hook: flushes facts before context compaction (nothing lost at the wall)
- 39 tests covering capture, curation, provenance, board integrity, config, and security
- MIT License
