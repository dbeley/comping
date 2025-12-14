(function () {
  const api = window.__RYM_EXT__ || {};
  const DEFAULT_SETTINGS = api.DEFAULT_SETTINGS || { sources: {}, overlays: {} };
  const sendMessage = api.sendMessage;

  let chartObserver = null;
  let chartRefreshTimer = null;
  let chartHookTimer = null;
  let chartContainer = null;
  let chartContainerWatcher = null;
  let chartPollInterval = null;
  let chartExtractionInFlight = false;

  main().catch((err) => console.warn("[rym-overlay] extract failed", err));

  async function main() {
    const settings = await fetchSettings();
    await runExtraction(settings);
    setupChartObservers(settings);
  }

  async function fetchSettings() {
    try {
      const settings = await sendMessage({ type: "rym-settings-get" });
      return { ...DEFAULT_SETTINGS, ...settings };
    } catch (err) {
      console.warn("[rym-overlay] failed to load settings, assuming defaults", err);
      return DEFAULT_SETTINGS;
    }
  }

  function getContext() {
    const html = document.documentElement;
    return {
      url: location.href,
      host: location.host,
      pageId: html.id || "",
      classList: Array.from(html.classList || []),
    };
  }

  function collectExtractions(context, settings) {
    const batches = [];
    const addBatch = (mediaType, source, records) => {
      if (!records || !records.length) return;
      if (settings.sources[mediaType] === false) return;
      batches.push({ mediaType, source, records });
    };

    if (context.pageId === "page_home") {
      addBatch("release", "extract:home:new-releases", extractHomeNewReleases());
      addBatch("release", "extract:home:features", extractHomeFeatured());
      return batches;
    }

    if (context.pageId === "page_release") {
      addBatch("release", "extract:release", extractReleasePage());
      return batches;
    }

    if (context.pageId === "page_artist") {
      const isFilm = context.classList.includes("scope_film");
      const mediaType = isFilm ? "film" : "release";
      addBatch(mediaType, "extract:artist:discography", extractArtistDiscography(mediaType));
      if (!isFilm) {
        addBatch("song", "extract:artist:top-songs", extractArtistTopSongs());
      }
      return batches;
    }

    if (context.pageId === "page_charts" && context.classList.includes("scope_music")) {
      if (location.pathname.includes("/song/")) {
        addBatch("song", "extract:charts:song", extractSongChart());
      } else {
        addBatch("release", "extract:charts:album", extractComponentChart("release"));
      }
      return batches;
    }

    if (context.pageId === "page_song") {
      addBatch("song", "extract:song", extractSongPage());
      return batches;
    }

    if (context.pageId === "page_film") {
      addBatch("film", "extract:film", extractFilmPage());
      return batches;
    }

    if (context.pageId === "page_charts" && context.classList.includes("scope_film")) {
      addBatch("film", "extract:charts:film", extractComponentChart("film"));
      return batches;
    }

    if (
      context.pageId === "page_chart" &&
      document.documentElement.classList.contains("glitchwave")
    ) {
      addBatch("game", "extract:charts:game", extractGameChart());
      return batches;
    }

    if (context.pageId === "page_game") {
      addBatch("game", "extract:game", extractGamePage());
      return batches;
    }

    if (context.pageId === "page_company_game") {
      addBatch("game", "extract:company-games", extractDeveloperGames());
      return batches;
    }

    return batches;
  }

  async function runExtraction(settings) {
    if (chartExtractionInFlight) return;
    chartExtractionInFlight = true;
    try {
      const context = getContext();
      const batches = collectExtractions(context, settings);

      for (const batch of batches) {
        if (!batch.records.length) continue;
        await sendMessage({
          type: "rym-cache-update",
          records: batch.records,
          source: batch.source,
          mediaType: batch.mediaType,
        });
      }
    } finally {
      chartExtractionInFlight = false;
    }
  }

  function setupChartObservers(settings) {
    if (document.documentElement.id !== "page_charts") return;
    ensureChartContainerWatcher(settings);
    const container = findChartContainer();
    if (!container) return;

    if (chartObserver) {
      chartObserver.disconnect();
    }

    const scheduleRefresh = () => {
      if (chartRefreshTimer) clearTimeout(chartRefreshTimer);
      chartRefreshTimer = setTimeout(() => {
        runExtraction(settings).catch((err) =>
          console.warn("[rym-overlay] chart refresh failed", err)
        );
      }, 500);
    };

    chartContainer = container;
    chartObserver = new MutationObserver((mutations) => {
      const relevant = mutations.some(
        (mutation) => mutation.addedNodes.length || mutation.removedNodes.length
      );
      if (relevant) scheduleRefresh();
    });
    chartObserver.observe(container, { childList: true, subtree: true });

    const originalPushState = history.pushState?.bind(history);
    const originalReplaceState = history.replaceState?.bind(history);

    if (originalPushState) {
      history.pushState = function (...args) {
        originalPushState(...args);
        scheduleRefresh();
      };
    }

    if (originalReplaceState) {
      history.replaceState = function (...args) {
        originalReplaceState(...args);
        scheduleRefresh();
      };
    }

    window.addEventListener("popstate", scheduleRefresh);

    hookChartNavigation(scheduleRefresh);
    chartHookTimer = setTimeout(() => hookChartNavigation(scheduleRefresh), 500);

    if (!chartPollInterval) {
      chartPollInterval = setInterval(() => scheduleRefresh(), 2000);
    }
  }

  function ensureChartContainerWatcher(settings) {
    if (chartContainerWatcher) return;
    chartContainerWatcher = new MutationObserver(() => {
      const next = findChartContainer();
      if (next && next !== chartContainer) {
        setupChartObservers(settings);
      }
    });
    chartContainerWatcher.observe(document.body, { childList: true, subtree: true });
  }

  function findChartContainer() {
    return (
      document.querySelector(".page_charts_section_charts_items") ||
      document.querySelector("#page_charts_section_charts")
    );
  }

  function hookChartNavigation(scheduleRefresh) {
    const wrap = (obj, key) => {
      if (!obj || typeof obj[key] !== "function") return;
      if (obj[key]._rymExtWrapped) return;
      const original = obj[key].bind(obj);
      obj[key] = function (...args) {
        const result = original(...args);
        Promise.resolve(result)
          .catch(() => {})
          .finally(() => scheduleRefresh());
        return result;
      };
      obj[key]._rymExtWrapped = true;
    };

    wrap(window.RYMpagination, "callback");
    wrap(window.page?.charts, "loadPage");
    wrap(window.page?.charts, "reloadPage");
  }

  function extractHomeNewReleases() {
    const items = [];
    document.querySelectorAll(".newreleases_itembox").forEach((item) => {
      const link = item.querySelector(".newreleases_item_title");
      const artistLink = item.querySelector(".newreleases_item_artist .artist");
      const genres = texts(item.querySelectorAll(".newreleases_item_genres"));
      const ratingValue = text(item.querySelector(".newreleases_avg_rating_stat"));
      const ratingCount = toNumber(text(item.querySelector(".newreleases_ratings_stat")));
      const reviewCount = toNumber(text(item.querySelector(".newreleases_wishlist_stat")));
      const imageEl = item.querySelector(".newreleases_item_art, .newreleases_item_artbox img");
      const record = baseRecord("release", link?.href || "");
      record.name = text(link);
      record.artist = text(artistLink);
      record.releaseDate = text(item.querySelector(".newreleases_item_releasedate"));
      record.primaryGenres = genres.join(", ");
      record.ratingValue = ratingValue;
      record.ratingCount = ratingCount;
      record.reviewCount = reviewCount;
      record.image = pickSrc(imageEl);
      record.isPartial = false;
      items.push(record);
    });
    return items;
  }

  function extractHomeFeatured() {
    const items = [];
    document.querySelectorAll(".page_feature_main_info").forEach((item) => {
      const link = item.querySelector(".page_feature_title a.album");
      const artistLink = item.querySelector(".page_feature_artist .artist");
      if (!link) return;
      const ratingMeta = item.querySelector("[itemprop=reviewRating] [itemprop=ratingValue]");
      const record = baseRecord("release", link.href || "");
      record.name = text(link);
      record.artist = text(artistLink);
      record.releaseDate = text(item.querySelector(".page_feature_title_year"));
      record.ratingValue = ratingMeta?.getAttribute("content") || "";
      record.isPartial = true;
      items.push(record);
    });
    return items;
  }

  function extractReleasePage() {
    const table = extractInfoTable(".album_info");
    const record = baseRecord("release", location.href);
    record.name = text(document.querySelector(".album_title"));
    record.artist = text(
      document.querySelector(".album_info .artist, .album_artist_small .artist")
    );
    record.type = table.Type || "";
    record.releaseDate = table.Released || "";
    record.ratingValue = text(document.querySelector(".avg_rating"));
    record.maxRating = extractMaxRating(
      "[itemprop=reviewRating] [itemprop=bestRating]",
      ".max_rating span",
      ".max_rating"
    );
    record.ratingCount = toNumber(
      text(document.querySelector(".num_ratings b span, .num_ratings b, .num_ratings span"))
    );
    record.reviewCount = toNumber(
      text(document.querySelector(".num_reviews b span, .num_reviews b, .num_reviews span"))
    );
    record.primaryGenres = texts(document.querySelectorAll(".release_pri_genres .genre")).join(
      ", "
    );
    record.secondaryGenres = texts(document.querySelectorAll(".release_sec_genres .genre")).join(
      ", "
    );
    record.descriptors = text(document.querySelector(".release_pri_descriptors"));
    record.languages = table.Language || "";
    record.image = pickSrc(document.querySelector(".coverart img, .release_art img"));
    record.isPartial = false;
    return [record];
  }

  function extractArtistDiscography(mediaType) {
    const artist = text(document.querySelector("h1.artist_name_hdr"));
    const items = [];
    document.querySelectorAll(".disco_release").forEach((el) => {
      const titleLink = el.querySelector(".disco_mainline a.album");
      if (!titleLink) return;
      const releaseType = lookupPreviousLabel(el);
      if (!isAllowedReleaseType(releaseType)) return;
      const record = baseRecord(mediaType, titleLink.href || "");
      record.name = text(titleLink);
      record.artist = artist;
      record.releaseDate = text(el.querySelector(".disco_year_ymd, .disco_year_ym, .disco_year_y"));
      record.ratingValue = text(el.querySelector(".disco_avg_rating"));
      record.ratingCount = toNumber(text(el.querySelector(".disco_ratings")));
      record.reviewCount = toNumber(text(el.querySelector(".disco_reviews")));
      record.type = releaseType;
      record.image = pickSrc(el.querySelector(".disco_info img"));
      record.isPartial = true;
      items.push(record);
    });
    return items;
  }

  function isAllowedReleaseType(type) {
    const normalized = (type || "").toLowerCase().trim();
    return (
      normalized === "album" ||
      normalized === "ep" ||
      normalized === "compilation" ||
      normalized === "live" ||
      normalized === "live album"
    );
  }

  function extractArtistTopSongs() {
    const artist = text(document.querySelector("h1.artist_name_hdr"));
    const items = [];
    document.querySelectorAll("li.page_artist_songs_song").forEach((el) => {
      const link = el.querySelector("a.song");
      if (!link) return;
      const record = baseRecord("song", link.href || "");
      record.name = text(link);
      record.artist = artist;
      record.ratingValue = text(el.querySelector(".page_artist_tracks_track_stats_rating"));
      record.ratingCount = toNumber(
        text(el.querySelector(".page_artist_tracks_track_stats_count"))
      );
      record.isPartial = true;
      items.push(record);
    });
    return items;
  }

  function extractComponentChart(mediaType) {
    const items = [];

    // Extract main chart items (.page_charts_section_charts_item)
    document.querySelectorAll(".page_charts_section_charts_item").forEach((item) => {
      const link = item.querySelector(".page_charts_section_charts_item_link");
      if (!link) return;
      const record = baseRecord(mediaType, link.href || "");
      record.name = text(link);
      record.artist = text(
        item.querySelector(
          ".page_charts_section_charts_item_credited_links_primary a.artist, .page_charts_section_charts_item_credited_links_primary a.film_artist"
        )
      );

      // Extract release date and type
      const dateCompact = item.querySelector(".page_charts_section_charts_item_title_date_compact");
      if (dateCompact) {
        const dateSpan = dateCompact.querySelector("span");
        if (dateSpan) {
          record.releaseDate = text(dateSpan);
        }
        const typeSpan = dateCompact.querySelector(".page_charts_section_charts_item_release_type");
        if (typeSpan) {
          record.type = text(typeSpan);
        }
      }

      // Extract rating value
      record.ratingValue = text(
        item.querySelector(
          ".page_charts_section_charts_item_details_average_num, .page_charts_section_charts_item_details_average"
        )
      );

      // Extract ratings and reviews
      const ratingsEl = item.querySelector(".page_charts_section_charts_item_details_ratings");
      if (ratingsEl) {
        record.ratingCount = toNumber(text(ratingsEl));
      }
      const reviewsEl = item.querySelector(".page_charts_section_charts_item_details_reviews");
      if (reviewsEl) {
        record.reviewCount = toNumber(text(reviewsEl));
      }

      record.image = pickSrc(item.querySelector("img.ui_image_img"));
      record.isPartial = false;
      items.push(record);
    });

    return items;
  }

  function extractSongChart() {
    const items = [];
    document.querySelectorAll(".page_charts_section_charts_item.object_song").forEach((item) => {
      const link = item.querySelector(".page_charts_section_charts_item_link.song");
      if (!link) return;
      const record = baseRecord("song", link.href || "");
      record.name = text(link);
      record.artist = text(
        item.querySelector(".page_charts_section_charts_item_credited_text .artist")
      );
      record.releaseDate = text(
        item.querySelector(
          ".page_charts_section_charts_item_title_date_compact span, .page_charts_section_charts_item_date span"
        )
      );
      record.primaryGenres = texts(
        item.querySelectorAll(".page_charts_section_charts_item_genres_primary a.genre")
      ).join(", ");
      record.ratingValue = text(
        item.querySelector(".page_charts_section_charts_item_details_average_num")
      );
      record.ratingCount = toNumber(
        text(
          item.querySelector(
            ".page_charts_section_charts_item_details_ratings .full, .page_charts_section_charts_item_details_ratings .abbr"
          )
        )
      );
      record.image = pickSrc(item.querySelector(".page_charts_section_charts_item_image img"));
      record.isPartial = false;
      items.push(record);
    });
    return items;
  }

  function extractSongPage() {
    const record = baseRecord("song", location.href);
    record.name = text(document.querySelector(".page_song_header_main_info h1"));
    record.artist = text(document.querySelector(".page_song_header_info_artist .artist"));
    record.releaseDate = extractFromPipes(
      document.querySelectorAll(".page_song_header_info_rest .pipe_separated")
    );
    record.type = "Song";
    record.ratingValue = text(
      document.querySelector(".page_section_main_info_music_rating_value_rating")
    );
    record.ratingCount = toNumber(
      text(document.querySelector(".page_section_main_info_music_rating_value_number"))
    );
    record.primaryGenres = texts(
      document.querySelectorAll(".page_song_header_info_genre_item_primary a.genre")
    ).join(", ");
    record.album = text(document.querySelector(".page_song_header_info_rest a.album"));
    record.image = pickSrc(
      document.querySelector(".page_song_header_image img, .page_section_charts_item_image img")
    );
    record.isPartial = false;
    return [record];
  }

  function extractFilmPage() {
    const table = extractInfoTable(".film_info");
    const record = baseRecord("film", location.href);
    record.name = text(document.querySelector(".film_title h1, .album_title"));
    record.directors = text(document.querySelector(".film_info a.film_artist"));
    record.releaseDate = table.Released || "";
    record.ratingValue = text(document.querySelector(".avg_rating"));
    record.maxRating = extractMaxRating(
      "[itemprop=reviewRating] [itemprop=bestRating]",
      ".max_rating span",
      ".max_rating"
    );
    record.ratingCount = toNumber(
      text(document.querySelector(".num_ratings b span, .num_ratings b, .num_ratings span"))
    );
    record.reviewCount = toNumber(
      text(document.querySelector(".num_reviews b span, .num_reviews b, .num_reviews span"))
    );
    record.primaryGenres = texts(
      document.querySelectorAll(".extra_metadata_genres a, .release_pri_genres .genre")
    ).join(", ");
    record.secondaryGenres = texts(
      document.querySelectorAll(".extra_metadata_sec_genres a, .release_sec_genres .genre")
    ).join(", ");
    record.descriptors =
      table.Descriptors || text(document.querySelector(".release_pri_descriptors"));
    record.languages = table.Language || "";
    record.image = pickSrc(document.querySelector(".page_release_art_frame img, .film_art img"));
    record.isPartial = false;
    return [record];
  }

  function extractGameChart() {
    const items = [];
    document.querySelectorAll(".chart_card").forEach((card) => {
      const link = card.querySelector(".chart_title a.game");
      if (!link) return;
      const record = baseRecord("game", link.href || "");
      record.name = text(link);
      record.releaseDate = text(card.querySelector(".chart_release_date, .chart_position_sm_year"));
      record.ratingValue = text(card.querySelector(".rating_number_game"));
      record.ratingCount = toNumber(text(card.querySelector(".chart_card_ratings b")));
      record.reviewCount = toNumber(text(card.querySelector(".chart_card_reviews b")));
      record.primaryGenres = texts(card.querySelectorAll(".chart_genres .genre_")).join(", ");
      record.image = pickBackground(card.querySelector(".chart_card_image"));
      record.isPartial = false;
      items.push(record);
    });
    return items;
  }

  function extractGamePage() {
    const record = baseRecord("game", location.href);
    record.name = text(document.querySelector(".page_object_header_title, #page_object_header h1"));
    record.ratingValue = text(document.querySelector(".rating_number_game"));
    record.maxRating = extractMaxRating(
      ".rating_card_max_rating [itemprop=bestRating]",
      ".rating_card_max_rating"
    );
    record.ratingCount = toNumber(
      text(
        document.querySelector(
          ".rating_card_description a[href$='Ratings'], .rating_card_description"
        )
      )
    );
    record.reviewCount = toNumber(
      text(document.querySelector(".rating_card_description a[href$='Reviews']"))
    );
    record.primaryGenres = texts(
      document.querySelectorAll(
        ".main_info_field_genres a.genres, .main_info_field_genres a.genre, .page_object_main_info_field .genres"
      )
    ).join(", ");
    record.secondaryGenres = texts(
      document.querySelectorAll(".main_info_field_sec_genres a.sec_genres")
    ).join(", ");
    record.descriptors = texts(
      document.querySelectorAll(
        ".main_info_field_descriptors, .page_object_main_info_field.main_info_field_sec_genres .genres"
      )
    ).join(", ");
    record.image = pickSrc(document.querySelector(".page_object_image img"));
    record.platforms = texts(
      document.querySelectorAll(".page_object_secondary_info_link a.platforms")
    ).join(", ");
    record.isPartial = false;
    return [record];
  }

  function extractDeveloperGames() {
    const items = [];
    document
      .querySelectorAll("#page_discography_items_game .page_discography_line")
      .forEach((line) => {
        const link = line.querySelector(".page_discography_line_1 a.game");
        if (!link) return;
        const record = baseRecord("game", link.href || "");
        record.name = text(link);
        record.ratingValue = text(line.querySelector(".page_discography_average .rating_number"));
        record.ratingCount = toNumber(text(line.querySelector(".page_discography_ratings")));
        record.reviewCount = toNumber(text(line.querySelector(".page_discography_reviews")));
        record.releaseDate = text(
          line.querySelector(".page_discography_date_year, .page_discography_date_full")
        );
        record.primaryGenres = texts(line.querySelectorAll(".page_discography_line_genre")).join(
          ", "
        );
        record.image = pickBackground(line.querySelector(".page_discography_img"));
        record.isPartial = true;
        items.push(record);
      });
    return items;
  }

  function extractInfoTable(selector) {
    const map = {};
    document.querySelectorAll(`${selector} tr`).forEach((row) => {
      const header = text(row.querySelector(".info_hdr"));
      if (!header) return;
      const value = text(row.querySelector("td"));
      map[header.trim()] = value;
    });
    return map;
  }

  function lookupPreviousLabel(el) {
    // First check siblings of the element itself
    let node = el.previousElementSibling;
    while (node) {
      const label = node.querySelector?.(".disco_header_label");
      if (label) return text(label);
      node = node.previousElementSibling;
    }

    // If not found, check siblings of the parent container
    const parent = el.parentElement;
    if (parent) {
      node = parent.previousElementSibling;
      while (node) {
        const label = node.querySelector?.(".disco_header_label");
        if (label) return text(label);
        node = node.previousElementSibling;
      }
    }

    return "";
  }

  function extractFromPipes(nodes) {
    for (const node of nodes) {
      const content = text(node);
      if (/released/i.test(content)) return content.replace(/.*Released/i, "Released").trim();
    }
    return "";
  }

  function baseRecord(mediaType, url) {
    return {
      mediaType,
      url: url || "",
      slug: slugFromUrl(url),
      updatedAt: new Date().toISOString(),
      firstSeen: new Date().toISOString(),
    };
  }

  const text = api.text || ((node) => node?.textContent?.replace(/\s+/g, " ").trim() || "");
  const texts =
    api.texts ||
    ((nodes) =>
      Array.from(nodes || [])
        .map((n) => text(n))
        .filter(Boolean));
  const toNumber = api.toNumber;
  const slugFromUrl = api.slugFromUrl;
  const pickSrc = api.pickSrc;
  const pickBackground = api.pickBackground;

  function extractMaxRating(...selectors) {
    for (const selector of selectors) {
      if (!selector) continue;
      const node = document.querySelector(selector);
      if (!node) continue;

      const candidates = [
        node.getAttribute?.("content"),
        node.getAttribute?.("aria-label"),
        node.getAttribute?.("value"),
        text(node),
      ];

      for (const raw of candidates) {
        if (!raw) continue;
        const match = String(raw).match(/(\d+(?:\.\d+)?)/);
        if (!match) continue;
        const parsed = parseFloat(match[1]);
        if (Number.isFinite(parsed)) {
          return Number.isInteger(parsed) ? parsed.toFixed(1) : String(parsed);
        }
        return match[1];
      }
    }
    return "";
  }
})();
