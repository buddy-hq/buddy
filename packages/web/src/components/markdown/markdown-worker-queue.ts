export function createLatestWorkerQueue<TRequest extends { key: string }>(input: {
  run: (request: TRequest) => Promise<void>
  supersede: (request: TRequest) => void
  dispose: (key: string) => void
}) {
  type HighlightSlot = { type: "highlight"; key: string; request?: TRequest }
  type DisposeSlot = { type: "dispose"; key: string }
  const jobs: Array<HighlightSlot | DisposeSlot> = []
  const slots = new Map<string, HighlightSlot>()
  let running: Promise<void> | undefined
  let cursor = 0

  const schedule = () => {
    if (running) return
    running = Promise.resolve()
      .then(async () => {
        while (cursor < jobs.length) {
          const job = jobs[cursor]
          cursor += 1
          if (!job) continue
          if (job.type === "dispose") {
            input.dispose(job.key)
            continue
          }
          if (slots.get(job.key) === job) slots.delete(job.key)
          const request = job.request
          job.request = undefined
          if (request) await input.run(request)
        }
      })
      .finally(() => {
        jobs.splice(0, cursor)
        cursor = 0
        running = undefined
        if (jobs.length > 0) schedule()
      })
  }

  return {
    highlight(request: TRequest) {
      const slot = slots.get(request.key)
      if (slot) {
        if (slot.request) input.supersede(slot.request)
        slot.request = request
        return
      }
      const next: HighlightSlot = { type: "highlight", key: request.key, request }
      slots.set(request.key, next)
      jobs.push(next)
      schedule()
    },
    dispose(key: string) {
      const slot = slots.get(key)
      if (slot?.request) input.supersede(slot.request)
      if (slot) {
        slot.request = undefined
        slots.delete(key)
      }
      jobs.push({ type: "dispose", key })
      schedule()
    },
    pending: () => slots.size,
    async idle() {
      for (;;) {
        const current = running
        if (!current) return
        await current
      }
    },
  }
}
