import {
  assessmentsConflict,
  searchContext,
  selectedEvidenceRecordIds,
  verifyDiagnosticSnapshot,
} from "./runtime.js";

const sampleSnapshot = await fetch("./operational-health.json").then((response) => {
  if (!response.ok) throw new Error(`Could not load sample: ${response.status}`);
  return response.json();
});

const elements = {
  file: document.querySelector("#snapshot-file"),
  open: document.querySelector("#open-snapshot"),
  reset: document.querySelector("#load-sample"),
  sourceMode: document.querySelector("#source-mode"),
  sourceMessage: document.querySelector("#source-message"),
  verdictCard: document.querySelector("#verdict-card"),
  verdict: document.querySelector("#verdict"),
  question: document.querySelector("#question"),
  asOf: document.querySelector("#as-of"),
  verdictDetail: document.querySelector("#verdict-detail"),
  copy: document.querySelector("#copy-report"),
  conflictCard: document.querySelector("#conflict-card"),
  conflictState: document.querySelector("#conflict-state"),
  summaryVerdict: document.querySelector("#summary-verdict"),
  summaryTime: document.querySelector("#summary-time"),
  currentVerdict: document.querySelector("#current-verdict"),
  currentTime: document.querySelector("#current-time"),
  conflictExplanation: document.querySelector("#conflict-explanation"),
  lanes: document.querySelector("#lanes"),
  laneCount: document.querySelector("#lane-count"),
  rules: document.querySelector("#rules"),
  timeline: document.querySelector("#timeline"),
  timelineCount: document.querySelector("#timeline-count"),
  searchForm: document.querySelector("#search-form"),
  searchQuery: document.querySelector("#search-query"),
  searchResults: document.querySelector("#search-results"),
  searchCount: document.querySelector("#search-count"),
  dialog: document.querySelector("#evidence-dialog"),
  dialogTitle: document.querySelector("#evidence-title"),
  dialogContent: document.querySelector("#evidence-content"),
  closeDialog: document.querySelector("#close-evidence"),
};

let snapshot = verifyDiagnosticSnapshot(sampleSnapshot);
let sourceName = "Synthetic sample";

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function formatTime(value) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(new Date(value));
}

