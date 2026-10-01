---
{
  "id": "daily-status-dashboard",
  "title": "Daily Status Dashboard",
  "summary": "The 07:30 dashboard snapshot reports every scheduled job healthy.",
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
      "text": "All scheduled jobs are healthy.",
      "sourceIds": ["dashboard-snapshot-0730"],
      "operational": {
        "kind": "summary",
        "observedAt": "2026-07-28T07:30:00Z",
        "verdict": "healthy",
        "lanes": [
          {
            "id": "nightly-export",
            "label": "Nightly Export",
            "dueAt": "2026-07-28T07:55:00Z"
          },
          {
            "id": "docs-build",
            "label": "Docs Build",
            "dueAt": "2026-07-28T08:15:00Z"
          },
          {
            "id": "weekly-report",
            "label": "Weekly Report",
            "dueAt": "2026-07-28T08:30:00Z"
          },
          {
            "id": "data-sync",
            "label": "Data Sync",
            "dueAt": "2026-07-28T17:30:00Z"
          }
        ]
      }
    }
  ]
}
---
The dashboard was accurate when generated. Its freshness window ends when the first scheduled job becomes due.
