# Chemistry format scope

Buddy supports chemistry source formats for teaching, not as a general chemical-file interchange layer.

## Supported formats

- `smiles` for molecule connectivity
- `cxsmiles` when supported CX extensions are required
- `reaction-smiles` for reaction schemes
- `ket` for generated or imported coordinate-preserving structure documents
- `chemfig` for deliberately arranged or custom structure art
- mhchem `\ce` / `\pu` inside math for formulas, quantities, and equations

## Removed CTAB formats

Buddy does not support `mol-v2000`, `mol-v3000`, `rxn-v2000`, or `rxn-v3000` as Markdown fences or `render_svg` inputs.

These formats encode complete MDL connection-table records. They are useful for chemical-file interchange and coordinate-preserving imports, but those workflows are outside Buddy's teaching-product scope. They do not add a teaching visualization beyond the supported formats, while model-authored connection tables are verbose and fail easily because their headers, counts, atom blocks, bond blocks, and version markers must agree exactly.

Removing them keeps the model-facing format set smaller and makes the reliable path the obvious path:

- ordinary molecule diagrams use `smiles`;
- reaction diagrams use `reaction-smiles`;
- equations use mhchem;
- custom layouts use `chemfig`;
- generated or imported coordinate-preserving structures use `ket`.

This is an intentional product boundary, not a limitation of Indigo. The underlying renderer may understand additional chemistry formats, but Buddy exposes only formats that materially improve its teaching workflows. Buddy renders chemistry source but does not bundle a chemistry-specific visual editor.
