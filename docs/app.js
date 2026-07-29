const recordsRoot = document.querySelector("#records");
const search = document.querySelector("#search");
const count = document.querySelector("#count");
const [records, receipts] = await Promise.all(
  ["records.json", "receipts.json"].map((file) =>
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

const asOf = new Date("2026-07-28T12:00:00Z");

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
  return `
    <article class="record">
      <div>
        <p class="state ${state}">${state}</p>
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
          <dt>Updated</dt><dd>${escapeHtml(record.updatedAt.slice(0, 10))}</dd>
          <dt>Valid until</dt><dd>${escapeHtml(record.validUntil.slice(0, 10))}</dd>
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

function render() {
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

search.addEventListener("input", render);
render();
