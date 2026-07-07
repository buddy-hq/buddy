/// <reference types="astro/client" />

declare module "*?raw" {
  const content: string
  export default content
}

declare module "*.woff2?url" {
  const url: string
  export default url
}
