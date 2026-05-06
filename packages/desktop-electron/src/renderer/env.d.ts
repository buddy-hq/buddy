/// <reference types="vite/client" />

import type { ElectronAPI } from "../preload/types"

declare global {
  interface Window {
    api: ElectronAPI
    electronAPI?: {
      openDirectoryPickerDialog?: () => Promise<string | string[] | null>
      openFilePickerDialog?: () => Promise<string | string[] | null>
    }
    __BUDDY__?: {
      updaterEnabled?: boolean
      deepLinks?: string[]
      version?: string
      assetBaseUrl?: string
      iconUrl?: string
      devInstanceName?: string
    }
  }
}
