#!/usr/bin/env node
'use strict';

/**
 * SessionEnd hook — fires on graceful close (clear / logout / exit).
 * Captures the final turns, marks the close, and runs ALFRED curation so the
 * board is fresh for the next session. Always exits 0.
 */

const { loadConfig } = require('../lib/config');
const { readStdin } = require('../lib/hookio');
const { capture } = require('../lib/capture');
const khazanah = require('../lib/khazanah');
const alfred = require('../lib/alfred');

readStdin(async (evt) => {
  try {
    const cfg = loadConfig(evt.cwd);
    capture(cfg, evt);
    khazanah.appendRaw(cfg, `SESSION END (${(evt && evt.reason) || 'unknown'})`);
    await alfred.curate(cfg);
  } catch (e) {
    try {
      process.stderr.write('SHARIL session-end: ' + (e && e.message) + '\n');
    } catch (_) {}
  }
  process.exit(0);
});
