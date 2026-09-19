import type {
  BrowserImportFailureReason,
  BrowserImportResult,
  BrowserImportSource,
  BrowserImportSourceID,
  BrowserImportSourceProfile,
  BrowserImportUnavailableReason,
} from "@buddy/browser-contract/browser-import"
import type { BrowserImportHost } from "./browser-import-host"
import type { BrowserImportFailureStage } from "./browser-import-host"
import { readChromiumCookies } from "./chromium-cookies"
import type {
  CookieSameSite,
  CookieStoreContents,
  CookieStoreRead,
  ImportedCookie,
} from "./imported-cookie"
import { readSafariCookies, safariAccessDenied } from "./safari-cookies"
import { isSourceRunning } from "./source-locks"
import {
  BROWSER_IMPORT_SOURCES,
  SAFARI_DEFAULT_PROFILE_ID,
  findSourceDefinition,
  hasCookieDatabase,
  listSourceProfiles,
  resolveCookieDatabase,
  type BrowserImportSourceDefinition,
} from "./sources"

export type BrowserImportCookieDetails = {
  url: string
  name: string
  value: string
  domain?: string
  path: string
  secure: boolean
  httpOnly: boolean
  expirationDate?: number
  sameSite: CookieSameSite
}

export type BrowserImportCookieSink = {
  set(details: BrowserImportCookieDetails): Promise<void>
}

export type BrowserCookieImportRequest = {
  readonly sourceID: BrowserImportSourceID
  readonly sourceProfileID: string
  readonly cookies: BrowserImportCookieSink
}

export type BrowserImporter = {
  listSources(): Promise<readonly BrowserImportSource[]>
  importCookies(request: BrowserCookieImportRequest): Promise<BrowserImportResult>
  checkSafariFullDiskAccess(): Promise<boolean>
}

type SourceAssessment =
  | {
      readonly _tag: "available"
      readonly userDataDirectory: string
      readonly profiles: readonly BrowserImportSourceProfile[]
    }
  | { readonly _tag: "unavailable"; readonly reason: BrowserImportUnavailableReason }

function unavailable(reason: BrowserImportUnavailableReason): SourceAssessment {
  return { _tag: "unavailable", reason }
}

function importFailed(reason: BrowserImportFailureReason): BrowserImportResult {
  return { _tag: "failed", reason }
}

async function safariFullDiskAccessGranted(
  definition: BrowserImportSourceDefinition,
  userDataDirectory: string,
  profiles: readonly BrowserImportSourceProfile[],
  host: BrowserImportHost,
): Promise<boolean> {
  const defaultJar = await resolveCookieDatabase(
    definition,
    userDataDirectory,
    SAFARI_DEFAULT_PROFILE_ID,
    host,
  )
  if (defaultJar !== undefined) return !(await safariAccessDenied(host.files, defaultJar))
  for (const profile of profiles) {
    const jar = await resolveCookieDatabase(definition, userDataDirectory, profile.id, host)
    if (jar !== undefined && !(await safariAccessDenied(host.files, jar))) return true
  }
  return false
}

function cookieDetails(cookie: ImportedCookie): BrowserImportCookieDetails {
  const details: BrowserImportCookieDetails = {
    url: cookie.url,
    name: cookie.name,
    value: cookie.value,
    path: cookie.path,
    secure: cookie.secure,
    httpOnly: cookie.httpOnly,
    sameSite: cookie.sameSite,
  }
  if (cookie.domain !== undefined) details.domain = cookie.domain
  if (cookie.expirationDate !== undefined) details.expirationDate = cookie.expirationDate
  return details
}

async function writeCookies(
  sink: BrowserImportCookieSink,
  contents: CookieStoreContents,
): Promise<BrowserImportResult> {
  let imported = 0
  let skipped = contents.skipped
  const skippedDomains = new Set(contents.skippedDomains)
  for (const cookie of contents.cookies) {
    try {
      await sink.set(cookieDetails(cookie))
      imported += 1
    } catch {
      skipped += 1
      try {
        skippedDomains.add(new URL(cookie.url).hostname)
      } catch {
        // Cookie URLs were parsed at the engine boundary; an invalid URL is still counted above.
      }
    }
  }
  return { _tag: "imported", imported, skipped, skippedDomains: [...skippedDomains].slice(0, 20) }
}

