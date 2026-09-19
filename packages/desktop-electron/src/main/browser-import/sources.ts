import type {
  BrowserImportSourceID,
  BrowserImportSourceProfile,
} from "@buddy/browser-contract/browser-import"
import { z } from "zod"
import type { BrowserImportHost } from "./browser-import-host"
import { parseChromiumLocalStateProfiles } from "./chromium-local-state"

type SourcePaths = Pick<BrowserImportHost, "platform" | "path" | "home" | "localAppData">
type CookieDatabaseHost = Pick<BrowserImportHost, "path" | "files">
type SourceListingHost = Pick<BrowserImportHost, "path" | "files" | "openDatabase">

type SourceDefinitionBase = {
  readonly id: BrowserImportSourceID
  readonly name: string
  readonly platforms: readonly NodeJS.Platform[]
  readonly userDataDirectory: (paths: SourcePaths) => string | undefined
}

export type ChromiumSourceDefinition = SourceDefinitionBase & {
  readonly engine: "chromium"
  readonly macKeychain?: {
    readonly service: string
    readonly account: string
  }
}

export type SafariSourceDefinition = SourceDefinitionBase & { readonly engine: "safari" }

export type BrowserImportSourceDefinition = ChromiumSourceDefinition | SafariSourceDefinition

export const SAFARI_DEFAULT_PROFILE_ID = "."

const SAFARI_PROFILE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu
const SAFARI_DEFAULT_PROFILE_UUID = "DefaultProfile"
// Safari records each profile as an undeleted top-level bookmark folder of this type and subtype.
const SAFARI_PROFILE_QUERY = `select title, external_uuid from bookmarks
  where parent = 0 and type = 1 and subtype = 2 and deleted = 0 order by order_index`
const safariProfileRows = z.array(
  z.object({ title: z.string().nullable(), external_uuid: z.string() }),
)
const cookieCountRows = z.array(z.object({ count: z.number().int().nonnegative() }))

function macApplicationSupport(paths: SourcePaths, segments: readonly string[]): string {
  return paths.path.join(paths.home, "Library", "Application Support", ...segments)
}

function chromiumUserDataDirectory(input: {
  readonly paths: SourcePaths
  readonly macSegments: readonly string[]
  readonly windowsSegments: readonly string[]
}): string | undefined {
  if (input.paths.platform === "darwin") {
    return macApplicationSupport(input.paths, input.macSegments)
  }
  if (input.paths.platform === "win32") {
    return input.paths.path.join(input.paths.localAppData, ...input.windowsSegments)
  }
  return undefined
}

export const BROWSER_IMPORT_SOURCES: readonly BrowserImportSourceDefinition[] = [
  {
    engine: "chromium",
    id: "chrome",
    name: "Chrome",
    macKeychain: { service: "Chrome Safe Storage", account: "Chrome" },
    platforms: ["darwin", "win32"],
    userDataDirectory: (paths) =>
      chromiumUserDataDirectory({
        paths,
        macSegments: ["Google", "Chrome"],
        windowsSegments: ["Google", "Chrome", "User Data"],
      }),
  },
  {
    engine: "chromium",
    id: "edge",
    name: "Microsoft Edge",
    platforms: ["win32"],
    userDataDirectory: (paths) =>
      paths.platform === "win32"
        ? paths.path.join(paths.localAppData, "Microsoft", "Edge", "User Data")
        : undefined,
  },
  {
    engine: "safari",
    id: "safari",
    name: "Safari",
    platforms: ["darwin"],
    userDataDirectory: (paths) =>
      paths.platform === "darwin"
        ? paths.path.join(
            paths.home,
            "Library",
            "Containers",
            "com.apple.Safari",
            "Data",
            "Library",
            "Cookies",
          )
        : undefined,
  },
]

export function findSourceDefinition(
  id: BrowserImportSourceID,
): BrowserImportSourceDefinition | undefined {
  return BROWSER_IMPORT_SOURCES.find((definition) => definition.id === id)
}

// Chromium 96 moved the jar to Network/Cookies and may leave a stale root-level Cookies file.
function cookieDatabaseCandidatePaths(
  definition: BrowserImportSourceDefinition,
  root: string,
  profileID: string,
  host: CookieDatabaseHost,
): readonly string[] {
  const profileDirectory = host.path.isAbsolute(profileID)
    ? profileID
    : host.path.join(root, profileID)
  switch (definition.engine) {
    case "safari":
      return [host.path.join(profileDirectory, "Cookies.binarycookies")]
    case "chromium":
      return [
        host.path.join(profileDirectory, "Network", "Cookies"),
        host.path.join(profileDirectory, "Cookies"),
      ]
  }
}

export async function resolveCookieDatabase(
  definition: BrowserImportSourceDefinition,
  root: string,
  profileID: string,
  host: CookieDatabaseHost,
): Promise<string | undefined> {
  for (const candidate of cookieDatabaseCandidatePaths(definition, root, profileID, host)) {
    if (await host.files.isFile(candidate)) return candidate
  }
  return undefined
}

