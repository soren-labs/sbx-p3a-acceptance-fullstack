"""API contract tests for the Focus Board backend."""

import sqlite3
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from app.main import create_app

ENV_PRIORITY = "FOCUS_BOARD_DEFAULT_PRIORITY"


@pytest.fixture()
def client(tmp_path):
    app = create_app(db_path=str(tmp_path / "test.db"))
    with TestClient(app) as client:
        yield client


def create_task(client, title="Write tests", status=None, **extra):
    body = {"title": title}
    if status is not None:
        body["status"] = status
    body.update(extra)
    return client.post("/tasks", json=body)


def test_health(client):
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}


def test_create_task_defaults(client, monkeypatch):
    monkeypatch.delenv(ENV_PRIORITY, raising=False)
    res = create_task(client)
    assert res.status_code == 201
    task = res.json()
    assert task["id"] > 0
    assert task["title"] == "Write tests"
    assert task["status"] == "todo"
    assert task["priority"] == "medium"
    assert task["due_date"] is None
    assert task["created_at"]


def test_create_task_default_priority_from_env(client, monkeypatch):
    monkeypatch.setenv(ENV_PRIORITY, "high")
    res = create_task(client)
    assert res.status_code == 201
    assert res.json()["priority"] == "high"


@pytest.mark.parametrize("value", ["urgent", "", "MEDIUMISH"])
def test_create_task_invalid_env_falls_back_to_medium(client, monkeypatch, value):
    monkeypatch.setenv(ENV_PRIORITY, value)
    res = create_task(client)
    assert res.status_code == 201
    assert res.json()["priority"] == "medium"


def test_create_task_explicit_priority_overrides_env(client, monkeypatch):
    monkeypatch.setenv(ENV_PRIORITY, "high")
    res = create_task(client, priority="low")
    assert res.status_code == 201
    assert res.json()["priority"] == "low"


def test_create_task_accepts_priority_and_due_date(client):
    res = create_task(client, priority="high", due_date="2030-01-15")
    assert res.status_code == 201
    task = res.json()
    assert task["priority"] == "high"
    assert task["due_date"] == "2030-01-15"


def test_create_task_null_due_date(client):
    res = create_task(client, due_date=None)
    assert res.status_code == 201
    assert res.json()["due_date"] is None


def test_create_task_strips_title_and_accepts_status(client):
    res = create_task(client, title="  spaced  ", status="doing")
    assert res.status_code == 201
    assert res.json()["title"] == "spaced"
    assert res.json()["status"] == "doing"


@pytest.mark.parametrize(
    "body",
    [
        {},
        {"title": ""},
        {"title": "   "},
        {"title": "x" * 201},
        {"title": "ok", "status": "backlog"},
        {"title": "ok", "priority": "urgent"},
        {"title": "ok", "due_date": "not-a-date"},
        {"title": "ok", "due_date": "2030-13-40"},
        {"status": "todo"},
    ],
)
def test_create_task_validation_errors(client, body):
    res = client.post("/tasks", json=body)
    assert res.status_code == 422
    assert res.json()["detail"]


def test_list_tasks(client):
    create_task(client, "first")
    create_task(client, "second", status="done")
    res = client.get("/tasks")
    assert res.status_code == 200
    tasks = res.json()
    assert [t["title"] for t in tasks] == ["first", "second"]
    assert all(
        {"id", "title", "status", "priority", "due_date", "created_at"}
        <= set(t)
        for t in tasks
    )


def test_get_task(client):
    task_id = create_task(client).json()["id"]
    res = client.get(f"/tasks/{task_id}")
    assert res.status_code == 200
    assert res.json()["id"] == task_id


def test_get_task_not_found(client):
    res = client.get("/tasks/9999")
    assert res.status_code == 404
    assert res.json()["detail"] == "Task 9999 not found"


def test_update_task_title_and_status(client):
    task_id = create_task(client).json()["id"]

    res = client.patch(f"/tasks/{task_id}", json={"status": "doing"})
    assert res.status_code == 200
    assert res.json()["status"] == "doing"

    res = client.patch(
        f"/tasks/{task_id}", json={"title": "renamed", "status": "done"}
    )
    assert res.status_code == 200
    assert res.json()["title"] == "renamed"
    assert res.json()["status"] == "done"

    assert client.get(f"/tasks/{task_id}").json()["title"] == "renamed"


def test_update_task_priority_and_due_date(client):
    task_id = create_task(client).json()["id"]

    res = client.patch(
        f"/tasks/{task_id}",
        json={"priority": "high", "due_date": "2030-06-01"},
    )
    assert res.status_code == 200
    assert res.json()["priority"] == "high"
    assert res.json()["due_date"] == "2030-06-01"


