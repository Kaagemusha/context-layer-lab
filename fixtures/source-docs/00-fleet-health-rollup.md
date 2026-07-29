---
{
  "id": "fleet-health-rollup",
  "title": "Fleet Health Rollup",
  "summary": "A morning dashboard snapshot reports every scheduled lane healthy.",
  "tags": ["automation-health", "summary", "dashboard"],
  "owner": "Reliability Operations",
  "updatedAt": "2026-07-28T07:30:00Z",
  "validUntil": "2026-07-28T07:55:00Z",
  "sources": [
    {
      "id": "dashboard-snapshot-0730",
      "label": "Dashboard snapshot at 07:30",
      "url": "https://example.invalid/operations/dashboard-0730",
      "observedAt": "2026-07-28T07:30:00Z"
    }
  ],
  "claims": [
    {
      "text": "All scheduled automation lanes are healthy.",
      "sourceIds": ["dashboard-snapshot-0730"]
    }
  ]
}
---
The dashboard was accurate when generated. Its freshness window ends when the first morning lane becomes due.
