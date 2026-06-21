#!/usr/bin/env node
'use strict';

/**
 * SHARIL CLI — init | status | doctor | curate | sync | capture | help
 *
 * `sharil init`   wires the four hooks into .claude/settings.json and creates
 *                 the Khazanah. Five-minute setup, then Claude Code has memory.
 */

const fs = require('fs');
const path = require('path');
const { loadConfig } = require('../lib/config');
const khazanah = require('../lib/khazanah');
const alfred = require('../lib/alfred');
const state = require('../lib/state');
const llm = require('../lib/llm');
const { atomicWrite } = require('../lib/util');

const HOOK_DIR = path.resolve(__dirname, '..', 'hooks');
const HOOKS = {
  SessionStart: path.join(HOOK_DIR, 'session-start.js'),
  Stop: path.join(HOOK_DIR, 'stop.js'),
  SessionEnd: path.join(HOOK_DIR, 'session-end.js'),
  PreCompact: path.join(HOOK_DIR, 'pre-compact.js'),
};

function log(s) {
  process.stdout.write(s + '\n');
}

// Ask a question interactively. Non-interactive (piped/CI) → resolves '' so we
// never hang.
function ask(question) {
  return new Promise((resolve) => {
    if (!process.stdin.isTTY) return resolve('');
    const rl = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(question, (a) => {
      rl.close();
      resolve(String(a || '').trim().toLowerCase());
    });
  });
}

function hasOllamaBinary() {
  try {
    const r = require('child_process').spawnSync('ollama', ['--version'], {
      stdio: 'ignore',
    });
    return !r.error && r.status === 0;
  } catch (_) {
    return false;
  }
}

function pullModel(model) {
  return new Promise((resolve) => {
    log('   Pulling ' + model + ' (this can take a few minutes the first time)…');
    const ch = require('child_process').spawn('ollama', ['pull', model], {
      stdio: 'inherit',
    });
    ch.on('close', (code) => resolve(code === 0));
    ch.on('error', () => resolve(false));
  });
}

