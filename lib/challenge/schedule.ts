export type ChallengeDayType = "list" | "relist" | "rest"

export interface ChallengeDayDefinition {
  day: number
  type: ChallengeDayType
  goal: number
  title: string
  description: string
}

/** Fixed 10-Day Listing Challenge schedule. */
export const CHALLENGE_SCHEDULE: ChallengeDayDefinition[] = [
  {
    day: 1,
    type: "list",
    goal: 3,
    title: "List 3",
    description: "Publish 3 new listings today.",
  },
  {
    day: 2,
    type: "list",
    goal: 4,
    title: "List 4",
    description: "Publish 4 new listings today.",
  },
  {
    day: 3,
    type: "list",
    goal: 5,
    title: "List 5",
    description: "Publish 5 new listings today.",
  },
  {
    day: 4,
    type: "list",
    goal: 6,
    title: "List 6",
    description: "Publish 6 new listings today.",
  },
  {
    day: 5,
    type: "list",
    goal: 8,
    title: "List 8",
    description: "Publish 8 new listings today.",
  },
  {
    day: 6,
    type: "relist",
    goal: 6,
    title: "End & relist 6",
    description: "End and relist 6 existing items today.",
  },
  {
    day: 7,
    type: "list",
    goal: 3,
    title: "List 3",
    description: "Publish 3 new listings today.",
  },
  {
    day: 8,
    type: "list",
    goal: 5,
    title: "List 5",
    description: "Publish 5 new listings today.",
  },
  {
    day: 9,
    type: "relist",
    goal: 10,
    title: "End & relist 10",
    description: "End and relist 10 existing items today.",
  },
  {
    day: 10,
    type: "rest",
    goal: 0,
    title: "Rest day",
    description: "Take a rest day — this day completes automatically.",
  },
]

export const CHALLENGE_DAY_MS = 24 * 60 * 60 * 1000
export const CHALLENGE_TOTAL_DAYS = CHALLENGE_SCHEDULE.length

export function getChallengeDayDefinition(day: number): ChallengeDayDefinition {
  const def = CHALLENGE_SCHEDULE.find((row) => row.day === day)
  if (!def) {
    throw new Error(`Invalid challenge day: ${day}`)
  }
  return def
}
