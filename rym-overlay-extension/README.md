# RYM Cache Overlay (Firefox WebExtension)

Display cached RateYourMusic and Glitchwave ratings on Spotify, YouTube, Navidrome, Bandcamp, Last.fm, and Deezer using the data already captured by the tracker userscripts.

## How it works
- The CSV tracker userscripts mirror their JSON blobs into `localStorage` (keys: `rateyourmusic-csv::records`, `rateyourmusic-song-csv::records`, `rateyourmusic-film-csv::records`, `glitchwave-csv::records`).
- A content script on RateYourMusic and Glitchwave reads those blobs when you visit and pushes them to the background script.
- The background script merges the datasets, builds a lookup index (music entries keyed by artist + title), and keeps everything in `browser.storage.local`.
- Content scripts on Spotify, YouTube, Navidrome, Bandcamp, Last.fm, and Deezer pull the index and inject a small `RYM <rating>` badge next to matching titles.

Visiting a RYM album or chart page automatically refreshes the cache; the next time you open Spotify/YouTube/Navidrome, the overlay uses the new data.

The popup lets you:
- Enable/disable collection per media type (releases, tracks, films, Glitchwave games).
- Toggle overlays per target site.
- Export the full cache to CSV at any time.

## Loading the extension (Firefox)
1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on…** and select `manifest.json` inside `rym-overlay-extension/`.
3. Keep the tracker userscripts enabled so they continue to populate the cache.

You can reopen the popup to see the last sync time and number of cached releases.
