export type TaskStatus = 'todo' | 'doing' | 'done'

export interface Task {
  id: number
  title: string
  status: TaskStatus
  created_at: string
}
