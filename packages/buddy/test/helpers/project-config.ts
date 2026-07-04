import fs from "node:fs"
import path from "node:path"

const BUDDY_HOME_DIRECTORY_NAME = ".buddy"

export function projectConfigDir(directory: string): string {
  return path.join(directory, BUDDY_HOME_DIRECTORY_NAME)
}

export function projectConfigFile(directory: string, filename = "buddy.jsonc"): string {
  return path.join(projectConfigDir(directory), filename)
}

export function writeProjectConfig(directory: string, content: string): void {
  const filepath = projectConfigFile(directory)
  fs.mkdirSync(path.dirname(filepath), { recursive: true })
  fs.writeFileSync(filepath, content)
}
