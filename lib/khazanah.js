'use strict';

/**
 * The Khazanah — TWO physical files so concurrent chat windows never collide:
 *
 *   raw.log      → append-only capture. Written ONLY by appendRaw via
 *                  fs.appendFileSync (atomic per write). Never read-modified.
 *                  Concurrent writers are safe for lines < PIPE_BUF (~4096 bytes);
 *                  appendRaw enforces a 3500-byte cap per line. This is the durable data.
 *
 *   khazanah.md   → ALFRED's board (human-facing + injected on startup). Written
 *                  ONLY by setBoard via atomicWrite. It is a DERIVED summary of
 *                  raw.log — disposable and regenerable, so last-writer-wins on
 *                  it can never lose real data (the data lives in raw.log).
 *
 * This separation removes the read-modify-write race entirely: the hot path
 * (appendRaw, every turn) only ever appends; the cold path (setBoard, on
 * curation) only ever rewrites the derived board.
 */

const fs = require('fs');
const path = require('path');
const { atomicWrite } = require('./util');
const provenance = require('./provenance');
const state = require('./state');

const BOARD_START = '<!-- SHARIL-BOARD-START -->';
const BOARD_END = '<!-- SHARIL-BOARD-END -->';
// Legacy: old Batman-era markers — kept here for migration only
const BOARD_START_LEGACY = '<!-- ALFRED-BOARD-START -->';
const BOARD_END_LEGACY = '<!-- ALFRED-BOARD-END -->';
const EMPTY = '_(empty — AL-FARID will fill this on first curation)_';

/** Strip anything that could break our markers out of board content. */
function sanitizeBoard(s) {
  return String(s).replace(
    /<!--\s*(ALFRED|SHARIL)-BOARD-(START|END)\s*-->/gi,
    '[sharil-board-$2]'
  );
}

function boardTemplate() {
  return [
    '# 🗄️ THE KHAZANAH',
    "### Live cross-session memory · AL-FARID's board",
    '',
    '> AL-FARID curates this board from the raw capture log (.sharil/raw.log).',
    '> This is the warm-start memory injected into new sessions. Nothing is lost:',
    '> every turn is mirrored to raw.log the moment it happens.',
    '',
    BOARD_START,
    EMPTY,
    BOARD_END,
    '',
    '*The Khazanah never forgets. — AL-FARID*',
    '',
  ].join('\n');
}

function ensure(cfg) {
  if (!fs.existsSync(cfg.home)) fs.mkdirSync(cfg.home, { recursive: true });
  // SECURITY/PRIVACY: raw.log holds plaintext conversation (possible secrets).
  // Keep the whole .sharil/ out of any git repo / shared sync by default.
  const gi = path.join(cfg.home, '.gitignore');
  if (!fs.existsSync(gi)) {
    try {
      fs.writeFileSync(gi, '# SHARIL local memory — do not commit\n*\n');
    } catch (_) {}
  }
  if (!fs.existsSync(cfg.khazanah)) atomicWrite(cfg.khazanah, boardTemplate());
  // Migrate legacy ALFRED markers → SHARIL markers on first run after upgrade.
  else {
    let raw = fs.readFileSync(cfg.khazanah, 'utf8');
    if (raw.includes(BOARD_START_LEGACY) || raw.includes(BOARD_END_LEGACY)) {
      raw = raw
        .replace(/<!--\s*ALFRED-BOARD-START\s*-->/g, BOARD_START)
        .replace(/<!--\s*ALFRED-BOARD-END\s*-->/g, BOARD_END);
      atomicWrite(cfg.khazanah, raw);
    }
  }
  if (!fs.existsSync(cfg.rawLog)) fs.appendFileSync(cfg.rawLog, '');
  // Mint the provenance key (single-process here at init) + migrate any old log.
  provenance.ensureKey(cfg);
  // self-heal: board file missing its markers → rebuild around existing prose
  let c = fs.readFileSync(cfg.khazanah, 'utf8');
  if (!c.includes(BOARD_START) || !c.includes(BOARD_END)) {
    const inner = sanitizeBoard(c.trim()) || EMPTY;
    atomicWrite(cfg.khazanah, boardTemplate().replace(EMPTY, () => inner));
  }
  return cfg.khazanah;
}

/**
 * Pure append to raw.log. POSIX O_APPEND is atomic for writes < PIPE_BUF (~4096 bytes).
 * appendRaw caps each line at 3500 bytes (provenance stamp + body), keeping every
 * write well within that window → concurrent chatbox writers never interleave. No
 * read, no markers, no contention.
 */
function appendRaw(cfg, text) {
  if (!fs.existsSync(cfg.home)) fs.mkdirSync(cfg.home, { recursive: true });
  const key = provenance.ensureKey(cfg);
  const stamp = new Date().toISOString();
  // Clamp body so stamp + body stays under PIPE_BUF (~4096 B) — guarantees atomic
  // O_APPEND across concurrent writers (3-chatbox case).
  const RAW_BODY_CAP = 3500;
  const rawBody = String(text).replace(/\r?\n/g, ' ').trim();
  const body = rawBody.length > RAW_BODY_CAP
    ? rawBody.slice(0, RAW_BODY_CAP) + ' …[truncated]'
    : rawBody;
  // PROVENANCE: stamp every line so reads can tell our writes from outside ones.
  fs.appendFileSync(cfg.rawLog, provenance.stampLine(key, stamp, body) + '\n');
  return stamp;
}

