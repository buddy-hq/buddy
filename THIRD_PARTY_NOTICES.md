# Third-party notices

Buddy is source-available under the [O'Saasy License](LICENSE). Third-party code,
data, models, fonts, and other assets keep their own licenses. Those licenses
are not changed by Buddy's license.

Exact JavaScript package versions are recorded in `bun.lock`. Where a component
ships its own license or notice file, that file remains authoritative.

## OpenCode

Buddy vendors OpenCode as its agent runtime.

- Project: [OpenCode](https://github.com/anomalyco/opencode)
- Copyright: Copyright (c) 2025 opencode
- License: MIT
- Included license: [`vendor/opencode/LICENSE`](vendor/opencode/LICENSE)

Buddy-owned integration code lives outside `vendor/opencode/`. The vendored
tree is refreshed from upstream and is not relicensed under O'Saasy.

## Learning Commons Knowledge Graph

Buddy redistributes a local database derived from Learning Commons Knowledge
Graph exports.

- Provider: [Learning Commons](https://www.learningcommons.org/)
- Dataset version: `v1.8.0`
- Source exports: `nodes.jsonl` and `relationships.jsonl` from
  `cdn.learningcommons.org`
- Data license: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)
- Knowledge Graph code license: MIT
- License and source credits:
  [Learning Commons licensing](https://docs.learningcommons.org/knowledge-graph/resources/license)

Learning Commons credits state standards to 1EdTech, learning components to
Achievement Network, and learning progressions to Student Achievement Partners.
Buddy converts the exported data into a SQLite database and compresses it with
Zstandard for local distribution. The source URLs, checksums, and conversion
metadata are recorded in
`packages/buddy/resources/knowledge-graph/knowledge-graph.lock.json` and
`packages/buddy/resources/knowledge-graph/learning-commons-knowledge-graph.db.json`.

## Tesseract English language data

Buddy bundles the English model from `tessdata_best` for local OCR.

- Project: [tessdata_best](https://github.com/tesseract-ocr/tessdata_best)
- File: `eng.traineddata`
- SHA-256: `8280aed0782fe27257a68ea10fe7ef324ca0f8d85bd2fd145d1c2b560bcb66ba`
- License: Apache License 2.0
- Included license: `packages/buddy/resources/tessdata/LICENSE`

## Principal application libraries

The following projects are compiled into, packaged with, or used at runtime by
Buddy. This list highlights the principal components; exact dependency versions
and the complete dependency graph are in `bun.lock`.

| Component | License | Project |
|---|---|---|
| Electron | MIT | [electron/electron](https://github.com/electron/electron) |
| React and React DOM | MIT | [facebook/react](https://github.com/facebook/react) |
| Hono | MIT | [honojs/hono](https://github.com/honojs/hono) |
| AI SDK | Apache-2.0 | [vercel/ai](https://github.com/vercel/ai) |
| LiteParse | Apache-2.0 | [run-llama/liteparse](https://github.com/run-llama/liteparse) |
| PDF.js | Apache-2.0 | [mozilla/pdf.js](https://github.com/mozilla/pdf.js) |
| Indigo Ketcher | Apache-2.0 | [epam/ketcher](https://github.com/epam/ketcher) |
| Excalidraw | MIT | [excalidraw/excalidraw](https://github.com/excalidraw/excalidraw) |
| foliate-js | MIT | [johnfactotum/foliate-js](https://github.com/johnfactotum/foliate-js) |
| CodeMirror | MIT | [codemirror](https://github.com/codemirror) |
| Monaco Editor | MIT | [microsoft/monaco-editor](https://github.com/microsoft/monaco-editor) |
| Mermaid | MIT | [mermaid-js/mermaid](https://github.com/mermaid-js/mermaid) |
| KaTeX | MIT | [KaTeX/KaTeX](https://github.com/KaTeX/KaTeX) |
| Shiki | MIT | [shikijs/shiki](https://github.com/shikijs/shiki) |
| DOMPurify | MPL-2.0 OR Apache-2.0 | [cure53/DOMPurify](https://github.com/cure53/DOMPurify) |
| SheetJS Community Edition | Apache-2.0 | [SheetJS/sheetjs](https://git.sheetjs.com/sheetjs/sheetjs) |
| Inter | OFL-1.1 | [rsms/inter](https://github.com/rsms/inter) |
| node-tikzjax | LPPL-1.3c | [prinsss/node-tikzjax](https://github.com/prinsss/node-tikzjax) |

Electron packages also include Electron and Chromium license files produced by
the Electron toolchain. Native runtime packages and other JavaScript
dependencies retain the license terms published with their package releases.

## Reporting an omission

If an attribution or license notice is missing or inaccurate, open an issue or
follow the private route in [SECURITY.md](SECURITY.md) when public disclosure
would create a security problem.
