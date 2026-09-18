"use strict";

// Embedded input examples match examples.json; assessment results always come from the BFF.
// Keep both copies aligned; examples.json is the editable fixture source.
const fixtureElement = document.getElementById("demo-fixtures");
let fixtureData;
try {
  fixtureData = JSON.parse(fixtureElement.textContent);
  if (!fixtureData.synthetic || !Array.isArray(fixtureData.cases)) throw new Error("Invalid fixtures");
} catch {
  fixtureData = null;
}

const form = document.getElementById("assessment-form");
const promptInput = document.getElementById("prompt");
const analyzeButton = document.getElementById("analyze");
const inputError = document.getElementById("input-error");
const reportRegion = document.getElementById("report-region");
const liveStatus = document.getElementById("live-status");
const accessInput = document.getElementById("access-code");
const accessError = document.getElementById("access-error");
const stateIds = ["empty-state", "processing", "result", "error-state"];
const tabs = [document.getElementById("assessment-tab"), document.getElementById("structured-tab")];

let busy = false;
let runId = 0;
let activeController = null;

function normalizePrompt(prompt) { return prompt.trim().replace(/\s+/g, " "); }

const errorMessages = {
  DEMO_ACCESS_DENIED: "Private preview access is unavailable or the access code is invalid.",
  DEMO_ORIGIN_DENIED: "This preview address is not enabled. Contact the preview owner.",
  DEMO_INVALID_INPUT: "Please provide only a prompt of 1–3000 characters.",
  PAYLOAD_TOO_LARGE: "The request is too large. Shorten the description and try again.",
  DEMO_UPSTREAM_TIMEOUT: "The assessment took too long. Please try again."
};
async function runAssessment(prompt) {
  const controller = new AbortController();
  activeController = controller;
  const timer = window.setTimeout(() => controller.abort(), 35000);
  try {
    const response = await fetch("/api/demo/chat", {
      method: "POST", credentials: "omit", cache: "no-store", redirect: "error",
      headers: { "Content-Type": "application/json", "X-Demo-Access": accessInput.value },
      body: JSON.stringify({ prompt }), signal: controller.signal
    });
    if (!/^application\/json(?:\s*;|$)/i.test(response.headers.get("content-type") || "")) throw new Error("Invalid response");
    const envelope = await response.json();
    if (!response.ok || envelope.ok !== true) {
      const error = new Error("Assessment unavailable");
      error.code = envelope.error?.code;
      error.requestId = envelope.requestId;
      throw error;
    }
    if (!envelope.data || typeof envelope.data !== "object" || Array.isArray(envelope.data) ||
        !["insufficient-evidence", "assessed"].includes(envelope.data.status)) throw new Error("Invalid response");
    return envelope;
  } catch (error) {
    if (controller.signal.aborted) error.code = "DEMO_UPSTREAM_TIMEOUT";
    throw error;
  } finally {
    window.clearTimeout(timer);
    if (activeController === controller) activeController = null;
  }
}

