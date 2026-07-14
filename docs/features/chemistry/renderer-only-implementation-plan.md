# Renderer-only chemistry implementation plan

## Goal

Keep generated chemistry rendering in chat and Markdown Bench without bundling a chemistry-specific editor.

## Boundary

- Models and imported documents provide SMILES, CXSMILES, reaction SMILES, KET, or Chemfig source.
- Indigo renders SMILES-family and KET source in a browser worker.
- The Buddy backend renders Chemfig.
- MDXEditor preserves chemistry fences and displays their rendered preview.
- Buddy does not provide chemistry-specific visual or source editing controls.

## Implementation

1. Remove the Ketcher editor component, coordination UI, tests, and `ketcher-*` dependencies.
2. Keep the Markdown Bench chemistry DecoratorNode as a render-only preview.
3. Load `indigo-ketcher/binaryWasm` so Vite emits the WASM as an asset instead of transforming an embedded binary as JavaScript.
4. Verify real Indigo rendering, Markdown fence preservation, web production output, and packaged Electron worker asset loading.
5. Retain the temporary 4 GB release heap guard until the Electron build is proven reliable under the original 2 GB ceiling.

## Acceptance criteria

- Generated SMILES, CXSMILES, reaction SMILES, KET, and Chemfig still render.
- Markdown round-tripping preserves chemistry fence language, metadata, and source.
- No Ketcher editor package or chemistry editing control remains in the web bundle; only Indigo's renderer runtime remains.
- The production output contains a separate Indigo WASM asset.
- The Electron production build completes with a 2 GB Node heap.
