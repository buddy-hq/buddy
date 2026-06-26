export function GET({ request }: { request: Request }) {
  const userAgent = request.headers.get("user-agent") ?? ""
  const isWindows = /Windows|Win32|Win64/i.test(userAgent)
  const script = isWindows ? "/install-buddy-windows.ps1" : "/install-buddy-macos.sh"
  return Response.redirect(new URL(script, request.url).href, 302)
}
