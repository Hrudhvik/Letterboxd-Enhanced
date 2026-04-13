# Letterboxd Enhanced — Project Context

## Overview
A Chrome Extension (Manifest V3) that enhances [Letterboxd](https://letterboxd.com/) with external ratings, poster overlays, metadata bars, friends rating histograms, list progress bars, and diary analytics.

## Architecture

```
content.js          →  Runs on letterboxd.com pages (content script)
                       Scrapes DOM, injects UI elements, handles user interaction
                       All injected CSS classes use `lbe-` prefix

background.js       →  Service worker (runs in extension background)
                       Makes API calls (TMDB, OMDb, Jikan/MAL, Wikidata, RT, Metacritic)
                       Handles caching (in-memory Map, chrome.storage.local, per-user permanent)
                       Scrapes Letterboxd film pages for TMDB/IMDb IDs, genres, runtime
                       Scrapes friends ratings pages
                       Scrapes diary pages for stats
                       Communicates with content.js via chrome.runtime.onMessage

popup.html/popup.js →  Extension popup for settings (API keys, feature toggles)
styles.css          →  All injected styles (dark theme matching Letterboxd)
manifest.json       →  MV3 config with host_permissions for all external APIs
```

## Key Patterns

### Message Passing
content.js sends messages to background.js:
- `FETCH_RATINGS` — get external ratings for a film
- `FETCH_FRIENDS_RATINGS` — get friends' ratings for a film
- `GET_KEY_STATS` — get API key usage stats
- `FETCH_DIARY_STATS` — get diary analytics data for a user+year
- `CLEAR_DIARY_CACHE` — force re-scrape of diary data

background.js always returns via `sendResponse()` with `return true` for async.

### Caching Strategy
```
In-memory Map (session) → chrome.storage.local (24h TTL) → API call
```
- `cached(key, fn)` — generic cache-through helper
- `getLocal(user, slug)` / `setLocal(user, slug, data)` — per-user permanent cache
- Cache keys are versioned (e.g. `lbe5:`, `mal:v3:`, `friends:v5:`, `diary-stats:v7:`)

### Scraping Letterboxd Pages
- Film pages: regex on HTML for `data-tmdb-id`, `imdb.com/title/`, runtime, content rating, original title
- **Note:** Genre scraping from HTML does NOT work (Letterboxd renders genres via JS). Genres are fetched via TMDB API instead.
- Friends pages: regex for `rated-N` classes in rating spans, paginated
- Diary pages: `<tr class="diary-entry-row">` rows with film slugs, dates, ratings, rewatch/review/liked status

### DOM Injection (content.js)
- `isFilmPage()` / `isReviewPage()` — detect current page type
- `isDiaryPage()` — detect `/username/diary/` pages
- Feature toggles read from `chrome.storage.sync` before injecting
- MutationObserver watches for SPA navigation (Letterboxd uses client-side routing)

### CSS Design Language
- Colors: `#14181c` (bg), `#1b2028` (card), `#2c3440` (border), `#678` (muted), `#9ab` (secondary text), `#def` (primary text)
- Accent: `#00e054` (Letterboxd green), `#40bcf4` (Letterboxd blue)
- Histogram bars: `#5f7085` (default), `#73869d` (hover)
- Diary monthly bars: `#5a6572` (new), `#FAC775` (rewatch/gold), `#8da0b4`/`#ffd68a` (active)
- Diary weekly/day-of-week bars: `#67758a` (default), `#40bcf4` (peak highlight)
- Diary selected month: `rgba(64, 188, 244, 0.10)` overlay background
- Diary expand card: `#1b2028` bg, `#2c3440` border, `6px` border-radius
- Tooltips: `#70839a` bg with `#f4f7fb` text, arrow pointer, `box-shadow: 0 4px 16px rgba(0,0,0,0.35)`
- Section headers: `font-size: 11px; font-weight: 500; letter-spacing: 2px; color: #9ab; text-transform: uppercase`
- Font: `'Graphik-Regular-Web', 'Helvetica Neue', Helvetica, Arial, sans-serif`

## Feature Toggles (popup.html → chrome.storage.sync)
- `togglePoster` — Poster overlay on film pages + grid info cards
- `toggleRatings` — Sidebar ratings panel
- `toggleMeta` — Metadata bar under title
- `toggleFriendsHisto` — Friends rating histogram
- `toggleListProgress` — List progress bars
- `toggleDiaryStats` — Diary page analytics panel

## External APIs Used
| Service | Key Required | Usage |
|---------|-------------|-------|
| TMDB | Yes (user provides) | Primary film lookup, genres, runtime, IMDb ID |
| OMDb | Optional (user provides) | RT, Metacritic, IMDb scores |
| Jikan/MAL | No | Anime ratings (free public API) |
| Wikidata SPARQL | No | Discover RT/MC/MAL slugs |
| Rotten Tomatoes | No (scrape) | Direct score scraping |
| Metacritic | No (scrape) | Direct score scraping |
| Letterboxd | No (scrape) | Film pages, friends ratings, diary pages |

## Diary Stats Feature

### Data Collection
- Scrapes `/{username}/films/diary/for/{YYYY}/page/N/` pages from background.js
- Each diary entry provides: film slug, title, year, watched date, rating (1-10 half-stars), rewatch flag, review flag, liked flag
- Paginated scraping with up to 50 pages (safety cap)

### Diary HTML Parsing
- Rows: `<tr class="diary-entry-row">`
- Film slug: `data-item-slug` attribute or `/film/{slug}/` link
- Title: `<h3 class="headline-3"><a>Title</a></h3>` or `data-item-name`
- Date: `/diary/for/YYYY/MM/DD/` links within the row
- Rating: `rated-N` class on `<span>` (N/2 = star rating)
- Rewatch: `<td>` with `rewatch` class — active when it does NOT have `icon-status-off`
- Review: `<td>` with `review` class — active when it does NOT have `icon-status-off`
- Liked: row contains `\bicon-liked\b` (word boundary match — `icon-like` without 'd' = not liked)

### Genre & Runtime Enrichment
- Genres cannot be scraped from Letterboxd HTML (rendered client-side by JS)
- Instead: scrape Letterboxd page → get TMDB ID → call `tmdbById()` → get genres + runtime
- Uses existing `cached()` system so TMDB calls are cached across features
- Films already visited via normal browsing will have cached TMDB data

### Stats Computed
**Yearly overview:**
- Total films, avg rating, per-month average, rewatch count, liked count, review count, total runtime (hours)
- Top 5 genres with counts (from TMDB API data)
- Monthly histogram with new/rewatch stacked bars

**Monthly expanded (click a month bar):**
- Day-of-week distribution histogram (Sun–Sat)
- Avg rating, most watched day, rewatches, liked, reviews for that month

**Weekly view:**
- 53-element array of films per ISO week
- Peak week highlighted with count, week number, and date range

**Yearly day-of-week view:**
- 7-element aggregate across all months (Mon–Sun, reordered from JS Sun=0)
- Peak day highlighted with count label

### UI Structure
- Toggle: three-button segmented control (Monthly | Weekly | Day) switches between views
- Monthly view: stacked vertical bars, clickable to expand detail card
- Weekly view: 52 thin vertical bars with peak highlight
- Day-of-week view: horizontal bars with peak highlight
- Year navigation: `‹` `›` arrows, refresh button
- Expand section: visually distinct card (`#1b2028` bg, border, border-radius)

### Caching
- Key: `diary-stats:v7:{username}:{year}`
- TTL: 1 hour
- Refresh button sends `CLEAR_DIARY_CACHE` then re-fetches
- TMDB film data cached via existing `tmdb:{type}:{id}` keys (shared with ratings feature)

### Performance
- Diary scraping: 1 fetch per page (~50 entries per page)
- Film enrichment: 1 Letterboxd scrape + 1 TMDB call per unique film (most cached from normal browsing)
- Throttled: 150ms delay every 5 films during enrichment
- Shows loading spinner during initial scan
- Subsequent visits use cached stats (1h TTL)

## File Structure
```
letterboxd-enhanced/
├── manifest.json       # MV3 config
├── background.js       # Service worker — APIs, caching, scraping, diary stats
├── content.js          # Content script — DOM injection, diary stats UI
├── styles.css          # All injected styles
├── popup.html          # Settings popup
├── popup.js            # Settings logic
├── icons/              # Extension icons
├── README.md           # User-facing documentation
└── LICENSE             # MIT
```
