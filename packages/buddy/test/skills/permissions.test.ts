import { expect, test } from "bun:test"
import { Config } from "../../src/config/config"
import {
  clearSkillPermission,
  setSkillPermission,
} from "../../src/learning/skill-management/service/permissions"

test("clears a persisted skill rule while preserving other permissions and settings", async () => {
  const previous = await Config.getGlobal()
  const initial: Config.Info = {
    permission: {
      edit: "ask",
      bash: { "*": "deny", "git status": "allow" },
      skill: { "retained-skill": "allow" },
    },
    personalization: { preferred_name: "Ada" },
  }

  try {
    const configured = await Config.replaceGlobal(initial)
    await setSkillPermission("retired-skill", "deny")

    expect((await Config.getGlobal()).permission?.skill).toEqual({
      "retained-skill": "allow",
      "retired-skill": "deny",
    })

    await clearSkillPermission("retired-skill")

    expect(await Config.getGlobal()).toEqual(configured)
  } finally {
    await Config.replaceGlobal(previous)
  }
})
