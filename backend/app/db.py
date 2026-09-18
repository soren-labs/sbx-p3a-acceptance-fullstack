"""SQLite access for Focus Board tasks."""

import os
import sqlite3
from pathlib import Path

DEFAULT_DB_PATH = Path(__file__).resolve().parent.parent / "focus_board.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'todo'
        CHECK (status IN ('todo', 'doing', 'done')),
    priority TEXT NOT NULL DEFAULT 'medium'
        CHECK (priority IN ('low', 'medium', 'high')),
    due_date TEXT,
    created_at TEXT NOT NULL
);
"""


def db_path() -> str:
    return os.environ.get("FOCUS_BOARD_DB", str(DEFAULT_DB_PATH))


def connect(path: str) -> sqlite3.Connection:
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    return conn


def _migrate(conn: sqlite3.Connection) -> None:
    """Add columns introduced after the initial schema to existing DBs."""
    columns = {row["name"] for row in conn.execute("PRAGMA table_info(tasks)")}
    if "priority" not in columns:
        conn.execute(
            "ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'medium'"
        )
    if "due_date" not in columns:
        conn.execute("ALTER TABLE tasks ADD COLUMN due_date TEXT")


def init_db(path: str) -> None:
    with connect(path) as conn:
        conn.executescript(SCHEMA)
        _migrate(conn)