// Reads at most the last 512 KB so an unbounded (or hostile, oversized) raw.log
// can't blow memory on every curation. Drops the first partial line.
function getRaw(cfg) {
  try {
    const cap = 512 * 1024;
    const st = fs.statSync(cfg.rawLog);
    if (st.size <= cap) return fs.readFileSync(cfg.rawLog, 'utf8').trim();
    const fd = fs.openSync(cfg.rawLog, 'r');
    try {
      const buf = Buffer.alloc(cap);
      fs.readSync(fd, buf, 0, cap, st.size - cap);
      let s = buf.toString('utf8');
      const nl = s.indexOf('\n');
      if (nl !== -1) s = s.slice(nl + 1);
      return s.trim();
    } finally {
      fs.closeSync(fd);
    }
  } catch (_) {
    return '';
  }
}

/**
 * TRUST GATE. Returns { text, untrustedCount } where text is ONLY the trusted
 * (validly-stamped, non-replayed) line bodies newer than sinceIso. Untrusted
 * lines (no/invalid stamp = injected from outside; or exact-duplicate = replay)
 * are excluded and counted. Timestamp compare is lexicographic-correct (UTC `Z`).
 */
function rawSince(cfg, sinceIso, maxLines) {
  const raw = getRaw(cfg);
  if (!raw) return { text: '', untrustedCount: 0 };
  const key = provenance.ensureKey(cfg);
  let lines = raw.split('\n').filter((l) => l.trim());
  if (sinceIso) {
    lines = lines.filter((l) => {
      const m = l.match(/^\[([^\]]+)\]/);
      if (!m) return false; // unparseable → not trusted, drop from window
      return m[1] > sinceIso;
    });
  }
  if (maxLines && lines.length > maxLines) {
    lines = lines.slice(lines.length - maxLines);
  }
  const trusted = [];
  const seen = new Set();
  let untrusted = 0; // ONLY real outside injection (unsigned / bad signature)
  let dupes = 0; // SHARIL's own re-captured duplicates — housekeeping, not a threat
  for (const l of lines) {
    const v = provenance.verifyLine(key, l);
    if (!v.ok) {
      untrusted++; // unsigned or tampered → injected from outside → flag
      continue;
    }
    const dup = v.ts + '\x1f' + v.body;
    if (seen.has(dup)) {
      dupes++; // valid signature but duplicate = our own re-capture → skip silently
      continue;
    }
    seen.add(dup);
    trusted.push('[' + v.ts + '] ' + v.body);
  }
  // A valid-signature duplicate can only be content WE already signed (an attacker
  // has no key), so re-injecting it adds nothing new → harmless → never alarmed.
  return { text: trusted.join('\n'), untrustedCount: untrusted, dupes };
}

function read(cfg) {
  return fs.existsSync(cfg.khazanah) ? fs.readFileSync(cfg.khazanah, 'utf8') : '';
}

function getBoard(cfg) {
  const c = read(cfg);
  const s = c.indexOf(BOARD_START);
  const e = c.indexOf(BOARD_END);
  if (s === -1 || e === -1 || e < s) return '';
  return c.slice(s + BOARD_START.length, e).trim();
}

/**
 * Board integrity. The board is DERIVED (regenerable), so it is never trusted as
 * curation input unless it matches the integrity tag we stored when we wrote it.
 * Returns { board, tampered }. On tamper, board='' so curation rebuilds clean.
 */
function getBoardTrusted(cfg) {
  const board = getBoard(cfg);
  if (!board || /^_\(/.test(board)) return { board: board || '', tampered: false };
  const s = state.load(cfg);
  if (!s.boardMac) return { board, tampered: false }; // TOFU: adopt current
  const key = provenance.ensureKey(cfg);
  const mac = provenance.macContent(key, board);
  if (mac === s.boardMac) return { board, tampered: false };
  return { board: '', tampered: true };
}

function setBoard(cfg, boardMd) {
  ensure(cfg);
  // Never let model output break our markers (sanitize before writing).
  const safe = sanitizeBoard(boardMd).trim() || EMPTY;
  let c = read(cfg);
  const s = c.indexOf(BOARD_START);
  const e = c.indexOf(BOARD_END);
  if (s === -1 || e === -1 || e < s) {
    c = boardTemplate().replace(EMPTY, () => safe);
  } else {
    c = c.slice(0, s + BOARD_START.length) + '\n' + safe + '\n' + c.slice(e);
  }
  atomicWrite(cfg.khazanah, c);
  // PROVENANCE: store an integrity tag over the board content we just wrote, so
  // a later out-of-band edit to khazanah.md is detected (getBoardTrusted).
  try {
    const key = provenance.ensureKey(cfg);
    state.touch(cfg, { boardMac: provenance.macContent(key, getBoard(cfg)) });
  } catch (_) {}
}

module.exports = {
  ensure,
  read,
  appendRaw,
  getRaw,
  getBoard,
  getBoardTrusted,
  setBoard,
  rawSince,
  boardTemplate,
  MARKERS: { BOARD_START, BOARD_END, BOARD_START_LEGACY, BOARD_END_LEGACY },
};
