import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { createHandler } from '../api/demo/chat.js';
import { assess, UPSTREAM_ORIGIN, RESPONSE_LIMIT } from '../server/flowcredit-client.js';
import { officialResponse } from './mock-response.js';
const code = randomBytes(24).toString('hex');
const secret = randomBytes(32).toString('hex');
const env = { NODE_ENV: 'production', FLOWCREDIT_API_BASE_URL: UPSTREAM_ORIGIN, FLOWCREDIT_API_KEY: secret, DEMO_ENABLED: 'true', DEMO_ACCESS_CODE: code, ALLOWED_DEMO_ORIGINS: 'http://localhost:8787, https://example-preview.vercel.app' };
function request(body = { prompt: ' test counterparty ' }, { method = 'POST', headers = {}, path = '' } = {}) {
  const defaults = { 'content-type': 'application/json', origin: 'http://localhost:8787', 'x-demo-access': code, ...headers };
  for (const [key, value] of Object.entries(defaults)) if (value === null) delete defaults[key];
  return new Request('http://localhost:8787/api/demo/chat' + path, { method, headers: defaults, ...(method !== 'GET' ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}) });
}
function setup({ fetchImpl = async () => Response.json(officialResponse()), settings = env, timeoutMs = 25000, ...options } = {}) {
  const calls = [], logs = [];
  const handler = createHandler({ env: settings, logger: record => logs.push(record),
    client: (prompt, config, metadata) => assess(prompt, config, { ...metadata, timeoutMs, fetchImpl: async (...args) => { calls.push(args); return fetchImpl(...args); } }), ...options });
  return { handler, calls, logs };
}
async function expectError(req, status, errorCode, options) {
  const app = setup(options);
  const response = await app.handler(req);
  const body = await response.json();
  assert.equal(response.status, status);
  assert.equal(body.ok, false);
  assert.equal(body.error.code, errorCode);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('access-control-allow-origin'), null);
  for (const prohibited of [secret, code, 'stack', '/app/', 'Authorization']) assert.ok(!JSON.stringify(body).includes(prohibited));
  return app;
}

