# Repository Guidelines

## Project Structure & Module Organization
- `rym-overlay-extension/`: Firefox WebExtension code. `background.js` manages cache/index, `content/` holds site-specific injectors (RYM/Glitchwave sync plus Spotify/YouTube/Navidrome/Bandcamp/Last.fm/Deezer overlays), `shared/` contains cross-file helpers (normalization, config), and `popup.*` renders the settings/export UI defined in `manifest.json`.
- `rym-html-examples/`: static RYM/Glitchwave pages for testing selectors and parsing without hitting the live sites.
- `navidrome-html-examples/`: static Navidrome pages for overlay QA.
- `docs/`: reference screenshots of the tracker userscripts that feed the cache.

## Build, Test, and Development Commands
- The common development environment used with this repository is running NixS: you have access to all the nix and nixpkgs tooling to install and run new tools.
- No build step is required; load `rym-overlay-extension/manifest.json` directly via `about:debugging#/runtime/this-firefox` for temporary installs.
- Optional lint (requires `web-ext` on your PATH): `web-ext lint --source-dir rym-overlay-extension`.
- Optional live reload: `web-ext run --source-dir rym-overlay-extension --firefox=nightly` (or your Firefox binary) to iterate on content/popup scripts.

## Coding Style & Naming Conventions
- JavaScript is plain ES2020 with IIFEs; prefer `const`/`let`, arrow functions for callbacks, and trailing semicolons. Indent with two spaces.
- Use lower camelCase for variables/functions; keys mirrored from external storage (`rateyourmusic-csv::records`, etc.) stay verbatim.
- Keep shared helpers in `shared/` and reuse `__RYM_EXT__` exports instead of duplicating normalization or keying logic.
- When adding new overlay targets, group selectors and host checks near existing ones and gate features behind defaults in `DEFAULT_SETTINGS`.

## Testing Guidelines
- There is no automated suite; rely on manual verification. After changes, load the extension, visit a RYM album or chart to refresh the cache, then open Spotify/YouTube/Navidrome to confirm badges render and settings toggles persist.
- Use the HTML snapshots in `rym-html-examples/` and `navidrome-html-examples/` to check selector robustness without network dependence.
- If `web-ext lint` is available, run it before submitting to catch manifest or permission issues.

## Commit & Pull Request Guidelines
- Follow the existing log style: short, present-tense summaries (e.g., `add navidrome overlay toggle`), ~72 chars. Squash locally if needed; avoid noisy churn.
- For PRs, provide a concise description, linked issues (if any), manual test notes, and screenshots/GIFs when UI or overlay output changes. Call out any new permissions or storage keys added.
