---
{
  "id": "launch-readiness",
  "title": "Northstar Launch Readiness",
  "summary": "Current owners, decision gates, and rollback criteria for the Northstar launch.",
  "tags": ["launch", "ownership", "operations"],
  "owner": "Program Operations",
  "updatedAt": "2026-07-20T14:30:00Z",
  "validUntil": "2026-08-15T23:59:59Z",
  "sources": [
    {
      "id": "decision-log-42",
      "label": "Decision log 42",
      "url": "https://example.invalid/northstar/decision-42",
      "observedAt": "2026-07-20T14:00:00Z"
    },
    {
      "id": "runbook-v3",
      "label": "Launch runbook v3",
      "url": "https://example.invalid/northstar/runbook-v3",
      "observedAt": "2026-07-19T18:00:00Z"
    }
  ],
  "claims": [
    {
      "text": "Northstar is in controlled rollout.",
      "sourceIds": ["decision-log-42"]
    },
    {
      "text": "Engineering owns rollback execution.",
      "sourceIds": ["runbook-v3"]
    }
  ]
}
---
The launch is in controlled rollout. Product owns the go/no-go decision, Support owns the escalation brief, and Engineering owns rollback execution.
