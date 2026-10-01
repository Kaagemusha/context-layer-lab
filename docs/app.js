// Context Layer Lab console. Framework-free ES module, no network calls
// beyond the one same-origin fetch of the published sample snapshot.
// Every answer on screen comes from verifyDiagnosticSnapshot's return value.

const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;
const STEP_MS = 500;
const HOLD_MS = 250;
const EVAL_REPORT = "https://github.com/Kaagemusha/context-layer-lab/blob/main/docs/eval-report.md";
const LAB2 = "https://kaagemusha.github.io/governed-action-lab/";
const DEFAULT_QUERY = "status dashboard";

// ---- Shared time formatter (spec 1.11, verbatim) ----
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
// Public scenario: time of day on the labelled scenario clock.
function clock(iso, scenarioIso) {
  const d = new Date(iso), s = new Date(scenarioIso);
  const hm = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
  if (ymd(d) === ymd(s)) return hm;
  const next = new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate() + 1));
  if (ymd(d) === ymd(next)) return `${hm} the next day`;
  return stamp(iso);
}
// A visitor's own file: always absolute.
function stamp(iso) {
  const d = new Date(iso);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
}
function span(ms) {
  const m = Math.round(Math.abs(ms) / 60000);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}
const ms = (n) => (n < 1 ? "under 1 ms" : `${Math.round(n)} ms`);
// In public mode use clock(); in own-file mode use stamp() everywhere. Raw ISO never reaches the screen.

// ---- DOM helpers: data only ever reaches the page through textContent / setAttribute ----
const $ = (id) => document.getElementById(id);
function el(tag, attrs, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "class") node.className = v;
    else if (k === "text") node.textContent = v;
    else node.setAttribute(k, v === true ? "" : String(v));
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}
const mark = (kind, extra) => el("span", { class: `mark ${kind}${extra ? " " + extra : ""}`, "aria-hidden": "true" });
const word = (kind, text) => el("span", { class: `word ${kind}` }, text);
const stateWord = (kind, text) => el("span", { class: "state" }, mark(kind), word(kind, text));
const clear = (node) => { node.replaceChildren(); return node; };

let announceTimer = 0;
function announce(text) {
  const node = $("announcer");
  node.textContent = "";
  cancelAnimationFrame(announceTimer);
  announceTimer = requestAnimationFrame(() => { node.textContent = text; });
}

// ---- Words ----
const NUMBER_WORDS = ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"];
const startNum = (n) => (n >= 0 && n <= 9 ? NUMBER_WORDS[n] : String(n));
const plural = (n, one, many) => (n === 1 ? one : many);
function words(value) {
  if (value === null || value === undefined) return "";
  const s = String(value).replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}
function listJoin(items) {
  if (items.length <= 1) return items.join("");
  return items.join(", ");
}
const OUTCOME_WORD = { success: "Succeeded", failed: "Failed", preserved_local: "Not published" };
const OUTCOME_KIND = { success: "ok", failed: "stop", preserved_local: "hold" };

// ---- Module state ----
let runtime = null;
let rawText = "";
let current = null;
let mode = "public";
let ownName = "";
let lastVerifyMs = 0;
const replay = { timer: 0, step: -1, rows: [], active: false };
let returnFocus = null;
let booted = false;

// ---- Derived view model (computed from the verified snapshot only) ----
function model(snap) {
  const a = snap.assessment;
  const sc = snap.scenario;
  const asOf = sc.asOf;
  const own = mode === "own";
  const t = (iso) => (own ? stamp(iso) : clock(iso, asOf));
  const recordsById = new Map(snap.records.map((r) => [r.id, r]));
  const receiptByRecord = new Map(sc.receipts.map((r) => [r.recordId, r]));
  const summaryRecord = recordsById.get(sc.summary.recordId);
  const summaryQuality = a.evidenceQuality[sc.summary.recordId];
  const summaryExpired = !!summaryQuality?.issues?.some((i) => i.code === "stale_record");
  const lanes = a.laneAssessments.map((lane) => {
    const receipt = lane.evidenceRecordId ? receiptByRecord.get(lane.evidenceRecordId) : undefined;
    const due = sc.lanes.find((l) => l.id === lane.id)?.dueAt;
    return { ...lane, receipt, dueAt: due };
  });
  const dueLanes = lanes.filter((l) => l.state !== "not_due");
  const needLanes = lanes.filter((l) => l.state === "attention" || l.state === "missing");
  const missingLanes = lanes.filter((l) => l.state === "missing");
  const notDue = lanes.filter((l) => l.state === "not_due");
  const selected = runtime.selectedEvidenceRecordIds(a);
  const notValidSelected = selected.filter((id) => a.evidenceQuality[id]?.state !== "valid");
  return {
    snap, a, sc, asOf, own, t, recordsById, receiptByRecord, summaryRecord, summaryExpired,
    lanes, dueLanes, needLanes, missingLanes, notDue, selected, notValidSelected,
    attention: a.governedVerdict === "attention",
  };
}

function laneFragment(l) {
  if (l.state === "missing") return `${l.label} has no report`;
  if (l.outcome === "failed") return `${l.label} failed`;
  if (l.outcome === "preserved_local") return `${l.label} did not publish`;
  return `${l.label} needs attention`;
}

function laneClause(m, l) {
  const at = l.receipt ? m.t(l.receipt.observedAt) : "";
  if (l.state === "missing") return `${l.label} has not reported since it was due at ${m.t(l.dueAt)}.`;
  if (l.outcome === "failed") return `${l.label} failed at ${at}.`;
  if (l.outcome === "preserved_local") return `${l.label} finished at ${at} but did not publish its output.`;
  return `${l.label} reported at ${at}, but its receipt is not valid.`;
}

