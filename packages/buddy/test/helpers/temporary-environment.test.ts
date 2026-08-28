import { describe, expect, test } from "bun:test"
import { temporaryEnvironment } from "./temporary-environment"

const EXISTING_VARIABLE = "BUDDY_TEST_TEMPORARY_ENVIRONMENT_EXISTING"
const NEW_VARIABLE = "BUDDY_TEST_TEMPORARY_ENVIRONMENT_NEW"

describe("temporaryEnvironment", () => {
  test("restores existing and absent variables when its scope exits", () => {
    const originalExistingValue = process.env[EXISTING_VARIABLE]
    const originalNewValue = process.env[NEW_VARIABLE]
    process.env[EXISTING_VARIABLE] = "original"
    delete process.env[NEW_VARIABLE]

    try {
      {
        using environment = temporaryEnvironment({
          [EXISTING_VARIABLE]: "temporary",
          [NEW_VARIABLE]: "created",
        })

        expect(environment).toBeDefined()
        expect(process.env[EXISTING_VARIABLE]).toBe("temporary")
        expect(process.env[NEW_VARIABLE]).toBe("created")
      }

      expect(process.env[EXISTING_VARIABLE]).toBe("original")
      expect(process.env[NEW_VARIABLE]).toBeUndefined()
    } finally {
      if (originalExistingValue === undefined) delete process.env[EXISTING_VARIABLE]
      else process.env[EXISTING_VARIABLE] = originalExistingValue

      if (originalNewValue === undefined) delete process.env[NEW_VARIABLE]
      else process.env[NEW_VARIABLE] = originalNewValue
    }
  })

  test("can temporarily remove an existing variable", () => {
    const originalValue = process.env[EXISTING_VARIABLE]
    process.env[EXISTING_VARIABLE] = "original"

    try {
      {
        using environment = temporaryEnvironment({ [EXISTING_VARIABLE]: undefined })
        expect(environment).toBeDefined()
        expect(process.env[EXISTING_VARIABLE]).toBeUndefined()
      }

      expect(process.env[EXISTING_VARIABLE]).toBe("original")
    } finally {
      if (originalValue === undefined) delete process.env[EXISTING_VARIABLE]
      else process.env[EXISTING_VARIABLE] = originalValue
    }
  })
})
