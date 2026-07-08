import type { APIRoute } from "astro"
import { content } from "../content/site"

type InstallOperatingSystem = "mac" | "win"

const analyticsHosts = new Set(["hibuddy.in", "www.hibuddy.in"])
const eventInstallScriptRequested = "install_script_requested"
const installScripts: Record<InstallOperatingSystem, string> = {
  mac: "/install-buddy-macos.sh",
  win: "/install-buddy-windows.ps1",
}
const postHogCaptureTimeoutMs = 750
const windowsUserAgentPattern = /Windows|Win32|Win64/i

const { meta } = content

function createDistinctId() {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function getCampaignProperties(url: URL) {
  return {
    utm_campaign: url.searchParams.get("utm_campaign") ?? undefined,
    utm_content: url.searchParams.get("utm_content") ?? undefined,
    utm_medium: url.searchParams.get("utm_medium") ?? undefined,
    utm_source: url.searchParams.get("utm_source") ?? undefined,
    utm_term: url.searchParams.get("utm_term") ?? undefined,
  }
}

async function sendInstallScriptRequested(input: {
  request: Request
  selectedOs: InstallOperatingSystem
  url: URL
}): Promise<void> {
  if (!analyticsHosts.has(input.url.hostname)) return

  const abortController = new AbortController()
  const timeoutId = setTimeout(() => abortController.abort(), postHogCaptureTimeoutMs)

  try {
    await fetch(meta.analytics.postHogCaptureEndpoint, {
      body: JSON.stringify({
        api_key: meta.analytics.postHogProjectToken,
        distinct_id: createDistinctId(),
        event: eventInstallScriptRequested,
        properties: {
          $host: input.url.host,
          $pathname: input.url.pathname,
          $process_person_profile: false,
          environment: "production",
          has_referrer: input.request.headers.has("referer"),
          selected_os: input.selectedOs,
          source: "install_route",
          ...getCampaignProperties(input.url),
        },
        timestamp: new Date().toISOString(),
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
      signal: abortController.signal,
    })
  } catch {
    // Install should never fail because analytics is unavailable.
  } finally {
    clearTimeout(timeoutId)
  }
}

export const GET: APIRoute = async ({ request }) => {
  const url = new URL(request.url)
  const userAgent = request.headers.get("user-agent") ?? ""
  const selectedOs = windowsUserAgentPattern.test(userAgent) ? "win" : "mac"
  const script = installScripts[selectedOs]

  await sendInstallScriptRequested({ request, selectedOs, url })

  return Response.redirect(new URL(script, request.url).href, 302)
}
