import type { PlatformPath } from "node:path"
import type {
  BrowserImportFailureReason,
  BrowserImportSourceID,
} from "@buddy/browser-contract/browser-import"
import type { BrowserImportFiles } from "./browser-import-files"
import type { OpenReadOnlyDatabase } from "./cookie-database"

/** The internal operation that failed while importing browser cookies. */
export type BrowserImportFailureStage =
  | "assessSource"
  | "resolveCookieDatabase"
  | "readCookieStore"

/** Safe routing context for a browser-import failure reported by the importer. */
export type BrowserImportFailureDiagnostic = {
  readonly sourceID: BrowserImportSourceID
  readonly reason: BrowserImportFailureReason
  readonly stage: BrowserImportFailureStage
  readonly cause?: unknown
}

export type BrowserImportKeychainPasswordRead =
  | { readonly _tag: "password"; readonly value: string }
  | {
      readonly _tag: "failed"
      readonly reason: "needsKeychainApproval" | "keychainItemMissing" | "keychainUnavailable"
      readonly cause?: unknown
    }

/** Result of asking Windows DPAPI to decrypt bytes for the current user. */
export type BrowserImportWindowsDataRead =
  | { readonly _tag: "decrypted"; readonly bytes: Uint8Array }
  | { readonly _tag: "failed"; readonly cause?: unknown }

export type BrowserImportHost = {
  readonly platform: NodeJS.Platform
  readonly path: PlatformPath
  readonly home: string
  readonly localAppData: string
  readonly hostname: string
  readonly temporaryDirectory: string
  readonly files: BrowserImportFiles
  readonly openDatabase: OpenReadOnlyDatabase
  readonly readKeychainPassword: (
    service: string,
    account: string,
  ) => Promise<BrowserImportKeychainPasswordRead>
  readonly unprotectWindowsData: (
    encrypted: Uint8Array,
  ) => Promise<BrowserImportWindowsDataRead>
  readonly isProcessAlive: (pid: number) => boolean
  readonly reportFailure: (diagnostic: BrowserImportFailureDiagnostic) => void
}
