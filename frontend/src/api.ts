import type { Task, TaskStatus } from './types'

export const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'
).replace(/\/+$/, '')

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...init,
    })
  } catch {
    throw new Error(
      `Could not reach the API at ${API_BASE_URL}. Is the backend running?`,
    )
  }

  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`
    try {
      const body = await res.json()
      if (typeof body?.detail === 'string') {
        detail = body.detail
      } else if (Array.isArray(body?.detail)) {
        detail = body.detail
          .map((d: { msg?: string }) => d.msg ?? JSON.stringify(d))
          .join('; ')
      }
    } catch {
      // keep the status text
    }
    throw new Error(detail)
  }

  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export function listTasks(): Promise<Task[]> {
  return request<Task[]>('/tasks')
}

export function createTask(title: string, status: TaskStatus = 'todo'): Promise<Task> {
  return request<Task>('/tasks', {
    method: 'POST',
    body: JSON.stringify({ title, status }),
  })
}

export function updateTask(
  id: number,
  patch: { title?: string; status?: TaskStatus },
): Promise<Task> {
  return request<Task>(`/tasks/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
}

export function deleteTask(id: number): Promise<void> {
  return request<void>(`/tasks/${id}`, { method: 'DELETE' })
}
