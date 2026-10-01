import { searchContext, validateRecord } from "../src/context.js";

const current = {
  id: "refund-policy-2026",
  title: "Returns: 30-day window",
  summary: "Refunds are accepted within 30 days of delivery.",
  content: "Customers may request a refund within 30 days of delivery.",
  tags: ["policy", "refunds"],
  owner: "Customer Operations", // who answers for this record
  updatedAt: "2026-07-01T00:00:00Z",
  validUntil: "2026-12-31T23:59:59Z", // after this, the record is stale
  sources: [
    {
      id: "policy-doc-v3", // evidence the claims point to
      label: "Refund policy v3",
      url: "https://example.invalid/policies/refunds-v3",
      observedAt: "2026-07-01T00:00:00Z",
    },
  ],
  claims: [
    {
      text: "The refund window is 30 days.",
      sourceIds: ["policy-doc-v3"], // must name a declared source
    },
  ],
};

// Last year's version matches the query better, but it has expired.
const expired = {
  ...current,
  id: "refund-policy-2025",
  title: "Refund policy",
  validUntil: "2025-12-31T23:59:59Z",
};

const asOf = new Date("2026-09-01T00:00:00Z");

const check = validateRecord(expired, asOf);
console.log(check.state, check.issues.map((issue) => issue.code));
// degraded [ 'stale_record' ]

for (const hit of searchContext([expired, current], "refund policy", asOf)) {
  console.log(hit.id, hit.state, hit.score.toFixed(2));
}
// refund-policy-2026 valid 0.25
// refund-policy-2025 degraded 0.32
