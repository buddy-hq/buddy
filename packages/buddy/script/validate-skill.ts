#!/usr/bin/env bun

import fsp from "node:fs/promises"
import path from "node:path"
import { validateBuddySkillFile } from "./skill-validator"

async function skillDocumentPath(inputPath: string): Promise<string> {
  const resolved = path.resolve(inputPath)
  const stat = await fsp.stat(resolved).catch(() => undefined)
  if (stat?.isDirectory()) return path.join(resolved, "SKILL.md")
  if (stat?.isFile() && path.basename(resolved) === "SKILL.md") return resolved
  throw new Error(`Expected a skill directory or SKILL.md file: ${resolved}`)
}

async function main(args: string[]): Promise<void> {
  if (args.length === 1 && (args[0] === "--help" || args[0] === "-h")) {
    console.log("Usage: bun run skill:validate [skill-directory-or-SKILL.md ...]")
    console.log("With no paths, validate registered bundled Buddy skills.")
    return
  }

  if (args.length === 0) {
    const { checkBundledSkills } = await import("./check-bundled-skills")
    const registrations = await checkBundledSkills()
    console.log(`Validated ${registrations.length} registered Buddy skills.`)
    return
  }

  let invalid = false
  for (const inputPath of args) {
    let documentPath: string
    try {
      documentPath = await skillDocumentPath(inputPath)
    } catch (error) {
      invalid = true
      console.error(error instanceof Error ? error.message : String(error))
      continue
    }
    const result = await validateBuddySkillFile(documentPath)
    if (result.issues.length === 0) {
      console.log(`Valid Buddy skill: ${documentPath}`)
      continue
    }

    invalid = true
    console.error(`Invalid Buddy skill: ${documentPath}`)
    for (const issue of result.issues) console.error(`  - ${issue}`)
  }
  if (invalid) process.exitCode = 1
}

if (import.meta.main) {
  await main(process.argv.slice(2))
}
