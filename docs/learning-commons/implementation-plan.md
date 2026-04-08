# Learning Commons Standards Optional Package - Ship Plan

## Goal
Ship Learning Commons standards as an optional, downloadable capability (not bundled/active by default), with full backend, desktop runtime wiring, frontend UI, and release CI support.

## Acceptance Criteria
- Standards database/tools are not shipped active-by-default.
- User can install, repair, remove, and view status for standards from the app UI.
- Backend only registers/enables standards tools when standards package is ready.
- Desktop runtime startup no longer force-installs bundled standards DB.
- Release CI uploads standards package artifacts required by runtime installer.
- Dev flow supports local standards package assets without release download.
- `bun fmt`, `bun lint`, and `bun typecheck` pass.

## Checklist
- [x] Add backend standards optional-package service (`status/install/remove`, checksum validation, install state persistence, local-dev asset fallback, remote release asset download).
- [x] Add standards local-runtime routes under `/api/local-runtimes/standards` and wire status/install/remove operations.
- [x] Gate standards capability at runtime registration (proxy registration flags) so standards tools register only when standards package is ready.
- [x] Gate standards capability at profile resolution (deny standards tool IDs when standards package is not ready).
- [x] Remove desktop startup force-materialization of bundled knowledge graph DB.
- [x] Remove bundling/copying of standards knowledge graph assets from Electron packaging/prepare scripts.
- [x] Add desktop dev env support for local standards assets path (parallel to advanced math local assets behavior).
- [x] Add frontend standards runtime state client for new backend routes.
- [x] Add frontend settings UI section to install/remove standards package and display status/progress/errors.
- [x] Disable standards tool toggles in settings when standards package is not ready.
- [x] Add i18n strings for standards package UI states/actions.
- [x] Update release CI to upload standards package artifacts to GitHub release.
- [x] Add/adjust tests for backend standards runtime routes and frontend standards runtime state/UI behavior.
- [x] Run package-scoped tests for changed packages.
- [x] Run `bun fmt`, `bun lint`, and `bun typecheck` and fix issues to green.
- [x] Mark checklist complete and summarize ship-ready state.
