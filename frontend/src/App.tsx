import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { createTask, deleteTask, listTasks, updateTask } from './api'
import type { Task, TaskStatus } from './types'

const STATUSES: TaskStatus[] = ['todo', 'doing', 'done']

const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: 'To do',
  doing: 'Doing',
  done: 'Done',
}

type Filter = 'all' | TaskStatus

export default function App() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [newTitle, setNewTitle] = useState('')
  const [newStatus, setNewStatus] = useState<TaskStatus>('todo')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [draftTitle, setDraftTitle] = useState('')
  const [busyIds, setBusyIds] = useState<ReadonlySet<number>>(new Set())

  useEffect(() => {
    refresh()
  }, [])

  async function refresh() {
    setLoading(true)
    try {
      setTasks(await listTasks())
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load tasks')
    } finally {
      setLoading(false)
    }
  }

  function withBusy(id: number, fn: () => Promise<void>) {
    setBusyIds((prev) => new Set(prev).add(id))
    return fn().finally(() =>
      setBusyIds((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      }),
    )
  }

  async function run(fn: () => Promise<void>) {
    try {
      await fn()
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed')
    }
  }

  function handleAdd(e: FormEvent) {
    e.preventDefault()
    const title = newTitle.trim()
    if (!title) return
    void run(async () => {
      const task = await createTask(title, newStatus)
      setTasks((prev) => [...prev, task])
      setNewTitle('')
    })
  }

  function handleStatusChange(task: Task, status: TaskStatus) {
    if (status === task.status) return
    void withBusy(task.id, () =>
      run(async () => {
        const updated = await updateTask(task.id, { status })
        setTasks((prev) => prev.map((t) => (t.id === task.id ? updated : t)))
      }),
    )
  }

  function startEdit(task: Task) {
    setEditingId(task.id)
    setDraftTitle(task.title)
  }

  function handleSaveTitle(task: Task) {
    const title = draftTitle.trim()
    if (!title || title === task.title) {
      setEditingId(null)
      return
    }
    void withBusy(task.id, () =>
      run(async () => {
        const updated = await updateTask(task.id, { title })
        setTasks((prev) => prev.map((t) => (t.id === task.id ? updated : t)))
        setEditingId(null)
      }),
    )
  }

  function handleDelete(task: Task) {
    void withBusy(task.id, () =>
      run(async () => {
        await deleteTask(task.id)
        setTasks((prev) => prev.filter((t) => t.id !== task.id))
      }),
    )
  }

  const counts = useMemo(() => {
    const c: Record<TaskStatus, number> = { todo: 0, doing: 0, done: 0 }
    for (const t of tasks) c[t.status] += 1
    return c
  }, [tasks])

  const visible =
    filter === 'all' ? tasks : tasks.filter((t) => t.status === filter)

  return (
    <main className="container">
      <h1>Focus Board</h1>

      <form className="add-form" onSubmit={handleAdd}>
        <input
          type="text"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="New task title"
          maxLength={200}
          aria-label="New task title"
        />
        <select
          value={newStatus}
          onChange={(e) => setNewStatus(e.target.value as TaskStatus)}
          aria-label="Initial status"
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <button type="submit" disabled={!newTitle.trim()}>
          Add task
        </button>
      </form>

      <div className="filters" role="group" aria-label="Filter tasks by status">
        {(['all', ...STATUSES] as Filter[]).map((f) => (
          <button
            key={f}
            type="button"
            className={filter === f ? 'filter active' : 'filter'}
            onClick={() => setFilter(f)}
          >
            {f === 'all' ? `All (${tasks.length})` : `${STATUS_LABELS[f]} (${counts[f]})`}
          </button>
        ))}
        <button type="button" className="filter" onClick={() => void refresh()}>
          Refresh
        </button>
      </div>

      {error && (
        <div className="error" role="alert">
          {error}
          <button type="button" onClick={() => setError(null)} aria-label="Dismiss error">
            ×
          </button>
        </div>
      )}

      {loading ? (
        <p>Loading tasks…</p>
      ) : visible.length === 0 ? (
        <p className="empty">
          {tasks.length === 0
            ? 'No tasks yet. Add one above.'
            : `No tasks with status "${filter}".`}
        </p>
      ) : (
        <ul className="task-list">
          {visible.map((task) => {
            const busy = busyIds.has(task.id)
            const editing = editingId === task.id
            return (
              <li key={task.id} className={`task task-${task.status}`}>
                <span className={`badge badge-${task.status}`}>
                  {STATUS_LABELS[task.status]}
                </span>

                {editing ? (
                  <form
                    className="edit-form"
                    onSubmit={(e) => {
                      e.preventDefault()
                      handleSaveTitle(task)
                    }}
                  >
                    <input
                      type="text"
                      value={draftTitle}
                      onChange={(e) => setDraftTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') setEditingId(null)
                      }}
                      maxLength={200}
                      autoFocus
                    />
                    <button type="submit" disabled={busy || !draftTitle.trim()}>
                      Save
                    </button>
                    <button type="button" onClick={() => setEditingId(null)}>
                      Cancel
                    </button>
                  </form>
                ) : (
                  <span className="task-title">{task.title}</span>
                )}

                <span className="task-actions">
                  <select
                    value={task.status}
                    disabled={busy}
                    onChange={(e) =>
                      handleStatusChange(task, e.target.value as TaskStatus)
                    }
                    aria-label={`Status of ${task.title}`}
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {STATUS_LABELS[s]}
                      </option>
                    ))}
                  </select>
                  {!editing && (
                    <button type="button" disabled={busy} onClick={() => startEdit(task)}>
                      Edit
                    </button>
                  )}
                  <button
                    type="button"
                    className="danger"
                    disabled={busy}
                    onClick={() => handleDelete(task)}
                  >
                    Delete
                  </button>
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </main>
  )
}
