"use strict";

// The embedded data is an exact copy of examples.json. It avoids runtime data requests.
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
const simulateError = document.getElementById("simulate-error");
const stateIds = ["empty-state", "processing", "result", "error-state"];
const tabs = [document.getElementById("assessment-tab"), document.getElementById("structured-tab")];
const steps = Array.from(document.querySelectorAll("#processing-steps li"));
const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
let busy = false;
let runId = 0;
let pendingDelay = null;

function normalizePrompt(prompt) { return prompt.trim().replace(/\s+/g, " "); }

async function runAssessment(prompt) {
  // Phase 3: replace fixture adapter with same-origin /api/demo/chat BFF.
  if (!fixtureData) throw new Error("Example data unavailable");
  const example = fixtureData.cases.find(item => normalizePrompt(item.prompt) === normalizePrompt(prompt));
  if (example) return { ...example, result: JSON.parse(JSON.stringify(example.result)) };
  return {
    id: "FC-SYN-CUSTOM",
    name: "Custom text preview",
    note: "Custom text is not analyzed in this demo. This fixed example shows an insufficient-evidence outcome. Choose a preset to explore populated results. No facts or scores have been inferred from your text.",
    result: {
      status: "insufficient-evidence",
      presentation: { assessmentStatus: "limited", decisionStatus: "insufficient-evidence", evidenceStrength: "low", availableScores: {} },
      extractedDraft: {}
    }
  };
}

function setState(id) {
  for (const state of stateIds) document.getElementById(state).hidden = state !== id;
}
function setBusy(value) {
  busy = value;
  promptInput.disabled = value;
  analyzeButton.disabled = value;
  simulateError.disabled = value;
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
function renderResult(example) {
  const data = example.result;
  document.getElementById("case-id").textContent = example.id;
  document.getElementById("case-note").textContent = example.note;
  document.getElementById("data-readiness").textContent = data.presentation.assessmentStatus.toUpperCase();
  document.getElementById("evidence-strength").textContent = data.presentation.evidenceStrength.toUpperCase();
  document.getElementById("decision").textContent = data.presentation.decisionStatus.replaceAll("-", " ").toUpperCase();
  const dimensions = document.getElementById("dimension-scores");
  dimensions.replaceChildren();
  for (const [key, label] of [["repayment", "Repayment Performance"], ["customer", "Customer Structure"]]) {
    const value = data.presentation.availableScores[key];
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
  if (!dimensions.childElementCount) dimensions.append(textElement("p", "No partial dimension scores are available for this example.", "no-scores"));
  const facts = document.getElementById("facts");
  facts.replaceChildren();
  for (const [key, label, format] of factFields) {
    if (data.extractedDraft[key] == null) continue;
    const pair = document.createElement("div");
    pair.append(textElement("dt", label), textElement("dd", format(data.extractedDraft[key])));
    facts.append(pair);
  }
  document.getElementById("no-facts").hidden = facts.childElementCount > 0;
  document.getElementById("structured-data").textContent = JSON.stringify(data, null, 2);
  selectTab(0);
}
function delay(ms) {
  return new Promise(resolve => {
    const timer = window.setTimeout(() => { pendingDelay = null; resolve(); }, ms);
    pendingDelay = { timer, resolve };
  });
}
function cancelDelay() {
  if (!pendingDelay) return;
  window.clearTimeout(pendingDelay.timer);
  const { resolve } = pendingDelay;
  pendingDelay = null;
  resolve();
}
async function processSequence(id) {
  if (motionPreference.matches) {
    steps.forEach(step => { step.dataset.state = "done"; });
    liveStatus.textContent = "Preparing a synthetic assessment. Motion is reduced.";
    return;
  }
  for (let i = 0; i < steps.length; i++) {
    if (id !== runId || motionPreference.matches) break;
    steps.forEach((step, j) => { step.dataset.state = j < i ? "done" : j === i ? "current" : "pending"; });
    liveStatus.textContent = `Simulated processing: ${steps[i].textContent}.`;
    await delay(400);
  }
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
  const shouldSimulateError = simulateError.checked;
  setBusy(true);
  setState("processing");
  document.getElementById("processing").scrollIntoView({ block: "nearest", behavior: "auto" });
  try {
    await processSequence(id);
    if (id !== runId) return;
    if (shouldSimulateError) throw new Error("Simulated unavailability");
    const example = await runAssessment(prompt);
    if (id !== runId) return;
    renderResult(example);
    setState("result");
    liveStatus.textContent = "Synthetic assessment ready. Insufficient evidence for a full risk rating.";
    document.getElementById("result-title").focus();
  } catch {
    if (id !== runId) return;
    setState("error-state");
    document.getElementById("error-detail").textContent = shouldSimulateError ? "This error was simulated. Your text is preserved; Try again will turn off the simulation." : "Example data is unavailable. Your text is preserved. Reload the page if trying again does not help.";
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
document.getElementById("retry").addEventListener("click", () => { simulateError.checked = false; submitAssessment(); });
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
motionPreference.addEventListener("change", event => { if (event.matches) cancelDelay(); });
window.addEventListener("pagehide", () => { ++runId; cancelDelay(); setBusy(false); });
window.addEventListener("pageshow", event => { if (event.persisted) setState("empty-state"); });
