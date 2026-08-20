---
{
  "id": "research-watch-receipt",
  "title": "Research Watch Run Receipt",
  "summary": "The research run completed, but its output remains preserved locally rather than integrated.",
  "tags": ["automation-health", "run-receipt", "research-watch"],
  "owner": "Research Operations",
  "updatedAt": "2026-07-28T09:05:00Z",
  "validUntil": "2026-07-29T09:05:00Z",
  "sources": [
    {
      "id": "research-run-0905",
      "label": "Research Watch terminal receipt",
      "url": "https://example.invalid/operations/research-run-0905",
      "observedAt": "2026-07-28T09:05:00Z"
    }
  ],
  "claims": [
    {
      "text": "The Research Watch output is preserved locally and is not integrated.",
      "sourceIds": ["research-run-0905"],
      "operational": {
        "kind": "receipt",
        "laneId": "research-watch",
        "observedAt": "2026-07-28T09:05:00Z",
        "outcome": "preserved_local"
      }
    }
  ]
}
---
Work exists, but the terminal state is not equivalent to successful publication. The lane needs attention without discarding its output.
