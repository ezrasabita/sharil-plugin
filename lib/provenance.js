'use strict';

/**
 * Trusted Provenance — tamper / outside-injection detection. ZERO tokens, ZERO
 * deps (Node's built-in crypto only).
 *
 * Premise (the owner's insight): SHARIL's ONLY legitimate input is the user's own
 * sessions, written through appendRaw. So every line SHARIL writes is stamped with
 * an HMAC only SHARIL holds (.sharil/.key, 0600, gitignored). On read, lines are
 * verified: a valid stamp = it came from your sessions (trusted); a missing/invalid
 * stamp = it was injected from OUTSIDE the pipeline (a sync peer, another process,
 * a hand edit) → untrusted → excluded + flagged.
 *
 * Honest limit: the key lives on the same disk. An attacker who can READ .key
 * (full local read as your user) can forge stamps — out of scope (game-over
 * regardless). This defends against writers who can touch the files but not read
 * the key: Obsidian-sync conflicts/peers, sandboxed or other-user processes.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const SEP = '\x1f'; // unit separator → unambiguous MAC delimiter
const TAGLEN = 32; // hex chars kept (128-bit)
const LINE_RE = /^\[([^\]]+)\]\s+#([0-9a-f]{32})\s+([\s\S]*)$/;

const _keys = {}; // cache by key path (so multiple vaults/tests don't collide)

function keyPath(cfg) {
  // constant filename; cfg.home is derived + containment-checked (config.js)
  return path.join(cfg.home, '.key'); // nosemgrep: path-join-resolve-traversal
}

function writeGitignore(cfg) {
  const gi = path.join(cfg.home, '.gitignore'); // nosemgrep: path-join-resolve-traversal
  if (!fs.existsSync(gi)) {
    try {
      fs.writeFileSync(gi, '# SHARIL local memory — do not commit\n*\n');
    } catch (_) {}
  }
}

/**
 * Get (or first-time mint) the per-install secret key. Creation is atomic
 * (O_EXCL) so concurrent processes can't mint two different keys. On first mint,
 * any pre-existing raw.log is re-stamped (trust-on-first-use; the log is clean at
 * install time).
 */
function ensureKey(cfg) {
  const kp = keyPath(cfg);
  if (_keys[kp]) return _keys[kp];
  try {
    _keys[kp] = fs.readFileSync(kp);
    return _keys[kp];
  } catch (_) {}
  // not present → create exclusively
  fs.mkdirSync(cfg.home, { recursive: true });
  writeGitignore(cfg); // ensure .key is ignored before it ever exists
  const key = crypto.randomBytes(32);
  try {
    const fd = fs.openSync(kp, 'wx'); // O_EXCL: only one creator wins
    try {
      fs.writeSync(fd, key);
    } finally {
      fs.closeSync(fd);
    }
    try {
      fs.chmodSync(kp, 0o600);
    } catch (_) {}
    _keys[kp] = key;
    migrateRawLog(cfg, key); // one-time TOFU re-stamp of any existing lines
    return key;
  } catch (e) {
    if (e && e.code === 'EEXIST') {
      _keys[kp] = fs.readFileSync(kp); // someone else minted it → use theirs
      return _keys[kp];
    }
    throw e;
  }
}

function tag(key, ts, body) {
  return crypto
    .createHmac('sha256', key)
    .update(ts + SEP + body)
    .digest('hex')
    .slice(0, TAGLEN);
}

function stampLine(key, ts, body) {
  return '[' + ts + '] #' + tag(key, ts, body) + ' ' + body;
}

/** Verify one raw line → { ok, ts, body }. Constant-time tag compare. */
function verifyLine(key, line) {
  const m = String(line).match(LINE_RE);
  if (!m) return { ok: false };
  const ts = m[1];
  const got = m[2];
  const body = m[3];
  const expected = tag(key, ts, body);
  let ok = false;
  try {
    ok =
      got.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(got), Buffer.from(expected));
  } catch (_) {
    ok = false;
  }
  return ok ? { ok: true, ts, body } : { ok: false };
}

/** HMAC tag over arbitrary content (used for board integrity). */
function macContent(key, content) {
  return crypto
    .createHmac('sha256', key)
    .update(String(content))
    .digest('hex')
    .slice(0, TAGLEN);
}

/** One-time: re-stamp pre-existing (untagged) raw.log lines at key creation. */
function migrateRawLog(cfg, key) {
  try {
    if (!fs.existsSync(cfg.rawLog)) return;
    const raw = fs.readFileSync(cfg.rawLog, 'utf8');
    if (!raw.trim()) return;
    const out = [];
    for (const line of raw.split('\n')) {
      if (!line.trim()) continue;
      if (LINE_RE.test(line)) {
        out.push(line); // already stamped — leave it
        continue;
      }
      const m = line.match(/^\[([^\]]+)\]\s+([\s\S]*)$/);
      if (m) out.push(stampLine(key, m[1], m[2]));
      else out.push(stampLine(key, new Date().toISOString(), line.trim()));
    }
    // single rewrite (one-time, at first key mint → effectively single-process)
    const tmp = cfg.rawLog + '.tmp.' + process.pid + '.' + crypto.randomBytes(4).toString('hex');
    fs.writeFileSync(tmp, out.join('\n') + '\n');
    fs.renameSync(tmp, cfg.rawLog);
  } catch (_) {
    /* migration is best-effort; never break a session */
  }
}

module.exports = {
  keyPath,
  ensureKey,
  tag,
  stampLine,
  verifyLine,
  macContent,
  migrateRawLog,
  writeGitignore,
  _resetCache: () => {
    for (const k of Object.keys(_keys)) delete _keys[k];
  },
  SEP,
  TAGLEN,
  LINE_RE,
};
