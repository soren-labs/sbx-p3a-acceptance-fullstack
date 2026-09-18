export type TaskStatus = 'todo' | 'doing' | 'done'
export type TaskPriority = 'low' | 'medium' | 'high'

export interface Task {
  id: number
  title: string
  status: TaskStatus
  priority?: TaskPriority
  due_date?: string | null
  created_at: string
}

export interface Stats {
  total: number
  by_status: Record<TaskStatus, number>
  by_priority: Record<TaskPriority, number>
  overdue: number
}
