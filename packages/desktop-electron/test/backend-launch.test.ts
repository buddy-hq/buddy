import { expect, test } from "bun:test"
import { readFile } from "node:fs/promises"

test("backend launch does not use Electron utilityProcess", async () => {
  const source = await readFile(new URL("../src/main/server.ts", import.meta.url), "utf8")

  expect(source).not.toMatch(/\butilityProcess\b/u)
})
