'use strict';

/**
 * Tiny JSON state store. The load→modify→save sequence is wrapped in a
 * cross-process lock (util.withLock) so parallel chat windows can't clobber
 * each other's cursor — and individual writes are atomic (temp + rename).
 *
 * Cursors are keyed PER TRANSCRIPT, storing a message COUNT plus a fingerprint
 * HASH of the boundary message so a compaction (transcript rewrite) is detected.
 */

const fs = require('fs');
const { atomicWrite, withLock } = require('./util');

function lockPath(cfg) {
  return cfg.state + '.lock';
}

function load(cfg) {
  try {
    const s = JSON.parse(fs.readFileSync(cfg.state, 'utf8'));
    if (!s.cursors) s.cursors = {};
    return s;
  } catch (_) {
    return { cursors: {}, sessions: 0, lastCuratedTs: null, lastCaptureTs: null };
  }
}

function save(cfg, state) {
  try {
    atomicWrite(cfg.state, JSON.stringify(state, null, 2));
    return true;
  } catch (_) {
    return false;
  }
}

function getCursor(cfg, key) {
  const s = load(cfg);
  return (s.cursors && s.cursors[key]) || null;
}

/** One locked write: advance a transcript's cursor AND stamp lastCaptureTs. */
function commitCapture(cfg, key, cursorPatch) {
  return withLock(lockPath(cfg), () => {
    const s = load(cfg);
    s.cursors = s.cursors || {};
    s.cursors[key] = Object.assign({}, s.cursors[key], cursorPatch);
    s.lastCaptureTs = new Date().toISOString();
    save(cfg, s);
    return s.cursors[key];
  });
}

function updateCursor(cfg, key, patch) {
  return withLock(lockPath(cfg), () => {
    const s = load(cfg);
    s.cursors = s.cursors || {};
    s.cursors[key] = Object.assign({}, s.cursors[key], patch);
    save(cfg, s);
    return s.cursors[key];
  });
}

function touch(cfg, patch) {
  return withLock(lockPath(cfg), () => {
    const s = load(cfg);
    Object.assign(s, patch);
    save(cfg, s);
    return s;
  });
}

// back-compat alias
const update = touch;

module.exports = { load, save, getCursor, commitCapture, updateCursor, touch, update };