test('valid and insufficient-evidence: trimmed prompt, fixed upstream, no forwarded headers, no defaults for absent scores', async () => {
  const app = setup();
  const response = await app.handler(request(undefined, { headers: { authorization: 'browser-value', cookie: 'cookie-value', 'x-forwarded-for': '1.2.3.4' } }));
  const body = await response.json();
  assert.equal(response.status, 200); assert.equal(body.ok, true);
  assert.equal(body.data.status, 'insufficient-evidence');
  assert.equal(body.data.presentation.availableScores.repayment, 94.3);
  assert.equal(body.data.presentation.availableScores.customer, 89.9);
  assert.equal(Object.keys(body.data.extractedDraft).length, 9);
  assert.equal(body.data.presentation.fullScores, undefined);
  assert.match(body.data.message, /初步风险评估/);
  assert.equal(body.data.requiredActions[0].priority, 1);
  assert.equal(app.calls.length, 1);
  const [url, init] = app.calls[0];
  assert.equal(url, UPSTREAM_ORIGIN + '/api/v1/chat');
  assert.equal(init.redirect, 'manual'); assert.equal(init.method, 'POST');
  assert.deepEqual(init.headers, { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` });
  assert.deepEqual(JSON.parse(init.body), { prompt: 'test counterparty' });
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(Object.keys(app.logs[0]).sort(), ['timestamp', 'requestId', 'status', 'latency', 'upstreamStatus', 'promptLength'].sort());
  for (const value of [secret, code, 'test counterparty', body.data.message]) assert.ok(!JSON.stringify(app.logs).includes(value));
});
for (const [name, headers] of [['missing', { 'x-demo-access': null }], ['wrong', { 'x-demo-access': randomBytes(24).toString('hex') }]]) {
  test(`${name} access code → 401, no upstream call`, async () => assert.equal((await expectError(request(undefined, { headers }), 401, 'DEMO_ACCESS_DENIED')).calls.length, 0));
}
for (const origin of ['https://attacker.invalid', 'null', 'https://example-preview.vercel.app.evil.invalid', null]) {
  test(`origin ${origin} denied`, async () => assert.equal((await expectError(request(undefined, { headers: { origin } }), 403, 'DEMO_ORIGIN_DENIED')).calls.length, 0));
}
test('exact allowed origin and explicit test-only no-Origin override', async () => {
  assert.equal((await setup().handler(request(undefined, { headers: { origin: 'https://example-preview.vercel.app' } }))).status, 200);
  await expectError(request(undefined, { headers: { origin: null } }), 403, 'DEMO_ORIGIN_DENIED', { allowNoOriginForTests: true });
  const app = setup({ settings: { ...env, NODE_ENV: 'test' }, allowNoOriginForTests: true });
  assert.equal((await app.handler(request(undefined, { headers: { origin: null } }))).status, 200);
});
for (const settings of [{ DEMO_ENABLED: 'false' }, { DEMO_ACCESS_CODE: '' }, { DEMO_ENABLED: '' }]) {
  test(`disabled/missing config fails closed ${JSON.stringify(settings)}`, async () => await expectError(request(), 401, 'DEMO_ACCESS_DENIED', { settings: { ...env, ...settings } }));
}
for (const prompt of ['', '   ', 'a'.repeat(3001), 15, null]) {
  test(`invalid prompt (${typeof prompt}, ${String(prompt).length})`, async () => await expectError(request({ prompt }), 400, 'DEMO_INVALID_INPUT'));
}
for (const field of ['text', 'messages', 'content', 'modelConsent', 'draft', 'url', 'endpoint', 'headers', 'authorization', '__proto__']) {
  test(`extra field ${field} denied`, async () => await expectError(request(`{"prompt":"valid","${field}":{}}`), 400, 'DEMO_INVALID_INPUT'));
}
for (const raw of ['[]', 'null', '{}', '{', '"hello"']) test(`invalid JSON shape ${raw}`, async () => await expectError(request(raw), 400, 'DEMO_INVALID_INPUT'));
test('UTF-8 size capped before parsing, not just prompt length', async () => {
  await expectError(request(' '.repeat(16385)), 413, 'PAYLOAD_TOO_LARGE');
  await expectError(request('{"prompt":"' + '\\u0061'.repeat(3000) + '"}'), 413, 'PAYLOAD_TOO_LARGE');
  await expectError(request(undefined, { headers: { 'content-length': '20000' } }), 413, 'PAYLOAD_TOO_LARGE');
  assert.equal((await setup().handler(request({ prompt: '中'.repeat(3000) }))).status, 200);
});
test('streamed body over limit with no content-length', async () => {
  const body = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(9000)); controller.enqueue(new Uint8Array(9000)); controller.close(); } });
  const req = new Request('http://localhost:8787/api/demo/chat', { method: 'POST', headers: { origin: 'http://localhost:8787', 'x-demo-access': code, 'content-type': 'application/json' }, body, duplex: 'half' });
  await expectError(req, 413, 'PAYLOAD_TOO_LARGE');
});
for (const headers of [{ 'content-type': 'text/plain' }, { 'content-type': null }, { 'content-encoding': 'gzip' }]) test('reject non-json/encoded body', async () => await expectError(request(undefined, { headers }), 415, 'UNSUPPORTED_MEDIA_TYPE'));
test('POST only and no query/path routing overrides', async () => {
  await expectError(request(undefined, { method: 'GET' }), 405, 'METHOD_NOT_ALLOWED');
  await expectError(request(undefined, { method: 'OPTIONS' }), 405, 'METHOD_NOT_ALLOWED');
  await expectError(request(undefined, { path: '?url=https://attacker.invalid' }), 400, 'DEMO_INVALID_INPUT');
  await expectError(request(undefined, { path: '/anything' }), 400, 'DEMO_INVALID_INPUT');
});
for (const status of [401, 500, 301, 302, 307, 308]) {
  test(`upstream ${status} → sanitized 502; single POST`, async () => {
    const app = await expectError(request(), 502, 'DEMO_UPSTREAM_ERROR', { fetchImpl: async () => new Response(`Authorization: ${secret}\n/app/server.js stack`, { status, headers: { location: 'https://attacker.invalid' } }) });
    assert.equal(app.calls.length, 1);
  });
}
test('timeout covers fetch and slow response body → 504, no retry', async () => {
  const waitingFetch = async (_, { signal }) => new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new Error(secret)), { once: true }));
  const app = await expectError(request(), 504, 'DEMO_UPSTREAM_TIMEOUT', { fetchImpl: waitingFetch, timeoutMs: 20 });
  assert.equal(app.calls.length, 1);
  await expectError(request(), 504, 'DEMO_UPSTREAM_TIMEOUT', { timeoutMs: 20, fetchImpl: async () => new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('{')); } }), { headers: { 'content-type': 'application/json' } }) });
});
for (const response of [() => new Response('{', { headers: { 'content-type': 'application/json' } }), () => new Response('{}'), () => Response.json([]), () => Response.json({ ok: false, data: {} }), () => Response.json({ ok: true, data: [] }), () => Response.json({ ok: true, data: {} })]) {
  test('invalid upstream body/envelope → 502', async () => await expectError(request(), 502, 'DEMO_UPSTREAM_ERROR', { fetchImpl: async () => response() }));
}
test('response capped by stream bytes and content-length', async () => {
  for (const fetchImpl of [async () => Response.json({ ok: true, data: { status: 'assessed', message: 'x'.repeat(RESPONSE_LIMIT) } }), async () => new Response('{}', { headers: { 'content-type': 'application/json', 'content-length': String(RESPONSE_LIMIT + 1) } })]) {
    await expectError(request(), 502, 'DEMO_UPSTREAM_ERROR', { fetchImpl });
  }
});
test('fixed base configuration cannot point to alternate host/path/query', async () => {
  for (const base of ['http://127.0.0.1:9000', UPSTREAM_ORIGIN + '/other', UPSTREAM_ORIGIN + '?url=evil', 'https://evil.invalid']) {
    const app = await expectError(request(), 502, 'DEMO_UPSTREAM_ERROR', { settings: { ...env, FLOWCREDIT_API_BASE_URL: base } });
    assert.equal(app.calls.length, 0);
  }
});
test('allowlists remove internal keys; known secrets redacted from allowed text', async () => {
  const payload = officialResponse();
  payload.data.headers = { Authorization: secret }; payload.data.stack = '/app/private.js';
  payload.data.presentation.env = secret; payload.data.extractedDraft.secret = secret;
  payload.data.requiredActions[0].internal = code;
  payload.data.message += `\n${secret} ${code}`;
  const response = await setup({ fetchImpl: async () => Response.json(payload) }).handler(request());
  assert.equal(response.status, 200);
  const text = await response.text();
  for (const prohibited of [secret, code, 'internal', 'headers', 'stack', '/app/', 'Authorization']) assert.ok(!text.includes(prohibited));
  assert.ok(text.includes('[redacted]'));
});
test('diagnostic details in allowed message fail closed; errors and logs are safe', async () => {
  const payload = officialResponse(); payload.data.message = 'Exception at /app/private.js';
  await expectError(request(), 502, 'DEMO_UPSTREAM_ERROR', { fetchImpl: async () => Response.json(payload) });
  const app = setup({ fetchImpl: async () => { throw new Error(secret + code + '/app/stack'); } });
  await app.handler(request());
  assert.ok(!JSON.stringify(app.logs).includes(secret));
});
test('complete scores are preserved; malformed nested response rejected', async () => {
  const payload = officialResponse(); payload.data.presentation.fullScores = { TAI: 60, CCI: 600, riskGrade: 'B' };
  assert.deepEqual((await (await setup({ fetchImpl: async () => Response.json(payload) }).handler(request())).json()).data.presentation.fullScores, payload.data.presentation.fullScores);
  payload.data.presentation.availableScores.customer = '89.9';
  await expectError(request(), 502, 'DEMO_UPSTREAM_ERROR', { fetchImpl: async () => Response.json(payload) });
});
