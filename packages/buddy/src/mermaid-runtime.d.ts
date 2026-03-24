declare module "mermaid/dist/mermaid.esm.mjs" {
  import mermaid, { type Mermaid } from "mermaid"

  const runtime: Mermaid

  export default runtime
  export { mermaid }
}