def test_update_task_clears_due_date_with_null(client):
    task_id = create_task(client, due_date="2030-06-01").json()["id"]

    res = client.patch(f"/tasks/{task_id}", json={"due_date": None})
    assert res.status_code == 200
    assert res.json()["due_date"] is None
    assert client.get(f"/tasks/{task_id}").json()["due_date"] is None


def test_update_task_not_found(client):
    res = client.patch("/tasks/9999", json={"status": "done"})
    assert res.status_code == 404


def test_update_task_no_fields(client):
    task_id = create_task(client).json()["id"]
    res = client.patch(f"/tasks/{task_id}", json={})
    assert res.status_code == 400
    assert "title" in res.json()["detail"]
    assert "status" in res.json()["detail"]


@pytest.mark.parametrize(
    "body",
    [
        {"title": ""},
        {"title": "   "},
        {"status": "paused"},
        {"title": "x" * 201},
        {"priority": "urgent"},
        {"due_date": "yesterday"},
    ],
)
def test_update_task_validation_errors(client, body):
    task_id = create_task(client).json()["id"]
    res = client.patch(f"/tasks/{task_id}", json=body)
    assert res.status_code == 422


def test_delete_task(client):
    task_id = create_task(client).json()["id"]
    res = client.delete(f"/tasks/{task_id}")
    assert res.status_code == 204
    assert client.get(f"/tasks/{task_id}").status_code == 404
    assert client.get("/tasks").json() == []


def test_delete_task_not_found(client):
    assert client.delete("/tasks/9999").status_code == 404


def test_stats_empty(client):
    res = client.get("/stats")
    assert res.status_code == 200
    assert res.json() == {
        "total": 0,
        "by_status": {"todo": 0, "doing": 0, "done": 0},
        "by_priority": {"low": 0, "medium": 0, "high": 0},
        "overdue": 0,
    }


def test_stats_counts_and_overdue(client, monkeypatch):
    monkeypatch.delenv(ENV_PRIORITY, raising=False)
    # The backend compares due_date against the UTC date.
    today = datetime.now(timezone.utc).date()
    past = (today - timedelta(days=1)).isoformat()
    future = (today + timedelta(days=1)).isoformat()

    create_task(client, "overdue", priority="high", due_date=past)
    create_task(client, "done-past-due", status="done", due_date=past)
    create_task(client, "due-today", priority="low", due_date=today.isoformat())
    create_task(client, "due-future", priority="low", due_date=future)
    create_task(client, "no-due", status="doing")

    res = client.get("/stats")
    assert res.status_code == 200
    body = res.json()
    assert body["total"] == 5
    assert body["by_status"] == {"todo": 3, "doing": 1, "done": 1}
    assert body["by_priority"] == {"low": 2, "medium": 2, "high": 1}
    # Only the unfinished task with a past due_date counts as overdue:
    # done tasks and tasks due today/future are excluded.
    assert body["overdue"] == 1


def test_stats_overdue_respects_completion(client):
    past = (datetime.now(timezone.utc).date() - timedelta(days=1)).isoformat()
    task_id = create_task(client, due_date=past).json()["id"]
    assert client.get("/stats").json()["overdue"] == 1

    client.patch(f"/tasks/{task_id}", json={"status": "done"})
    assert client.get("/stats").json()["overdue"] == 0


def test_existing_db_is_migrated(tmp_path):
    """A database created with the pre-priority schema keeps working."""
    path = tmp_path / "legacy.db"
    conn = sqlite3.connect(path)
    conn.execute(
        "CREATE TABLE tasks ("
        "  id INTEGER PRIMARY KEY AUTOINCREMENT,"
        "  title TEXT NOT NULL,"
        "  status TEXT NOT NULL DEFAULT 'todo'"
        "    CHECK (status IN ('todo', 'doing', 'done')),"
        "  created_at TEXT NOT NULL"
        ")"
    )
    conn.execute(
        "INSERT INTO tasks (title, status, created_at) "
        "VALUES ('legacy task', 'done', '2020-01-01T00:00:00+00:00')"
    )
    conn.commit()
    conn.close()

    app = create_app(db_path=str(path))
    with TestClient(app) as client:
        res = client.get("/tasks/1")
        assert res.status_code == 200
        task = res.json()
        assert task["title"] == "legacy task"
        assert task["status"] == "done"
        assert task["priority"] == "medium"
        assert task["due_date"] is None

        # New writes work on the migrated schema.
        assert create_task(client, "new task").status_code == 201
