type MermaidScheduledTask = {
  insertedAt: number
  key: string
  priority: number
  reject: (error: unknown) => void
  run: () => Promise<void>
}

const MERMAID_RENDER_CONCURRENCY = 1

const queuedTasks: MermaidScheduledTask[] = []
const pendingTasks = new Map<string, Promise<unknown>>()
const queuedTaskByKey = new Map<string, MermaidScheduledTask>()

let activeTaskCount = 0
let taskCounter = 0

function sortQueuedTasks(): void {
  queuedTasks.sort((left, right) => {
    if (left.priority !== right.priority) {
      return left.priority - right.priority
    }
    return left.insertedAt - right.insertedAt
  })
}

function pumpQueue(): void {
  while (activeTaskCount < MERMAID_RENDER_CONCURRENCY && queuedTasks.length > 0) {
    const task = queuedTasks.shift()
    if (!task) {
      return
    }
    activeTaskCount += 1
    void task
      .run()
      .catch((error) => {
        task.reject(error)
      })
      .finally(() => {
        activeTaskCount = Math.max(activeTaskCount - 1, 0)
        pendingTasks.delete(task.key)
        queuedTaskByKey.delete(task.key)
        pumpQueue()
      })
  }
}

export function scheduleMermaidRender<T>(input: {
  key: string
  priority: number
  run: () => Promise<T>
}): Promise<T> {
  const existing = pendingTasks.get(input.key)
  if (existing) {
    const queued = queuedTaskByKey.get(input.key)
    if (queued && input.priority < queued.priority) {
      queued.priority = input.priority
      sortQueuedTasks()
    }
    // SAFETY: A task key is stable for its lifetime and callers reuse the same result contract.
    return existing as Promise<T>
  }

  const promise = new Promise<T>((resolve, reject) => {
    taskCounter += 1
    queuedTasks.push({
      insertedAt: taskCounter,
      key: input.key,
      priority: input.priority,
      reject,
      run: async () => resolve(await input.run()),
    })
    const queuedTask = queuedTasks[queuedTasks.length - 1]
    if (queuedTask) queuedTaskByKey.set(input.key, queuedTask)
    sortQueuedTasks()
    pumpQueue()
  })

  pendingTasks.set(input.key, promise)
  return promise
}
