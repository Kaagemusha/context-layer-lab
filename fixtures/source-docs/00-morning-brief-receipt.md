---
{
  "id": "morning-brief-receipt",
  "title": "Morning Brief Run Receipt",
  "summary": "The scheduled morning brief completed and delivered successfully.",
  "tags": ["automation-health", "run-receipt", "morning-brief"],
  "owner": "Messaging Operations",
  "updatedAt": "2026-07-28T08:02:00Z",
  "validUntil": "2026-07-29T08:02:00Z",
  "sources": [
    {
      "id": "morning-run-0802",
      "label": "Morning Brief terminal receipt",
      "url": "https://example.invalid/operations/morning-run-0802",
      "observedAt": "2026-07-28T08:02:00Z"
    }
  ],
  "claims": [
    {
      "text": "The Morning Brief run completed successfully.",
      "sourceIds": ["morning-run-0802"],
      "operational": {
        "kind": "receipt",
        "laneId": "morning-brief",
        "observedAt": "2026-07-28T08:02:00Z",
        "outcome": "success"
      }
    }
  ]
}
---
The terminal receipt records successful generation and delivery after the lane's scheduled window opened.
