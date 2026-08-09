const MINUTES_TO_MS = 60_000
const DAYS_TO_MS = 86_400_000

type SchedulerTiming = {
  now: number
  currentDayStartAt: number
  nextDayAt: number
}

function rolloverOnLocalDate(timestamp: number, rolloverHour: number): Date {
  const rollover = new Date(timestamp)
  rollover.setHours(rolloverHour, 0, 0, 0)
  return rollover
}

function addLocalDays(timestamp: number, days: number, rolloverHour: number): number {
  const date = rolloverOnLocalDate(timestamp, rolloverHour)
  date.setDate(date.getDate() + days)
  return date.getTime()
}

function schedulerTiming(now: number, rolloverHour: number): SchedulerTiming {
  const rolloverToday = rolloverOnLocalDate(now, rolloverHour).getTime()
  if (now < rolloverToday) {
    return {
      now,
      currentDayStartAt: addLocalDays(rolloverToday, -1, rolloverHour),
      nextDayAt: rolloverToday,
    }
  }

  return {
    now,
    currentDayStartAt: rolloverToday,
    nextDayAt: addLocalDays(rolloverToday, 1, rolloverHour),
  }
}

function schedulingDayIndex(timestamp: number, rolloverHour: number): number {
  const dayStart = new Date(schedulerTiming(timestamp, rolloverHour).currentDayStartAt)
  return Math.floor(
    Date.UTC(dayStart.getFullYear(), dayStart.getMonth(), dayStart.getDate()) / DAYS_TO_MS,
  )
}

function schedulingDayKey(timestamp: number, rolloverHour: number): string {
  const dayStart = new Date(schedulerTiming(timestamp, rolloverHour).currentDayStartAt)
  const year = dayStart.getFullYear()
  const month = `${dayStart.getMonth() + 1}`.padStart(2, "0")
  const day = `${dayStart.getDate()}`.padStart(2, "0")
  return `${year}-${month}-${day}`
}

function scheduleDayInterval(
  timing: SchedulerTiming,
  days: number,
  rolloverHour: number,
): number {
  const boundedDays = Math.max(1, Math.round(days))
  return addLocalDays(timing.nextDayAt, boundedDays - 1, rolloverHour)
}

function schedulingDaysLate(due: number, now: number, rolloverHour: number): number {
  return Math.max(0, schedulingDayIndex(now, rolloverHour) - schedulingDayIndex(due, rolloverHour))
}

function learningIntervalCrossesRollover(timing: SchedulerTiming, delayMs: number): boolean {
  return delayMs >= timing.nextDayAt - timing.now
}

function learningIntervalDays(timing: SchedulerTiming, delayMs: number): number {
  const afterRolloverMs = Math.max(0, delayMs - (timing.nextDayAt - timing.now))
  return Math.floor(afterRolloverMs / DAYS_TO_MS) + 1
}

export {
  DAYS_TO_MS,
  MINUTES_TO_MS,
  learningIntervalCrossesRollover,
  learningIntervalDays,
  scheduleDayInterval,
  schedulerTiming,
  schedulingDayKey,
  schedulingDaysLate,
}
export type { SchedulerTiming }
