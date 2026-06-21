'use strict';

/**
 * Curator transport. Tries a FREE local model (Ollama) first, then falls back
 * to Haiku (cheap) if an API key is present. If neither is available, returns
 * null — and the caller keeps the raw log intact (no data loss, just no prose
 * summary). Zero npm dependencies: raw http/https only.
 */

const http = require('http');
const https = require('https');

const MAX_RESPONSE_BYTES = 2 * 1024 * 1024; // 2 MB hard cap — guard memory

function postJson(urlStr, headers, body, timeoutMs) {
  return new Promise((resolve) => {
    let u;
    try {
      u = new URL(urlStr);
    } catch (_) {
      return resolve({ error: 'bad url' });
    }
    let settled = false;
    const done = (v) => {
      if (settled) return;
      settled = true;
      resolve(v);
    };
    const lib = u.protocol === 'https:' ? https : http;
    const data = JSON.stringify(body);
    const req = lib.request(
      {
        hostname: u.hostname,
        port: u.port || (u.protocol === 'https:' ? 443 : 80),
        path: u.pathname + (u.search || ''),
        method: 'POST',
        headers: Object.assign(
          {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(data),
          },
          headers
        ),
      },
      (res) => {
        let out = '';
        res.on('data', (d) => {
          out += d;
          if (out.length > MAX_RESPONSE_BYTES) {
            req.destroy();
            done({ error: 'response too large' });
          }
        });
        res.on('end', () => done({ status: res.statusCode, body: out }));
      }
    );
    req.on('error', (e) => done({ error: e.message }));
    req.setTimeout(timeoutMs || 60000, () => {
      req.destroy();
      done({ error: 'timeout' });
    });
    req.write(data);
    req.end();
  });
}

async function ollama(cfg, prompt) {
  // 120s: a cold model load (first call) can be slow; warm calls are seconds.
  const res = await postJson(
    `${cfg.ollamaUrl}/api/generate`,
    {},
    { model: cfg.ollamaModel, prompt, stream: false },
    120000
  );
  if (res.error || !res.status || res.status >= 400) return null;
  try {
    const j = JSON.parse(res.body);
    return (j.response && j.response.trim()) || null;
  } catch (_) {
    return null;
  }
}

async function haiku(cfg, prompt) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  const res = await postJson(
    'https://api.anthropic.com/v1/messages',
    { 'x-api-key': key, 'anthropic-version': cfg.anthropicVersion || '2023-06-01' },
    {
      model: cfg.haikuModel,
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    },
    60000
  );
  if (res.error || !res.status || res.status >= 400) return null;
  try {
    const j = JSON.parse(res.body);
    const block = j.content && j.content.find((b) => b && b.type === 'text');
    return (block && block.text && block.text.trim()) || null;
  } catch (_) {
    return null;
  }
}

/** Returns { text, via } or { text: null, via: 'none' }. */
async function curate(cfg, prompt) {
  const mode = cfg.curator || 'auto';
  if (mode === 'none') return { text: null, via: 'none' };
  if (mode === 'ollama') return { text: await ollama(cfg, prompt), via: 'ollama' };
  if (mode === 'haiku') return { text: await haiku(cfg, prompt), via: 'haiku' };
  // auto: free local first; cloud ONLY if explicitly allowed (privacy default).
  const local = await ollama(cfg, prompt);
  if (local) return { text: local, via: 'ollama' };
  if (cfg.allowCloud) {
    const cloud = await haiku(cfg, prompt);
    if (cloud) return { text: cloud, via: 'haiku' };
  }
  return { text: null, via: 'none' };
}

async function probeOllama(cfg) {
  return new Promise((resolve) => {
    let u;
    try {
      u = new URL(cfg.ollamaUrl);
    } catch (_) {
      return resolve(false);
    }
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.request(
      {
        hostname: u.hostname,
        port: u.port || 11434,
        path: '/api/tags',
        method: 'GET',
      },
      (res) => resolve(res.statusCode < 400)
    );
    req.on('error', () => resolve(false));
    req.setTimeout(2000, () => {
      req.destroy();
      resolve(false);
    });
    req.end();
  });
}

function listModels(cfg) {
  return new Promise((resolve) => {
    let u;
    try {
      u = new URL(cfg.ollamaUrl);
    } catch (_) {
      return resolve([]);
    }
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.request(
      {
        hostname: u.hostname,
        port: u.port || 11434,
        path: '/api/tags',
        method: 'GET',
      },
      (res) => {
        let out = '';
        res.on('data', (d) => (out += d));
        res.on('end', () => {
          try {
            const j = JSON.parse(out);
            resolve((j.models || []).map((m) => m.name));
          } catch (_) {
            resolve([]);
          }
        });
      }
    );
    req.on('error', () => resolve([]));
    req.setTimeout(2000, () => {
      req.destroy();
      resolve([]);
    });
    req.end();
  });
}

module.exports = { curate, ollama, haiku, probeOllama, listModels };
