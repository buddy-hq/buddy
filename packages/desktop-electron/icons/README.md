# Electron Icons

The desktop shell has three icon sources:

- `assets/buddy-app-icon.png` for `dev` and `prod` packaged app icons such as `icon.icns`, `icon.ico`, the Dock icon, and Windows installer assets
- `assets/buddy-beta-app-icon.png` for the corresponding `beta` packaged app icons, with an indigo-violet tile and matching panda hoodie
- `assets/buddy-inapp-icon.png` for in-app `buddy-icon.png` assets shown inside the renderer

To regenerate everything:

```bash
bun run --cwd packages/desktop-electron icons:generate <app-icon-source> <in-app-icon-source> [beta-app-icon-source]
```

The optional third argument defaults to `assets/buddy-beta-app-icon.png`. A missing Beta source stops generation with an error before generated icons are replaced.

The script:

- replaces the previous generated icon assets in place
- regenerates all `dev`, `beta`, and `prod` channel Electron icon variants
- refreshes `packages/desktop-electron/resources/icons` for the current channel
- rewrites the public `buddy-icon.png` files used by the web and desktop renderers

The generated channel folders now keep only the Electron desktop assets that are actually consumed: `icon.png`, `dock.png`, `icon.ico`, and `icon.icns`.
