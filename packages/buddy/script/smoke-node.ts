#!/usr/bin/env bun

import {
  assertNodeArtifactRuntimeAssets,
  readFlagValue,
  resolveNodeArtifactEntrypoint,
} from "./node-artifact-runtime"

const ENTRYPOINT_FLAG = "--entrypoint" as const

const args = Bun.argv.slice(2)
const entrypoint = resolveNodeArtifactEntrypoint(readFlagValue(args, ENTRYPOINT_FLAG))

await assertNodeArtifactRuntimeAssets(entrypoint)

console.log(`Buddy Node artifact smoke passed at ${entrypoint}`)
