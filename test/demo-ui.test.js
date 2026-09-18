import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { officialResponse } from './mock-response.js';
const source = await readFile(new URL('../demo/assets/demo.js', import.meta.url), 'utf8');
const fixtures = JSON.parse(await readFile(new URL('../demo/assets/examples.json', import.meta.url)));
class Element {
  constructor(id = '') { Object.assign(this, { id, textContent: '', children: [], dataset: {}, style: {}, attributes: {}, value: '', hidden: false, disabled: false, events: {} }); }
  append(...items) { this.children.push(...items); }
  replaceChildren(...items) { this.children = items; }
  get childElementCount() { return this.children.length; }
  setAttribute(k, v) { this.attributes[k] = String(v); }
  getAttribute(k) { return this.attributes[k]; }
  removeAttribute(k) { delete this.attributes[k]; }
  addEventListener(k, fn) { this.events[k] = fn; }
  focus() { this.focused = true; }
  scrollIntoView() {}
}
function browser(fetchImpl) {
  const elements = new Map(), events = {}, timers = [], calls = [];
  const get = id => { if (!elements.has(id)) elements.set(id, new Element(id)); return elements.get(id); };
  get('demo-fixtures').textContent = JSON.stringify(fixtures);
  get('assessment-tab').setAttribute('aria-controls', 'assessment-view');
  get('structured-tab').setAttribute('aria-controls', 'structured-view');
  const context = vm.createContext({
    document: { getElementById: get, createElement: () => new Element(), querySelectorAll: selector => selector === '.preset-button' ? get('presets').children : [] },
    window: { setTimeout: (fn, ms) => { timers.push(ms); return setTimeout(fn, ms); }, clearTimeout, addEventListener: (event, fn) => { events[event] = fn; } },
    fetch: async (...args) => { calls.push(args); return fetchImpl(...args); }, AbortController, Intl, JSON, Number, Array, String, Promise, Error
  });
  vm.runInContext(source, context);
  return { get, timers, calls, events, run: code => vm.runInContext(code, context) };
}
test('frontend renders returned data, including absent full scores, without preset result lookup', async () => {
  const result = officialResponse();
  result.data.presentation.availableScores.repayment = 71.2;
  result.data.extractedDraft.revenueUsd = 12345;
  const app = browser(async () => Response.json(result));
  app.get('prompt').value = fixtures.cases[0].prompt;
  app.get('access-code').value = randomBytes(24).toString('hex');
  await app.run('submitAssessment()');
  assert.equal(app.calls.length, 1); assert.equal(app.calls[0][0], '/api/demo/chat');
  assert.equal(app.calls[0][1].credentials, 'omit');
  assert.equal(app.calls[0][1].redirect, 'error');
  assert.deepEqual(Object.keys(app.calls[0][1].headers), ['Content-Type', 'X-Demo-Access']);
  assert.equal(JSON.parse(app.get('structured-data').textContent).presentation.availableScores.repayment, 71.2);
  assert.equal(JSON.parse(app.get('structured-data').textContent).extractedDraft.revenueUsd, 12345);
  assert.equal(app.get('facts').childElementCount, 9);
  for (const id of ['full-tai', 'full-cci', 'full-grade']) assert.equal(app.get(id).textContent, 'Not Computable');
  assert.equal(app.get('result').hidden, false);
  assert.match(app.get('agent-message').textContent, /初步风险评估/);
  assert.equal(app.get('agent-message').lang, 'zh');
  assert.deepEqual(app.timers, [35000]); // Safety timeout only: no artificial 1–2 second sequence.
});
test('custom prompt also requests BFF; processing remains until real response', async () => {
  let release;
  const app = browser(() => new Promise(resolve => { release = resolve; }));
  app.get('prompt').value = 'Arbitrary custom description'; app.get('access-code').value = randomBytes(24).toString('hex');
  const pending = app.run('submitAssessment()');
  assert.equal(app.calls.length, 1); assert.equal(app.get('processing').hidden, false); assert.equal(app.get('analyze').disabled, true);
  assert.equal(app.get('result').hidden, true);
  release(Response.json(officialResponse())); await pending;
  assert.equal(app.get('result').hidden, false); assert.equal(app.get('analyze').disabled, false);
});
test('missing access code/invalid prompt prevent network requests', async () => {
  const app = browser(async () => { throw new Error('must not call'); });
  app.get('prompt').value = ''; await app.run('submitAssessment()');
  assert.equal(app.get('input-error').hidden, false);
  app.get('prompt').value = 'valid'; await app.run('submitAssessment()');
  assert.equal(app.get('access-error').hidden, false); assert.equal(app.get('access-code').focused, true);
  assert.equal(app.calls.length, 0);
});
test('upstream failure hides prior results, retains input and retry uses BFF again', async () => {
  let fail = false;
  const app = browser(async () => fail ? Response.json({ ok: false, error: { code: 'DEMO_UPSTREAM_ERROR', message: 'unsafe detail' } }, { status: 502 }) : Response.json(officialResponse()));
  app.get('prompt').value = fixtures.cases[0].prompt; app.get('access-code').value = randomBytes(24).toString('hex');
  await app.run('submitAssessment()'); fail = true; await app.run('submitAssessment()');
  assert.equal(app.get('error-state').hidden, false); assert.equal(app.get('result').hidden, true);
  assert.equal(app.get('prompt').value, fixtures.cases[0].prompt);
  assert.ok(!app.get('error-detail').textContent.includes('unsafe detail'));
  fail = false; await app.run('submitAssessment()'); assert.equal(app.get('result').hidden, false); assert.equal(app.calls.length, 3);
});
test('navigation aborts active request and clears preview code; reload clears restored value', async () => {
  const app = browser((url, { signal }) => new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new Error('Aborted')))));
  app.get('prompt').value = 'valid'; app.get('access-code').value = randomBytes(24).toString('hex');
  const pending = app.run('submitAssessment()'); app.events.pagehide(); await pending;
  assert.equal(app.get('access-code').value, ''); assert.equal(app.get('analyze').disabled, false);
  app.get('access-code').value = randomBytes(24).toString('hex'); app.events.pageshow({ persisted: true });
  assert.equal(app.get('access-code').value, ''); assert.equal(app.get('empty-state').hidden, false);
});
test('reduced motion uses static Analyzing state; dynamic output is text-only', async () => {
  const css = await readFile(new URL('../demo/assets/demo.css', import.meta.url), 'utf8');
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)\{\.processing ol,\.processing-mark,\.processing>p\{display:none\}\}/);
  assert.match(css, /animation:none!important/);
  assert.ok(!source.includes('innerHTML')); assert.ok(source.includes('liveStatus.textContent = "Analyzing..."'));
});
