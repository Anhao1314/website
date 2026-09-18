import { randomUUID } from 'node:crypto';
import { DemoError, validateRequest } from '../../server/demo-validation.js';
import { guardRequest, responseHeaders } from '../../server/demo-security.js';
import { assess } from '../../server/flowcredit-client.js';
const messages = {
  DEMO_INVALID_INPUT: 'Please provide only a prompt of 1–3000 characters.',
  DEMO_ACCESS_DENIED: 'Private preview access is unavailable or the access code is invalid.',
  DEMO_ORIGIN_DENIED: 'This origin is not allowed to use the demo.',
  METHOD_NOT_ALLOWED: 'Only POST requests are accepted.',
  PAYLOAD_TOO_LARGE: 'The request is too large.',
  UNSUPPORTED_MEDIA_TYPE: 'Use application/json.',
  DEMO_UPSTREAM_ERROR: 'The assessment is currently unavailable. Please try again.',
  DEMO_UPSTREAM_TIMEOUT: 'The assessment took too long. Please try again.'
};
// Dependency injection is server/test code only, never driven by HTTP fields or query parameters.
export function createHandler({ env = process.env, client = assess, logger = record => console.info(JSON.stringify(record)), allowNoOriginForTests = false } = {}) {
  return async request => {
    const requestId = randomUUID();
    const start = Date.now();
    let status = 200, upstreamStatus, promptLength;
    const headers = { ...responseHeaders };
    let body;
    try {
      if (request.method !== 'POST') throw new DemoError(405, 'METHOD_NOT_ALLOWED');
      guardRequest(request, env, { allowNoOriginForTests });
      const prompt = await validateRequest(request);
      promptLength = prompt.length;
      const data = await client(prompt, env, { onStatus: value => { upstreamStatus = value; } });
      body = { ok: true, requestId, data };
    } catch (error) {
      const safe = error instanceof DemoError && messages[error.code] ? error : new DemoError(502, 'DEMO_UPSTREAM_ERROR');
      status = safe.status;
      body = { ok: false, requestId, error: { code: safe.code, message: messages[safe.code] } };
      if (status === 405) headers.Allow = 'POST';
    }
    // Deliberate fixed log schema. Never include exception objects, bodies or headers.
    try { logger({ timestamp: new Date().toISOString(), requestId, status, latency: Date.now() - start, upstreamStatus, promptLength }); } catch { /* Logging must not change the HTTP outcome. */ }
    return new Response(JSON.stringify(body), { status, headers });
  };
}
export default { fetch: createHandler() };
