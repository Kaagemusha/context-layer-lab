---
{
  "id": "site-refresh-receipt",
  "title": "Site Refresh Run Receipt",
  "summary": "The scheduled refresh stopped before deployment because its source checkout was dirty.",
  "tags": ["automation-health", "run-receipt", "site-refresh"],
  "owner": "Web Operations",
  "updatedAt": "2026-07-28T08:40:00Z",
  "validUntil": "2026-07-29T08:40:00Z",
  "sources": [
    {
      "id": "site-run-0840",
      "label": "Site Refresh terminal receipt",
      "url": "https://example.invalid/operations/site-run-0840",
      "observedAt": "2026-07-28T08:40:00Z"
    }
  ],
  "claims": [
    {
      "text": "The Site Refresh run failed before deployment.",
      "sourceIds": ["site-run-0840"],
      "operational": {
        "kind": "receipt",
        "laneId": "site-refresh",
        "observedAt": "2026-07-28T08:40:00Z",
        "outcome": "failed"
      }
    }
  ]
}
---
The prior public version remains unchanged. The failed run is newer and more specific than the earlier fleet summary.