function verdictWord(m, verdict) {
  if (m.own) return verdict === "healthy" ? "Healthy." : "Needs attention.";
  return verdict === "healthy" ? "Yes." : "No.";
}

// ---- Trace rows ----
function traceRows(m) {
  const { sc, asOf, summaryRecord } = m;
  const events = [];
  const asOfMs = Date.parse(asOf);
  const minute = (iso) => Math.floor(Date.parse(iso) / 60000);
  events.push({ at: sc.summary.observedAt, order: 0, kind: "summary", recordId: sc.summary.recordId });
  if (summaryRecord && Date.parse(summaryRecord.validUntil) <= asOfMs) {
    events.push({ at: summaryRecord.validUntil, order: 1, kind: "expiry" });
  }
  for (const lane of sc.lanes) {
    if (Date.parse(lane.dueAt) <= asOfMs) events.push({ at: lane.dueAt, order: 2, kind: "due", label: lane.label });
  }
  const labelOf = new Map(sc.lanes.map((l) => [l.id, l.label]));
  for (const r of sc.receipts) {
    events.push({ at: r.observedAt, order: 3, kind: "receipt", label: labelOf.get(r.laneId) ?? r.laneId, outcome: r.outcome, recordId: r.recordId });
  }
  events.push({ at: asOf, order: 4, kind: "now" });
  events.sort((x, y) => Date.parse(x.at) - Date.parse(y.at) || x.order - y.order);

  const rows = [];
  for (const ev of events) {
    const last = rows[rows.length - 1];
    if (last && minute(last.at) === minute(ev.at)) last.events.push(ev);
    else rows.push({ at: ev.at, events: [ev] });
  }
  return rows.map((row) => describeRow(m, row));
}

function describeRow(m, row) {
  const labels = [];
  let detail = "";
  let side = null;
  let recordId = null;
  let markKind = "pending";
  let finalKind = "pending";
  let compact = true;
  let hasExpiry = false;
  let isSummary = false;
  let isNow = false;
  const rank = { pending: 0, stale: 1, ok: 2, hold: 3, stop: 4, now: 5 };
  const take = (k) => { if (rank[k] > rank[finalKind]) finalKind = k; };
  for (const ev of row.events) {
    if (ev.kind === "summary") {
      const healthy = m.sc.summary.verdict === "healthy";
      labels.push(healthy ? "Dashboard says all jobs are healthy." : "Dashboard says some jobs need attention.");
      if (m.summaryRecord) detail = `Valid until ${m.t(m.summaryRecord.validUntil)}.`;
      side = { kind: healthy ? "ok" : "hold", text: healthy ? "Healthy" : "Needs attention" };
      recordId = ev.recordId; compact = false; isSummary = true;
      take(healthy ? "ok" : "hold");
    } else if (ev.kind === "expiry") {
      labels.push("Dashboard expires."); hasExpiry = true; take("stale");
    } else if (ev.kind === "due") {
      labels.push(`${ev.label} is due.`); take("pending");
    } else if (ev.kind === "receipt") {
      const o = ev.outcome;
      if (o === "success") labels.push(`${ev.label} succeeded.`);
      else if (o === "failed") labels.push(`${ev.label} failed.`);
      else if (o === "preserved_local") labels.push(`${ev.label} finished. Output not published.`);
      else labels.push(`${ev.label}: ${words(o).toLowerCase()}.`);
      const kind = OUTCOME_KIND[o] ?? "hold";
      side = { kind, text: OUTCOME_WORD[o] ?? words(o) };
      recordId = ev.recordId; compact = false; take(kind);
    } else if (ev.kind === "now") {
      labels.push("The question is asked.");
      detail = detail || "The answer uses everything above.";
      side = { kind: "", text: "Now" }; compact = false; isNow = true; take("now");
    }
  }
  markKind = finalKind;
  return { at: row.at, time: m.t(row.at), label: labels.join(" "), detail, side, recordId, markKind, compact, hasExpiry, isSummary, isNow };
}

function renderTrace(m) {
  const list = clear($("trace"));
  list.classList.toggle("abs", m.own);
  const rows = traceRows(m);
  for (const row of rows) {
    const li = el("li", { class: row.compact ? "compact" : null, "data-at": row.time });
    li.dataset.kind = row.markKind;
    li.append(el("span", { class: "t-time" }, row.time));
    li.append(mark(row.markKind));
    const body = el("span", { class: "t-body" }, el("span", { class: "t-label" }, row.label));
    if (row.detail) body.append(el("span", { class: "t-detail" }, row.detail));
    li.append(body);
    if (row.side || row.recordId) {
      const sideNode = el("span", { class: "t-side" });
      if (row.side) {
        let { kind, text } = row.side;
        if (row.isSummary && m.summaryExpired) { kind = "stale"; text = "Expired"; }
        sideNode.append(el("span", { class: `word${kind ? " " + kind : ""}`, "data-final": text, "data-final-kind": kind }, text));
      }
      if (row.recordId) sideNode.append(recordButton(m, row.recordId));
      li.append(sideNode);
    }
    if (row.isNow) li.classList.add("is-current");
    list.append(li);
  }
  replay.rows = rows;

  const first = rows[0];
  $("trace-title").textContent = m.own
    ? `What arrived before ${stamp(m.asOf)}`
    : `What arrived between ${first ? first.time : m.t(m.asOf)} and ${m.t(m.asOf)}`;
  const note = $("trace-note");
  if (m.notDue.length === 0) note.hidden = true;
  else {
    note.hidden = false;
    note.textContent = m.notDue.length === 1
      ? `${m.notDue[0].label} is due at ${m.t(m.notDue[0].dueAt)}, so it is not counted yet.`
      : `${m.notDue.length} jobs are not due yet, so they are not counted.`;
  }
}

