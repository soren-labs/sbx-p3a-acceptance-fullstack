"""API contract tests for the Focus Board backend."""

import pytest
from fastapi.testclient import TestClient

from app.main import create_app


@pytest.fixture()
def client(tmp_path):
    app = create_app(db_path=str(tmp_path / "test.db"))
    with TestClient(app) as client:
        yield client


def create_task(client, title="Write tests", status=None):
    body = {"title": title}
    if status is not None:
        body["status"] = status
    return client.post("/tasks", json=body)


def test_health(client):
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}


def test_create_task_defaults(client):
    res = create_task(client)
    assert res.status_code == 201
    task = res.json()
    assert task["id"] > 0
    assert task["title"] == "Write tests"
    assert task["status"] == "todo"
    assert task["created_at"]


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
    assert all({"id", "title", "status", "created_at"} <= set(t) for t in tasks)


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


def test_update_task_not_found(client):
    res = client.patch("/tasks/9999", json={"status": "done"})
    assert res.status_code == 404


def test_update_task_no_fields(client):
    task_id = create_task(client).json()["id"]
    res = client.patch(f"/tasks/{task_id}", json={})
    assert res.status_code == 400
    assert "title or status" in res.json()["detail"]


@pytest.mark.parametrize(
    "body",
    [{"title": ""}, {"title": "   "}, {"status": "paused"}, {"title": "x" * 201}],
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
