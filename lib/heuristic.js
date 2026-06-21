'use strict';

/**
 * Heuristic curator — the UNIVERSAL FLOOR. No model, no tokens, no API key, no
 * internet. Pure JavaScript keyword extraction. Guarantees that EVERY user gets
 * a usable board out of the box; if they also have Ollama or a Haiku key, ALFRED
 * upgrades to LLM-quality curation automatically.
 *
 * It is not as smart as an LLM — it classifies lines by keyword into the same
 * sections, dedupes, merges with the existing board, and caps each section.
 */

const SECTIONS = [
  'Active Projects',
  'Ideas Captured',
  'Facts Learned',
  'Decisions Made',
  'Open Loops',
  'Council Verdicts',
];

// Ordered by priority — first match wins, so a line lands in one section.
const RULES = [
  { section: 'Council Verdicts', re: /\b(council|verdict)\b/i },
  {
    section: 'Decisions Made',
    re: /\b(decid\w*|approv\w*|go for it|let'?s (?:go|use|do|build)|we'?ll (?:use|go|do)|lock(?:ed|ing)?|finali\w*|chosen|agreed?)\b/i,
  },
  {
    section: 'Open Loops',
    re: /\b(to-?do|need(?:s)? to|next step|pending|remind me|follow ?up|\[ \])\b/i,
  },
  {
    section: 'Ideas Captured',
    re: /\b(idea|what if|maybe we|could build|concept|brainstorm|proposal|we should)\b/i,
  },
  {
    section: 'Facts Learned',
    re: /\b(turns out|found that|discovered|learned that|note that|does ?n['o]t exist|in fact|it works|confirmed)\b/i,
  },
];

function clean(line) {
  let s = String(line)
    .replace(/^\[[^\]]*\]\s*/, '') // strip [timestamp]
    .replace(/^(USER|ASSISTANT):\s*/i, '') // strip role tag
    .replace(/\[tool:[^\]]*\]/g, '') // drop tool markers
    .replace(/\s+/g, ' ')
    .trim();
  if (s.length > 140) s = s.slice(0, 137) + '…';
  return s;
}

function norm(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 60);
}

function parseExistingBoard(board) {
  const out = {};
  SECTIONS.forEach((s) => (out[s] = []));
  if (!board) return out;
  let cur = null;
  for (const raw of String(board).split('\n')) {
    const h = raw.match(/^#+\s*(.+?)\s*$/);
    if (h && SECTIONS.includes(h[1].trim())) {
      cur = h[1].trim();
      continue;
    }
    const b = raw.match(/^\s*[-*]\s+(.*)$/);
    if (b && cur) {
      const t = b[1].trim();
      if (t && !/^_\(/.test(t)) out[cur].push(t);
    }
  }
  return out;
}

/** Produce board markdown from the existing board + new raw deltas. */
function curate(existingBoard, rawDeltas, opts) {
  opts = opts || {};
  const cap = opts.maxPerSection || 6;
  const buckets = parseExistingBoard(existingBoard);
  const seen = {};
  SECTIONS.forEach((s) => (seen[s] = new Set(buckets[s].map(norm))));

  const lines = String(rawDeltas || '')
    .split('\n')
    .filter((l) => l.trim());

  for (const line of lines) {
    const content = clean(line);
    if (content.length < 8) continue;
    for (const rule of RULES) {
      if (rule.re.test(content)) {
        const n = norm(content);
        if (n && !seen[rule.section].has(n)) {
          seen[rule.section].add(n);
          buckets[rule.section].push(content);
        }
        break;
      }
    }
  }

  const parts = [];
  for (const s of SECTIONS) {
    let items = buckets[s];
    if (!items.length) continue;
    if (items.length > cap) items = items.slice(items.length - cap); // keep newest
    parts.push('### ' + s);
    items.forEach((it) => parts.push('- ' + it));
    parts.push('');
  }
  return parts.join('\n').trim() || '_(no salient items captured yet)_';
}

module.exports = { curate, clean, SECTIONS };