function recordButton(m, id) {
  const r = m.recordsById.get(id);
  return el("button", { class: "btn-text", type: "button", "data-record-id": id, "aria-label": `Open the record: ${r ? r.title : id}` }, "Record");
}

// ---- Stage ----
function renderDashboard(m, phase) {
  // phase: "final" (default), "live" (replay before expiry)
  const cell = $("answer-dashboard");
  const sr = m.summaryRecord;
  const naive = m.a.naiveVerdict;
  $("dash-label").textContent = m.own ? `The summary, ${stamp(m.sc.summary.observedAt)}` : `The dashboard, ${m.t(m.sc.summary.observedAt)}`;
  $("dash-word").textContent = verdictWord(m, naive);
  const says = m.own ? (naive === "healthy" ? "healthy" : "needs attention") : (naive === "healthy" ? "yes" : "no");
  const suffix = $("dash-suffix");
  const note = $("dash-note");
  if (phase === "live") {
    cell.dataset.state = "live";
    suffix.textContent = "";
    note.textContent = sr ? `Valid until ${m.t(sr.validUntil)}.` : "";
    return;
  }
  if (m.summaryExpired && sr) {
    cell.dataset.state = "expired";
    suffix.textContent = ` (expired at ${m.t(sr.validUntil)})`;
    note.textContent = `Expired at ${m.t(sr.validUntil)}. It still says ${says}.`;
  } else if (m.a.summaryStale) {
    cell.dataset.state = "replaced";
    suffix.textContent = " (replaced by newer run receipts)";
    const n = m.a.newerEvidenceRecordIds.length;
    note.textContent = `Replaced by ${n} newer run ${plural(n, "receipt", "receipts")}.`;
  } else {
    cell.dataset.state = "live";
    suffix.textContent = "";
    note.textContent = sr ? `Still current until ${m.t(sr.validUntil)}.` : "";
  }
}

function renderEvidence(m, phase) {
  const cell = $("answer-evidence");
  const w = $("evid-word");
  const st = $("evid-state");
  const note = $("evid-note");
  $("evid-label").textContent = m.own ? `The evidence, ${stamp(m.asOf)}` : `The evidence, ${m.t(m.asOf)}`;
  if (phase === "pending") {
    cell.dataset.state = "pending";
    clear(w).append(el("span", { class: "checking" }, "Not asked yet."));
    st.hidden = true; note.hidden = true;
    return;
  }
  cell.dataset.state = m.attention ? "attention" : "healthy";
  clear(w).append(verdictWord(m, m.a.governedVerdict));
  clear(st).append(m.attention ? stateWord("hold", "Needs attention") : stateWord("ok", "Healthy"));
  st.hidden = false;
  const due = m.dueLanes.length;
  note.textContent = m.attention
    ? (m.needLanes.length
      ? `${m.needLanes.length} of ${due} ${plural(due, "job that was", "jobs that were")} due: ${listJoin(m.needLanes.map(laneFragment))}.`
      : `${m.notValidSelected.length} ${plural(m.notValidSelected.length, "receipt is", "receipts are")} not valid.`)
    : `All ${due} ${plural(due, "job that was", "jobs that were")} due succeeded.`;
  note.hidden = false;
}

function renderStage(m) {
  $("clock-line").textContent = m.own
    ? `Your snapshot's clock: ${stamp(m.asOf)}.`
    : `Scenario clock: ${clock(m.asOf, m.asOf)} UTC, ${stamp(m.asOf).replace(/, \d\d:\d\d UTC$/, "")}, fixed.`;
  $("question").textContent = m.a.question;
  document.querySelector(".answers").classList.toggle("abs", m.own);
  renderDashboard(m, "final");
  renderEvidence(m, "final");
  renderTrace(m);
  const run = $("run");
  run.hidden = m.own;
  run.removeAttribute("aria-disabled");
  run.textContent = "Run the public scenario";
  $("copy-answer").hidden = false;
  $("ticker").hidden = true;
  const quiet = $("quiet-line");
  quiet.textContent = m.own
    ? `Your snapshot: ${ownName}. Checked in this tab only. Refresh to clear it.`
    : "Synthetic scenario on a fixed clock. Runs in your browser. Nothing is uploaded.";
  $("quiet-back").hidden = !m.own;
}

function setStatus(text) {
  const s = $("boot-status");
  s.removeAttribute("role");
  clear(s).append(text);
}

