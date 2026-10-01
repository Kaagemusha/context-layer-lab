---
{
  "id": "docs-build-receipt",
  "title": "Docs Build Run Receipt",
  "summary": "The scheduled docs build stopped before deployment because its pre-deploy validation failed.",
  "tags": ["automation-health", "run-receipt", "docs-build"],
  "owner": "Platform Operations",
  "updatedAt": "2026-07-28T08:40:00Z",
  "validUntil": "2026-07-29T08:40:00Z",
  "sources": [
    {
      "id": "docs-run-0840",
      "label": "Docs Build terminal receipt",
      "url": "https://example.invalid/operations/docs-run-0840",
      "observedAt": "2026-07-28T08:40:00Z"
    }
  ],
  "claims": [
    {
      "text": "The Docs Build run failed before deployment.",
      "sourceIds": ["docs-run-0840"],
      "operational": {
        "kind": "receipt",
        "laneId": "docs-build",
        "observedAt": "2026-07-28T08:40:00Z",
        "outcome": "failed"
      }
    }
  ]
}
---
The prior public version remains unchanged. The failed run is newer and more specific than the earlier status summary.
