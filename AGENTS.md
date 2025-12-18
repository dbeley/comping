# Repository Guidelines

## Project Structure & Module Organization

- `comping/`: Manifest V2 browser extension. `background.js` manages cache/index, settings, export, and cache clearing; `popup.html`/`popup.js` render the settings/export UI; `content/` holds data extraction and overlay injectors; `shared/` contains cross-file utilities (normalization, config, badge/DOM/observer helpers, matching, async/runtime helpers, debug).
  - `content/data-extract.js`: Extracts release/song/film/game data from RateYourMusic and Glitchwave pages and charts (with chart observers for navigation updates).
  - `content/data-sync.js`: Manages synchronization of extracted data to browser storage.
  - `content/*-overlay.js`: Platform-specific overlay injectors for Spotify, YouTube, Last.fm, Navidrome, Jellyfin, Steam, and Humble Bundle.
  - `shared/`: Utilities including `normalize.js`, `config.js`, `badge-utils.js`, `dom-utils.js`, `observer-utils.js`, `match-utils.js`, `async-utils.js`, `runtime-utils.js`, and `debug-utils.js`.
- `docs/`: Reference screenshots (e.g., Navidrome overlay).
- `build-extension.sh`: Build script that creates `.xpi` (Firefox) and `.zip` (Chrome) packages and flips `DEBUG` off for production builds.
- `.github/workflows/release.yml`: Tag-driven release pipeline that builds the extension, signs the Firefox package with `web-ext`, and uploads release assets.
- `flake.nix` + `.envrc`: Nix dev shell (`nix develop`/`direnv allow`) with Node.js 22, npm, zip, web-ext, and `prek` to auto-install pre-commit hooks.
- `.pre-commit-config.yaml`: Pre-commit hooks configuration for code quality (trailing whitespace/EOF fixes, ESLint with autofix, Prettier).

## Build, Test, and Development Commands

- The common development environment is NixOS: you have access to all nix and nixpkgs tooling to install and run new tools (`nix develop` provides Node.js 22, npm, zip, web-ext, prek).
- Recommended Node.js version: >=22 (CI uses Node 24).
- **Development**: No build step required for development; load `comping/manifest.json` directly via `about:debugging#/runtime/this-firefox` for temporary Firefox installs (debug logging stays enabled in source).
- **Build**: Run `npm run build` or `./build-extension.sh` to create production packages (requires `zip`, disables debug mode, creates `.xpi` and `.zip` files in `build/` directory).
- **Linting**: Run `npm run lint` or `web-ext lint --source-dir comping` to check for manifest or permission issues. Use `npm run lint:fix` for automatic fixes.
- **Formatting**: Run `npm run format` to format code with Prettier. Use `npm run format:check` to verify formatting without changes.
- **Live reload**: Run `web-ext run --source-dir comping --firefox=nightly` (or your Firefox binary) to iterate on content/popup scripts with automatic reloading.
- **Pre-commit hooks**: Configured via `.pre-commit-config.yaml` to run linting and formatting checks before commits; `prek` in the Nix shell installs them automatically.

## Coding Style & Naming Conventions

- JavaScript is plain ES2020 with IIFEs; prefer `const`/`let`, arrow functions for callbacks, and trailing semicolons. Indent with two spaces.
- Use lower camelCase for variables/functions; keys mirrored from external storage (`rateyourmusic-csv::records`, etc.) stay verbatim.
- Keep shared helpers in `comping/shared/` and reuse exported utilities instead of duplicating normalization, badge rendering, DOM manipulation, or observer logic.
- When adding new overlay targets, group selectors and host checks near existing ones (e.g., in `data-extract.js` for data sources, or create a new `*-overlay.js` for display targets) and gate features behind defaults in `DEFAULT_SETTINGS` (in `shared/config.js`).
- Follow ESLint and Prettier configurations defined in `eslint.config.js` and `.prettierrc`.

## Testing Guidelines

- There is no automated test suite; rely on manual verification. After changes:
  1. Load the extension via `about:debugging#/runtime/this-firefox`
  2. Visit RYM or Glitchwave album/song/film/game pages and charts to refresh the cache
  3. Open supported platforms (Spotify/YouTube/Navidrome/Last.fm/Jellyfin/Steam/Humble Bundle) to confirm badges render correctly
  4. Test settings toggles persist and work as expected via the popup UI (including export/clear cache)
- Static HTML snapshots are not present; rely on live pages for selector QA.
- Run `npm run lint` and `npm run format:check` before submitting to catch code quality issues.
- Pre-commit hooks will automatically run checks; fix any issues they report.

## Commit & Pull Request Guidelines

- Follow the existing log style: short, present-tense summaries (e.g., `add navidrome overlay toggle`), ~72 chars. Squash locally if needed; avoid noisy churn.
- For PRs, provide a concise description, linked issues (if any), manual test notes, and screenshots/GIFs when UI or overlay output changes. Call out any new permissions or storage keys added.