function setState(id) {
  for (const state of stateIds) document.getElementById(state).hidden = state !== id;
}
function setBusy(value) {
  busy = value;
  promptInput.disabled = value;
  analyzeButton.disabled = value;
  accessInput.disabled = value;
  for (const button of document.querySelectorAll(".preset-button")) button.disabled = value;
  reportRegion.setAttribute("aria-busy", String(value));
}
function updateInput() {
  document.getElementById("char-count").textContent = `${promptInput.value.length} / 3000`;
  inputError.hidden = true;
  promptInput.removeAttribute("aria-invalid");
  for (const button of document.querySelectorAll(".preset-button")) {
    const example = fixtureData.cases.find(item => item.id === button.dataset.caseId);
    button.setAttribute("aria-pressed", String(normalizePrompt(promptInput.value) === normalizePrompt(example.prompt)));
  }
  // Never leave an old report next to newly edited input.
  if (!busy) setState("empty-state");
  liveStatus.textContent = "";
}
function selectTab(index, moveFocus = false) {
  tabs.forEach((tab, i) => {
    tab.setAttribute("aria-selected", String(i === index));
    tab.tabIndex = i === index ? 0 : -1;
    document.getElementById(tab.getAttribute("aria-controls")).hidden = i !== index;
  });
  if (moveFocus) tabs[index].focus();
}
function textElement(tag, text, className) {
  const element = document.createElement(tag);
  element.textContent = text;
  if (className) element.className = className;
  return element;
}
const number = value => new Intl.NumberFormat("en-US").format(value);
const factFields = [
  ["taskType", "Business", value => value === "inference" ? "AI Inference" : String(value)],
  ["gpuModel", "GPU", value => value === "h100-equivalent" ? "H100 equivalent" : String(value)],
  ["gpuHours", "GPU Usage", value => `${number(value)} hrs`],
  ["revenueUsd", "Revenue", value => `$${number(value)}`],
  ["computeSpendUsd", "Compute Spend", value => `$${number(value)}`],
  ["repaymentRatePct", "Repayment Rate", value => `${number(value)}%`],
  ["overdue30Pct", "30d+ Overdue", value => `${number(value)}%`],
  ["payingCustomers", "Paying Customers", number],
  ["top5ConcentrationPct", "Top-5 Concentration", value => `${number(value)}%`]
];
const statusText = value => typeof value === "string" && value ? value.replaceAll("-", " ").toUpperCase() : "Not provided";
const safeRequestId = value => typeof value === "string" && /^[a-f0-9-]{36}$/i.test(value);
const fieldNames = { R: "Declared activity history", C: "Credible activity history", monthlySeries: "Operating history", validRatePct: "Token validity", label: "Assessment entity", modelTier: "Model class", inputTokensM: "Input tokens (millions)", outputTokensM: "Output tokens (millions)", operatingHistoryDays: "Operating history (days)", dataCoveragePct: "Data coverage", periodStart: "Period start", periodEnd: "Period end" };
function renderActions(data) {
  const list = document.getElementById("needed-list");
  list.replaceChildren();
  const add = (heading, detail) => {
    const li = document.createElement("li");
    const content = document.createElement("div");
    content.append(textElement("h4", heading));
    if (detail) content.append(textElement("p", detail));
    li.append(textElement("span", String(list.childElementCount + 1).padStart(2, "0")), content);
    list.append(li);
  };
  for (const step of data.presentation?.nextSteps || []) add(step);
  if (data.missingInputs?.length) add("Missing information returned by FlowCredit", data.missingInputs.map(key => fieldNames[key] || key).join(" · "));
  for (const action of data.requiredActions || []) {
    if (typeof action === "string") add("Required follow-up", action);
    else add(action.title || action.message || action.description || action.action || "Required follow-up", [action.priority != null ? `Priority ${action.priority}` : "", (action.fields || []).map(key => fieldNames[key] || key).join(" · ")].filter(Boolean).join(" — "));
  }
  document.getElementById("no-actions").hidden = list.childElementCount > 0;
}
function renderResult(envelope) {
  const data = envelope.data;
  const presentation = data.presentation || {};
  const example = fixtureData?.cases.find(item => normalizePrompt(item.prompt) === normalizePrompt(promptInput.value));
  document.getElementById("case-id").textContent = example ? `${example.id} · Synthetic input` : "Custom input";
  document.getElementById("case-note").textContent = presentation.summary || "Review the returned evidence and limitations before making a decision.";
  document.getElementById("data-readiness").textContent = statusText(presentation.assessmentStatus || data.readinessStatus);
  document.getElementById("evidence-strength").textContent = statusText(presentation.evidenceStrength || data.evidenceStrength);
  document.getElementById("decision").textContent = statusText(presentation.decisionStatus || data.decisionStatus || data.status);
  const dimensions = document.getElementById("dimension-scores");
  dimensions.replaceChildren();
  for (const [key, label] of [["repayment", "Repayment Performance"], ["customer", "Customer Structure"]]) {
    const value = presentation.availableScores?.[key];
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100) continue;
    const dimension = document.createElement("div");
    const heading = textElement("div", "", "dimension-header");
    heading.append(textElement("span", label), textElement("strong", value.toFixed(1)));
    const track = textElement("div", "", "score-track");
    track.setAttribute("aria-hidden", "true");
    const fill = document.createElement("span");
    fill.style.width = `${value}%`;
    track.append(fill);
    dimension.append(heading, track);
    dimensions.append(dimension);
  }
  if (!dimensions.childElementCount) dimensions.append(textElement("p", "No partial dimension scores were returned.", "no-scores"));
  const facts = document.getElementById("facts");
  facts.replaceChildren();
  for (const [key, label, format] of factFields) {
    if ((data.extractedDraft || {})[key] == null) continue;
    const pair = document.createElement("div");
    pair.append(textElement("dt", label), textElement("dd", format((data.extractedDraft || {})[key])));
    facts.append(pair);
  }
  document.getElementById("no-facts").hidden = facts.childElementCount > 0;
  document.getElementById("structured-data").textContent = JSON.stringify(data, null, 2);
  document.getElementById("result-title").textContent = presentation.title || "FlowCredit Initial Risk Assessment";
  document.getElementById("agent-message").textContent = data.message || "No narrative report was returned.";
  document.getElementById("agent-message").lang = /[\u3400-\u9fff]/.test(data.message || "") ? "zh" : "en";
  document.getElementById("request-reference").textContent = safeRequestId(envelope.requestId) ? `Request ID: ${envelope.requestId}` : "";
  for (const [key, id] of [["TAI", "full-tai"], ["CCI", "full-cci"], ["riskGrade", "full-grade"]]) {
    document.getElementById(id).textContent = presentation.fullScores?.[key] ?? "Not Computable";
  }
  const complete = ["TAI", "CCI", "riskGrade"].every(key => presentation.fullScores?.[key] != null);
  document.getElementById("full-note").textContent = complete ? "These indicators were returned by FlowCredit. Review the decision status and evidence strength; they do not constitute credit approval." : "Additional operating history, token activity and supporting evidence may be required. Missing full assessment values are not assigned default scores.";
  renderActions(data);
  selectTab(0);
}
async function submitAssessment() {
  if (busy) return;
  const prompt = promptInput.value.trim();
  if (!prompt || promptInput.value.length > 3000) {
    inputError.textContent = !prompt ? "Please describe a counterparty before running the assessment." : "Please use no more than 3000 characters.";
    inputError.hidden = false;
    promptInput.setAttribute("aria-invalid", "true");
    promptInput.focus();
    return;
  }
  inputError.hidden = true;
  promptInput.removeAttribute("aria-invalid");
  const id = ++runId;
  if (!accessInput.value) {
    accessError.textContent = "Enter your private preview access code.";
    accessError.hidden = false;
    accessInput.setAttribute("aria-invalid", "true");
    accessInput.focus();
    return;
  }
  accessError.hidden = true;
  accessInput.removeAttribute("aria-invalid");
  setBusy(true);
  const request = runAssessment(prompt);
  setState("processing");
  liveStatus.textContent = "Analyzing...";
  document.getElementById("processing").scrollIntoView({ block: "nearest", behavior: "auto" });
  try {
    const example = await request;
    if (id !== runId) return;
    renderResult(example);
    setState("result");
    liveStatus.textContent = "FlowCredit assessment response ready. Review its evidence and limitations.";
    document.getElementById("result-title").focus();
  } catch (error) {
    if (id !== runId) return;
    setState("error-state");
    document.getElementById("error-detail").textContent = (errorMessages[error.code] || "The assessment is currently unavailable. Please try again.") + (safeRequestId(error.requestId) ? ` Request ID: ${error.requestId}` : "");
    if (error.code === "DEMO_ACCESS_DENIED") {
      accessError.textContent = errorMessages.DEMO_ACCESS_DENIED;
      accessError.hidden = false;
      accessInput.setAttribute("aria-invalid", "true");
    }
    liveStatus.textContent = "Something went wrong. No assessment was generated.";
    document.getElementById("error-title").focus();
  } finally {
    if (id === runId) setBusy(false);
  }
}
for (const example of fixtureData?.cases || []) {
  const button = textElement("button", example.name, "preset-button");
  button.type = "button";
  button.dataset.caseId = example.id;
  button.setAttribute("aria-pressed", "false");
  button.addEventListener("click", () => {
    promptInput.value = example.prompt;
    updateInput();
    liveStatus.textContent = `${example.name} synthetic example loaded.`;
    promptInput.focus({ preventScroll: true });
  });
  document.getElementById("presets").append(button);
}
promptInput.addEventListener("input", updateInput);
form.addEventListener("submit", event => { event.preventDefault(); submitAssessment(); });
document.getElementById("retry").addEventListener("click", () => { submitAssessment(); });
tabs.forEach((tab, index) => {
  tab.addEventListener("click", () => selectTab(index));
  tab.addEventListener("keydown", event => {
    let next;
    if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
    else if (event.key === "ArrowLeft") next = (index + tabs.length - 1) % tabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabs.length - 1;
    else return;
    event.preventDefault();
    selectTab(next, true);
  });
});
accessInput.addEventListener("input", () => { accessError.hidden = true; accessInput.removeAttribute("aria-invalid"); });
window.addEventListener("pagehide", () => { ++runId; activeController?.abort(); accessInput.value = ""; setBusy(false); });
window.addEventListener("pageshow", event => { accessInput.value = ""; if (event.persisted) setState("empty-state"); });
