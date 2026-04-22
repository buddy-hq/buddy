# Electron Icons

The desktop shell now has two icon sources:

- `assets/buddy-app-icon.png` for packaged app icons such as `icon.icns`, `icon.ico`, the Dock icon, and Windows installer assets
- `assets/buddy-inapp-icon.png` for in-app `buddy-icon.png` assets shown inside the renderer

To regenerate everything:

```bash
bun run --cwd packages/desktop-electron icons:generate <app-icon-source> <in-app-icon-source>
```

The script:

- replaces the previous generated icon assets in place
- regenerates all `dev`, `beta`, and `prod` channel Electron icon variants
- refreshes `packages/desktop-electron/resources/icons` for the current channel
- rewrites the public `buddy-icon.png` files used by the web and desktop renderers

The generated channel folders now keep only the Electron desktop assets that are actually consumed: `icon.png`, `dock.png`, `icon.ico`, and `icon.icns`.