// ---- Sections 5 to 9 ----
function renderWhy(m) {
  const slot = clear(document.querySelector('[data-slot="why"]'));
  const title = $("why-title");
  const jobsNeed = m.needLanes.length > 0;
  if (m.own) title.textContent = "Why this answer.";
  else title.textContent = m.attention ? "Why the answer is no." : "Why the answer is yes.";
  const checks = [];

  // Job outcomes
  if (jobsNeed) {
    checks.push(["Job outcomes", m.needLanes.map((l) => laneClause(m, l)).join(" "), "hold",
      `${m.needLanes.length} ${plural(m.needLanes.length, "needs", "need")} attention`]);
  } else {
    checks.push(["Job outcomes", "Every job that was due succeeded.", "ok", "All succeeded"]);
  }
  // Dashboard freshness
  const sr = m.summaryRecord;
  const n = m.a.newerEvidenceRecordIds.length;
  const obs = m.t(m.sc.summary.observedAt);
  const dashName = m.own ? `summary from ${obs}` : `${obs} dashboard`;
  if (m.summaryExpired && sr) {
    const tail = n === 0 ? "No newer run receipt replaces it." : `${startNum(n)} newer run ${plural(n, "receipt replaces", "receipts replace")} it.`;
    checks.push(["Dashboard freshness", `The ${dashName} expired at ${m.t(sr.validUntil)}. ${tail}`, "stale", "Expired"]);
  } else if (m.a.summaryStale) {
    checks.push(["Dashboard freshness", `${startNum(n)} newer run ${plural(n, "receipt", "receipts")} arrived after the ${dashName}.`, "stale", "Replaced"]);
  } else {
    checks.push(["Dashboard freshness", `The ${dashName} is still current.`, "ok", "Current"]);
  }
  // Schedule coverage
  const due = m.dueLanes.length;
  if (m.missingLanes.length === 0) {
    let s = due === 1 ? "The 1 job that was due has reported." : `All ${due} jobs that were due have reported.`;
    if (m.notDue.length === 1) s += ` ${m.notDue[0].label} is not due until ${m.t(m.notDue[0].dueAt)}, so it is not counted as failed.`;
    else if (m.notDue.length > 1) s += ` ${startNum(m.notDue.length)} jobs are not due yet, so they are not counted as failed.`;
    checks.push(["Schedule coverage", s, "ok", "Complete"]);
  } else {
    const k = m.missingLanes.length;
    checks.push(["Schedule coverage", `${startNum(k)} ${plural(k, "job that was due has", "jobs that were due have")} no report.`, "stop", "Incomplete"]);
  }
  // Receipt quality
  const sel = m.selected.length;
  if (m.notValidSelected.length === 0) {
    checks.push(["Receipt quality", sel === 1 ? "The 1 receipt the answer uses is valid." : `All ${sel} receipts the answer uses are valid.`, "ok", "Valid"]);
  } else {
    const k = m.notValidSelected.length;
    checks.push(["Receipt quality", `${startNum(k)} ${plural(k, "receipt the answer uses is", "receipts the answer uses are")} expired or invalid.`, "stop", "Not valid"]);
  }

  let lead = "Four checks decide it.";
  if (m.attention && jobsNeed) lead = "Four checks decide it. The first one changes the answer.";
  else if (!m.attention) lead = "Four checks decide it. All four pass.";
  slot.append(el("p", { class: "lead-p" }, lead));
  const list = el("ul", { class: "ruled checks" });
  for (const [name, sentence, kind, state] of checks) {
    list.append(el("li", { class: "check" },
      el("div", { class: "check-text" }, el("h3", { class: "check-title" }, name), el("p", { class: "check-sentence" }, sentence)),
      stateWord(kind, state)));
  }
  slot.append(list);
  slot.append(el("p", { class: "small foot" }, "Each line restates the diagnostic's own result, recomputed in your browser."));
}

function renderJobs(m) {
  const slot = clear(document.querySelector('[data-slot="jobs"]'));
  const total = m.lanes.length;
  const due = m.dueLanes.length;
  const need = m.needLanes.length;
  let lead = `${total} ${plural(total, "job", "jobs")}. ${due} ${plural(due, "was", "were")} due by ${m.t(m.asOf)}.`;
  if (need) lead += ` ${need} ${plural(need, "needs", "need")} attention.`;
  slot.append(el("p", { class: "lead-p" }, lead));
  const tbody = el("tbody");
  for (const l of m.lanes) {
    let outcome, oKind, status, sKind;
    if (l.state === "not_due") { outcome = "Not due yet"; oKind = "stale"; status = "Not counted"; sKind = "stale"; }
    else if (l.state === "missing") { outcome = "No report"; oKind = "stop"; status = "Needs attention"; sKind = "hold"; }
    else {
      outcome = OUTCOME_WORD[l.outcome] ?? words(l.outcome); oKind = OUTCOME_KIND[l.outcome] ?? "hold";
      status = l.state === "healthy" ? "Healthy" : "Needs attention"; sKind = l.state === "healthy" ? "ok" : "hold";
    }
    const actions = el("td", { "data-label": "Actions", class: "job-actions" });
    if (l.evidenceRecordId) actions.append(recordButton(m, l.evidenceRecordId));
    if (!m.own && l.outcome === "failed") actions.append(el("a", { href: `${LAB2}#retry`, class: "lab2" }, "Propose a retry in lab 2"));
    if (!m.own && l.outcome === "preserved_local") actions.append(el("a", { href: `${LAB2}#delete`, class: "lab2" }, "See what an agent may do in lab 2"));
    tbody.append(el("tr", {},
      el("th", { scope: "row", "data-label": "Job" }, l.label),
      el("td", { "data-label": "Due" }, el("span", { class: "data" }, m.t(l.dueAt))),
      el("td", { "data-label": "Reported" }, l.receipt ? el("span", { class: "data" }, m.t(l.receipt.observedAt)) : "Not yet"),
      el("td", { "data-label": "Outcome" }, word(oKind, outcome)),
      el("td", { "data-label": "Status" }, stateWord(sKind, status)),
      actions));
  }
  slot.append(el("table", { class: "stack jobs-table" },
    el("thead", {}, el("tr", {}, ...["Job", "Due", "Reported", "Outcome", "Status"].map((h) => el("th", { scope: "col" }, h)), el("th", { scope: "col" }, el("span", { class: "vh" }, "Actions")))),
    tbody));
}

