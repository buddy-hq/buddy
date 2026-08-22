/**
 * Buddy's surface grain, mirrored for video.
 *
 * Source of truth: packages/web/src/components/prompt/composer-surfaces.css
 * (`--composer-grain-*`) — see docs/architecture/design/grain.md. Video can't read the app's
 * CSS variables, so these values track the tokens by hand. Don't retune them
 * here; retune the tokens.
 */
export const GRAIN_IMAGE = `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`
export const GRAIN_OPACITY = 0.06
export const GRAIN_SIZE = 180
