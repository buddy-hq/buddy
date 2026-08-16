import { readSkillCatalogSnapshot, reconcileWithdrawnLibrarySkills } from "./library"
import { refreshSystemSkillPack } from "./system-installer"
import { parseTErrorMessage } from "../../shared/parse-values"

const SKILL_ARTIFACT_REFRESH_INTERVAL_MS = 60 * 60 * 1_000

let refreshInterval: NodeJS.Timeout | undefined
let refreshTask: Promise<SkillArtifactRefreshResult> | undefined

export type SkillArtifactRefreshResult = {
  catalog: Awaited<ReturnType<typeof readSkillCatalogSnapshot>>
  system: Awaited<ReturnType<typeof refreshSystemSkillPack>>
}

type SkillArtifactRefreshDependencies = {
  readCatalog(): Promise<SkillArtifactRefreshResult["catalog"]>
  reconcileCatalog(catalog: SkillArtifactRefreshResult["catalog"]["document"]): Promise<void>
  refreshSystem(): Promise<SkillArtifactRefreshResult["system"]>
}

async function refreshSystemArtifact() {
  const [{ resolveBuddyBundledSkillRoots }, { allBuddySkills }] = await Promise.all([
    import("../../../config/opencode/skills.js"),
    import("../../runtime/feature-registry.js"),
  ])
  const roots = await resolveBuddyBundledSkillRoots()
  return await refreshSystemSkillPack(roots, allBuddySkills())
}

async function refreshOnce(
  dependencies: SkillArtifactRefreshDependencies = {
    readCatalog: () => readSkillCatalogSnapshot({ refresh: true }),
    reconcileCatalog: reconcileWithdrawnLibrarySkills,
    refreshSystem: refreshSystemArtifact,
  },
): Promise<SkillArtifactRefreshResult> {
  const [catalog, system] = await Promise.all([
    dependencies.readCatalog(),
    dependencies.refreshSystem(),
  ])
  await dependencies.reconcileCatalog(catalog.document)
  return { catalog, system }
}

export async function refreshSkillArtifacts(): Promise<SkillArtifactRefreshResult> {
  if (refreshTask) return await refreshTask
  refreshTask = refreshOnce().finally(() => {
    refreshTask = undefined
  })
  return await refreshTask
}

function reportBackgroundRefresh(result: SkillArtifactRefreshResult): void {
  if (result.catalog.syncError) {
    console.warn(`Skill library catalog refresh failed: ${result.catalog.syncError}`)
  }
  if (result.system.syncError) {
    console.warn(`System skill pack refresh failed: ${result.system.syncError}`)
  }
}

function runBackgroundRefresh(): void {
  void refreshSkillArtifacts().then(reportBackgroundRefresh, (error) => {
    const message = parseTErrorMessage(error)
    console.warn(`Skill artifact refresh failed: ${message}`)
  })
}

export function startSkillArtifactRefreshLoop(): void {
  if (refreshInterval) return
  runBackgroundRefresh()
  refreshInterval = setInterval(runBackgroundRefresh, SKILL_ARTIFACT_REFRESH_INTERVAL_MS)
  refreshInterval.unref()
}

export async function refreshSkillArtifactsWithDependenciesForTests(
  dependencies: SkillArtifactRefreshDependencies,
): Promise<SkillArtifactRefreshResult> {
  return await refreshOnce(dependencies)
}
