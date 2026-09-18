import { DemoError, object } from './demo-validation.js';
const fail = () => { throw new DemoError(502, 'DEMO_UPSTREAM_ERROR'); };
const strings = ['status', 'message', 'readinessStatus', 'decisionStatus', 'evidenceStrength'];
// Matches the current backend natural-language parser's complete nine-field output.
const draftStrings = ['taskType', 'gpuModel'];
const draftNumbers = ['gpuHours', 'revenueUsd', 'computeSpendUsd', 'repaymentRatePct', 'overdue30Pct', 'payingCustomers', 'top5ConcentrationPct'];
const scoreKeys = ['repayment', 'customer', 'tokenActivity', 'economics', 'continuity'];
// Explicit nested allowlists: never forward assessment internals, headers, stack, env or session IDs.
export function sanitizeResponse(payload, secrets = []) {
  if (!object(payload) || payload.ok !== true || !object(payload.data)) fail();
  const data = payload.data;
  const cleanText = (value, max = 12000) => {
    if (typeof value !== 'string' || value.length > max) fail();
    let result = value;
    for (const secret of secrets.filter(Boolean)) result = result.split(secret).join('[redacted]');
    // Reject apparent diagnostic material instead of relaying internal exception details.
    if (/\b(?:authorization|bearer|FLOWCREDIT_API_KEY|DEMO_ACCESS_CODE|process\.env|stack trace)\b|(?:\/Users\/|\/home\/|\/var\/|\/app\/|[A-Z]:\\)|\bat\s+\S+\s*\([^)]*:\d+:\d+\)/i.test(result)) fail();
    return result;
  };
  const textArray = value => {
    if (!Array.isArray(value) || value.length > 100) fail();
    return value.map(x => cleanText(x, 2000));
  };
  const copyText = (from, keys, to) => {
    for (const key of keys) if (from[key] != null) to[key] = cleanText(from[key]);
  };
  const copyNumbers = (from, keys, to) => {
    for (const key of keys) if (from[key] != null) {
      if (typeof from[key] !== 'number' || !Number.isFinite(from[key])) fail();
      to[key] = from[key];
    }
  };
  if (!['insufficient-evidence', 'assessed'].includes(data.status)) fail();
  const out = {};
  copyText(data, strings, out);
  if (data.presentation != null) {
    if (!object(data.presentation)) fail();
    const p = data.presentation;
    out.presentation = {};
    copyText(p, ['title', 'summary', 'assessmentStatus', 'decisionStatus', 'evidenceStrength'], out.presentation);
    if (p.availableScores != null) {
      if (!object(p.availableScores)) fail();
      out.presentation.availableScores = {};
      copyNumbers(p.availableScores, scoreKeys, out.presentation.availableScores);
      if (Object.values(out.presentation.availableScores).some(x => x < 0 || x > 100)) fail();
    }
    if (p.fullScores != null) {
      if (!object(p.fullScores)) fail();
      out.presentation.fullScores = {};
      copyNumbers(p.fullScores, ['TAI', 'CCI'], out.presentation.fullScores);
      copyText(p.fullScores, ['riskGrade'], out.presentation.fullScores);
    }
    if (p.nextSteps != null) out.presentation.nextSteps = textArray(p.nextSteps);
  }
  if (data.extractedDraft != null) {
    if (!object(data.extractedDraft)) fail();
    out.extractedDraft = {};
    copyText(data.extractedDraft, draftStrings, out.extractedDraft);
    copyNumbers(data.extractedDraft, draftNumbers, out.extractedDraft);
  }
  if (data.missingInputs != null) out.missingInputs = textArray(data.missingInputs);
  if (data.requiredActions != null) {
    if (!Array.isArray(data.requiredActions) || data.requiredActions.length > 100) fail();
    out.requiredActions = data.requiredActions.map(item => {
      if (typeof item === 'string') return cleanText(item, 2000);
      if (!object(item)) fail();
      const action = {};
      copyText(item, ['id', 'category', 'title', 'message', 'description', 'action'], action);
      copyNumbers(item, ['priority'], action);
      if (item.fields != null) action.fields = textArray(item.fields);
      return action;
    });
  }
  return out;
}
