'use strict';

/**
 * Capture orchestration shared by Stop / SessionEnd / PreCompact hooks.
 * Mirrors any not-yet-captured turns into raw.log, then advances a per-transcript
 * cursor in a SINGLE locked state write. Mechanical only → zero Claude tokens.
 *
 * Cursor = { count, lastHash }. The hash fingerprints the boundary message so a
 * COMPACTION (transcript rewritten in place, not just appended) is detected: if
 * the message at the old boundary no longer matches, we re-capture from 0 rather
 * than risk DROPPING the post-compaction turns. Duplicate raw lines are tolerable
 * (ALFRED de-dups at curation); dropped turns are not (never-lose-data mandate).
 */

const { readTranscript } = require('./transcript');
const khazanah = require('./khazanah');
const state = require('./state');

// Small, fast, dependency-free fingerprint (djb2-xor).
function fingerprint(s) {
  let h = 5381;
  const str = String(s);
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h) ^ str.charCodeAt(i);
  }
  return (h >>> 0).toString(36);
}

function capture(cfg, evt) {
  const tpath = (evt && evt.transcript_path) || null;
  if (!tpath) return { captured: 0 };

  const msgs = readTranscript(tpath);
  if (!msgs.length) return { captured: 0 };

  const cur = state.getCursor(cfg, tpath) || { count: 0, lastHash: null };

  // Decide where to resume.
  let startedAt = 0;
  if (cur.count && cur.count <= msgs.length) {
    const boundary = msgs[cur.count - 1];
    if (boundary && cur.lastHash && fingerprint(boundary.text) === cur.lastHash) {
      startedAt = cur.count; // confirmed append-only continuation
    } else {
      startedAt = 0; // transcript was rewritten (compaction) → re-capture, never drop
    }
  }

  if (msgs.length <= startedAt) return { captured: 0 };

  const fresh = msgs.slice(startedAt);
  for (const m of fresh) {
    let text = m.text;
    if (m.role === 'assistant' && text.length > cfg.rawAssistantCap) {
      text =
        text.slice(0, cfg.rawAssistantCap) + ' …[trimmed; full in transcript]';
    }
    const tag = m.role === 'user' ? 'USER' : 'ASSISTANT';
    khazanah.appendRaw(cfg, `${tag}: ${text}`);
  }

  const lastMsg = msgs[msgs.length - 1];
  state.commitCapture(cfg, tpath, {
    count: msgs.length,
    lastHash: fingerprint(lastMsg.text),
  });
  return { captured: fresh.length };
}

module.exports = { capture, fingerprint };
