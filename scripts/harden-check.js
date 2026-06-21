#!/usr/bin/env node
'use strict';

/**
 * Runtime/repo hardening checks for SHARIL (and a template for any plugin).
 * Fails (exit 1) if a security-relevant invariant is broken.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.resolve(__dirname, '..');
let fail = 0;
const ok = (m) => console.log('  ✓ ' + m);
const bad = (m) => {
  console.log('  ✗ ' + m);
  fail++;
};

console.log('SHARIL harden-check');

// 1. lockfile present (pinned supply chain)
fs.existsSync(path.join(root, 'package-lock.json'))
  ? ok('package-lock.json present (pinned deps)')
  : bad('package-lock.json missing');

// 2. .gitignore excludes secrets/local memory
try {
  const gi = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
  /\.sharil\/?/.test(gi) ? ok('.gitignore excludes .sharil/') : bad('.gitignore missing .sharil/');
  /node_modules/.test(gi) ? ok('.gitignore excludes node_modules/') : bad('.gitignore missing node_modules/');
} catch (_) {
  bad('.gitignore not found');
}

// 3. no dangerous primitives in source
try {
  const hits = execSync(
    "grep -rnE 'shell:[[:space:]]*true|child_process\\.exec[^F]|[^.]\\beval\\(' lib hooks bin 2>/dev/null | grep -v execFile || true",
    { cwd: root, encoding: 'utf8' }
  ).trim();
  hits ? bad('dangerous primitive(s) found:\n' + hits) : ok('no shell:true / exec / eval in source');
} catch (_) {
  ok('no shell:true / exec / eval in source');
}

// 4. zero runtime dependencies (smaller attack surface)
try {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const n = Object.keys(pkg.dependencies || {}).length;
  n === 0 ? ok('zero runtime dependencies') : bad(n + ' runtime dependencies (review each)');
} catch (_) {
  bad('cannot read package.json');
}

// 5. if a live .sharil exists, key must be 0600
const keyp = path.join(root, '.sharil', '.key');
if (fs.existsSync(keyp)) {
  const mode = fs.statSync(keyp).mode & 0o777;
  mode === 0o600 ? ok('.sharil/.key is 0600') : bad('.sharil/.key mode is ' + mode.toString(8) + ' (want 600)');
}

console.log(fail ? '\n' + fail + ' check(s) FAILED' : '\nall hardening checks passed ✓');
process.exit(fail ? 1 : 0);