function renderContrast(m) {
  const slot = clear(document.querySelector('[data-slot="contrast"]'));
  slot.append(el("p", { class: "lead-p" }, "No. Here are three ways to answer the same question. Checking how recent the dashboard is gets this scenario right, and misses the next one."));
  const gov = m.a.governedVerdict;
  const naive = m.a.naiveVerdict;
  const recency = m.a.summaryStale ? "attention" : naive;
  const cell = (label, v) => {
    const right = v === gov;
    return el("td", { "data-label": label },
      el("span", { class: "verdict" }, v === "healthy" ? "Healthy" : "Needs attention"), ". ",
      el("span", { class: `word ${right ? "ok" : "stop"}` }, right ? "Right" : "Wrong"), ".");
  };
  const fixed = (label, v, right) => el("td", { "data-label": label }, el("span", { class: "verdict" }, v), ". ", el("span", { class: `word ${right ? "ok" : "stop"}` }, right ? "Right" : "Wrong"), ".");
  const heads = ["Case", "Repeat the dashboard", "Check only how recent it is", "This diagnostic"];
  slot.append(el("table", { class: "stack contrast-table" },
    el("caption", {}, `Answers to "${m.a.question}"`),
    el("thead", {}, el("tr", {}, ...heads.map((h) => el("th", { scope: "col" }, h)))),
    el("tbody", {},
      el("tr", {},
        el("th", { scope: "row", "data-label": "Case" }, m.own ? "Your snapshot, computed in your browser" : "This scenario, computed in your browser"),
        cell(heads[1], naive), cell(heads[2], recency), cell(heads[3], gov)),
      el("tr", {},
        el("th", { scope: "row", "data-label": "Case" }, "A receipt expires and nothing newer replaces it (from the eval report, not loaded on this page)"),
        fixed(heads[1], "Healthy", false), fixed(heads[2], "Healthy", false), fixed(heads[3], "Needs attention", true)))));
  slot.append(el("p", { class: "small foot" },
    "Recency only follows the eval report's rule: if the dashboard is stale, say needs attention; otherwise repeat it. ",
    el("a", { href: EVAL_REPORT }, "Read the eval report")));
}

function renderFoolMode(m) {
  for (const b of document.querySelectorAll("[data-preset]")) {
    if (m.own) b.setAttribute("aria-disabled", "true"); else b.removeAttribute("aria-disabled");
  }
  $("preset-note").hidden = !m.own;
  $("back-to-public").hidden = !m.own;
  $("snapshot-status").textContent = m.own ? `Showing your snapshot, ${ownName}. Checked in this tab.` : "Showing the public scenario.";
}

// ---- Search ----
let searchTimer = 0;
function resultState(r) {
  if (r.state === "valid") return ["ok", "Current"];
  if (r.state === "degraded" && r.issues.some((i) => i.code === "stale_record")) return ["stale", "Expired"];
  if (r.state === "degraded") return ["hold", "Needs review"];
  return ["stop", "Invalid"];
}
function runSearch(q, { announceIt = true } = {}) {
  if (!current) return;
  const m = model(current);
  const list = clear($("search-results"));
  const count = $("search-count");
  const order = $("search-order");
  order.hidden = true;
  const total = current.records.length;
  $("search-lead").textContent = `The diagnostic can also search the ${total} ${plural(total, "record", "records")} it used. Current records always rank before expired ones.`;
  let text;
  if (!q.trim()) {
    text = `Type a word to search the ${total} ${plural(total, "record", "records")}.`;
    count.textContent = text;
  } else {
    const results = runtime.searchContext(current.records, q, new Date(current.scenario.asOf), 5);
    if (results.length === 0) {
      count.textContent = `No record matches "${q}". Search matches whole words.`;
      text = "No record matches.";
    } else {
      text = results.length === 1 ? "1 record matches." : `${results.length} records match.`;
      count.textContent = text;
      for (let i = 0; i < results.length && order.hidden; i++) {
        if (results[i].state !== "valid") continue;
        for (let j = i + 1; j < results.length; j++) {
          if (results[j].state !== "valid" && results[j].score > results[i].score) {
            const expired = results[j].issues.some((x) => x.code === "stale_record");
            const lead = i === 0 ? `${results[i].title} ranks first because it is current.` : `${results[i].title} ranks above ${results[j].title} because it is current.`;
            order.textContent = `${lead} ${results[j].title} matches more words (score ${results[j].score.toFixed(2)} against ${results[i].score.toFixed(2)}) but ${expired ? "has expired" : "needs review"}.`;
            order.hidden = false;
            break;
          }
        }
      }
      for (const r of results) {
        const [kind, label] = resultState(r);
        list.append(el("li", { class: "result" },
          el("div", { class: "result-text" }, el("h3", { class: "result-title" }, r.title), el("p", { class: "small" }, r.summary)),
          el("div", { class: "result-meta" }, stateWord(kind, label), el("span", { class: "data score" }, `score ${r.score.toFixed(2)}`), recordButton(m, r.id))));
      }
    }
  }
  if (announceIt) {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => announce(text), 250);
  }
}

// ---- Render all ----
function renderAll() {
  const m = model(current);
  renderStage(m);
  renderWhy(m);
  renderJobs(m);
  renderContrast(m);
  renderFoolMode(m);
  for (const a of document.querySelectorAll("a.lab2")) a.hidden = m.own;
  const failed = m.lanes.find((l) => l.outcome === "failed");
  $("next-text").textContent = failed
    ? `An answer is not permission to act. Lab 2 of 2 starts from this answer: an agent proposes a retry of the failed ${failed.label}, but cannot approve it itself.`
    : "An answer is not permission to act. Lab 2 of 2 starts from this answer: an agent proposes an action, but cannot approve it itself.";
  if (m.own) {
    const input = $("search-query");
    runSearch(input.value, { announceIt: false });
  }
}

function verifyPublic() {
  const t0 = performance.now();
  const snap = runtime.verifyDiagnosticSnapshot(JSON.parse(rawText));
  lastVerifyMs = performance.now() - t0;
  return snap;
}

// ---- Replay ----
function setRowReached(li, row, reached) {
  li.dataset.reached = reached ? "true" : "false";
  const mk = li.querySelector(".mark");
  mk.className = `mark ${reached ? row.markKind : "pending"}`;
  const sideWord = li.querySelector(".t-side .word");
  if (sideWord) sideWord.hidden = !reached;
}

