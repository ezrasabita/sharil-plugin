#!/usr/bin/env node
'use strict';

/**
 * Stop hook — fires after Claude finishes each response.
 * Mirrors the new turn into the Khazanah raw log. Zero Claude tokens.
 * Always exits 0 so it can never interrupt the session.
 */

const { loadConfig } = require('../lib/config');
const { readStdin } = require('../lib/hookio');
const { capture } = require('../lib/capture');

readStdin((evt) => {
  try {
    capture(loadConfig(evt.cwd), evt);
  } catch (e) {
    try {
      process.stderr.write('SHARIL stop: ' + (e && e.message) + '\n');
    } catch (_) {}
  }
  process.exit(0);
});