export function createBrowserImporter(host: BrowserImportHost): BrowserImporter {
  function failedImport(input: {
    readonly sourceID: BrowserImportSourceID
    readonly reason: BrowserImportFailureReason
    readonly stage: BrowserImportFailureStage
    readonly cause?: unknown
  }): BrowserImportResult {
    host.reportFailure(input)
    return importFailed(input.reason)
  }

  async function assessSource(
    definition: BrowserImportSourceDefinition,
  ): Promise<SourceAssessment> {
    if (!definition.platforms.includes(host.platform)) return unavailable("unsupportedPlatform")
    const userDataDirectory = definition.userDataDirectory(host)
    if (userDataDirectory === undefined) return unavailable("notInstalled")
    const profiles = await listSourceProfiles(definition, userDataDirectory, host)
    if (!(await hasCookieDatabase(definition, userDataDirectory, profiles, host))) {
      return unavailable("notInstalled")
    }
    if (await isSourceRunning(definition, userDataDirectory, host)) {
      return unavailable("browserRunning")
    }
    if (
      definition.engine === "safari" &&
      !(await safariFullDiskAccessGranted(definition, userDataDirectory, profiles, host))
    ) {
      return unavailable("needsFullDiskAccess")
    }
    return { _tag: "available", userDataDirectory, profiles }
  }

  function readSourceCookies(
    definition: BrowserImportSourceDefinition,
    userDataDirectory: string,
    databasePath: string,
  ): Promise<CookieStoreRead<BrowserImportFailureReason>> {
    switch (definition.engine) {
      case "chromium":
        return readChromiumCookies(
          host,
          definition.macKeychain === undefined
            ? {
                databasePath,
                localStatePath: host.path.join(userDataDirectory, "Local State"),
              }
            : {
                databasePath,
                localStatePath: host.path.join(userDataDirectory, "Local State"),
                macKeychain: definition.macKeychain,
              },
        )
      case "safari":
        return readSafariCookies(host.files, databasePath)
    }
  }

  return {
    async checkSafariFullDiskAccess() {
      const definition = findSourceDefinition("safari")
      if (definition === undefined || !definition.platforms.includes(host.platform)) return false
      const userDataDirectory = definition.userDataDirectory(host)
      if (userDataDirectory === undefined) return false
      const profiles = await listSourceProfiles(definition, userDataDirectory, host)
      if (!(await hasCookieDatabase(definition, userDataDirectory, profiles, host))) return false
      return safariFullDiskAccessGranted(definition, userDataDirectory, profiles, host)
    },
    listSources() {
      return Promise.all(
        BROWSER_IMPORT_SOURCES.map(async (definition): Promise<BrowserImportSource> => {
          const assessment = await assessSource(definition)
          return assessment._tag === "available"
            ? {
                id: definition.id,
                name: definition.name,
                profiles: assessment.profiles,
                availability: { _tag: "available" },
              }
            : {
                id: definition.id,
                name: definition.name,
                profiles: [],
                availability: { _tag: "unavailable", reason: assessment.reason },
              }
        }),
      )
    },

    async importCookies(request) {
      try {
        const definition = findSourceDefinition(request.sourceID)
        if (definition === undefined) {
          return failedImport({
            sourceID: request.sourceID,
            reason: "unknownSource",
            stage: "assessSource",
          })
        }
        const assessment = await assessSource(definition)
        if (assessment._tag === "unavailable") {
          return failedImport({
            sourceID: request.sourceID,
            reason: assessment.reason,
            stage: "assessSource",
          })
        }
        // Only IDs from this listing are honoured; an unchecked ID could traverse to any database.
        const profile = assessment.profiles.find(
          (candidate) => candidate.id === request.sourceProfileID,
        )
        if (profile === undefined) {
          return failedImport({
            sourceID: request.sourceID,
            reason: "unknownSourceProfile",
            stage: "assessSource",
          })
        }
        const databasePath = await resolveCookieDatabase(
          definition,
          assessment.userDataDirectory,
          profile.id,
          host,
        )
        if (databasePath === undefined) {
          return failedImport({
            sourceID: request.sourceID,
            reason: "readFailed",
            stage: "resolveCookieDatabase",
          })
        }
        const read = await readSourceCookies(definition, assessment.userDataDirectory, databasePath)
        if (read._tag === "failed") {
          return failedImport({
            sourceID: request.sourceID,
            reason: read.reason,
            stage: "readCookieStore",
            cause: read.cause,
          })
        }
        return writeCookies(request.cookies, read.contents)
      } catch (cause) {
        return failedImport({
          sourceID: request.sourceID,
          reason: "readFailed",
          stage: "readCookieStore",
          cause,
        })
      }
    },
  }
}
