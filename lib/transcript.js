'use strict';

/**
 * Parse a Claude Code transcript JSONL file into a flat list of
 * { uuid, role, text, ts } messages. Tool noise is collapsed so the
 * Khazanah raw log stays readable. Full fidelity always remains in the
 * original transcript file — this is a concise mirror, not the source of truth.
 */

const fs = require('fs');

function extractText(content) {
  if (!content) return '';
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) {
    const parts = [];
    for (const part of content) {
      if (typeof part === 'string') {
        parts.push(part);
      } else if (part && part.type === 'text' && part.text) {
        parts.push(part.text);
      } else if (part && part.type === 'tool_use') {
        parts.push(`[tool:${part.name || 'unknown'}]`);
      }
      // tool_result and thinking blocks are intentionally skipped (noise)
    }
    return parts.join(' ').replace(/\s+/g, ' ').trim();
  }
  return '';
}

function readTranscript(transcriptPath) {
  if (!transcriptPath || !fs.existsSync(transcriptPath)) return [];
  let raw;
  try {
    raw = fs.readFileSync(transcriptPath, 'utf8');
  } catch (_) {
    return [];
  }
  const out = [];
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    let obj;
    try {
      obj = JSON.parse(line);
    } catch (_) {
      continue;
    }
    const m = obj.message || obj;
    const role = m.role || obj.type;
    if (role !== 'user' && role !== 'assistant') continue;
    const text = extractText(m.content);
    if (!text) continue;
    out.push({
      uuid: obj.uuid || obj.id || null,
      role,
      text,
      ts: obj.timestamp || null,
    });
  }
  return out;
}

/** Return only messages after the one matching lastUuid. */
function newSince(messages, lastUuid) {
  if (!lastUuid) return messages;
  const idx = messages.findIndex((m) => m.uuid === lastUuid);
  if (idx === -1) return messages; // unknown cursor → treat all as new
  return messages.slice(idx + 1);
}

module.exports = { readTranscript, newSince, extractText };
