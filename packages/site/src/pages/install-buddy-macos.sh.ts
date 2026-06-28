import script from "../../../../scripts/install-buddy-macos.sh?raw"

export function GET(): Response {
  return new Response(script, {
    headers: {
      "Cache-Control": "public, max-age=300",
      "Content-Type": "text/x-shellscript; charset=utf-8",
    },
  })
}
