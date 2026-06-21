#!/usr/bin/env node
'use strict';

/**
 * PreCompact hook — fires before context compaction. With trigger "auto" this
 * IS the near-context-limit (~the wall) event: flush durable facts to the
 * Khazanah and curate BEFORE older turns are dropped, so nothing is lost when
 * the window clears. MUST exit 0 (exit 2 would block compaction).
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
    khazanah.appendRaw(
      cfg,
      `CONTEXT FLUSH (precompact: ${(evt && evt.trigger) || 'auto'})`
    );
    await alfred.curate(cfg);
  } catch (e) {
    try {
      process.stderr.write('SHARIL pre-compact: ' + (e && e.message) + '\n');
    } catch (_) {}
  }
  process.exit(0);
});
