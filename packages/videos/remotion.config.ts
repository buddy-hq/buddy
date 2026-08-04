import { Config } from "@remotion/cli/config"

/**
 * Shared render settings. Anything that should be true of every output lives
 * here; the per-target size knobs (CRF, audio bitrate, x264 preset) live in the
 * `render:*` scripts in package.json, because those are exactly what differs
 * between an archive master and a file small enough to send on WhatsApp.
 */

Config.setOverwriteOutput(true)

/**
 * Frames reach the encoder losslessly.
 *
 * The default is JPEG at quality 80, which is a lossy pass *before* h264 ever
 * sees the frame — so its artifacts get encoded in and no CRF can remove them.
 * This film is the worst case for that: flat black fields, a fine grain
 * overlay, and hard-edged white type, which is precisely what JPEG turns into
 * mosquito noise around the letterforms. PNG costs render time and nothing
 * else; size is then controlled by CRF, which is a knob that belongs to the
 * encoder rather than to the frames.
 *
 * If renders get painfully slow, `Config.setJpegQuality(100)` is the fast
 * compromise — visually close, and still far above the default.
 */
Config.setVideoImageFormat("png")

/**
 * HD is bt709. Remotion defaults to bt601, the standard-definition matrix,
 * which leaves players interpreting the primaries slightly differently than
 * Chromium drew them — greys drift and the aurora's magentas shift. Nothing in
 * this film is saturated enough for it to be loud, but it is wrong for free.
 */
Config.setColorSpace("bt709")
