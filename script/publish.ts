#!/usr/bin/env bun

import { $ } from "bun"
import { Script } from "@buddy/script"

function releaseRepo() {
  return process.env.BUDDY_REPO || process.env.GITHUB_REPOSITORY || "prashantbhudwal/buddy"
}

if (!Script.release) {
  throw new Error("BUDDY_RELEASE must be set to publish a release")
}

const tag = `v${Script.version}`

await $`gh release edit ${tag} --draft=false --repo ${releaseRepo()}`