function titleCase(value) {
  return String(value)
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function statusLabel(state) {
  return {
    healthy: "Healthy",
    attention: "Attention",
    missing: "Missing receipt",
    not_due: "Not due",
  }[state];
}

function evidenceRecords() {
  return new Map(snapshot.records.map((record) => [record.id, record]));
}

function activeLanes() {
  return snapshot.assessment.laneAssessments.filter(
    (lane) => lane.state === "attention" || lane.state === "missing",
  );
}

function laneMarkup(lane) {
  const receipt = snapshot.scenario.receipts.find(
    (candidate) => candidate.recordId === lane.evidenceRecordId,
  );
  const evidenceAction = lane.evidenceRecordId
    ? `<button class="row-action" type="button" data-evidence-id="${escapeHtml(
        lane.evidenceRecordId,
      )}">View evidence</button>`
    : "<span class=\"row-note\">No receipt expected</span>";
  const detail = receipt
    ? `${titleCase(lane.outcome)} · ${formatTime(receipt.observedAt)}`
    : lane.state === "not_due"
      ? `Due ${formatTime(
          snapshot.scenario.lanes.find((item) => item.id === lane.id)?.dueAt,
        )}`
      : "No terminal evidence after due time";

  return `
    <article class="lane-row ${escapeHtml(lane.state)}">
      <span class="status-dot" aria-hidden="true"></span>
      <div class="lane-name">
        <strong>${escapeHtml(lane.label)}</strong>
        <span>${escapeHtml(detail)}</span>
      </div>
      <span class="status-chip">${escapeHtml(statusLabel(lane.state))}</span>
      ${evidenceAction}
    </article>
  `;
}

function ruleMarkup(label, detail, state) {
  const stateLabel = {
    pass: "Pass",
    warn: "Review",
    fail: "Fail",
  }[state];
  return `
    <article class="rule ${state}">
      <span class="rule-mark" aria-hidden="true"></span>
      <div>
        <strong>${escapeHtml(label)}</strong>
        <p>${escapeHtml(detail)}</p>
      </div>
      <span>${stateLabel}</span>
    </article>
  `;
}

function timelineEvents() {
  const lanes = new Map(
    snapshot.scenario.lanes.map((lane) => [lane.id, lane.label]),
  );
  return [
    {
      observedAt: snapshot.scenario.summary.observedAt,
      label: "Aggregate summary",
      result: snapshot.scenario.summary.verdict,
      recordId: snapshot.scenario.summary.recordId,
      kind: "summary",
    },
    ...snapshot.scenario.receipts.map((receipt) => ({
      observedAt: receipt.observedAt,
      label: lanes.get(receipt.laneId) ?? receipt.laneId,
      result: receipt.outcome,
      recordId: receipt.recordId,
      kind: "receipt",
    })),
  ].sort(
    (left, right) =>
      new Date(left.observedAt).getTime() - new Date(right.observedAt).getTime(),
  );
}

function renderTimeline() {
  const events = timelineEvents();
  elements.timelineCount.textContent = `${events.length} events`;
  elements.timeline.innerHTML = events
    .map(
      (event) => `
        <li class="${escapeHtml(event.kind)}">
          <time>${escapeHtml(formatTime(event.observedAt))}</time>
          <span class="timeline-mark" aria-hidden="true"></span>
          <div>
            <strong>${escapeHtml(event.label)}</strong>
            <span>${escapeHtml(titleCase(event.result))}</span>
          </div>
          <button class="row-action" type="button" data-evidence-id="${escapeHtml(
            event.recordId,
          )}">Inspect</button>
        </li>
      `,
    )
    .join("");
}

function renderSearch() {
  const query = elements.searchQuery.value.trim();
  const results = query
    ? searchContext(
        snapshot.records,
        query,
        new Date(snapshot.scenario.asOf),
        5,
      )
    : [];

  elements.searchCount.textContent = query
    ? `${results.length} ${results.length === 1 ? "match" : "matches"}`
    : "BM25F · max 5";
  elements.searchResults.innerHTML = query
    ? results.length
      ? results
          .map(
            (result) => `
              <article class="search-result">
                <div>
                  <strong>${escapeHtml(result.title)}</strong>
                  <span>${escapeHtml(result.summary)}</span>
                </div>
                <span class="status-chip ${escapeHtml(result.state)}">${escapeHtml(
                  titleCase(result.state),
                )}</span>
                <button class="row-action" type="button" data-evidence-id="${escapeHtml(
                  result.id,
                )}">Inspect</button>
              </article>
            `,
          )
          .join("")
      : '<p class="empty-search">No evidence in this packet matches that query.</p>'
    : '<p class="empty-search">Search is local, bounded, and carries quality states with every result.</p>';
}

function renderRules() {
  const assessment = snapshot.assessment;
  const dueLanes = assessment.laneAssessments.filter(
    (lane) => lane.state !== "not_due",
  );
  const missing = dueLanes.filter((lane) => lane.state === "missing");
  const degraded = selectedEvidenceRecordIds(assessment).filter(
    (id) => assessment.evidenceQuality[id]?.state !== "valid",
  );

  elements.rules.innerHTML = [
    ruleMarkup(
      "Summary freshness",
      assessment.summaryStale
        ? "Newer evidence supersedes the aggregate."
        : "The aggregate remains current.",
      assessment.summaryStale ? "warn" : "pass",
    ),
    ruleMarkup(
      "Due-lane coverage",
      missing.length
        ? `${missing.length} due ${missing.length === 1 ? "lane has" : "lanes have"} no terminal receipt.`
        : `All ${dueLanes.length} due lanes have terminal evidence.`,
      missing.length ? "fail" : "pass",
    ),
    ruleMarkup(
      "Evidence quality",
      degraded.length
        ? `${degraded.length} terminal ${degraded.length === 1 ? "record is" : "records are"} degraded or invalid.`
        : "Every terminal record used by the answer validates.",
      degraded.length ? "fail" : "pass",
    ),
  ].join("");
}

function render() {
  const { scenario, assessment } = snapshot;
  const attention = activeLanes();
  const notDue = assessment.laneAssessments.filter(
    (lane) => lane.state === "not_due",
  );
  const isHealthy = assessment.governedVerdict === "healthy";

  document.body.dataset.verdict = assessment.governedVerdict;
  elements.sourceMode.textContent = sourceName;
  elements.question.textContent = assessment.question;
  elements.asOf.textContent = `As of ${formatTime(assessment.asOf)}`;
  elements.asOf.dateTime = assessment.asOf;
  elements.verdict.textContent = isHealthy ? "All clear" : "Needs attention";
  elements.verdictDetail.textContent = isHealthy
    ? "Every due lane has valid terminal evidence."
    : `${attention.length} of ${
        assessment.laneAssessments.length - notDue.length
      } due ${attention.length === 1 ? "lane needs" : "lanes need"} review.${
        notDue.length ? ` ${notDue.length} not due yet.` : ""
      }`;

  elements.summaryVerdict.textContent = titleCase(scenario.summary.verdict);
  elements.summaryTime.textContent = formatTime(scenario.summary.observedAt);
  elements.currentVerdict.textContent = titleCase(assessment.governedVerdict);
  elements.currentTime.textContent = formatTime(assessment.asOf);
  const hasConflict = assessmentsConflict(assessment);
  elements.conflictCard.classList.toggle("resolved", !hasConflict);
  elements.conflictState.textContent = hasConflict ? "Detected" : "None";
  elements.conflictExplanation.textContent = hasConflict
    ? `The evidence-backed verdict changes the earlier ${assessment.naiveVerdict} aggregate to ${assessment.governedVerdict}.`
    : "The current evidence does not contradict the earlier aggregate.";

  elements.laneCount.textContent = `${assessment.laneAssessments.length} lanes`;
  elements.lanes.innerHTML = assessment.laneAssessments.map(laneMarkup).join("");
  renderRules();
  renderTimeline();
  renderSearch();
}

function reportText() {
  const attention = activeLanes();
  const lines = [
    `Context health: ${snapshot.assessment.governedVerdict.toUpperCase()}`,
    `As of: ${snapshot.assessment.asOf}`,
    `Question: ${snapshot.assessment.question}`,
  ];
  if (attention.length) {
    lines.push(
      `Needs attention: ${attention
        .map(
          (lane) =>
            `${lane.label} (${lane.outcome ? titleCase(lane.outcome) : "missing receipt"})`,
        )
        .join("; ")}`,
    );
  }
  if (snapshot.assessment.summaryStale) {
    lines.push(
      `Earlier summary superseded: ${titleCase(
        snapshot.scenario.summary.verdict,
      )} at ${snapshot.scenario.summary.observedAt}`,
    );
  }
  return lines.join("\n");
}

async function copyReport() {
  try {
    await navigator.clipboard.writeText(reportText());
    elements.copy.textContent = "Copied";
  } catch {
    elements.copy.textContent = "Copy unavailable";
  }
  window.setTimeout(() => {
    elements.copy.textContent = "Copy concise report";
  }, 1800);
}

function showEvidence(recordId) {
  const record = evidenceRecords().get(recordId);
  if (!record) {
    elements.sourceMessage.textContent =
      "The snapshot references an evidence record it does not include.";
    return;
  }
  const quality = snapshot.assessment.evidenceQuality[recordId];
  elements.dialogTitle.textContent = record.title;
  elements.dialogContent.innerHTML = `
    <div class="dialog-state ${escapeHtml(quality?.state ?? "unknown")}">
      ${escapeHtml(titleCase(quality?.state ?? "unknown"))}
    </div>
    <p class="dialog-summary">${escapeHtml(record.summary)}</p>
    <p>${escapeHtml(record.content)}</p>
    <dl class="evidence-meta">
      <dt>Owner</dt><dd>${escapeHtml(record.owner)}</dd>
      <dt>Updated</dt><dd>${escapeHtml(formatTime(record.updatedAt))}</dd>
      <dt>Valid until</dt><dd>${escapeHtml(formatTime(record.validUntil))}</dd>
    </dl>
    <div class="evidence-section">
      <h3>Supported claims</h3>
      <ul>${record.claims
        .map((claim) => `<li>${escapeHtml(claim.text)}</li>`)
        .join("")}</ul>
    </div>
    <div class="evidence-section">
      <h3>Declared sources</h3>
      <ul>${record.sources
        .map(
          (source) =>
            `<li><code>${escapeHtml(source.id)}</code> ${escapeHtml(
              source.label,
            )}</li>`,
        )
        .join("")}</ul>
    </div>
  `;
  elements.dialog.showModal();
}

async function loadFile(file) {
  try {
    const parsed = JSON.parse(await file.text());
    snapshot = verifyDiagnosticSnapshot(parsed);
    sourceName = `Local snapshot · ${file.name}`;
    elements.sourceMessage.textContent =
      "Loaded in memory for this tab only. Refresh to clear it.";
    render();
  } catch (error) {
    elements.sourceMessage.textContent =
      error instanceof Error
        ? `Snapshot rejected: ${error.message}`
        : "Snapshot rejected: could not read the file.";
  } finally {
    elements.file.value = "";
  }
}

elements.open.addEventListener("click", () => elements.file.click());
elements.file.addEventListener("change", () => {
  const [file] = elements.file.files;
  if (file) loadFile(file);
});
elements.reset.addEventListener("click", () => {
  snapshot = verifyDiagnosticSnapshot(sampleSnapshot);
  sourceName = "Synthetic sample";
  elements.sourceMessage.textContent =
    "Open a private JSON snapshot to inspect it in this browser.";
  render();
});
elements.copy.addEventListener("click", copyReport);
elements.searchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  renderSearch();
});
elements.searchQuery.addEventListener("input", renderSearch);
elements.closeDialog.addEventListener("click", () => elements.dialog.close());
elements.dialog.addEventListener("click", (event) => {
  if (event.target === elements.dialog) elements.dialog.close();
});
document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-evidence-id]");
  if (button) showEvidence(button.dataset.evidenceId);
});

render();
