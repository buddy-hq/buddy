# Foliate Integration Notes

## Summary

- Buddy uses `foliate-js`, not the GPL-licensed `foliate` app code.
- Buddy currently keeps `foliate-js` as a package dependency in `packages/web`, not as a submodule or vendored snapshot.
- Buddy is pinned to the same `foliate-js` commit referenced by the official `foliate` app submodule:
  - `399248a67a8862ffb5e6463a33f9d52b317ca2eb`
- This decision is temporary and pragmatic. It preserves the current package-managed structure while aligning Buddy with the upstream app's known-good source commit.

## License Boundary

- The `foliate` desktop app repository is GPL.
- The `foliate-js` repository is MIT.
- `PDF.js` assets used by `foliate-js` are Apache 2.0.
- Buddy must not copy implementation code from the GPL `foliate` app into Buddy-owned code.
- It is acceptable to use `foliate-js` directly because it is a separate MIT-licensed project.
- It is acceptable to study the `foliate` app for behavior and integration reference, but not to reuse GPL implementation code.

## What We Found

### Official Foliate App Structure

- The official app does not consume a published npm release of `foliate-js`.
- It vendors `foliate-js` as a git submodule at `src/foliate-js`.
- In the local `foliate` clone at commit `67b6676d3f936c5edea91d4d903385ef39dd25c0`, the `foliate-js` submodule pointer is:
  - `399248a67a8862ffb5e6463a33f9d52b317ca2eb`

### Published npm Package Problem

- The published `foliate-js@1.0.1` package opened EPUB successfully.
- The same published package failed to open PDF with `UnsupportedTypeError`.
- Inspection showed that the published package lacked `pdf.js`, even though the upstream repo README describes PDF support as experimental and requiring `PDF.js`.

### Upstream Source Behavior

- Upstream `foliate-js` source commits that include `pdf.js` and `vendor/pdfjs` assets opened both EPUB and PDF successfully in smoke tests.
- The official Foliate app commit `399248a67a8862ffb5e6463a33f9d52b317ca2eb` also passed EPUB and PDF smoke tests in headless Chromium.

## Current Buddy Decision

- Keep the current dependency structure for now.
- Do not convert `foliate-js` to a submodule yet.
- Pin `packages/web` to the same `foliate-js` commit the official `foliate` app uses:
  - `github:johnfactotum/foliate-js#399248a67a8862ffb5e6463a33f9d52b317ca2eb`

## Why We Kept The Current Structure

- It minimizes churn while the file explorer integration is still stabilizing.
- It avoids adding submodule workflow overhead for contributors right now.
- It still gives us a source-level pin to a known upstream commit instead of relying on the broken npm release.
- It keeps open the option to move to a vendored snapshot or submodule later if `foliate-js` becomes a more permanent core dependency.

## Smoke Test Results

Smoke tests were run in headless Chromium against real files from `~/Downloads`.

### Published npm `foliate-js@1.0.1`

- EPUB: passed
- PDF: failed with `UnsupportedTypeError`

### Upstream `foliate-js` commit `399248a67a8862ffb5e6463a33f9d52b317ca2eb`

- EPUB: passed
- PDF: passed

Files used during smoke testing included:

- `/Users/prashantbhudwal/Downloads/Will Larson - An Elegant Puzzle_ Systems of Engineering Management (2019, Stripe Press) - libgen.li.epub`
- `/Users/prashantbhudwal/Downloads/Michael J. Panik - Growth Curve Modeling_ Theory and Applications-Wiley (2014).pdf`

## Operational Note

- After changing the `foliate-js` dependency pin, Electron/Vite may continue serving stale optimized dependency output from `packages/desktop-electron/node_modules/.vite`.
- If runtime behavior does not match the current dependency pin, clear generated `.vite` caches and restart the app.
- This cache issue does not mean the source pin failed; it means the dev runtime is still serving prebundled output from an older install.
- In addition, Vite dependency optimization can incorrectly prebundle the bundled PDF.js module inside `foliate-js` for Electron/web dev. Buddy excludes `foliate-js/view.js`, `foliate-js/pdf.js`, and `foliate-js/vendor/pdfjs/pdf.mjs` from `optimizeDeps` so the renderer loads the source modules directly instead of the broken optimized `pdf-*.js` output.
- The upstream `foliate-js/pdf.js` source also uses `new URL(\`vendor/pdfjs/\${path}\`, import.meta.url)`, which is accepted by Foliate's own tooling but rejected by Vite because the path does not start with `./`.
- A first-pass rewrite to `./vendor/pdfjs/\${path}` was still insufficient because Vite then converted the expression into a glob import table and pulled `.mjs.map` files into the module graph as `?import&url` dependencies. Those sourcemap requests are served as `application/json`, which causes browser module loading to fail.
- Buddy now rewrites that single expression to `new URL("./vendor/pdfjs/" + path, import.meta.url)` at the Vite transform layer. That preserves the runtime-relative asset resolution but avoids Vite's glob transform entirely, so PDFs load without forking or copying `foliate-js`.
- This Foliate/PDF.js combination also assumes a nonstandard `Map.prototype.getOrInsertComputed` helper that Chromium/Electron does not provide. Buddy keeps the Vite-side compatibility injection for the bundled PDF.js modules and also installs the same shim in Buddy's own runtime before `foliate-js/view.js` is imported, so the main-thread PDF path does not depend solely on a dependency transform to become usable.
- Separately, `foliate-js/paginator.js` schedules a `requestAnimationFrame` callback that dereferences `this.#view.document` even after the view has been torn down. Buddy rewrites that callback to guard `this.#view?.document` so failed opens and fast cleanup do not cascade into the secondary `Cannot read properties of null (reading 'document')` crash.

## Future Options

- Keep the current GitHub commit pin until the integration is stable.
- Later, consider moving `foliate-js` to `vendor/` as a vendored snapshot or subtree if we want stronger provenance and fewer package-manager variables.
- Avoid depending on the published npm release unless upstream publishes a verified package that includes the PDF adapter and bundled `PDF.js` assets.
