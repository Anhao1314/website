// Local-only integration harness: real HTTP browser → BFF → loopback mock.
// No environment mutations, stored credentials or possible production network transport.
import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { createHandler } from '../api/demo/chat.js';
import { assess, UPSTREAM_ORIGIN } from '../server/flowcredit-client.js';
import { officialResponse } from './mock-response.js';
const root = new URL('../', import.meta.url);
const listen = (server, port) => new Promise(resolve => server.listen(port, '127.0.0.1', resolve));
const close = server => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
export async function startLocalE2E({ port = 8787, mode = 'success', delayMs = 0 } = {}) {
  const previewCode = randomBytes(24).toString('hex');
  const serverKey = randomBytes(32).toString('hex');
  const records = [];
  const mock = createServer(async (req, res) => {
    try {
      assert.equal(req.url, '/api/v1/chat'); assert.equal(req.method, 'POST');
      assert.equal(req.headers.authorization, `Bearer ${serverKey}`);
      for (const key of ['cookie', 'x-demo-access', 'x-forwarded-for']) assert.equal(req.headers[key], undefined);
      const chunks = []; for await (const chunk of req) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString());
      assert.deepEqual(Object.keys(body), ['prompt']);
      assert.equal(typeof body.prompt, 'string');
      records.push({ method: req.method, path: req.url, promptLength: body.prompt.length, credentialMatched: true });
      if (delayMs) await new Promise(resolve => setTimeout(resolve, delayMs));
      res.setHeader('Content-Type', 'application/json');
      if (mode === 'error') { res.writeHead(500); res.end(JSON.stringify({ error: serverKey, stack: '/app/private.js' })); return; }
      if (mode === 'invalid') { res.end('{'); return; }
      res.end(JSON.stringify(officialResponse()));
    } catch { res.writeHead(500); res.end('{}'); }
  });
  await listen(mock, 0);
  const mockOrigin = `http://127.0.0.1:${mock.address().port}`;
  let localOrigin;
  const settings = { NODE_ENV: 'test', FLOWCREDIT_API_BASE_URL: UPSTREAM_ORIGIN, FLOWCREDIT_API_KEY: serverKey, DEMO_ENABLED: 'true', DEMO_ACCESS_CODE: previewCode, ALLOWED_DEMO_ORIGINS: '' };
  const handler = createHandler({ env: settings, logger: () => {}, client: (prompt, env, metadata) => assess(prompt, env, {
    ...metadata,
    fetchImpl: (url, init) => {
      assert.equal(url, `${UPSTREAM_ORIGIN}/api/v1/chat`);
      // The sole actual upstream transport is bound to the ephemeral loopback listener.
      return fetch(`${mockOrigin}/api/v1/chat`, init);
    }
  }) });
  const config = JSON.parse(await readFile(new URL('vercel.json', root), 'utf8'));
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, localOrigin);
      const common = config.headers[0].headers;
      for (const { key, value } of common) res.setHeader(key, value);
      if (url.pathname.startsWith('/api/')) {
        const request = new Request(url, { method: req.method, headers: req.headers, ...(!['GET', 'HEAD'].includes(req.method) ? { body: Readable.toWeb(req), duplex: 'half' } : {}) });
        const response = await handler(request);
        res.writeHead(response.status, Object.fromEntries(response.headers));
        res.end(Buffer.from(await response.arrayBuffer())); return;
      }
      if (url.pathname === '/demo') { res.writeHead(307, { Location: '/demo/' }); res.end(); return; }
      if (url.pathname.startsWith('/demo/')) for (const { key, value } of config.headers[1].headers) res.setHeader(key, value);
      const path = url.pathname === '/' ? 'index.html' : url.pathname === '/demo/' ? 'demo/index.html' : url.pathname.slice(1);
      if (!/^(?:index\.html|demo\/index\.html|demo\/assets\/(?:demo\.(?:js|css)|examples\.json)|assets\/(?:img\/[^/]+\.jpg|video\/[^/]+\.mp4))$/.test(path)) {
        res.writeHead(404); res.end('Not found'); return;
      }
      const data = await readFile(new URL(path, root));
      const type = { html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8', json: 'application/json', jpg: 'image/jpeg', mp4: 'video/mp4' }[path.split('.').pop()];
      res.writeHead(200, { 'Content-Type': type }); res.end(data);
    } catch { res.writeHead(400, { 'Cache-Control': 'no-store' }); res.end('Invalid request'); }
  });
  await listen(server, port);
  localOrigin = `http://localhost:${server.address().port}`;
  settings.ALLOWED_DEMO_ORIGINS = localOrigin;
  return { origin: localOrigin, previewCode, records, close: async () => { await close(server); await close(mock); } };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.argv[2] || 8787);
  const mode = process.argv[3] || 'success';
  const delayMs = Number(process.argv[4] || 0);
  const app = await startLocalE2E({ port, mode, delayMs });
  const codeFile = join(tmpdir(), `flowcredit-demo-preview-${port}.txt`);
  await writeFile(codeFile, app.previewCode, { mode: 0o600 });
  console.log(`MOCK ONLY: ${app.origin}/demo/ — no production API calls. Ephemeral local access code file: ${codeFile}`);
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await app.close(); await unlink(codeFile).catch(() => {}); process.exit(0); });
}
