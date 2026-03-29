#!/usr/bin/env bun

console.error("The local release-tag flow is retired.")
console.error(
  "Use `bun run release:cut` so GitHub creates the stable release tag from the published workflow.",
)
process.exit(1)
