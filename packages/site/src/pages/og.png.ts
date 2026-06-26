import { ImageResponse } from "cf-workers-og/html"
import OutfitBold from "../assets/fonts/Outfit-Bold.ttf"

export async function GET() {
  try {
    const html = `
      <div style="display:flex;width:1200px;height:630px;background:linear-gradient(135deg,#1a1a2e 0%,#16213e 100%);align-items:center;justify-content:center;flex-direction:column;font-family:'Outfit',sans-serif;">
        <div style="display:flex;font-size:52px;font-weight:700;color:#ffffff;line-height:1.2;">The personal learning system</div>
        <div style="display:flex;font-size:52px;font-weight:700;color:#8a8aff;line-height:1.2;">for curious minds</div>
      </div>
    `

    return await ImageResponse.create(html, {
      width: 1200,
      height: 630,
      fonts: [
        {
          name: "Outfit",
          data: OutfitBold as unknown as Uint8Array,
          style: "normal",
          weight: 700,
        },
      ],
      headers: {
        "Cache-Control": "public, max-age=86400, s-maxage=31536000, immutable",
      },
    })
  } catch (err) {
    console.error("OG image generation failed:", err)
    return new Response(`OG error: ${String(err)}`, { status: 500 })
  }
}
