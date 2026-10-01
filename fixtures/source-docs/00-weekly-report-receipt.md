---
{
  "id": "weekly-report-receipt",
  "title": "Weekly Report Run Receipt",
  "summary": "The report run completed, but its output remains preserved locally rather than published.",
  "tags": ["automation-health", "run-receipt", "weekly-report"],
  "owner": "Analytics Operations",
  "updatedAt": "2026-07-28T09:05:00Z",
  "validUntil": "2026-07-29T09:05:00Z",
  "sources": [
    {
      "id": "report-run-0905",
      "label": "Weekly Report terminal receipt",
      "url": "https://example.invalid/operations/report-run-0905",
      "observedAt": "2026-07-28T09:05:00Z"
    }
  ],
  "claims": [
    {
      "text": "The Weekly Report output is preserved locally and is not published.",
      "sourceIds": ["report-run-0905"],
      "operational": {
        "kind": "receipt",
        "laneId": "weekly-report",
        "observedAt": "2026-07-28T09:05:00Z",
        "outcome": "preserved_local"
      }
    }
  ]
}
---
Work exists, but the terminal state is not equivalent to successful publication. The job needs attention without discarding its output.
