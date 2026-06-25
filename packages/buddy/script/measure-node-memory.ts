#!/usr/bin/env bun

throw new Error(
  [
    "measure:node-memory has not been migrated to the Electron utility-process backend.",
    "The standalone Node artifact runtime was removed from the desktop contract.",
    "Rebuild this measurement against packages/desktop-electron's utility smoke/dev host before using it for memory optimization.",
  ].join(" "),
)
