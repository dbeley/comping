# Installation Guide

This guide explains how to install the RYM Cache Overlay extension on Firefox and Chrome.

## Quick Start

### Prerequisites

The build script requires the `zip` command. Install it if not already available:

- **Debian/Ubuntu:** `sudo apt-get install zip`
- **Fedora/RHEL:** `sudo dnf install zip`
- **macOS:** `brew install zip` (or use built-in zip)
- **NixOS:** `nix-shell -p zip` (or add to your configuration)
- **Arch Linux:** `sudo pacman -S zip`

### Build and Install

1. **Build the extension packages:**

   ```bash
   ./build-extension.sh
   ```

   This creates:
   - `build/rym-cache-overlay-<version>.xpi` for Firefox
   - `build/rym-cache-overlay-<version>-chrome.zip` for Chrome

2. **Follow the installation instructions below for your browser**

---

## Firefox Installation

### Option 1: Install .xpi Package (Recommended for Personal Use)

**Note:** Firefox requires extensions to be signed by Mozilla for permanent installation. For personal use, you have these options:

#### A. Temporary Installation (Resets on browser restart)

1. Download or build the `.xpi` file
2. Open Firefox and navigate to `about:debugging#/runtime/this-firefox`
3. Click **Load Temporary Add-on…**
4. Select the `.xpi` file
5. The extension will be active until you restart Firefox

#### B. Firefox Developer Edition / Nightly (Permanent Installation)

1. Download [Firefox Developer Edition](https://www.mozilla.org/firefox/developer/) or [Firefox Nightly](https://www.mozilla.org/firefox/nightly/)
2. Navigate to `about:config`
3. Set `xpinstall.signatures.required` to `false`
4. Open the `.xpi` file in Firefox or drag-and-drop it into the browser
5. Click **Add** when prompted
6. The extension will remain installed permanently

#### C. Development Mode (Alternative)

1. Open `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on…**
3. Navigate to the `rym-overlay-extension/` directory
4. Select `manifest.json`
5. The extension loads but resets on browser restart

### Option 2: Publish to Firefox Add-ons (For Public Distribution)

To make the extension permanently installable by anyone:

1. Create an account on [addons.mozilla.org](https://addons.mozilla.org)
2. Go to [Developer Hub](https://addons.mozilla.org/developers/)
3. Click **Submit a New Add-on**
4. Upload the `.xpi` file
5. Complete the submission process (Mozilla will review and sign it)
6. Once approved, users can install it with one click

---

## Chrome / Chromium Installation

Chrome and Chromium-based browsers (Edge, Brave, Opera, Vivaldi) can load unpacked extensions in developer mode.

### Option 1: Install from .zip (Developer Mode)

1. **Build or download the Chrome package:**

   ```bash
   ./build-extension.sh
   ```

   This creates `build/rym-cache-overlay-<version>-chrome.zip`

2. **Extract the .zip file:**

   ```bash
   unzip build/rym-cache-overlay-*-chrome.zip -d build/chrome-unpacked/
   ```

   Or extract manually to a folder of your choice

3. **Load the extension in Chrome:**
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable **Developer mode** (toggle in top-right corner)
   - Click **Load unpacked**
   - Select the extracted folder (e.g., `build/chrome-unpacked/`)
   - The extension will be installed and remain active

**Note:** Chrome may show a warning that the extension is in developer mode. This is normal for unpacked extensions.

### Option 2: Publish to Chrome Web Store (For Public Distribution)

To make the extension installable by anyone without developer mode:

1. Create a [Chrome Web Store developer account](https://chrome.google.com/webstore/devconsole/) ($5 one-time fee)
2. Zip the extension folder (same as the build script creates)
3. Upload the .zip file to the Chrome Web Store
4. Fill in required details (description, screenshots, privacy policy)
5. Submit for review (usually takes a few days)
6. Once approved, users can install with one click from the Chrome Web Store

---

## Compatibility Notes

### Manifest Version

This extension uses **Manifest V2**, which:

- ✅ Works on Firefox (full support)
- ✅ Works on Chrome in developer mode (unpacked)
- ⚠️ Chrome Web Store will require Manifest V3 starting in 2024+

If publishing to Chrome Web Store, you may need to migrate to Manifest V3. Key changes:

- Replace `background.scripts` with `background.service_worker`
- Update permission declarations
- Replace `browser.storage` API calls with `chrome.storage`

### Browser-Specific APIs

The extension currently uses Firefox's `browser.*` API namespace. For full Chrome compatibility, consider:

1. Using the [webextension-polyfill](https://github.com/mozilla/webextension-polyfill) library
2. Or adding conditional checks: `const browser = chrome || browser;`

---

## Verification

After installation, verify the extension is working:

1. **Check the extension is active:**
   - Firefox: `about:addons`
   - Chrome: `chrome://extensions/`

2. **Test the popup:**
   - Click the extension icon in your browser toolbar
   - You should see the RYM Cache Overlay popup

3. **Test functionality:**
   - Visit a RateYourMusic page (e.g., an album or chart)
   - The extension should sync data automatically
   - Visit a supported site (Navidrome, Spotify, etc.)
   - Ratings should appear as overlays

---

## Troubleshooting

### Firefox: "Add-on could not be installed because it is not properly signed"

- Use Firefox Developer Edition/Nightly with `xpinstall.signatures.required = false`
- Or use temporary installation via `about:debugging`

### Chrome: "Package is invalid: CRX_HEADER_INVALID"

- Don't try to install the .xpi in Chrome (it's Firefox-specific)
- Use the `-chrome.zip` file and extract it
- Load as unpacked extension in developer mode

### Extension not syncing data

- Ensure you have the tracker userscripts installed and active
- Visit a RateYourMusic page to populate the cache
- Check the popup to verify data is being collected

### Overlays not appearing

- Check that overlays are enabled for the specific site in the popup
- Verify you're visiting a supported site
- Check browser console for errors (F12 → Console tab)

---

## Updating the Extension

### Firefox (Temporary Installation)

1. Build a new package with updated version
2. Remove old extension from `about:addons`
3. Load the new `.xpi` file via `about:debugging`

### Chrome (Unpacked Extension)

1. Extract new version to the same folder (overwrite files)
2. Go to `chrome://extensions/`
3. Click the **reload** icon on the extension card

---

## Building from Source

If you want to modify and build the extension:

1. **Clone the repository**
2. **Make your changes** in `rym-overlay-extension/`
3. **Update version** in `manifest.json`
4. **Run build script:**
   ```bash
   ./build-extension.sh
   ```
5. **Test your changes** by installing the new package

---

## Support

For issues, questions, or contributions, see the main [README.md](README.md).
