/**
 * Production-safe stage timings for generate + publish.
 * Logs only stage names and milliseconds — no tokens, URLs, or PII.
 */

export type StageTimings = {
  flow: string
  totalMs: number
  stages: Record<string, number>
}

export function createStageTimer(flow: string) {
  const startedAt = Date.now()
  const stages: Record<string, number> = {}

  async function stage<T>(name: string, work: () => Promise<T>): Promise<T> {
    const t0 = Date.now()
    try {
      return await work()
    } finally {
      const ms = Date.now() - t0
      stages[name] = (stages[name] || 0) + ms
      console.info("[timing]", { flow, stage: name, ms })
    }
  }

  function mark(name: string, ms: number) {
    stages[name] = (stages[name] || 0) + Math.max(0, Math.round(ms))
    console.info("[timing]", { flow, stage: name, ms: stages[name] })
  }

  function done(): StageTimings {
    const totalMs = Date.now() - startedAt
    console.info("[timing]", { flow, stage: "total", ms: totalMs, stages })
    return { flow, totalMs, stages }
  }

  return { stage, mark, done, stages }
}
