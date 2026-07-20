import { chromium } from "playwright-core"
import fs from "fs"
import path from "path"

const outDir = path.resolve(process.cwd(), ".tmp-404-shots")
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true })
}

const urls = [
  { name: "linear", url: "https://linear.app/404" },
  { name: "raycast", url: "https://raycast.com/404" },
  { name: "warp", url: "https://www.warp.dev/404" },
  { name: "cursor", url: "https://cursor.com/404" },
  { name: "vercel", url: "https://vercel.com/404" },
  { name: "stripe", url: "https://stripe.com/404" },
  { name: "github", url: "https://github.com/404" },
  { name: "resend", url: "https://resend.com/404" },
  { name: "supabase", url: "https://supabase.com/404" }
]

async function run() {
  let browser
  const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  if (fs.existsSync(chromePath)) {
    console.log("Using system Google Chrome...")
    browser = await chromium.launch({ executablePath: chromePath, headless: true })
  } else {
    console.log("Using default chromium...")
    browser = await chromium.launch({ headless: true })
  }

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    colorScheme: "dark"
  })

  for (const item of urls) {
    try {
      console.log(`Navigating to ${item.name}: ${item.url}...`)
      const page = await context.newPage()
      await page.goto(item.url, { waitUntil: "domcontentloaded", timeout: 12000 }).catch(() => {})
      await page.waitForTimeout(2500)
      const filePath = path.join(outDir, `${item.name}.png`)
      await page.screenshot({ path: filePath, fullPage: false })
      console.log(`✓ Saved: ${filePath}`)
      await page.close()
    } catch (err: any) {
      console.error(`✕ Failed ${item.name}:`, err.message)
    }
  }

  await browser.close()
  console.log("Done taking screenshots.")
}

run()