// A user-data directory alone is no evidence; native messaging installers create them.
export async function hasCookieDatabase(
  definition: BrowserImportSourceDefinition,
  root: string,
  profiles: readonly BrowserImportSourceProfile[],
  host: CookieDatabaseHost,
): Promise<boolean> {
  for (const profile of profiles) {
    if ((await resolveCookieDatabase(definition, root, profile.id, host)) !== undefined) return true
  }
  return false
}

async function profilesWithCookieDatabase(
  definition: BrowserImportSourceDefinition,
  root: string,
  candidates: readonly BrowserImportSourceProfile[],
  host: CookieDatabaseHost,
): Promise<BrowserImportSourceProfile[]> {
  const profiles: BrowserImportSourceProfile[] = []
  for (const candidate of candidates) {
    if ((await resolveCookieDatabase(definition, root, candidate.id, host)) !== undefined) {
      profiles.push(candidate)
    }
  }
  return profiles
}

async function countProfileCookies(
  definition: BrowserImportSourceDefinition,
  root: string,
  profile: BrowserImportSourceProfile,
  host: SourceListingHost,
): Promise<number | undefined> {
  if (definition.engine === "safari") return undefined
  const databasePath = await resolveCookieDatabase(definition, root, profile.id, host)
  if (!databasePath) return undefined
  try {
    const database = host.openDatabase(databasePath)
    try {
      return cookieCountRows.parse(database.all("select count(*) as count from cookies", []))[0]
        ?.count
    } finally {
      database.close()
    }
  } catch {
    return undefined
  }
}

async function withCookieCounts(
  definition: BrowserImportSourceDefinition,
  root: string,
  profiles: readonly BrowserImportSourceProfile[],
  host: SourceListingHost,
): Promise<readonly BrowserImportSourceProfile[]> {
  return Promise.all(
    profiles.map(async (profile) => {
      const cookieCount = await countProfileCookies(definition, root, profile, host)
      return cookieCount === undefined ? profile : { ...profile, cookieCount }
    }),
  )
}

async function listChromiumProfiles(
  definition: ChromiumSourceDefinition,
  root: string,
  host: SourceListingHost,
): Promise<readonly BrowserImportSourceProfile[]> {
  const localState = await host.files.readText(host.path.join(root, "Local State"))
  const declared = localState === undefined ? [] : parseChromiumLocalStateProfiles(localState)
  if (declared.length > 0) return declared
  // Without Local State, list directories holding a cookie store rather than assuming Default.
  const entries = (await host.files.listDirectory(root)).toSorted()
  return profilesWithCookieDatabase(
    definition,
    root,
    entries.map((entry) => ({ id: entry, name: entry })),
    host,
  )
}

async function listSafariProfiles(
  definition: SafariSourceDefinition,
  root: string,
  host: SourceListingHost,
): Promise<readonly BrowserImportSourceProfile[]> {
  const library = host.path.dirname(root)
  const stores = host.path.join(library, "WebKit", "WebsiteDataStore")
  let declared: z.infer<typeof safariProfileRows> = []
  try {
    const database = host.openDatabase(host.path.join(library, "Safari", "SafariTabs.db"))
    try {
      declared = safariProfileRows.parse(database.all(SAFARI_PROFILE_QUERY, []))
    } finally {
      database.close()
    }
  } catch {
    declared = []
  }
  const defaultProfile = declared.find(
    (profile) => profile.external_uuid === SAFARI_DEFAULT_PROFILE_UUID,
  )
  const profiles: BrowserImportSourceProfile[] = [
    {
      id: SAFARI_DEFAULT_PROFILE_ID,
      name: defaultProfile === undefined ? "Safari" : defaultProfile.title?.trim() || "Personal",
    },
  ]
  for (const profile of declared) {
    if (!SAFARI_PROFILE_UUID.test(profile.external_uuid)) continue
    profiles.push({
      id: host.path.join(stores, profile.external_uuid.toLowerCase(), "Cookies"),
      name: profile.title?.trim() || profile.external_uuid,
    })
  }
  if (declared.length > 0) return profiles
  const entries = (await host.files.listDirectory(stores))
    .filter((entry) => SAFARI_PROFILE_UUID.test(entry))
    .toSorted()
  const recovered = await profilesWithCookieDatabase(
    definition,
    root,
    entries.map((entry) => ({ id: host.path.join(stores, entry, "Cookies"), name: entry })),
    host,
  )
  return [...profiles, ...recovered]
}

export async function listSourceProfiles(
  definition: BrowserImportSourceDefinition,
  root: string,
  host: SourceListingHost,
): Promise<readonly BrowserImportSourceProfile[]> {
  let profiles: readonly BrowserImportSourceProfile[]
  switch (definition.engine) {
    case "chromium":
      profiles = await listChromiumProfiles(definition, root, host)
      break
    case "safari":
      profiles = await listSafariProfiles(definition, root, host)
      break
  }
  return withCookieCounts(definition, root, profiles, host)
}
