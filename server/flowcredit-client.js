import { DemoError, isJSON, readBounded } from './demo-validation.js';
import { sanitizeResponse } from './demo-response.js';
export const UPSTREAM_ORIGIN = 'https://flowcredit-api.onrender.com';
export const UPSTREAM_TIMEOUT_MS = 25000;
export const RESPONSE_LIMIT = 64 * 1024;
export async function assess(prompt, env, { fetchImpl = fetch, timeoutMs = UPSTREAM_TIMEOUT_MS, onStatus = () => {} } = {}) {
  const fail = () => new DemoError(502, 'DEMO_UPSTREAM_ERROR');
  // Fail closed on misconfiguration. No alternate host, path, credentials, query or fragment.
  if (![UPSTREAM_ORIGIN, `${UPSTREAM_ORIGIN}/`].includes(env.FLOWCREDIT_API_BASE_URL) ||
      typeof env.FLOWCREDIT_API_KEY !== 'string' || !env.FLOWCREDIT_API_KEY.trim() || /[\r\n]/.test(env.FLOWCREDIT_API_KEY)) throw fail();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(`${UPSTREAM_ORIGIN}/api/v1/chat`, {
      method: 'POST', redirect: 'manual', signal: controller.signal,
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${env.FLOWCREDIT_API_KEY}` },
      body: JSON.stringify({ prompt })
    });
    onStatus(response.status);
    if (!response.ok || !isJSON(response.headers) || Number(response.headers.get('content-length')) > RESPONSE_LIMIT) {
      void response.body?.cancel().catch(() => {});
      throw fail();
    }
    const raw = await readBounded(response.body, RESPONSE_LIMIT, fail, controller.signal);
    return sanitizeResponse(JSON.parse(raw), [env.FLOWCREDIT_API_KEY, env.DEMO_ACCESS_CODE]);
  } catch {
    if (controller.signal.aborted) throw new DemoError(504, 'DEMO_UPSTREAM_TIMEOUT');
    throw fail();
  } finally { clearTimeout(timer); }
}
