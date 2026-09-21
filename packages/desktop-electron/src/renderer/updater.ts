import type { UpdateRing, UpdateState } from "@buddy/update-contract"
import { UPDATE_RING_STABLE, createUpdateState } from "@buddy/update-contract"
import { readBuddyRendererGlobals } from "../shared/parse-external"

function unsupportedState(): UpdateState {
  return createUpdateState({
    currentVersion: window.api.getAppVersion() ?? "",
    ring: UPDATE_RING_STABLE,
    supported: false,
  })
}

function isUpdaterEnabled(): boolean {
  return readBuddyRendererGlobals(window)?.updaterEnabled === true
}

export async function getUpdateState(): Promise<UpdateState> {
  if (!isUpdaterEnabled()) return unsupportedState()
  return await window.api.getUpdateState().catch(() => unsupportedState())
}

async function command(run: () => Promise<UpdateState>): Promise<UpdateState> {
  if (!isUpdaterEnabled()) return unsupportedState()
  return await run().catch(() => getUpdateState())
}

export function onUpdateState(cb: (state: UpdateState) => void): () => void {
  if (!isUpdaterEnabled()) return () => undefined
  return window.api.onUpdateState(cb)
}

export async function checkForUpdate(): Promise<UpdateState> {
  return await command(() => window.api.checkUpdate())
}

export async function downloadUpdate(): Promise<UpdateState> {
  return await command(() => window.api.downloadUpdate())
}

export async function installPendingUpdate(): Promise<UpdateState> {
  return await command(() => window.api.installUpdate())
}

export async function setUpdateRing(ring: UpdateRing): Promise<UpdateState> {
  if (!isUpdaterEnabled()) return unsupportedState()
  return await window.api.setUpdateRing(ring)
}
