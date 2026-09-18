"""Request/response models for the tasks API."""

from datetime import date
from typing import Literal

from pydantic import BaseModel, Field, field_validator

TaskStatus = Literal["todo", "doing", "done"]
TaskPriority = Literal["low", "medium", "high"]


class TaskCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    status: TaskStatus = "todo"
    priority: TaskPriority | None = None
    due_date: date | None = None

    @field_validator("title")
    @classmethod
    def _clean_title(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("title must not be blank")
        return stripped


class TaskUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    status: TaskStatus | None = None
    priority: TaskPriority | None = None
    due_date: date | None = None

    @field_validator("title")
    @classmethod
    def _clean_title(cls, value: str | None) -> str | None:
        if value is None:
            return value
        stripped = value.strip()
        if not stripped:
            raise ValueError("title must not be blank")
        return stripped


class TaskOut(BaseModel):
    id: int
    title: str
    status: TaskStatus
    priority: TaskPriority
    due_date: date | None
    created_at: str