function startReplay() {
  if (!current || mode !== "public") return;
  const m = model(current);
  stopTimers();
  replay.active = true;
  replay.step = -1;
  document.documentElement.classList.add("replaying");
  $("run").textContent = "Skip to the answer";
  const from = replay.rows[0]?.time ?? m.t(m.sc.summary.observedAt);
  setStatus(`Replaying ${from} to ${m.t(m.asOf)}.`);
  announce(`Replaying the scenario from ${from} to ${m.t(m.asOf)}.`);
  // Let the start announcement land before the answer replaces it.
  if (REDUCED) { replay.timer = setTimeout(() => finishReplay(m, true), 120); return; }
  const items = [...$("trace").children];
  items.forEach((li, i) => { setRowReached(li, replay.rows[i], false); li.classList.remove("is-current"); });
  // The summary row starts "Healthy" again; the strike is removed.
  const summaryIdx = replay.rows.findIndex((r) => r.isSummary);
  if (summaryIdx >= 0) {
    const w = items[summaryIdx].querySelector(".t-side .word");
    if (w) { w.className = `word ${m.sc.summary.verdict === "healthy" ? "ok" : "hold"}`; w.textContent = m.sc.summary.verdict === "healthy" ? "Healthy" : "Needs attention"; }
  }
  renderDashboard(m, "live");
  renderEvidence(m, "pending");
  const ticker = $("ticker");
  ticker.hidden = false;
  const advance = () => {
    replay.step += 1;
    const k = replay.step;
    const row = replay.rows[k];
    if (!row) { finishReplay(m, false); return; }
    items.forEach((li) => li.classList.remove("is-current"));
    setRowReached(items[k], row, true);
    items[k].classList.add("is-current");
    clear(ticker).append(el("span", { class: "data" }, row.time), row.label);
    if (row.hasExpiry && m.summaryExpired) {
      renderDashboard(m, "final");
      if (summaryIdx >= 0) {
        const w = items[summaryIdx].querySelector(".t-side .word");
        if (w) { w.className = "word stale"; w.textContent = "Expired"; }
      }
    }
    if (k === replay.rows.length - 1) {
      replay.timer = setTimeout(() => finishReplay(m, false), HOLD_MS);
    } else {
      replay.timer = setTimeout(advance, STEP_MS);
    }
  };
  advance();
}

function stopTimers() { clearTimeout(replay.timer); replay.timer = 0; }

function finishReplay(m, immediate) {
  stopTimers();
  replay.active = false;
  document.documentElement.classList.remove("replaying");
  let snap;
  try { snap = verifyPublic(); } catch (error) { bootFailed(error); return; }
  current = snap;
  const fresh = model(current);
  renderStage(fresh);
  const items = [...$("trace").children];
  items.forEach((li) => li.classList.remove("is-current"));
  items[items.length - 1]?.classList.add("is-current");
  setStatus(`Recomputed in your browser in ${ms(lastVerifyMs)}. Same snapshot, same answer.`);
  announce(answerAnnouncement(fresh));
  void immediate;
}

function answerAnnouncement(m) {
  if (!m.attention) {
    const due = m.dueLanes.length;
    return `Answer at ${m.t(m.asOf)}: yes, healthy. All ${due} ${plural(due, "job that was", "jobs that were")} due succeeded.`;
  }
  const frags = m.needLanes.map((l) => `${laneFragment(l)}.`).join(" ");
  let s = `Answer at ${m.t(m.asOf)}: no, needs attention. ${frags}`.trim();
  if (m.summaryExpired && m.summaryRecord) s += ` The ${m.t(m.sc.summary.observedAt)} dashboard expired at ${m.t(m.summaryRecord.validUntil)}.`;
  return s;
}

// ---- Copy the answer ----
function answerText(m) {
  const lines = [];
  const due = m.dueLanes.length;
  if (m.own) lines.push(`Context Layer Lab, your snapshot (${ownName}), as of ${stamp(m.asOf)}`);
  else lines.push(`Context Layer Lab, public synthetic scenario (fixed clock: ${m.t(m.asOf)} UTC, ${stamp(m.asOf).replace(/, \d\d:\d\d UTC$/, "")})`);
  lines.push(`Question: ${m.a.question}`);
  const naive = m.a.naiveVerdict === "healthy" ? "Healthy" : "Needs attention";
  let dash = `Dashboard at ${m.t(m.sc.summary.observedAt)}: ${naive}.`;
  if (m.summaryExpired && m.summaryRecord) dash += ` Expired at ${m.t(m.summaryRecord.validUntil)}.`;
  else if (m.a.summaryStale) dash += " Replaced by newer run receipts.";
  lines.push(dash);
  lines.push(m.attention
    ? `Answer at ${m.t(m.asOf)}: Needs attention. ${m.needLanes.length} of ${due} ${plural(due, "job that was", "jobs that were")} due.`
    : `Answer at ${m.t(m.asOf)}: Healthy. All ${due} ${plural(due, "job that was", "jobs that were")} due succeeded.`);
  for (const l of m.needLanes) {
    const at = l.receipt ? m.t(l.receipt.observedAt) : "";
    if (l.state === "missing") lines.push(`- ${l.label}: no report since ${m.t(l.dueAt)}.`);
    else if (l.outcome === "failed") lines.push(`- ${l.label}: failed at ${at}.`);
    else if (l.outcome === "preserved_local") lines.push(`- ${l.label}: finished at ${at}, output not published.`);
    else lines.push(`- ${l.label}: needs attention at ${at}.`);
  }
  if (m.notDue.length) lines.push(`Not counted: ${m.notDue.map((l) => `${l.label}, due at ${m.t(l.dueAt)}`).join("; ")}.`);
  lines.push(`Recomputed in the browser from ${current.records.length} ${plural(current.records.length, "record", "records")}. No model call.`);
  return lines.join("\n");
}

async function copyAnswer() {
  if (!current) return;
  const text = answerText(model(current));
  try {
    await navigator.clipboard.writeText(text);
    announce("Answer copied as text.");
  } catch {
    announce("Copy did not work in this browser. Select the answer and copy it.");
  }
}

