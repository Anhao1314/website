import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { startLocalE2E } from './local-e2e.js';
test('real loopback HTTP: preset → BFF → mocked upstream → sanitized Chinese report', async () => {
  const app = await startLocalE2E({ port: 0 });
  try {
    const examples = JSON.parse(await readFile(new URL('../demo/assets/examples.json', import.meta.url)));
    const response = await fetch(`${app.origin}/api/demo/chat`, { method: 'POST', headers: { Origin: app.origin, 'Content-Type': 'application/json', 'X-Demo-Access': app.previewCode }, body: JSON.stringify({ prompt: examples.cases[0].prompt }) });
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.match(payload.data.message, /初步风险评估/);
    assert.equal(payload.data.presentation.availableScores.repayment, 94.3);
    assert.equal(app.records.length, 1);
    assert.equal(app.records[0].credentialMatched, true);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    for (const path of ['/', '/demo/', '/demo/assets/demo.js', '/demo/assets/examples.json']) assert.equal((await fetch(app.origin + path)).status, 200);
    for (const path of ['/server/flowcredit-client.js', '/.env.example', '/test/local-e2e.js']) assert.equal((await fetch(app.origin + path)).status, 404);
    const html = await fetch(app.origin + '/demo/');
    assert.match(html.headers.get('content-security-policy'), /connect-src 'self'/);
  } finally { await app.close(); }
});
test('HTTP upstream failure never returns a fixture fallback', async () => {
  const app = await startLocalE2E({ port: 0, mode: 'error' });
  try {
    const response = await fetch(`${app.origin}/api/demo/chat`, { method: 'POST', headers: { Origin: app.origin, 'Content-Type': 'application/json', 'X-Demo-Access': app.previewCode }, body: '{"prompt":"valid"}' });
    const payload = await response.json();
    assert.equal(response.status, 502); assert.equal(payload.ok, false); assert.equal(payload.data, undefined);
    assert.equal(payload.error.code, 'DEMO_UPSTREAM_ERROR');
  } finally { await app.close(); }
});
