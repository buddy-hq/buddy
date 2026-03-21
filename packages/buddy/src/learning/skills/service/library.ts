import { spawn } from 'node:child_process'
import fsp from 'node:fs/promises'
import path from 'node:path'
import matter from 'gray-matter'
import type { SkillLibraryEntry } from './contracts'
import { readOptionalString } from './documents'
import { curatedSkillsCacheRoot } from './paths'

const DEFAULT_CURATED_SKILLS_REPO_URL = 'https://github.com/openai/skills.git'
const CURATED_REPO_MIRROR_NAME = 'skills-repo'
const CURATED_REPO_SHA_MARKER_FILE = 'skills-repo.sha'
const CURATED_SKILLS_ROOT = path.join('skills', '.curated')

export type CuratedLibrarySkill = Omit<SkillLibraryEntry, 'installed'> & {
  sourceDirectory: string
  skillFile: string
  skillName: string
}

function curatedSkillsRepoURL() {
  return process.env.BUDDY_CURATED_SKILLS_REPO_URL?.trim() || DEFAULT_CURATED_SKILLS_REPO_URL
}

function curatedMirrorRoot() {
  return path.join(curatedSkillsCacheRoot(), CURATED_REPO_MIRROR_NAME)
}

function curatedShaMarkerPath() {
  return path.join(curatedSkillsCacheRoot(), CURATED_REPO_SHA_MARKER_FILE)
}

function errorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message
  }
  return String(error)
}

async function directoryExists(filepath: string) {
  const stats = await fsp.stat(filepath).catch(() => undefined)
  return !!stats?.isDirectory()
}

async function readTrimmedFile(filepath: string) {
  const value = await fsp.readFile(filepath, 'utf8').catch(() => undefined)
  return value?.trim()
}

function runGit(args: string[], cwd?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (chunk: Buffer | string) => {
      stdout += chunk.toString()
    })
    child.stderr.on('data', (chunk: Buffer | string) => {
      stderr += chunk.toString()
    })
    child.on('error', (error) => {
      reject(error)
    })
    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout.trim())
        return
      }

      const output = stderr.trim() || stdout.trim()
      reject(
        new Error(
          output.length > 0 ? output : `git ${args.join(' ')} failed with exit code ${code}`,
        ),
      )
    })
  })
}

function parseHeadSha(input: string): string | undefined {
  const firstLine = input
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0)
  if (!firstLine) return undefined
  const [sha] = firstLine.split(/\s+/)
  return sha?.trim().length ? sha : undefined
}

async function resolveRemoteHeadSha(repositoryURL: string) {
  const lsRemoteOutput = await runGit(['ls-remote', repositoryURL, 'HEAD'])
  const remoteSHA = parseHeadSha(lsRemoteOutput)
  if (!remoteSHA) {
    throw new Error(`Could not resolve remote HEAD for ${repositoryURL}`)
  }
  return remoteSHA
}

async function removeDirectory(directory: string) {
  await fsp.rm(directory, {
    recursive: true,
    force: true,
  })
}

function mirrorSwapPaths(mirrorRoot: string) {
  const timestamp = Date.now()
  return {
    tempRoot: `${mirrorRoot}.tmp-${timestamp}-${process.pid}`,
    backupRoot: `${mirrorRoot}.bak-${timestamp}-${process.pid}`,
  }
}

async function syncCuratedRepository(): Promise<void> {
  const repositoryURL = curatedSkillsRepoURL()
  const cacheRoot = curatedSkillsCacheRoot()
  const mirrorRoot = curatedMirrorRoot()
  const markerPath = curatedShaMarkerPath()

  await fsp.mkdir(cacheRoot, { recursive: true })

  const remoteSHA = await resolveRemoteHeadSha(repositoryURL)
  const existingSHA = await readTrimmedFile(markerPath)
  const hasMirror = await directoryExists(mirrorRoot)
  if (hasMirror && existingSHA === remoteSHA) {
    return
  }

  const { tempRoot, backupRoot } = mirrorSwapPaths(mirrorRoot)

  await removeDirectory(tempRoot)

  try {
    await runGit(['clone', '--depth', '1', repositoryURL, tempRoot])
    if (hasMirror) {
      await removeDirectory(backupRoot)
      await fsp.rename(mirrorRoot, backupRoot)
    }
    await fsp.rename(tempRoot, mirrorRoot)
    await removeDirectory(backupRoot)
    await fsp.writeFile(markerPath, `${remoteSHA}\n`, 'utf8')
  } catch (error) {
    const mirrorExists = await directoryExists(mirrorRoot)
    const backupExists = await directoryExists(backupRoot)
    if (!mirrorExists && backupExists) {
      await fsp.rename(backupRoot, mirrorRoot).catch(() => undefined)
    }
    throw error
  } finally {
    await removeDirectory(tempRoot)
    await removeDirectory(backupRoot)
  }
}