function writeUserConfig(cfg, patch) {
  // nosemgrep: path-join-resolve-traversal — constant filename on derived cfg.home
  const p = path.join(cfg.home, 'config.json');
  let existing = {};
  try {
    existing = JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (_) {}
  // round-trip of the user's OWN config file; `patch` is internal (fixed keys).
  // loadConfig allowlists on read, so any stray keys here are inert.
  atomicWrite(p, JSON.stringify(Object.assign(existing, patch), null, 2)); // nosemgrep: insecure-object-assign
  return p;
}

function isWired(settings, scriptAbs) {
  const ev = settings && settings.hooks && settings.hooks.SessionStart;
  if (!Array.isArray(ev)) return false;
  return ev.some((group) =>
    (group.hooks || []).some(
      (h) =>
        h &&
        h.type === 'command' &&
        Array.isArray(h.args) &&
        h.args.includes(scriptAbs)
    )
  );
}

function addHook(settings, event, scriptAbs, timeout) {
  settings.hooks = settings.hooks || {};
  const arr = (settings.hooks[event] = settings.hooks[event] || []);
  // already wired? (command node + args contains our script)
  const wired = arr.some((group) =>
    (group.hooks || []).some(
      (h) =>
        h &&
        h.type === 'command' &&
        Array.isArray(h.args) &&
        h.args.some((a) => a === scriptAbs)
    )
  );
  if (wired) return false;
  arr.push({
    hooks: [
      {
        type: 'command',
        command: 'node',
        args: [scriptAbs],
        timeout: timeout || 30,
        statusMessage: 'SHARIL memory…',
      },
    ],
  });
  return true;
}

// Shared Ollama setup flow used by `init` (interactive) and `upgrade`.
async function setupOllamaFlow(cfg, model) {
  model = model || cfg.ollamaModel || 'llama3.2';
  // Validate before spawning ollama (defense in depth; spawn already shell-free).
  if (!/^[A-Za-z0-9._:\/-]+$/.test(model)) {
    log('   Invalid model name: ' + model + ' (allowed: letters, digits, . _ : / -)');
    return false;
  }
  if (!hasOllamaBinary()) {
    log('');
    log('   Ollama is not installed yet. Install it (free), then run `sharil upgrade`:');
    log('     • macOS / Windows: https://ollama.com/download');
    log('     • Linux: curl -fsSL https://ollama.com/install.sh | sh');
    return false;
  }
  const ok = await pullModel(model);
  if (!ok) {
    log('   Could not pull ' + model + '. Try manually: ollama pull ' + model);
    return false;
  }
  writeUserConfig(cfg, { curator: 'ollama', ollamaModel: model });
  // verify
  const up = await llm.probeOllama(cfg);
  const models = up ? await llm.listModels(cfg) : [];
  const good = models.some((m) => m.split(':')[0] === model.split(':')[0]);
  log(
    '   ' +
      (good
        ? '✅ Ollama ready — smart summaries enabled (' + model + ').'
        : '⚠ Pulled, but verification failed. Run `sharil doctor`.')
  );
  return good;
}

async function init() {
  const cfg = loadConfig();
  khazanah.ensure(cfg);

  const settingsPath = path.join(cfg.root, '.claude', 'settings.json');
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });

  let settings = {};
  if (fs.existsSync(settingsPath)) {
    try {
      settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    } catch (_) {
      const backup = settingsPath + '.sharil-backup-' + Date.now();
      fs.copyFileSync(settingsPath, backup);
      log('! Existing settings.json was invalid JSON. Backed up to: ' + backup);
      settings = {};
    }
  }

  let added = 0;
  added += addHook(settings, 'SessionStart', HOOKS.SessionStart, 45) ? 1 : 0;
  added += addHook(settings, 'Stop', HOOKS.Stop, 20) ? 1 : 0;
  added += addHook(settings, 'SessionEnd', HOOKS.SessionEnd, 45) ? 1 : 0;
  added += addHook(settings, 'PreCompact', HOOKS.PreCompact, 45) ? 1 : 0;

  atomicWrite(settingsPath, JSON.stringify(settings, null, 2));

  log('🗄️ SHARIL initialised.');
  log('   Project root : ' + cfg.root);
  log('   Khazanah      : ' + cfg.khazanah);
  log('   Settings     : ' + settingsPath);
  log('   Hooks wired  : ' + added + ' new (SessionStart, Stop, SessionEnd, PreCompact)');
  log('');
  log('   ✅ Works right now — built-in curator needs no model, no API key.');

  // Already have a smart curator? Report and finish.
  const haveKey = !!process.env.ANTHROPIC_API_KEY;
  const ollamaUp = await llm.probeOllama(cfg);
  const models = ollamaUp ? await llm.listModels(cfg) : [];
  const modelPulled = models.some(
    (m) => m.split(':')[0] === (cfg.ollamaModel || 'llama3.2').split(':')[0]
  );
  if ((ollamaUp && modelPulled) || haveKey) {
    log(
      '   ✅ Smart curation already available (' +
        (ollamaUp && modelPulled ? 'Ollama' : 'Haiku') +
        ').'
    );
    log('   Next: restart Claude Code in this project. Done.');
    log('');
    log('   💛 SHARIL is free forever. If it saves you time, an optional $1 tip helps a');
    log('      family-run project keep building — see README (skip freely, no nag).');
    return;
  }

  // Offer the upgrade interactively (auto-skips when non-interactive).
  log('   👉 Optional: smarter summaries via Ollama (free, local, private).');
  const ans = await ask(
    '\n   Set up Ollama now? [y]es / [s]kip for now (default) / [a]pi-key info: '
  );
  if (ans === 'y' || ans === 'yes') {
    await setupOllamaFlow(cfg);
  } else if (ans === 'a' || ans === 'api') {
    log('   To use Haiku instead: set ANTHROPIC_API_KEY, then `sharil doctor`.');
    log('     e.g.  export ANTHROPIC_API_KEY=sk-ant-...');
  } else {
    log('   👍 Skipped — using the built-in heuristic floor (works great).');
    log('      Upgrade anytime with:  sharil upgrade');
  }
  log('');
  log('   Next: `sharil doctor` to verify, then restart Claude Code in this project.');
  log('   💛 Free forever. If it helps, an optional $1 tip keeps it going — see README.');
}

async function upgrade() {
  const cfg = loadConfig();
  khazanah.ensure(cfg);
  log('🗄️ SHARIL upgrade — setting up Ollama for smarter summaries.');
  const arg = process.argv[3];
  const model = arg && !arg.startsWith('-') ? arg : cfg.ollamaModel || 'llama3.2';
  const ok = await setupOllamaFlow(cfg, model);
  if (!ok) log('   (No problem — the built-in floor keeps working meanwhile.)');
  else log('   Restart Claude Code to use the smarter curator.');
}

async function status() {
  const cfg = loadConfig();
  const s = state.load(cfg);
  const board = khazanah.getBoard(cfg);
  const raw = khazanah.getRaw(cfg);
  const rawLines = raw ? raw.split('\n').filter((l) => l.trim()).length : 0;
  const ollamaUp = await llm.probeOllama(cfg);
  const haikuKey = !!process.env.ANTHROPIC_API_KEY;

  log('🗄️ SHARIL status');
  log('   Khazanah        : ' + cfg.khazanah + (fs.existsSync(cfg.khazanah) ? ' ✓' : ' ✗ missing'));
  log('   Sessions seen  : ' + (s.sessions || 0));
  log('   Raw log lines  : ' + rawLines);
  log('   Last capture   : ' + (s.lastCaptureTs || '—'));
  log('   Last curation  : ' + (s.lastCuratedTs || '—'));
  log('   Curator mode   : ' + cfg.curator);
  log('   Ollama (local) : ' + (ollamaUp ? 'reachable ✓ (' + cfg.ollamaModel + ')' : 'not reachable'));
  log('   Haiku fallback : ' + (haikuKey ? 'API key present ✓' : 'no ANTHROPIC_API_KEY'));
  log('');
  log('   Board preview:');
  log('   ' + ((board || '(empty)').split('\n').slice(0, 12).join('\n   ')));
}

