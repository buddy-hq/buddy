#!/usr/bin/env bun

import { $ } from "bun"
import os from "node:os"
import path from "node:path"
import { mkdtempSync, rmSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { createInterface } from "node:readline/promises"
import { stdin as input, stdout as output } from "node:process"
import { buildNotes, getLatestRelease } from "./changelog.ts"

const ROOT_DIR = path.resolve(import.meta.dir, "..")
const RELEASE_BRANCH = "main"

type SyncState = "in-sync" | "ahead" | "behind" | "diverged"

type ReleaseSummary = {
  body: string
  isDraft: boolean
  name: string
  tagName: string
  url: string
}

type WorkflowRun = {
  createdAt: string
  displayTitle: string
  event: string
  headBranch: string
  headSha: string
  url: string
}

function releaseRepo() {
  return process.env.BUDDY_REPO || process.env.GITHUB_REPOSITORY || "prashantbhudwal/buddy"
}

function normalizeVersion(input: string) {
  const trimmed = input.trim().replace(/^v/, "")
  if (!/^\d+\.\d+\.\d+$/.test(trimmed)) {
    throw new Error(`Invalid version: ${input}`)
  }
  return trimmed
}

function bumpVersion(version: string, bump: "major" | "minor" | "patch") {
  const [major, minor, patchVersion] = normalizeVersion(version)
    .split(".")
    .map((value) => Number.parseInt(value, 10))

  switch (bump) {
    case "major":
      return `${major + 1}.0.0`
    case "minor":
      return `${major}.${minor + 1}.0`
    case "patch":
      return `${major}.${minor}.${patchVersion + 1}`
  }
}

function printStep(title: string, detail?: string) {
  console.log(`\n== ${title} ==`)
  if (detail) {
    console.log(detail)
  }
}

function shellQuote(value: string) {
  return `'${value.replaceAll("'", `'\\''`)}'`
}

function commandFailed(command: string, code: number | null) {
  const renderedCode = code === null ? "unknown" : String(code)
  throw new Error(`Command failed (${renderedCode}): ${command}`)
}

function runCommand(command: string, args: string[], options?: { stdio?: "inherit" | "pipe" }) {
  const result = spawnSync(command, args, {
    cwd: ROOT_DIR,
    stdio: options?.stdio ?? "inherit",
    encoding: "utf8",
  })

  if (result.status !== 0) {
    commandFailed([command, ...args].join(" "), result.status)
  }

  return result
}

async function promptLine(
  rl: ReturnType<typeof createInterface>,
  label: string,
  defaultValue?: string,
) {
  const suffix = defaultValue ? ` [${defaultValue}]` : ""
  const answer = (await rl.question(`${label}${suffix}: `)).trim()
  if (!answer && defaultValue !== undefined) {
    return defaultValue
  }
  return answer
}

async function confirm(rl: ReturnType<typeof createInterface>, label: string, defaultValue = true) {
  const suffix = defaultValue ? " [Y/n]" : " [y/N]"
  const answer = (await rl.question(`${label}${suffix}: `)).trim().toLowerCase()

  if (!answer) {
    return defaultValue
  }

  if (["y", "yes"].includes(answer)) return true
  if (["n", "no"].includes(answer)) return false
  throw new Error(`Unrecognized answer: ${answer}`)
}

async function commandExists(name: string) {
  const result = await $`command -v ${name}`.cwd(ROOT_DIR).quiet().nothrow()
  return result.exitCode === 0
}

async function resolveEditor() {
  const configured = process.env.VISUAL?.trim() || process.env.EDITOR?.trim()
  if (configured) {
    return configured
  }

  for (const candidate of ["nano", "vim", "vi"]) {
    if (await commandExists(candidate)) {
      return candidate
    }
  }

  throw new Error("No editor found. Set $VISUAL or $EDITOR before running the release wizard.")
}

async function ensureMainBranch() {
  const branch = await $`git branch --show-current`
    .cwd(ROOT_DIR)
    .text()
    .then((output) => output.trim())

  if (branch !== RELEASE_BRANCH) {
    throw new Error(`Stable releases must be cut from ${RELEASE_BRANCH}, received '${branch}'`)
  }
}

async function ensureCleanTree() {
  const dirty = await $`git status --short`.cwd(ROOT_DIR).text()
  if (dirty.trim()) {
    throw new Error("Working tree must be clean before cutting a release")
  }
}

function ensureInteractiveTerminal() {
  if (!input.isTTY || !output.isTTY) {
    throw new Error("The release wizard requires an interactive terminal")
  }
}

function ensureGithubAuth() {
  printStep("GitHub Auth", "Checking gh auth status.")
  runCommand("gh", ["auth", "status"])
}

async function ensureReleaseSecrets() {
  printStep("Secrets", "Checking optional Electron signing/notarization secrets.")
  const output = await $`gh secret list --repo ${releaseRepo()}`.cwd(ROOT_DIR).text()
  const names = new Set(
    output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => line.split(/\s+/)[0] ?? "")
      .filter(Boolean),
  )

  const optionalSecrets = [
    "APPLE_ID",
    "APPLE_APP_SPECIFIC_PASSWORD",
    "APPLE_TEAM_ID",
    "CSC_LINK",
    "CSC_KEY_PASSWORD",
    "WINDOWS_CERTIFICATE",
    "WINDOWS_CERTIFICATE_PASSWORD",
  ]

  const missing = optionalSecrets.filter((name) => !names.has(name))
  if (missing.length > 0) {
    console.warn(
      `Optional Electron signing secrets not configured: ${missing.join(", ")}. Continuing with unsigned release artifacts.`,
    )
  }
}

async function fetchOriginMain() {
  await $`git fetch origin ${RELEASE_BRANCH} --quiet`.cwd(ROOT_DIR)
}

async function currentHeadSha(ref: string) {
  return $`git rev-parse ${ref}`
    .cwd(ROOT_DIR)
    .text()
    .then((output) => output.trim())
}

async function syncState() {
  const counts = await $`git rev-list --left-right --count HEAD...origin/${RELEASE_BRANCH}`
    .cwd(ROOT_DIR)
    .text()
    .then((output) => output.trim())

  const [aheadText, behindText] = counts.split(/\s+/)
  const ahead = Number.parseInt(aheadText ?? "0", 10)
  const behind = Number.parseInt(behindText ?? "0", 10)

  let state: SyncState
  if (ahead === 0 && behind === 0) {
    state = "in-sync"
  } else if (ahead > 0 && behind === 0) {
    state = "ahead"
  } else if (ahead === 0 && behind > 0) {
    state = "behind"
  } else {
    state = "diverged"
  }

  return {
    ahead,
    behind,
    state,
  }
}

async function alignWithOriginMain(rl: ReturnType<typeof createInterface>) {
  printStep("Git Sync", "Checking whether local main matches origin/main.")
  await fetchOriginMain()

  while (true) {
    const state = await syncState()

    if (state.state === "in-sync") {
      const head = await currentHeadSha("HEAD")
      console.log(`Local main matches origin/main at ${head.slice(0, 12)}.`)
      return head
    }

    if (state.state === "behind") {
      console.log(`Local main is behind origin/main by ${state.behind} commit(s).`)
      if (!(await confirm(rl, "Fast-forward local main now?", true))) {
        throw new Error("Release aborted before syncing local main")
      }
      runCommand("git", ["pull", "--ff-only", "origin", RELEASE_BRANCH])
      continue
    }

    if (state.state === "ahead") {
      console.log(`Local main is ahead of origin/main by ${state.ahead} commit(s).`)
      if (!(await confirm(rl, "Push local main to origin now?", true))) {
        throw new Error("Release aborted before pushing local main")
      }
      runCommand("git", ["push", "origin", RELEASE_BRANCH])
      await fetchOriginMain()
      continue
    }

    throw new Error(
      "Local main diverged from origin/main. Rebase or merge it manually, then rerun the release wizard.",
    )
  }
}

async function chooseVersion(rl: ReturnType<typeof createInterface>, fast = false) {
  const latest = await getLatestRelease()
  const patchSuggestion = latest ? bumpVersion(latest, "patch") : "0.0.1"
  const minorSuggestion = latest ? bumpVersion(latest, "minor") : "0.1.0"
  const majorSuggestion = latest ? bumpVersion(latest, "major") : "1.0.0"

  if (fast) {
    printStep(
      "Version",
      latest
        ? `Latest stable release: v${latest}\nUsing suggested patch version: v${patchSuggestion}`
        : `No prior stable release found.\nUsing first stable release: v${patchSuggestion}`,
    )
    return patchSuggestion
  }

  printStep(
    "Version",
    latest
      ? `Latest stable release: v${latest}\nSuggested next release: v${patchSuggestion}`
      : `No prior stable release found.\nSuggested first stable release: v${patchSuggestion}`,
  )

  console.log("1. Use the suggested patch version")
  console.log(`   v${patchSuggestion}`)
  console.log("2. Use the next minor version")
  console.log(`   v${minorSuggestion}`)
  console.log("3. Use the next major version")
  console.log(`   v${majorSuggestion}`)
  console.log("4. Enter a custom version")

  const choice = await promptLine(rl, "Select a version option", "1")

  switch (choice) {
    case "1":
      return patchSuggestion
    case "2":
      return minorSuggestion
    case "3":
      return majorSuggestion
    case "4": {
      const custom = await promptLine(rl, "Enter the exact release version")
      return normalizeVersion(custom)
    }
    default:
      throw new Error(`Unknown version option: ${choice}`)
  }
}

async function loadRelease(tag: string) {
  const existing = await $`gh release view ${tag} --repo ${releaseRepo()}`
    .cwd(ROOT_DIR)
    .quiet()
    .nothrow()

  if (existing.exitCode !== 0) {
    return undefined
  }

  return (await $`gh release view ${tag} --repo ${releaseRepo()} --json name,body,isDraft,url,tagName`
    .cwd(ROOT_DIR)
    .json()) as ReleaseSummary
}

async function ensureVersionIsAvailable(version: string) {
  const tag = `v${version}`
  const existing = await loadRelease(tag)
  if (existing && !existing.isDraft) {
    throw new Error(`Release ${tag} already exists: ${existing.url}`)
  }
  return existing
}

async function initialReleaseBody(version: string, existingDraft: ReleaseSummary | undefined) {
  if (existingDraft?.isDraft) {
    const body = existingDraft.body.trim()
    if (body) {
      return body
    }
  }

  const previous = await getLatestRelease(version)
  const notes = await buildNotes(previous, "HEAD")
  return notes.join("\n")
}

async function editReleaseDraft(
  rl: ReturnType<typeof createInterface>,
  version: string,
  existingDraft: ReleaseSummary | undefined,
  fast = false,
) {
  const tag = `v${version}`
  const title = fast ? tag : await promptLine(rl, "Release title", existingDraft?.name || tag)
  const initialBody = await initialReleaseBody(version, existingDraft)

  if (fast) {
    return {
      body: initialBody,
      notesPath: undefined,
      tempDir: undefined,
      title,
    }
  }

  const tempDir = mkdtempSync(path.join(os.tmpdir(), "buddy-release-notes-"))
  const notesPath = path.join(tempDir, `${tag}.md`)
  await Bun.write(notesPath, initialBody ? `${initialBody}\n` : "")

  const editor = await resolveEditor()

  while (true) {
    printStep("Release Notes", `Opening ${notesPath} in ${editor}.`)
    const shell = process.env.SHELL?.trim() || "/bin/zsh"
    const result = spawnSync(shell, ["-lc", `${editor} ${shellQuote(notesPath)}`], {
      cwd: ROOT_DIR,
      stdio: "inherit",
      encoding: "utf8",
    })

    if (result.status !== 0) {
      commandFailed(`${editor} ${notesPath}`, result.status)
    }

    const body = await Bun.file(notesPath).text()
    const preview = body.trim() || "(empty release notes)"
    console.log("\n--- Notes Preview ---")
    console.log(preview)
    console.log("--- End Notes Preview ---")

    const nextAction = await promptLine(rl, "Use these notes? [y]es / [e]dit again / [q]uit", "y")
    const normalized = nextAction.trim().toLowerCase()
    if (normalized === "y" || normalized === "yes") {
      return {
        body,
        notesPath,
        tempDir,
        title,
      }
    }
    if (normalized === "e" || normalized === "edit") {
      continue
    }
    throw new Error("Release aborted during notes editing")
  }
}

async function upsertDraftRelease(
  version: string,
  title: string,
  notesPath: string | undefined,
  body: string,
  targetSha: string,
  existingDraft: ReleaseSummary | undefined,
) {
  const tag = `v${version}`
  printStep("Draft Release", `Creating or updating draft release ${tag}.`)

  if (existingDraft?.isDraft) {
    if (notesPath) {
      await $`gh release edit ${tag} --title ${title} --notes-file ${notesPath} --repo ${releaseRepo()}`.cwd(
        ROOT_DIR,
      )
    } else {
      await $`gh release edit ${tag} --title ${title} --notes ${body} --repo ${releaseRepo()}`.cwd(
        ROOT_DIR,
      )
    }
  } else {
    if (notesPath) {
      await $`gh release create ${tag} -d --title ${title} --notes-file ${notesPath} --target ${targetSha} --repo ${releaseRepo()}`.cwd(
        ROOT_DIR,
      )
    } else {
      await $`gh release create ${tag} -d --title ${title} --notes ${body} --target ${targetSha} --repo ${releaseRepo()}`.cwd(
        ROOT_DIR,
      )
    }
  }

  const release = await loadRelease(tag)
  if (!release) {
    throw new Error(`Failed to resolve draft release ${tag} after updating it`)
  }
  return release
}

function runRequiredGates() {
  printStep("Validation", "Running required repo gates before dispatching the release.")
  runCommand("bun", ["fmt"])
  runCommand("bun", ["lint"])
  runCommand("bun", ["typecheck"])
}

async function waitForRunUrl(version: string, targetSha: string) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const runs =
      (await $`gh run list --repo ${releaseRepo()} --workflow publish.yml --limit 10 --json displayTitle,headBranch,headSha,event,url,createdAt`
        .cwd(ROOT_DIR)
        .json()) as WorkflowRun[]

    const exact = runs.find(
      (run) =>
        run.event === "workflow_dispatch" &&
        run.headBranch === RELEASE_BRANCH &&
        run.headSha === targetSha &&
        run.displayTitle === `release ${version}`,
    )
    if (exact) {
      return exact.url
    }

    const fallback = runs.find(
      (run) =>
        run.event === "workflow_dispatch" &&
        run.headBranch === RELEASE_BRANCH &&
        run.headSha === targetSha,
    )
    if (fallback) {
      return fallback.url
    }

    await Bun.sleep(2_000)
  }

  return undefined
}

async function dispatchRelease(version: string, targetSha: string) {
  printStep("Dispatch", `Triggering GitHub release workflow for v${version}.`)

  const dispatchOutput =
    await $`gh workflow run publish.yml --repo ${releaseRepo()} -f ${`version=${version}`}`
      .cwd(ROOT_DIR)
      .text()
      .then((output) => output.trim())

  if (dispatchOutput) {
    return dispatchOutput
  }

  const fallbackUrl = await waitForRunUrl(version, targetSha)
  if (!fallbackUrl) {
    throw new Error(
      "Release workflow was dispatched, but the GitHub Actions run URL could not be resolved",
    )
  }

  return fallbackUrl
}

function runIdFromUrl(url: string) {
  const match = url.match(/\/runs\/(\d+)/)
  return match?.[1]
}

function watchRun(runId: string) {
  printStep("Watch", `Watching GitHub Actions run ${runId}.`)
  runCommand("gh", ["run", "watch", runId, "--repo", releaseRepo(), "--exit-status"])
}

function syncTagsFromOrigin() {
  printStep("Tag Sync", "Force-syncing local tags from origin to avoid local tag drift conflicts.")
  runCommand("git", ["fetch", "origin", "+refs/tags/*:refs/tags/*"])
}

async function maybePullReleaseSync(rl: ReturnType<typeof createInterface>, fast = false) {
  await fetchOriginMain()
  const state = await syncState()
  if (state.state !== "behind") {
    return
  }

  console.log(`origin/main gained ${state.behind} new commit(s) during release publishing.`)
  if (!fast && !(await confirm(rl, "Pull the release-sync commit into local main now?", true))) {
    return
  }

  syncTagsFromOrigin()
  runCommand("git", ["pull", "--rebase", "origin", RELEASE_BRANCH])
}

function parseArgs() {
  const args = process.argv.slice(2)
  return {
    fast: args.includes("--fast"),
  }
}

async function main() {
  const flags = parseArgs()
  ensureInteractiveTerminal()
  await ensureMainBranch()
  await ensureCleanTree()
  ensureGithubAuth()
  await ensureReleaseSecrets()

  const rl = createInterface({ input, output })

  try {
    const targetSha = await alignWithOriginMain(rl)
    await ensureCleanTree()

    const version = await chooseVersion(rl, flags.fast)
    const tag = `v${version}`
    const existingDraft = await ensureVersionIsAvailable(version)
    const editedDraft = await editReleaseDraft(rl, version, existingDraft, flags.fast)
    try {
      const release = await upsertDraftRelease(
        version,
        editedDraft.title,
        editedDraft.notesPath,
        editedDraft.body,
        targetSha,
        existingDraft,
      )

      console.log(`Draft release ready: ${release.url}`)
      if (flags.fast || (await confirm(rl, `Dispatch the publish workflow for ${tag} now?`, true))) {
        runRequiredGates()
        await ensureCleanTree()

        const runUrl = await dispatchRelease(version, targetSha)
        console.log(`Workflow dispatched: ${runUrl}`)

        const runId = runIdFromUrl(runUrl)
        if (runId && (flags.fast || (await confirm(rl, "Watch the release workflow until it finishes?", true)))) {
          watchRun(runId)
        }

        const published = await loadRelease(tag)
        if (published && !published.isDraft) {
          console.log(`Release published: ${published.url}`)
        } else {
          console.log(`Release draft: ${release.url}`)
        }

        await maybePullReleaseSync(rl, flags.fast)

        console.log("\nNext steps:")
        console.log(`- Install or update from GitHub Release ${tag}`)
        console.log(`- Smoke test the app and updater banner`)
        console.log(`- If needed, use bun run install:release ${tag}`)
      } else {
        console.log("Release draft updated, but workflow dispatch was skipped.")
      }
    } finally {
      if (editedDraft.tempDir) {
        rmSync(editedDraft.tempDir, { recursive: true, force: true })
      }
    }
  } finally {
    rl.close()
  }
}

await main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`\nRelease wizard failed: ${message}`)
  process.exit(1)
})