// ---- Record dialog ----
function openRecord(id, invoker) {
  if (!current) return;
  const m = model(current);
  const r = m.recordsById.get(id);
  if (!r) { announce("This snapshot names a record it does not include."); return; }
  const dialog = $("record-dialog");
  $("record-title").textContent = r.title;
  const body = clear($("record-body"));
  const q = m.a.evidenceQuality[id];
  const asOfMs = Date.parse(m.asOf);
  const expired = q ? q.issues.some((i) => i.code === "stale_record") : Date.parse(r.validUntil) <= asOfMs;
  const state = q ? q.state : (expired ? "degraded" : "valid");
  const stateLine = el("div", { class: "record-state" });
  if (state === "valid" && !expired) {
    stateLine.append(stateWord("ok", "Current"), el("p", {}, `Current at ${m.t(m.asOf)}. Valid until ${m.t(r.validUntil)}.`));
  } else if (expired) {
    stateLine.append(stateWord("stale", "Expired"), el("p", {}, `Expired at ${m.t(r.validUntil)}, ${span(asOfMs - Date.parse(r.validUntil))} before the question.`));
  } else {
    stateLine.append(stateWord(state === "invalid" ? "stop" : "hold", state === "invalid" ? "Invalid" : "Needs review"),
      el("p", {}, state === "invalid" ? "Invalid." : "Needs review."));
    for (const i of q?.issues ?? []) stateLine.append(el("p", { class: "data" }, `${i.code}: ${i.message}`));
  }
  body.append(stateLine);
  body.append(el("p", { class: "record-summary" }, r.summary));
  if (r.content && r.content !== r.summary) body.append(el("p", { class: "record-content" }, r.content));
  body.append(el("dl", { class: "record-meta" },
    el("div", { class: "dir" }, el("dt", { class: "dir-label" }, "Owner"), el("span", { class: "dir-leader", "aria-hidden": "true" }), el("dd", { class: "dir-value" }, r.owner)),
    el("div", { class: "dir" }, el("dt", { class: "dir-label" }, "Updated"), el("span", { class: "dir-leader", "aria-hidden": "true" }), el("dd", { class: "dir-value data" }, m.t(r.updatedAt))),
    el("div", { class: "dir" }, el("dt", { class: "dir-label" }, "Valid until"), el("span", { class: "dir-leader", "aria-hidden": "true" }), el("dd", { class: "dir-value data" }, m.t(r.validUntil)))));
  body.append(el("h3", { class: "label" }, "What it claims"));
  body.append(el("ul", { class: "claims" }, ...r.claims.map((c) => el("li", {}, c.text))));
  body.append(el("h3", { class: "label" }, "Sources"));
  body.append(el("ul", { class: "sources" }, ...r.sources.map((s) => el("li", {}, el("code", {}, s.id), " ", el("span", {}, s.label)))));
  body.append(el("p", { class: "small" }, "Source addresses are example identifiers, not links."));
  const pre = el("pre", {}, el("code", {}));
  pre.firstChild.textContent = JSON.stringify(r, null, 2);
  body.append(el("details", { class: "json" }, el("summary", {}, "Show the record as JSON"), pre));
  returnFocus = invoker;
  dialog.returnValue = "";
  dialog.showModal();
  $("record-close").focus();
}

function closeRecord() {
  const dialog = $("record-dialog");
  if (dialog.open) dialog.close();
}

// ---- Presets ----
const PRESETS = {
  verdict: (s) => { s.assessment.governedVerdict = "healthy"; },
  outcome: (s) => { const r = s.scenario.receipts.find((x) => x.recordId === "docs-build-receipt"); if (r) r.outcome = "success"; },
  drop: (s) => { s.scenario.receipts = s.scenario.receipts.filter((x) => x.recordId !== "docs-build-receipt"); },
  noon: (s) => { const r = s.records.find((x) => x.id === "daily-status-dashboard"); if (r) r.validUntil = "2026-07-28T12:00:00Z"; },
};
function runPreset(name) {
  if (!current || mode !== "public" || !PRESETS[name]) return;
  const copy = JSON.parse(rawText);
  PRESETS[name](copy);
  const out = clear($("fool-result"));
  out.hidden = false;
  for (const b of document.querySelectorAll("[data-preset]")) b.setAttribute("aria-pressed", String(b.dataset.preset === name));
  try {
    const v = runtime.verifyDiagnosticSnapshot(copy);
    out.dataset.state = "accepted";
    out.append(mark("hold"), " ", `Accepted. The checker recomputed: ${v.assessment.governedVerdict === "healthy" ? "Healthy" : "Needs attention"}. This edit did not change the evidence.`);
    announce(`Accepted. The checker recomputed: ${v.assessment.governedVerdict === "healthy" ? "Healthy" : "Needs attention"}.`);
  } catch (error) {
    const message = String(error?.message ?? error);
    out.dataset.state = "rejected";
    out.append(mark("stop"), " ", el("span", { class: "word stop" }, "Rejected:"), " ", el("span", { class: "data" }, message), " The answer above did not change.");
    announce(`Rejected. ${message}`);
  }
}

// ---- Own snapshot ----
function showSnapshotError(reason, mono) {
  const e = clear($("snapshot-error"));
  const source = mode === "own" ? `your snapshot, ${ownName}` : "the public scenario";
  e.append(`Snapshot rejected. The page still shows ${source}. Reason: `);
  e.append(mono ? el("span", { class: "data" }, reason) : reason);
  e.hidden = false;
}

