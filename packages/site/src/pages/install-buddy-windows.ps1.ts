import script from "../../../../scripts/install-buddy-windows.ps1?raw"

export function GET(): Response {
  return new Response(script, {
    headers: {
      "Cache-Control": "public, max-age=300",
      "Content-Type": "text/plain; charset=utf-8",
    },
  })
}
