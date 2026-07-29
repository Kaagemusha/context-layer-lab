---
{
  "id": "support-escalation",
  "title": "Support Escalation Path",
  "summary": "The current severity definitions and escalation owners for customer-impacting incidents.",
  "tags": ["support", "incident", "ownership"],
  "owner": "Customer Operations",
  "updatedAt": "2026-07-18T16:00:00Z",
  "validUntil": "2026-09-30T23:59:59Z",
  "sources": [
    {
      "id": "support-policy-7",
      "label": "Support policy 7",
      "url": "https://example.invalid/support/policy-7",
      "observedAt": "2026-07-18T15:30:00Z"
    }
  ],
  "claims": [
    {
      "text": "Severity 1 incidents page the incident commander and customer lead.",
      "sourceIds": ["support-policy-7"]
    },
    {
      "text": "Severity 2 incidents enter hourly triage.",
      "sourceIds": ["support-policy-7"]
    }
  ]
}
---
Severity 1 incidents page the incident commander and customer lead immediately. Severity 2 incidents enter the hourly triage queue.