async function checkFile(file) {
  const input = $("snapshot-file");
  const status = $("snapshot-status");
  $("snapshot-error").hidden = true;
  status.textContent = `Checking ${file.name}.`;
  let text;
  try { text = await file.text(); } catch { input.value = ""; renderFoolMode(model(current)); showSnapshotError("this file could not be read.", false); return; }
  let parsed;
  try { parsed = JSON.parse(text); } catch {
    input.value = ""; renderFoolMode(model(current)); showSnapshotError("this file is not JSON.", false); return;
  }
  let snap;
  const t0 = performance.now();
  try { snap = runtime.verifyDiagnosticSnapshot(parsed); } catch (error) {
    input.value = ""; renderFoolMode(model(current)); showSnapshotError(String(error?.message ?? error), true); return;
  }
  const took = performance.now() - t0;
  stopTimers();
  current = snap; mode = "own"; ownName = file.name; input.value = "";
  renderAll();
  setStatus(`Checked in this tab in ${ms(took)} from ${snap.records.length} ${plural(snap.records.length, "record", "records")}. No model call.`);
  $("fool-result").hidden = true;
  for (const b of document.querySelectorAll("[data-preset]")) b.removeAttribute("aria-pressed");
  const m = model(current);
  announce(`Loaded ${ownName}. Answer: ${m.attention ? "needs attention" : "healthy"}.`);
  const demo = $("demo");
  demo.scrollIntoView({ behavior: REDUCED ? "auto" : "smooth", block: "start" });
  demo.focus({ preventScroll: true });
}

function backToPublic() {
  let snap;
  try { snap = verifyPublic(); } catch (error) { bootFailed(error); return; }
  current = snap; mode = "public"; ownName = "";
  $("snapshot-error").hidden = true;
  renderAll();
  runSearch($("search-query").value, { announceIt: false });
  setStatus(`Computed in your browser in ${ms(lastVerifyMs)} from ${current.records.length} ${plural(current.records.length, "record", "records")}. No model call.`);
  announce("Back to the public scenario.");
}

// ---- Boot ----
function bootFailed(error) {
  stopTimers();
  current = null;
  document.documentElement.dataset.boot = "failed";
  document.documentElement.classList.remove("replaying");
  const evid = $("answer-evidence");
  evid.dataset.state = "failed";
  clear($("evid-word")).append(el("span", { class: "checking" }, "No answer."));
  $("evid-state").hidden = true;
  const note = $("evid-note");
  note.textContent = "The diagnostic did not load, so this page shows no answer it has not checked.";
  note.hidden = false;
  $("run").hidden = true;
  $("copy-answer").hidden = true;
  $("ticker").hidden = true;
  const s = clear($("boot-status"));
  s.setAttribute("role", "alert");
  s.append("Reason: ", el("span", { class: "data" }, String(error?.message ?? error)), " ", el("a", { href: EVAL_REPORT }, "Read the result in the eval report"));
  const tn = $("trace-note");
  tn.hidden = false;
  tn.textContent = "Evidence as published. Not checked in this browser.";
  for (const id of ["why", "jobs", "contrast", "fool", "search"]) {
    const body = document.querySelector(`#${id} .section-body`);
    if (body) clear(body).append(el("p", { class: "small" }, "Not available: the diagnostic did not load."));
  }
  announce("The diagnostic did not load. No answer is shown.");
}

function wire() {
  $("run").addEventListener("click", () => {
    if ($("run").getAttribute("aria-disabled") === "true" || !current) return;
    if (replay.active) { finishReplay(model(current), true); return; }
    startReplay();
  });
  $("copy-answer").addEventListener("click", copyAnswer);
  document.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-record-id]");
    if (btn && btn.getAttribute("aria-disabled") !== "true") openRecord(btn.dataset.recordId, btn);
  });
  const dialog = $("record-dialog");
  $("record-close").addEventListener("click", closeRecord);
  dialog.addEventListener("click", (event) => { if (event.target === dialog) closeRecord(); });
  dialog.addEventListener("close", () => { if (returnFocus && document.contains(returnFocus)) returnFocus.focus(); returnFocus = null; });
  for (const b of document.querySelectorAll("[data-preset]")) {
    b.addEventListener("click", () => { if (b.getAttribute("aria-disabled") !== "true") runPreset(b.dataset.preset); });
  }
  $("open-snapshot").addEventListener("click", () => { if (current) $("snapshot-file").click(); });
  $("snapshot-file").addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    if (file) checkFile(file);
  });
  $("back-to-public").addEventListener("click", backToPublic);
  $("quiet-back").addEventListener("click", backToPublic);
  const input = $("search-query");
  let debounce = 0;
  input.addEventListener("input", () => { clearTimeout(debounce); debounce = setTimeout(() => runSearch(input.value), 250); });
  $("search-form").addEventListener("submit", (event) => { event.preventDefault(); runSearch(input.value); });
  for (const b of document.querySelectorAll("[data-suggest]")) {
    b.addEventListener("click", () => { input.value = b.dataset.suggest; runSearch(input.value); });
  }
}

async function boot() {
  try {
    runtime = await import("./runtime.js");
    const res = await fetch("./operational-health.json");
    if (!res.ok) throw new Error(`The sample snapshot could not be loaded (HTTP ${res.status}).`);
    rawText = await res.text();
    current = verifyPublic();
    runtime.assessmentsConflict(current.assessment);
  } catch (error) {
    if (!booted) bootFailed(error);
    return;
  }
  booted = true;
  wire();
  renderAll();
  runSearch(DEFAULT_QUERY, { announceIt: false });
  setStatus(`Computed in your browser in ${ms(lastVerifyMs)} from ${current.records.length} ${plural(current.records.length, "record", "records")}. No model call.`);
  document.documentElement.dataset.boot = "ready";
  // The strike is already drawn on first render; transitions apply only after boot.
  requestAnimationFrame(() => requestAnimationFrame(() => document.documentElement.classList.add("animate")));
}

boot();