async function resolveCuratedRepository(options?: {
  refresh?: boolean
}): Promise<{ root?: string; syncError?: string }> {
  const mirrorRoot = curatedMirrorRoot()
  if (options?.refresh) {
    try {
      await syncCuratedRepository()
    } catch (error) {
      const hasCache = await directoryExists(mirrorRoot)
      const message = errorMessage(error)
      if (hasCache) {
        return {
          root: mirrorRoot,
          syncError: message,
        }
      }
      return {
        syncError: message,
      }
    }
  }

  const hasMirror = await directoryExists(mirrorRoot)
  if (!hasMirror) {
    return {}
  }

  return {
    root: mirrorRoot,
  }
}

function summarizeContent(input: string) {
  const normalized = input.replace(/\r\n/g, '\n').trim()
  if (!normalized) return undefined
  const firstParagraph = normalized
    .split(/\n\s*\n/)
    .map((entry) => entry.replace(/\s+/g, ' ').trim())
    .find((entry) => entry.length > 0)
  if (!firstParagraph) return undefined
  if (firstParagraph.length <= 220) {
    return firstParagraph
  }
  return `${firstParagraph.slice(0, 217).trimEnd()}...`
}

function parseCuratedSkillDocument(input: {
  id: string
  skillFile: string
  sourceDirectory: string
  document: string
}): CuratedLibrarySkill {
  const parsed = matter(input.document)
  const skillName = readOptionalString(parsed.data['name']) ?? input.id
  const summarizedContent =
    summarizeContent(parsed.content) ?? `Use the ${skillName} skill for this workflow.`
  const description = readOptionalString(parsed.data['description']) ?? summarizedContent
  const summary = readOptionalString(parsed.data['summary']) ?? summarizedContent
  const examplePrompt =
    readOptionalString(parsed.data['example_prompt']) ??
    `Use the ${skillName} skill to help with this task.`

  return {
    id: input.id,
    name: skillName,
    description,
    summary,
    examplePrompt,
    sourceDirectory: input.sourceDirectory,
    skillFile: input.skillFile,
    skillName,
  }
}

async function readCuratedSkillsFromRepository(
  repositoryRoot: string,
): Promise<CuratedLibrarySkill[]> {
  const curatedRoot = path.join(repositoryRoot, CURATED_SKILLS_ROOT)
  const entries = await fsp
    .readdir(curatedRoot, {
      withFileTypes: true,
    })
    .catch(() => [])

  const skills: CuratedLibrarySkill[] = []

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (!entry.isDirectory()) continue
    const sourceDirectory = path.join(curatedRoot, entry.name)
    const skillFile = path.join(sourceDirectory, 'SKILL.md')
    const document = await fsp.readFile(skillFile, 'utf8').catch(() => undefined)
    if (!document) continue

    skills.push(
      parseCuratedSkillDocument({
        id: entry.name,
        skillFile,
        sourceDirectory,
        document,
      }),
    )
  }

  return skills.sort((left, right) => left.name.localeCompare(right.name))
}

export async function listCuratedLibrarySkills(options?: {
  refresh?: boolean
}): Promise<{ skills: CuratedLibrarySkill[]; syncError?: string }> {
  const repository = await resolveCuratedRepository({
    refresh: options?.refresh,
  })
  if (!repository.root) {
    return {
      skills: [],
      ...(repository.syncError ? { syncError: repository.syncError } : {}),
    }
  }

  return {
    skills: await readCuratedSkillsFromRepository(repository.root),
    ...(repository.syncError ? { syncError: repository.syncError } : {}),
  }
}

export async function readCuratedLibrarySkillByID(
  skillID: string,
  options?: {
    refresh?: boolean
  },
) {
  const result = await listCuratedLibrarySkills({
    refresh: options?.refresh,
  })
  return result.skills.find((skill) => skill.id === skillID)
}
