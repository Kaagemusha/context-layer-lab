---
{
  "id": "nightly-export-receipt",
  "title": "Nightly Export Run Receipt",
  "summary": "The scheduled nightly export completed and delivered successfully.",
  "tags": ["automation-health", "run-receipt", "nightly-export"],
  "owner": "Data Operations",
  "updatedAt": "2026-07-28T08:02:00Z",
  "validUntil": "2026-07-29T08:02:00Z",
  "sources": [
    {
      "id": "export-run-0802",
      "label": "Nightly Export terminal receipt",
      "url": "https://example.invalid/operations/export-run-0802",
      "observedAt": "2026-07-28T08:02:00Z"
    }
  ],
  "claims": [
    {
      "text": "The Nightly Export run completed successfully.",
      "sourceIds": ["export-run-0802"],
      "operational": {
        "kind": "receipt",
        "laneId": "nightly-export",
        "observedAt": "2026-07-28T08:02:00Z",
        "outcome": "success"
      }
    }
  ]
}
---
The terminal receipt records successful generation and delivery after the job's scheduled window opened.