async function doctor() {
  const cfg = loadConfig();
  const nodeOk = parseInt(process.versions.node, 10) >= 16;
  const settingsPath = path.join(cfg.root, '.claude', 'settings.json');
  let wired = false;
  try {
    const st = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    wired = isWired(st, HOOKS.SessionStart);
  } catch (_) {}
  const ollamaUp = await llm.probeOllama(cfg);
  const models = ollamaUp ? await llm.listModels(cfg) : [];
  const modelOk =
    models.includes(cfg.ollamaModel) ||
    models.some((m) => m.split(':')[0] === cfg.ollamaModel.split(':')[0]);
  const haikuKey = !!process.env.ANTHROPIC_API_KEY;

  log('🗄️ SHARIL doctor');
  log('   Node >= 16        : ' + (nodeOk ? 'ok ✓' : 'FAIL (' + process.versions.node + ')'));
  log('   .sharil home      : ' + (fs.existsSync(cfg.home) ? 'ok ✓' : 'missing (run `sharil init`)'));
  log('   Khazanah file      : ' + (fs.existsSync(cfg.khazanah) ? 'ok ✓' : 'missing (run `sharil init`)'));
  log('   Hooks wired       : ' + (wired ? 'ok ✓' : 'NOT wired (run `sharil init`)'));
  log('   Ollama (local)    : ' + (ollamaUp ? 'reachable ✓' : 'not reachable'));
  if (ollamaUp) {
    log('   Configured model  : ' + cfg.ollamaModel + (modelOk ? ' ✓' : ' ✗ NOT pulled'));
    if (!modelOk) {
      log('     → installed: ' + (models.join(', ') || '(none)'));
      log('     → fix: set SHARIL_OLLAMA_MODEL or .sharil/config.json "ollamaModel" to one above,');
      log('            or run: ollama pull ' + cfg.ollamaModel);
    }
  }
  log('   Haiku fallback    : ' + (haikuKey ? 'API key present ✓' : 'no ANTHROPIC_API_KEY'));
  const smart = (ollamaUp && modelOk) || haikuKey;
  log('   Smart curation    : ' + (smart ? 'yes ✓ (' + (ollamaUp && modelOk ? 'Ollama' : 'Haiku') + ')' : 'no model — using heuristic floor'));
  log('   Heuristic floor   : always ✓ (no model/tokens needed — works for everyone)');
  log('   Curation usable   : yes ✓');
  if (cfg.curator === 'none') {
    log('     note: curator=none → capture only, no board (data still saved).');
  }
}

async function curate() {
  const cfg = loadConfig();
  const r = await alfred.curate(cfg);
  if (r.skipped) log('Nothing new to curate.');
  else if (r.ok) log('Board updated via ' + r.via + '. ✓');
  else log('Curation skipped: ' + r.reason);
}

function crew() {
  log('🗄️ SHARIL — Heritage Edition · the crew');
  log('');
  log('  🤵 AL-FARID  — the butler. Curates raw capture into the memory board.');
  log('  🗄️ HAFIZ  — the guardian. Provenance + defang + untrusted-data frame:');
  log('               keeps outside-injected/tampered memory out, flags it to you.');
  log('  🐦 KHATIB   — the sidekick. Captures every turn to raw.log (free) and');
  log('               keeps your parallel chat windows in sync.');
  log('');
  log('  Three independent modules, one mission: never forget, never get fooled.');
}

function help() {
  log('SHARIL — cross-session memory for Claude Code (Heritage Edition)');
  log('');
  log('Usage: sharil <command>');
  log('  init           Wire hooks + create the Khazanah (offers Ollama setup)');
  log('  upgrade [model] Set up Ollama for smarter summaries (default llama3.2)');
  log('  status         Show memory state, raw size, curator availability');
  log('  doctor         Diagnose setup problems');
  log('  curate         Run AL-FARID curation now (fold raw → board)');
  log('  sync           Alias for curate (future: push to knowledge graph)');
  log('  crew           Meet the crew (Al-Farid · Hafiz · Khatib)');
  log('  help           This message');
}

(async function main() {
  const cmd = (process.argv[2] || 'help').toLowerCase();
  try {
    if (cmd === 'init') return await init();
    if (cmd === 'upgrade') return await upgrade();
    if (cmd === 'status') return await status();
    if (cmd === 'doctor') return await doctor();
    if (cmd === 'curate' || cmd === 'sync') return await curate();
    if (cmd === 'crew') return crew();
    return help();
  } catch (e) {
    log('Error: ' + (e && e.message ? e.message : String(e)));
    process.exit(1);
  }
})();
