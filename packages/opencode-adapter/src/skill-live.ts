import { Effect } from "effect"
import * as OpenCodeSkill from "opencode/skill/index"
import { makeRuntime } from "opencode/effect/run-service"
import { withCurrentInstance } from "./effect-runtime"

const runtime = makeRuntime(OpenCodeSkill.Service, OpenCodeSkill.defaultLayer)
const patchedServices = new WeakSet<OpenCodeSkill.Interface>()
let patchPromise: Promise<void> | undefined
let visibilityFilter:
  | ((skill: { name: string; location: string }) => boolean)
  | undefined

function filterVisibleSkills<T extends { name: string; location: string }>(skills: T[]): T[] {
  return visibilityFilter ? skills.filter((skill) => visibilityFilter?.(skill) !== false) : skills
}

function ensurePatched(service: OpenCodeSkill.Interface) {
  if (patchedServices.has(service)) {
    return
  }
  patchedServices.add(service)

  const originalGet = service.get.bind(service)
  const originalAll = service.all.bind(service)
  const originalAvailable = service.available.bind(service)

  const get: OpenCodeSkill.Interface["get"] = Effect.fn("BuddySkill.get")(function* (name) {
    const skill = yield* originalGet(name)
    if (!skill || (visibilityFilter && visibilityFilter(skill) === false)) {
      return undefined
    }
    return skill
  })

  const all: OpenCodeSkill.Interface["all"] = Effect.fn("BuddySkill.all")(function* () {
    return filterVisibleSkills(yield* originalAll())
  })

  const available: OpenCodeSkill.Interface["available"] = Effect.fn("BuddySkill.available")(
    function* (agent) {
      return filterVisibleSkills(yield* originalAvailable(agent))
    },
  )

  Object.defineProperties(service, {
    get: { value: get },
    all: { value: all },
    available: { value: available },
  })
}

export function setSkillVisibilityFilter(
  filter: ((skill: { name: string; location: string }) => boolean) | undefined,
) {
  visibilityFilter = filter
}

export async function ensureSkillServicePatched() {
  patchPromise ??= runtime
    .runPromise((svc) => withCurrentInstance(Effect.sync(() => ensurePatched(svc))))
    .catch((error) => {
      patchPromise = undefined
      throw error
    })

  await patchPromise
}
