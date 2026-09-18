import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { createTask, deleteTask, getStats, listTasks, updateTask } from './api'
import type { Stats, Task, TaskPriority, TaskStatus } from './types'

const STATUSES: TaskStatus[] = ['todo', 'doing', 'done']
const PRIORITIES: TaskPriority[] = ['low', 'medium', 'high']

const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: 'To do',
  doing: 'Doing',
  done: 'Done',
}

const PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
}

type Filter = 'all' | TaskStatus

function isTaskOverdue(task: Task): boolean {
  if (!task.due_date || task.status === 'done') return false
  const today = new Date().toISOString().slice(0, 10)
  return task.due_date < today
}

function formatDueDate(value: string): string {
  const [y, m, d] = value.split('-')
  return `${m}/${d}/${y}`
}

export default function App() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [newTitle, setNewTitle] = useState('')
  const [newStatus, setNewStatus] = useState<TaskStatus>('todo')
  const [newPriority, setNewPriority] = useState<TaskPriority>('medium')
  const [newDueDate, setNewDueDate] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [draftTitle, setDraftTitle] = useState('')
  const [draftPriority, setDraftPriority] = useState<TaskPriority>('medium')
  const [draftDueDate, setDraftDueDate] = useState('')
  const [busyIds, setBusyIds] = useState<ReadonlySet<number>>(new Set())

  async function refresh() {
    setLoading(true)
    try {
      const [loadedTasks, loadedStats] = await Promise.all([
        listTasks(),
        getStats(),
      ])
      setTasks(loadedTasks)
      setStats(loadedStats)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load tasks')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  async function updateStats() {
    try {
      setStats(await getStats())
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load stats')
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
      const task = await createTask(
        title,
        newStatus,
        newPriority,
        newDueDate || null,
      )
      setTasks((prev) => [...prev, task])
      setNewTitle('')
      setNewStatus('todo')
      setNewPriority('medium')
      setNewDueDate('')
      await updateStats()
    })
  }

  function handleStatusChange(task: Task, status: TaskStatus) {
    if (status === task.status) return
    void withBusy(task.id, () =>
      run(async () => {
        const updated = await updateTask(task.id, { status })
        setTasks((prev) => prev.map((t) => (t.id === task.id ? updated : t)))
        await updateStats()
      }),
    )
  }

  function startEdit(task: Task) {
    setEditingId(task.id)
    setDraftTitle(task.title)
    setDraftPriority(task.priority ?? 'medium')
    setDraftDueDate(task.due_date ?? '')
  }

  function handleSaveEdit(task: Task) {
    const title = draftTitle.trim()
    if (!title) {
      setEditingId(null)
      return
    }
    const patch: {
      title?: string
      priority?: TaskPriority
      due_date?: string | null
    } = {}
    if (title !== task.title) patch.title = title
    const currentPriority = task.priority ?? 'medium'
    if (draftPriority !== currentPriority) patch.priority = draftPriority
    const currentDue = task.due_date ?? null
    const nextDue = draftDueDate || null
    if (nextDue !== currentDue) patch.due_date = nextDue
    if (Object.keys(patch).length === 0) {
      setEditingId(null)
      return
    }
    void withBusy(task.id, () =>
      run(async () => {
        const updated = await updateTask(task.id, patch)
        setTasks((prev) => prev.map((t) => (t.id === task.id ? updated : t)))
        setEditingId(null)
        await updateStats()
      }),
    )
  }

  function handleDelete(task: Task) {
    void withBusy(task.id, () =>
      run(async () => {
        await deleteTask(task.id)
        setTasks((prev) => prev.filter((t) => t.id !== task.id))
        await updateStats()
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
        <select
          value={newPriority}
          onChange={(e) => setNewPriority(e.target.value as TaskPriority)}
          aria-label="Priority"
        >
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {PRIORITY_LABELS[p]}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={newDueDate}
          onChange={(e) => setNewDueDate(e.target.value)}
          aria-label="Due date"
        />
        <button type="submit" disabled={!newTitle.trim()}>
          Add task
        </button>
      </form>

      {stats && (
        <section className="stats" aria-label="Task stats">
          <div className="stats-row">
            <span className="stat">Total: {stats.total}</span>
            {STATUSES.map((s) => (
              <span key={s} className={`stat stat-${s}`}>
                {STATUS_LABELS[s]}: {stats.by_status[s]}
              </span>
            ))}
          </div>
          <div className="stats-row">
            {PRIORITIES.map((p) => (
              <span key={p} className={`stat stat-priority-${p}`}>
                {PRIORITY_LABELS[p]}: {stats.by_priority[p]}
              </span>
            ))}
            <span
              className={`stat stat-overdue${
                stats.overdue > 0 ? ' overdue' : ''
              }`}
            >
              Overdue: {stats.overdue}
            </span>
          </div>
        </section>
      )}

      <div className="filters" role="group" aria-label="Filter tasks by status">
        {(['all', ...STATUSES] as Filter[]).map((f) => (
          <button
            key={f}
            type="button"
            className={filter === f ? 'filter active' : 'filter'}
            onClick={() => setFilter(f)}
          >
            {f === 'all'
              ? `All (${tasks.length})`
              : `${STATUS_LABELS[f]} (${counts[f]})`}
          </button>
        ))}
        <button type="button" className="filter" onClick={() => void refresh()}>
          Refresh
        </button>
      </div>

      {error && (
        <div className="error" role="alert">
          {error}
          <button
            type="button"
            onClick={() => setError(null)}
            aria-label="Dismiss error"
          >
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
            const overdue = isTaskOverdue(task)
            const priority = task.priority ?? 'medium'
            return (
              <li
                key={task.id}
                className={`task task-${task.status}${
                  overdue ? ' task-overdue' : ''
                }`}
              >
                <span className={`badge badge-${task.status}`}>
                  {STATUS_LABELS[task.status]}
                </span>
                <span className={`badge badge-priority-${priority}`}>
                  {PRIORITY_LABELS[priority]}
                </span>
                {overdue && (
                  <span className="badge badge-overdue" aria-label="Overdue">
                    Overdue
                  </span>
                )}

                {editing ? (
                  <form
                    className="edit-form"
                    onSubmit={(e) => {
                      e.preventDefault()
                      handleSaveEdit(task)
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
                    <select
                      value={draftPriority}
                      onChange={(e) =>
                        setDraftPriority(e.target.value as TaskPriority)
                      }
                      aria-label="Edit priority"
                    >
                      {PRIORITIES.map((p) => (
                        <option key={p} value={p}>
                          {PRIORITY_LABELS[p]}
                        </option>
                      ))}
                    </select>
                    <input
                      type="date"
                      value={draftDueDate}
                      onChange={(e) => setDraftDueDate(e.target.value)}
                      aria-label="Edit due date"
                    />
                    <button
                      type="submit"
                      disabled={busy || !draftTitle.trim()}
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                    >
                      Cancel
                    </button>
                  </form>
                ) : (
                  <span className="task-title">
                    {task.title}
                    {task.due_date && (
                      <span
                        className={`due-date${overdue ? ' overdue' : ''}`}
                      >
                        {' '}— due {formatDueDate(task.due_date)}
                      </span>
                    )}
                  </span>
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
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => startEdit(task)}
                    >
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
