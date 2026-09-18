"""Focus Board API — FastAPI + SQLite."""

import sqlite3
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Iterator

from fastapi import Depends, FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware

from . import db
from .schemas import TaskCreate, TaskOut, TaskUpdate


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _row_to_task(row: sqlite3.Row) -> TaskOut:
    return TaskOut(
        id=row["id"],
        title=row["title"],
        status=row["status"],
        created_at=row["created_at"],
    )


def create_app(db_path: str | None = None) -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        db.init_db(app.state.db_path)
        yield

    app = FastAPI(title="Focus Board API", version="0.1.0", lifespan=lifespan)
    app.state.db_path = db_path or db.db_path()

    # Dev CORS — the Vite frontend runs on a different origin.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    def get_db(request: Request) -> Iterator[sqlite3.Connection]:
        conn = db.connect(request.app.state.db_path)
        try:
            yield conn
        finally:
            conn.close()

    Conn = Depends(get_db)

    def get_task_or_404(conn: sqlite3.Connection, task_id: int) -> sqlite3.Row:
        row = conn.execute(
            "SELECT id, title, status, created_at FROM tasks WHERE id = ?",
            (task_id,),
        ).fetchone()
        if row is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Task {task_id} not found",
            )
        return row

    @app.get("/health")
    def health() -> dict:
        return {"status": "ok"}

    @app.get("/tasks", response_model=list[TaskOut])
    def list_tasks(conn: sqlite3.Connection = Conn) -> list[TaskOut]:
        rows = conn.execute(
            "SELECT id, title, status, created_at FROM tasks ORDER BY id"
        ).fetchall()
        return [_row_to_task(row) for row in rows]

    @app.post(
        "/tasks",
        response_model=TaskOut,
        status_code=status.HTTP_201_CREATED,
    )
    def create_task(
        payload: TaskCreate, conn: sqlite3.Connection = Conn
    ) -> TaskOut:
        created_at = _now_iso()
        cursor = conn.execute(
            "INSERT INTO tasks (title, status, created_at) VALUES (?, ?, ?)",
            (payload.title, payload.status, created_at),
        )
        conn.commit()
        return TaskOut(
            id=cursor.lastrowid,
            title=payload.title,
            status=payload.status,
            created_at=created_at,
        )

    @app.get("/tasks/{task_id}", response_model=TaskOut)
    def get_task(task_id: int, conn: sqlite3.Connection = Conn) -> TaskOut:
        return _row_to_task(get_task_or_404(conn, task_id))

    @app.patch("/tasks/{task_id}", response_model=TaskOut)
    def update_task(
        task_id: int,
        payload: TaskUpdate,
        conn: sqlite3.Connection = Conn,
    ) -> TaskOut:
        get_task_or_404(conn, task_id)

        updates = payload.model_dump(exclude_unset=True)
        updates = {k: v for k, v in updates.items() if v is not None}
        if not updates:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Provide at least one field to update: title or status",
            )

        assignments = ", ".join(f"{field} = ?" for field in updates)
        conn.execute(
            f"UPDATE tasks SET {assignments} WHERE id = ?",
            (*updates.values(), task_id),
        )
        conn.commit()
        return _row_to_task(get_task_or_404(conn, task_id))

    @app.delete("/tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
    def delete_task(task_id: int, conn: sqlite3.Connection = Conn) -> None:
        get_task_or_404(conn, task_id)
        conn.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
        conn.commit()

    return app


app = create_app()
