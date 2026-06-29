'use strict';

/**
 * Shared helpers. atomicWrite uses temp-file + rename so a write is either
 * fully applied or not at all — no truncated/corrupt files if the process is
 * killed mid-write, and concurrent full-file writers can't read a half-written
 * file. (POSIX/HFS+ rename is atomic.)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function atomicWrite(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  // Unpredictable temp name + O_EXCL (wx) so a pre-planted symlink can't
  // redirect the write outside the target.
  const tmp =
    file + '.tmp.' + process.pid + '.' + crypto.randomBytes(6).toString('hex');
  fs.writeFileSync(tmp, data, { flag: 'wx' });
  try {
    fs.renameSync(tmp, file);
  } catch (e) {
    try {
      fs.unlinkSync(tmp);
    } catch (_) {}
    throw e;
  }
}

/**
 * Defang text that will be injected into an LLM's context. Neutralizes the
 * common indirect-prompt-injection primitives (fake role tags, "ignore previous
 * instructions", jailbreak-mode phrases). Conservative — it tags/!redacts, it
 * does not delete content, so legitimate notes stay readable.
 */
function defangInjection(text) {
  if (!text) return text;
  let s = String(text);
  // strip zero-width / BOM chars used to split keywords past the filters
  s = s.replace(/[​-‍﻿]/g, '');
  // neutralize our own fence tag so injected content can't close it early
  s = s.replace(/<\/?\s*sharil-memory-data\s*>/gi, '[tag]');
  // fake role/turn markers at the start of a line → bracketed, can't be obeyed
  s = s.replace(
    /^[ \t>*\-#]*\b(system|assistant|developer|tool|function)\b\s*:/gim,
    '[$1]:'
  );
  // override phrases (broadened: optional "previous", + directives/act as/from now on)
  s = s.replace(
    /\b(ignore|disregard|forget|override)\s+(all\s+|any\s+|the\s+|everything\s+)?(previous\s+|prior\s+|above\s+|earlier\s+|system\s+)?(instructions?|prompts?|context|messages?|rules?|directives?)/gi,
    '[redacted-override]'
  );
  s = s.replace(/\b(you are now|act as|from now on)\b/gi, '[redacted]');
  s = s.replace(
    /\b(developer|jailbreak|dan|unrestricted)\s+(mode|ai)\b/gi,
    '[redacted-mode]'
  );
  s = s.replace(
    /\bnew\s+(system\s+)?(instructions?|rules?|directives?|prompt)\b/gi,
    '[redacted]'
  );
  return s;
}

/**
 * Cross-process exclusive lock for read-modify-write sequences (e.g. state.json
 * under parallel chat windows). Uses an O_EXCL lockfile; steals a stale lock
 * older than staleMs; if it ultimately can't acquire, it runs anyway (a slightly
 * racy update beats dropping the update entirely). The critical section is a
 * sub-millisecond JSON write, so contention windows are tiny.
 */
function withLock(lockPath, fn, opts) {
  opts = opts || {};
  const retries = opts.retries || 50;
  const delayMs = opts.delayMs || 20;
  const staleMs = opts.staleMs || 5000;
  for (let i = 0; i < retries; i++) {
    let fd = null;
    try {
      fd = fs.openSync(lockPath, 'wx'); // fails if it exists
    } catch (e) {
      if (e.code !== 'EEXIST') break; // unexpected → stop trying, run anyway
      try {
        const st = fs.statSync(lockPath);
        if (Date.now() - st.mtimeMs > staleMs) {
          fs.unlinkSync(lockPath); // steal stale lock
          continue;
        }
      } catch (_) {}
      // True synchronous sleep — no busy-spin, no CPU burn.
      // Atomics.wait() blocks the thread exactly delayMs ms with zero CPU usage.
      // Works in Node.js main thread (hooks are synchronous scripts, not workers).
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delayMs);
      continue;
    }
    try {
      try {
        fs.writeSync(fd, String(process.pid));
      } catch (_) {}
      fs.closeSync(fd);
      return fn();
    } finally {
      try {
        fs.unlinkSync(lockPath);
      } catch (_) {}
    }
  }
  return fn(); // could not acquire — do the work rather than lose it
}

module.exports = { atomicWrite, withLock, defangInjection };
