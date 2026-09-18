import { createHash, timingSafeEqual } from 'node:crypto';
import { DemoError } from './demo-validation.js';
const digest = value => createHash('sha256').update(value).digest();
export function guardRequest(request, env, { allowNoOriginForTests = false } = {}) {
  const origin = request.headers.get('origin');
  const allowed = (env.ALLOWED_DEMO_ORIGINS || '').split(',').map(x => x.trim()).filter(x => {
    try { return new URL(x).origin === x && /^https?:\/\//.test(x) && !x.includes('*'); } catch { return false; }
  });
  if (!(origin ? allowed.includes(origin) : env.NODE_ENV === 'test' && allowNoOriginForTests)) {
    throw new DemoError(403, 'DEMO_ORIGIN_DENIED');
  }
  const entered = request.headers.get('x-demo-access') || '';
  const expected = env.DEMO_ACCESS_CODE || '';
  // Fixed-length digests avoid variable-length timingSafeEqual exceptions.
  const equal = timingSafeEqual(digest(entered), digest(expected));
  if (env.DEMO_ENABLED !== 'true' || !expected || !entered || entered.length > 512 || !equal) {
    throw new DemoError(401, 'DEMO_ACCESS_DENIED');
  }
}
export const responseHeaders = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'"
};
