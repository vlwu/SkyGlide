# SkyGlide - Chrome Extension

## Web Store Assets
Before running the release command, ensure you have placed the following icon files in `public/icons/`:

- `public/icons/icon16.png` (16x16) - Favicon/Toolbar
- `public/icons/icon48.png` (48x48) - Extension Management Page
- `public/icons/icon128.png` (128x128) - Chrome Web Store / Installation

## Building for Release
To package the game for the Chrome Web Store:

1. Update the version in `package.json`:
   ```bash
   npm version patch/minor/major