'use strict';

/**
 * Read a hook's JSON event from stdin, robustly. Always calls back exactly
 * once, even on TTY, empty stdin, parse error, or a stuck pipe (8s safety).
 * Hooks must never hang or crash the session.
 */

function readStdin(cb) {
  let buf = '';
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    let evt = {};
    try {
      evt = JSON.parse(buf || '{}');
    } catch (_) {
      evt = {};
    }
    cb(evt);
  };
  try {
    if (process.stdin.isTTY) return finish();
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (d) => (buf += d));
    process.stdin.on('end', finish);
    process.stdin.on('error', finish);
    const t = setTimeout(() => {
      try {
        process.stdin.destroy();
      } catch (_) {}
      finish();
    }, 8000);
    if (t.unref) t.unref();
  } catch (_) {
    finish();
  }
}

module.exports = { readStdin };
