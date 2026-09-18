export const BODY_LIMIT = 16 * 1024;
export class DemoError extends Error {
  constructor(status, code) { super(code); this.status = status; this.code = code; }
}
export const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export function isJSON(headers) {
  return /^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(headers.get('content-type') || '');
}
// Bound bytes before decoding/parsing, even for chunked bodies or a false Content-Length.
export async function readBounded(stream, limit, fail, signal) {
  if (!stream) return '';
  const reader = stream.getReader();
  const chunks = [];
  let size = 0;
  const abort = () => { void reader.cancel().catch(() => {}); };
  signal?.addEventListener('abort', abort, { once: true });
  try {
    if (signal?.aborted) throw fail();
    while (true) {
      const { value, done } = await reader.read();
      if (signal?.aborted) throw fail();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { abort(); throw fail(); }
      chunks.push(value);
    }
    return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks, size));
  } finally {
    signal?.removeEventListener('abort', abort);
    reader.releaseLock();
  }
}
export async function validateRequest(request) {
  if (request.method !== 'POST') throw new DemoError(405, 'METHOD_NOT_ALLOWED');
  const url = new URL(request.url);
  if (url.pathname !== '/api/demo/chat' || url.search) throw new DemoError(400, 'DEMO_INVALID_INPUT');
  if (!isJSON(request.headers) || !['', 'identity'].includes(request.headers.get('content-encoding') || '')) {
    throw new DemoError(415, 'UNSUPPORTED_MEDIA_TYPE');
  }
  const size = request.headers.get('content-length');
  if (size !== null && (!/^\d+$/.test(size) || Number(size) > BODY_LIMIT)) throw new DemoError(413, 'PAYLOAD_TOO_LARGE');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const raw = await readBounded(request.body, BODY_LIMIT, () => new DemoError(413, 'PAYLOAD_TOO_LARGE'), controller.signal);
    if (controller.signal.aborted) throw new DemoError(400, 'DEMO_INVALID_INPUT');
    const body = JSON.parse(raw);
    if (!object(body) || Object.keys(body).length !== 1 || !Object.hasOwn(body, 'prompt') || typeof body.prompt !== 'string') {
      throw new DemoError(400, 'DEMO_INVALID_INPUT');
    }
    if (Buffer.byteLength(JSON.stringify(body)) > BODY_LIMIT) throw new DemoError(413, 'PAYLOAD_TOO_LARGE');
    const prompt = body.prompt.trim();
    if (prompt.length < 1 || prompt.length > 3000) throw new DemoError(400, 'DEMO_INVALID_INPUT');
    return prompt;
  } catch (error) {
    if (controller.signal.aborted) throw new DemoError(400, 'DEMO_INVALID_INPUT');
    if (error instanceof DemoError) throw error;
    throw new DemoError(400, 'DEMO_INVALID_INPUT');
  } finally { clearTimeout(timer); }
}
