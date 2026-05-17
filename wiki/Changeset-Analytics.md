# Changeset Analytics

Use `uvcs_changeset_analytics` to review checkins over a period.

Input example:

```json
{
  "since": "2026-05-01",
  "until": "2026-05-17",
  "branch": "/main",
  "commentLike": "refactor",
  "maxResults": 100
}
```

Use cases:

- release review;
- refactor review;
- branch activity summary;
- contributor activity summary;
- changelog preparation.

This tool is read-only and uses `cm find changeset`.

