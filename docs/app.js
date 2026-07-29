const recordsRoot = document.querySelector("#records");
const lanesRoot = document.querySelector("#lanes");
const search = document.querySelector("#search");
const count = document.querySelector("#count");
const [records, receipts, operational] = await Promise.all(
  ["records.json", "receipts.json", "operational-health.json"].map((file) =>
    fetch(`./${file}`).then((response) => {
      if (!response.ok) {
        throw new Error(`Could not load ${file}: ${response.status}`);
      }
      return response.json();
    }),
  ),
);
const receiptsByRecord = new Map(
  receipts.map((receipt) => [receipt.recordId, receipt]),
);
const recordsById = new Map(records.map((record) => [record.id, record]));
const assessment = operational.assessment;
const asOf = new Date(assessment.asOf);

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function quality(record) {
  const issues = [];
  const sourceIds = new Set(record.sources.map((source) => source.id));
  if (new Date(record.validUntil) < asOf) {
    issues.push("Freshness window expired");
  }
  if (record.sources.length === 0) {
    issues.push("No provenance declared");
  }
  for (const claim of record.claims) {
    if (
      claim.sourceIds.length === 0 ||
      claim.sourceIds.some((id) => !sourceIds.has(id))
    ) {
      issues.push("A claim lacks declared support");
      break;
    }
  }
  return issues;
}

function recordMarkup(record) {
  const issues = quality(record);
  const state = issues.length ? "degraded" : "current";
  const receipt = receiptsByRecord.get(record.id);
  const isOperational = record.tags.includes("automation-health");
  return `
    <article class="record ${isOperational ? "operational-record" : ""}" data-record-id="${escapeHtml(record.id)}">
      <div>
        <div class="record-state-row">
          <p class="state ${state}">${state}</p>
          ${isOperational ? '<p class="record-kind">Operational evidence</p>' : ""}
        </div>
        <h2>${escapeHtml(record.title)}</h2>
        <p class="summary">${escapeHtml(record.summary)}</p>
        <p class="content">${escapeHtml(record.content)}</p>
        ${
          issues.length
            ? `<p class="warning">${issues.map(escapeHtml).join(" / ")}</p>`
            : ""
        }
        <dl class="meta">
          <dt>Owner</dt><dd>${escapeHtml(record.owner)}</dd>
          <dt>Updated</dt><dd>${escapeHtml(record.updatedAt.slice(0, 16).replace("T", " "))} UTC</dd>
          <dt>Valid until</dt><dd>${escapeHtml(record.validUntil.slice(0, 16).replace("T", " "))} UTC</dd>
          ${
            receipt
              ? `<dt>Source document</dt><dd><code>${escapeHtml(receipt.documentPath)}</code></dd>
          <dt>Content SHA-256</dt><dd><code>${escapeHtml(receipt.contentSha256.slice(0, 16))}...</code></dd>`
              : ""
          }
        </dl>
      </div>
      <div class="panel">
        <h3>Supported claims</h3>
        <ul class="claims">
          ${record.claims
            .map(
              (claim) =>
                `<li>${escapeHtml(claim.text)} <small>[${claim.sourceIds.map(escapeHtml).join(", ")}]</small></li>`,
            )
            .join("")}
        </ul>
        <h3>Declared sources</h3>
        <ul class="sources">
          ${record.sources
            .map(
              (source) =>
                `<li><code>${escapeHtml(source.id)}</code>: ${escapeHtml(source.label)}</li>`,
            )
            .join("")}
        </ul>
      </div>
    </article>
  `;
}

function laneMarkup(lane) {
  const labels = {
    healthy: "Healthy",
    attention: "Needs attention",
    missing: "Missing receipt",
    not_due: "Not due",
  };
  const outcome = lane.outcome?.replaceAll("_", " ") ?? "Outside current window";
  const record = lane.evidenceRecordId
    ? recordsById.get(lane.evidenceRecordId)
    : null;
  return `
    <article class="lane ${lane.state}">
      <div class="lane-top">
        <span class="lane-dot" aria-hidden="true"></span>
        <p>${escapeHtml(labels[lane.state])}</p>
      </div>
      <h4>${escapeHtml(lane.label)}</h4>
      <p class="lane-outcome">${escapeHtml(outcome)}</p>
      ${
        record
          ? `<button type="button" data-open-record="${escapeHtml(record.id)}">Inspect receipt</button>`
          : '<span class="lane-note">No receipt expected yet</span>'
      }
    </article>
  `;
}

function renderRecords() {
  const query = search.value.trim().toLowerCase();
  const visible = records.filter((record) =>
    [
      record.title,
      record.summary,
      record.content,
      record.owner,
      ...record.tags,
    ]
      .join(" ")
      .toLowerCase()
      .includes(query),
  );
  count.textContent = `${visible.length} of ${records.length}`;
  recordsRoot.innerHTML = visible.map(recordMarkup).join("");
}

function openRecord(recordId) {
  const record = recordsById.get(recordId);
  if (!record) return;
  search.value = record.title;
  renderRecords();
  document
    .querySelector(`[data-record-id="${CSS.escape(recordId)}"]`)
    ?.scrollIntoView({ behavior: "smooth", block: "center" });
}

document.querySelector("#as-of").textContent = asOf
  .toISOString()
  .slice(0, 16)
  .replace("T", " ");
document.querySelector(".naive .answer-verdict").textContent =
  assessment.naiveVerdict === "healthy" ? "Yes." : "No.";
document.querySelector(".governed .answer-verdict").textContent =
  assessment.governedVerdict === "healthy" ? "Yes." : "No.";
const attentionCount = assessment.laneAssessments.filter(
  (lane) => lane.state === "attention" || lane.state === "missing",
).length;
document.querySelector("#attention-count").textContent =
  `${attentionCount} ${attentionCount === 1 ? "lane" : "lanes"}`;
lanesRoot.innerHTML = assessment.laneAssessments.map(laneMarkup).join("");

search.addEventListener("input", renderRecords);
document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-open-record]");
  if (button) openRecord(button.dataset.openRecord);
});
renderRecords();
