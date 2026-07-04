import { $ } from "bun"
import { isBuddyReleaseChannel } from "@buddy/script/channel"
import { resolveChannel } from "./utils"

const arg = process.argv[2]
const channel = isBuddyReleaseChannel(arg) ? arg : resolveChannel()

const src = `./icons/${channel}`
const dest = "resources/icons"

await $`rm -rf ${dest}`
await $`cp -R ${src} ${dest}`

console.log(`Copied ${channel} icons from ${src} to ${dest}`)
