import { chromium } from "playwright-core"
import { spawn } from "child_process"
import path from "path"
import fs from "fs"

async function run() {
  console.log("Starting Astro dev server...")
  const astroProcess = spawn("bun", ["run", "dev", "--port", "4399"], {
    cwd: path.resolve(process.cwd()),
    stdio: "pipe",
  })

  // Wait for server to start
  await new Promise((resolve) => setTimeout(resolve, 3500))

  const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  const browser = fs.existsSync(chromePath)
    ? await chromium.launch({ executablePath: chromePath, headless: true })
    : await chromium.launch({ headless: true })

  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    colorScheme: "dark",
  })

  try {
    await page.goto("http://localhost:4399/404-test-nonexistent-route", {
      waitUntil: "networkidle",
    })
    await page.waitForTimeout(1000)
    const outPath = path.resolve(process.cwd(), ".tmp-404-shots", "our-redesigned-404.png")
    await page.screenshot({ path: outPath, fullPage: false })
    console.log(`Saved screenshot to: ${outPath}`)
  } catch (err: any) {
    console.error("Screenshot error:", err.message)
  } finally {
    await browser.close()
    astroProcess.kill()
  }
}

run()
