# Focus Board Backend — Planning & Insights Acceptance Report

## Scope

Backend changes for the Focus Board Planning & Insights feature
(FastAPI + SQLite, `backend/` only; `frontend/` untouched).

## Changes

- `app/schemas.py`
  - Added `TaskPriority = Literal["low", "medium", "high"]`.
  - `TaskCreate` / `TaskUpdate` / `TaskOut` now include `priority`
    (optional on input) and `due_date` (optional ISO calendar date, or
    `null`). `due_date` is validated by Pydantic's `date` type, so
    malformed or impossible dates are rejected with HTTP 422.
- `app/db.py`
  - Fresh databases create `tasks` with `priority TEXT NOT NULL DEFAULT
    'medium' CHECK (priority IN ('low','medium','high'))` and nullable
    `due_date TEXT` (ISO `YYYY-MM-DD`).
  - `init_db` migrates pre-existing databases in place: `ALTER TABLE
    tasks ADD COLUMN priority ... DEFAULT 'medium'` and `ADD COLUMN
    due_date TEXT` are applied only when the columns are missing, so
    existing rows become `priority='medium'`, `due_date=NULL` with no
    data loss.
- `app/main.py`
  - All task reads/writes include `priority` and `due_date`.
  - `POST /tasks`: when `priority` is omitted, the value of the
    `FOCUS_BOARD_DEFAULT_PRIORITY` environment variable is used if it is
    present and valid (`low|medium|high`, case-insensitive, surrounding
    whitespace ignored); otherwise the default is `medium`. An explicit
    `priority` in the request always wins. The variable is read per
    request.
  - `PATCH /tasks/{id}`: accepts `priority` and `due_date`; an explicit
    `"due_date": null` clears the due date. Other fields keep the
    previous ignore-null semantics.
  - `GET /stats` returns
    `{"total", "by_status": {todo, doing, done}, "by_priority": {low,
    medium, high}, "overdue"}`.
- `tests/test_api.py`
  - Extended to cover: env-var default priority (set/invalid/unset),
    explicit-priority precedence, priority/due_date validation (422s),
    PATCH updates and due-date clearing, `/stats` counts and overdue
    rule, and migration of a pre-feature SQLite database.

## Overdue rule (documented behavior)

A task is **overdue** when `due_date` is not null **and** `due_date` is
strictly earlier than the current UTC date (`date('now')` in SQLite)
**and** `status != 'done'`. Tasks due today, tasks with no due date, and
completed tasks are never overdue.

## Injected environment resource

`FOCUS_BOARD_DEFAULT_PRIORITY` was provided via the injected session
resource `sbx-acceptance-focus-config`. It was exercised during
development via an in-process smoke check that created a task with the
`priority` field omitted and asserted the stored priority matched the
injected default semantics. The variable's value is not printed, logged,
or committed anywhere; this report only records that the injected
default was exercised.

## Commands and results

| Command (run from `backend/`) | Result |
| --- | --- |
| `pip install -r requirements-dev.txt` | PASS — deps installed (fastapi 0.141.1, pytest 8.4.2) |
| `python -m pytest -q` (before changes, main commit) | PASS — 21 passed |
| `python -m pytest -q` (after changes) | PASS — 39 passed, 1 warning |
| `python - <<'EOF' ... EOF` in-process smoke check: `POST /tasks` with omitted `priority` under the injected `FOCUS_BOARD_DEFAULT_PRIORITY`, then `GET /stats` | PASS — stored priority matched the injected-default semantics; `/stats` returned `total=1` |

No secrets, tokens, or environment-variable values are included in this
report or the repository.
