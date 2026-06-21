'use strict';

/**
 * SHARIL config resolution.
 * Zero dependencies. Resolves where the Khazanah and state live, and which
 * curator (local Ollama / Haiku / none) ALFRED should use.
 *
 * Resolution order for project root:
 *   1. env SHARIL_ROOT
 *   2. env CLAUDE_PROJECT_DIR (set by Claude Code)
 *   3. walk up from cwd looking for .sharil / .claude / .git
 *   4. cwd
 */

const fs = require('fs');
const path = require('path');

function findProjectRoot(start) {
  let dir = start || process.cwd();
  for (let i = 0; i < 50; i++) {
    if (
      fs.existsSync(path.join(dir, '.sharil')) ||
      fs.existsSync(path.join(dir, '.claude')) ||
      fs.existsSync(path.join(dir, '.git'))
    ) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return start || process.cwd();
}

function loadConfig(cwd) {
  const root =
    process.env.SHARIL_ROOT ||
    process.env.CLAUDE_PROJECT_DIR ||
    findProjectRoot(cwd);

  const home = path.join(root, '.sharil');

  const defaults = {
    root,
    home,
    khazanah: process.env.SHARIL_KHAZANAH || path.join(home, 'khazanah.md'),
    rawLog: process.env.SHARIL_RAWLOG || path.join(home, 'raw.log'),
    state: path.join(home, 'state.json'),
    anthropicVersion: process.env.SHARIL_ANTHROPIC_VERSION || '2023-06-01',
    // curator: auto | ollama | haiku | heuristic | none
    //   auto      → Ollama (free) → Haiku (key) → heuristic floor (always works)
    //   heuristic → no-model keyword curator only (zero deps, works for everyone)
    //   none      → capture only, no board (data still saved)
    curator: process.env.SHARIL_CURATOR || 'auto',
    ollamaUrl: process.env.SHARIL_OLLAMA_URL || 'http://localhost:11434',
    // Common, small, fast, and usually already pulled. Override per-machine in
    // .sharil/config.json or SHARIL_OLLAMA_MODEL (e.g. "qwen2.5:14b").
    ollamaModel: process.env.SHARIL_OLLAMA_MODEL || 'llama3.2',
    // NOTE: verify the current Haiku model id for your account; configurable.
    haikuModel: process.env.SHARIL_HAIKU_MODEL || 'claude-3-5-haiku-20241022',
    // PRIVACY: the Haiku fallback sends captured text to the Anthropic API.
    // OFF by default in 'auto' mode — opt in with SHARIL_ALLOW_CLOUD=1, config
    // { "allowCloud": true }, or by setting curator:'haiku' explicitly.
    allowCloud:
      process.env.SHARIL_ALLOW_CLOUD === '1' ||
      process.env.SHARIL_ALLOW_CLOUD === 'true',
    // cap how much assistant text we mirror per turn into the raw log
    rawAssistantCap: 2000,
    // how many recent raw lines to feed ALFRED at most
    maxRawForCuration: 400,
  };

  // optional user override file: .sharil/config.json
  // SECURITY: config.json lives in the (possibly synced/shared) vault, so it is
  // treated as untrusted for WRITE PATHS — any path key that escapes .sharil/ is
  // ignored. (Explicit env vars below are trusted: they come from the user shell.)
  // ALLOWLIST merge (no blanket Object.assign): config.json is untrusted, so only
  // known keys are accepted, path keys must stay inside .sharil/, and ollamaUrl
  // must be localhost (an untrusted remote URL would exfiltrate curation text).
  const cfgPath = path.join(home, 'config.json');
  if (fs.existsSync(cfgPath)) {
    try {
      const user = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
      const base = path.resolve(home); // nosemgrep: path-join-resolve-traversal
      const LOCAL = ['localhost', '127.0.0.1', '::1', '[::1]'];
      const ALLOW = [
        'curator', 'ollamaModel', 'ollamaUrl', 'haikuModel', 'anthropicVersion',
        'allowCloud', 'rawAssistantCap', 'maxRawForCuration', 'khazanah', 'rawLog',
      ];
      for (const k of ALLOW) {
        if (user[k] === undefined) continue;
        if (k === 'khazanah' || k === 'rawLog') {
          // resolve solely to VALIDATE containment; escaping paths are rejected,
          // never used for I/O — this is the guard, not a sink.
          const r = path.resolve(String(user[k])); // nosemgrep: path-join-resolve-traversal
          if (!(r === base || r.startsWith(base + path.sep))) continue; // escape → ignore
        }
        if (k === 'ollamaUrl') {
          let host = null;
          try {
            host = new URL(String(user[k])).hostname;
          } catch (_) {
            continue;
          }
          if (!LOCAL.includes(host)) continue; // remote curator URL → ignore
        }
        defaults[k] = user[k];
      }
    } catch (_) {
      /* ignore malformed config — never break a session over it */
    }
  }

  // env overrides always win over file
  if (process.env.SHARIL_KHAZANAH) defaults.khazanah = process.env.SHARIL_KHAZANAH;
  if (process.env.SHARIL_CURATOR) defaults.curator = process.env.SHARIL_CURATOR;

  // keep derived paths consistent with root/home
  defaults.root = root;
  defaults.home = home;
  return defaults;
}

module.exports = { loadConfig, findProjectRoot };
