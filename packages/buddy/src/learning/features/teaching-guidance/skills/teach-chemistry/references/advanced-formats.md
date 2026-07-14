# KET and render_svg

Prefer `smiles` / `reaction-smiles` / `\ce` for most teaching. Use KET only when Ketcher round-tripping is required.

If tempted to invent `inchi`, `smarts`, `sdf`, `cml`, `lewis`, `smile`, `reaction_smiles`, or `smiles-reaction` fences — stop. Use a supported chemistry format instead.

## KET (`ket`)

- Valid JSON **object** (not array/string).
- Must include non-empty `root.nodes` and `$ref` targets that resolve to objects.
- Interchange with Ketcher / structure editors.
- Prefer SMILES unless round-tripping editor JSON.

## `render_svg` tool

Parameters:

| Field | Rule |
| --- | --- |
| `filePath` | Absolute path ending in `.svg` |
| `format` | Exact enum: smiles, cxsmiles, reaction-smiles, ket, chemfig |
| `source` | Unfenced chemistry source only |

Then reference from MDX:

```mdx
![Ethanol structure](./assets/ethanol.svg)
```

For chemfig via `render_svg`, put chemfig markup in `source` with correct JSON escaping (`\\chemfig{…}` in the tool argument); do not wrap `source` in Markdown fences.

Resize later by editing SVG/`width` — not by re-running for size alone.

See `teaching-resource-authoring` → `references/buddy-mdx-support.md` for the full MDX workflow example.
