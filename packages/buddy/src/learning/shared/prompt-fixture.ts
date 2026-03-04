import fs from "node:fs/promises"

export async function readNormalizedPromptFixture(filepath: string) {
  const raw = await fs.readFile(filepath, "utf8")
  return raw.replace(/\r\n/g, "\n").trimEnd()
}
