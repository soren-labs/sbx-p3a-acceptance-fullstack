# Focus Board Frontend — Planning & Insights Acceptance Report

## Changes Delivered

- Added priority selector (`low` | `medium` | `high`) to the new-task form and inline task editor.
- Added optional due-date input for creating and editing tasks, with a visible overdue indicator for unfinished tasks whose due date is past today (UTC).
- Added a compact stats summary fetched from `GET /stats`, showing total, status counts, priority counts, and an overdue count.
- Preserved existing add, edit, status-change, delete, filter, and refresh behavior.
- Fall back to `medium` priority and `null` due date when older backend responses omit these fields.

## Frontend Checks

Run from `frontend/`:

| Command | Result |
| --- | --- |
| `npm ci` | PASS |
| `npm run typecheck` | PASS |
| `npm run build` | PASS |

Browser, Playwright, screenshot, or `sbx-browser` tests were not run per instructions.
