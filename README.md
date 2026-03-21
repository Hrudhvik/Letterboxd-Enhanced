# 🎬 Letterboxd Enhanced

A Chrome extension that enhances [Letterboxd](https://letterboxd.com/) with external ratings, a poster overlay, rearranged metadata, friends' rating histograms, and list progress bars on every page.

![Chrome](https://img.shields.io/badge/Chrome-Manifest%20V3-green) ![License](https://img.shields.io/badge/license-MIT-blue)

## Features

### 📊 Sidebar Ratings Panel
Displays ratings from multiple sources in the sidebar of any film page:
- **IMDb** — score + vote count
- **Rotten Tomatoes** — Fresh/Rotten percentage
- **Metacritic** — score with color coding
- **MyAnimeList** — score + member count (anime/donghua only)

Only ratings that are available are shown — no empty placeholders.

### 🎬 Poster Overlay
Hover over the film poster on any film page to see a clean overlay with:
- Film title, year, runtime, content rating
- Letterboxd star rating
- External ratings (I, R, M, MC badges)
- Genre tags

### ℹ️ Grid Info Cards
On activity feeds, lists, watchlists, and profile pages — hover the ⓘ button on any poster thumbnail to see a pop-out info card with ratings and metadata. Data is fetched on-demand (only when you hover) to save API calls.

### 🏷️ Metadata Bar
Moves runtime, content rating (PG, R, etc.), and genre tags directly under the film title for quick scanning. Themes, studios, and other non-genre data are excluded.

### 👥 Friends Rating Histogram
Scrapes your friends' ratings for each film and displays a histogram with average score — similar to Letterboxd's own ratings section but for your friends circle.

### 📋 List Progress Bars
Shows your watch progress for every list across all Letterboxd pages — not just the list detail page. A thin progress bar with "You've watched X of Y" text appears under list thumbnails on:
- **Home page** — "New from friends" and "Popular with friends" sections
- **Activity page** — list mentions in the activity feed
- **Profile page** — the Lists tab
- **/username/lists/** — the dedicated lists page
- **Anywhere else** lists appear (search results, tag pages, etc.)

Progress data is fetched from each list's detail page in the background using your logged-in session, with in-memory caching to avoid redundant requests.

---

## Screenshots

<img width="728" height="955" alt="image" src="https://github.com/user-attachments/assets/e470a4cd-f7b8-47f8-9f3a-e5e4931def59" />
<img width="1919" height="977" alt="image" src="https://github.com/user-attachments/assets/4662a1fd-88e8-4a6f-84b8-3d3830e92c54" />
<img width="610" height="356" alt="image" src="https://github.com/user-attachments/assets/df5e131c-b63a-44a7-8076-ac875c73eba5" />
<img width="1415" height="330" alt="image" src="https://github.com/user-attachments/assets/6d66036b-cda1-49f9-8213-ea6c4916ef30" />


---

## Installation

### 1. Get API Keys (free)

| Service | URL | Required? | What it provides |
|---------|-----|-----------|-----------------|
| **TMDB** | [themoviedb.org/settings/api](https://www.themoviedb.org/settings/api) | **Yes** | Primary film lookup — finds any film worldwide (Indian, Korean, Japanese, etc.) |
| **OMDb** | [omdbapi.com/apikey.aspx](https://www.omdbapi.com/apikey.aspx) | Optional | Adds Rotten Tomatoes + Metacritic scores. Free tier: 1,000 req/day |
| **Jikan** | — | No key needed | MyAnimeList ratings (free public API) |

> **TMDB is the primary source.** It provides excellent international coverage and returns the IMDb ID for each film, which is then used to fetch OMDb data by exact ID (no title-matching issues).

### 2. Clone or Download

```bash
git clone https://github.com/YOUR_USERNAME/letterboxd-enhanced.git
```

Or download and unzip the repository.

### 3. Load in Chrome

1. Open `chrome://extensions/`
2. Enable **Developer mode** (toggle in top-right)
3. Click **Load unpacked**
4. Select the project folder (the one containing `manifest.json`)

### 4. Configure API Keys

1. Click the extension icon in Chrome's toolbar (puzzle piece → Letterboxd Enhanced)
2. Paste your **TMDB API key** (required)
3. Optionally paste **OMDb API key(s)** — supports multiple keys comma-separated for rotation
4. Click **Save Settings**

### 5. Test It

1. Go to [letterboxd.com/film/your-name/](https://letterboxd.com/film/your-name/)
2. You should see:
   - Metadata bar (runtime + genres) under the title
   - Sidebar ratings panel (IMDb, RT, MAL, Metacritic)
   - Hover the poster for the overlay
3. Go to your activity feed — hover the ⓘ on any poster
4. Go to your home page — list progress bars should appear under list thumbnails in "New from friends" and "Popular with friends"

---

## Architecture

```
content.js                          background.js
─────────────                       ──────────────
Scrapes from Letterboxd DOM:        API calls (runs in service worker):
• data-tmdb-id attribute     ───►   1. TMDB /movie/{id} (by TMDB ID)
• IMDb link in footer               2. OMDb ?i={imdbId} (by IMDb ID)
• Title, year, genres               3. Jikan search (anime only)
• Letterboxd rating                  4. Friends page scrape
                                    
Injects into page:                  Caching:
• Metadata bar                      • In-memory (session)
• Sidebar ratings panel             • chrome.storage.local (24h)
• Poster overlay                    • Per-user local cache (permanent)
• Grid info cards                   • OMDb key rotation + exhaustion
• Friends histogram
• List progress bars
```

### How Film Lookup Works

1. **content.js** scrapes the TMDB ID directly from Letterboxd's DOM (`data-tmdb-id` attribute) and the IMDb ID from footer links
2. Sends both IDs to **background.js** — no title search needed for film pages
3. **background.js** calls TMDB by exact ID → gets genres, original title, IMDb ID confirmation
4. Calls OMDb by exact IMDb ID → gets IMDb score, Rotten Tomatoes, Metacritic
5. If the film is Animation genre → searches Jikan (MAL) with the original title first (e.g. "君の名は。"), falls back to English title
6. Results are cached at three levels: in-memory, chrome.storage.local (24h), and per-user permanent cache

For **grid posters** (activity, lists) that may not have TMDB IDs in the DOM, it falls back to TMDB title search.

### How List Progress Works

1. **content.js** scans the page for any `<a>` tag whose `href` matches the `/username/list/list-slug/` pattern and contains poster images
2. Deduplicates by list URL + DOM position — one bar per visual card, even if the same list appears in multiple sections
3. Fetches each list's detail page in the background using `fetch()` with same-origin credentials
4. Extracts progress data using a 4-tier approach:
   - Native `.progress-panel` selectors (Letterboxd's own progress UI)
   - `[data-progress]` attributes
   - "You've watched X of Y" text regex
   - Manual poster overlay counting as a last resort
5. Injects a minimal progress bar (4px track + text) after the poster collage link
6. Results are cached in-memory per session to avoid redundant fetches

---

## File Structure

```
letterboxd-enhanced/
├── manifest.json       # Extension config (Manifest V3)
├── background.js       # Service worker — API calls, caching, key rotation
├── content.js          # Content script — DOM scraping + injection
├── styles.css          # Injected styles (matches Letterboxd dark theme)
├── popup.html          # Settings popup UI
├── popup.js            # Settings logic
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md
```

## API Usage & Caching

### TMDB (primary)
- 1 call per film (by ID) — very efficient
- Free tier: rate-limited but no hard daily cap
- Provides: film details, genres, IMDb ID, original title, TMDB rating

### OMDb (optional, for RT/Metacritic)
- 1 call per film (by IMDb ID — never fails on title matching)
- Free tier: 1,000 requests/day per key
- Supports multiple keys with automatic rotation and daily exhaustion tracking
- Provides: IMDb score, Rotten Tomatoes, Metacritic

### Jikan / MAL (no key needed)
- Only called for Animation genre films
- Searches with original title first (Japanese/Chinese/Korean), then English
- Strict title matching prevents false positives
- Provides: MAL score, member count, direct link

### List Progress (no API needed)
- Fetches Letterboxd list pages directly using your session cookies
- 1 fetch per unique list URL, staggered 200ms apart to avoid hammering the server
- Cached in-memory for the session — revisiting a page costs zero fetches
- No external APIs or keys required

### Caching Strategy
```
Hover/visit a film
  → In-memory cache (instant, lasts until tab close)
    → Per-user local cache (instant, permanent by username+slug)
      → chrome.storage.local (24h TTL)
        → API call (only if all caches miss)
          → Saved to all cache layers
```

Once you've visited a film, revisiting it costs **zero API calls** — even months later.

---

## Configuration

All settings are in the popup (click the extension icon):

| Setting | Description |
|---------|-------------|
| TMDB API Key | **Required.** Primary source for all film lookups |
| OMDb API Keys | Optional. Comma-separated. Adds RT + Metacritic. Auto-rotates when daily limit hit |
| Poster Overlay | Toggle the hover overlay on film page posters |
| Sidebar Ratings | Toggle the external ratings panel in the sidebar |
| Metadata Bar | Toggle the runtime/genre/rating bar under the title |
| Friends Histogram | Toggle the friends' rating histogram |
| List Progress Bars | Toggle list watch progress bars on all pages |

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| No ratings showing | Check TMDB key is set. Open DevTools Console → look for lines starting with `LBE:` |
| Only MAL showing, no IMDb/RT | OMDb key missing or exhausted. IMDb score still shows via TMDB fallback |
| Wrong MAL result | Clear extension storage → `chrome://extensions/` → Details → Clear storage |
| Poster overlay not appearing | Reload extension + hard refresh (`Ctrl+Shift+R`). Check console for errors |
| "here" showing as a genre | Update to latest version — fixed in genre scraping filter |
| Stale/wrong cached data | Clear storage: `chrome://extensions/` → Letterboxd Enhanced → Details → Clear storage |
| List progress bars not showing | Must be logged in. Check console for `LBE: List Progress` logs. If 0 candidates found, the page may not have list links |
| Duplicate progress bars | Hard refresh (`Ctrl+Shift+R`) to clear stale injected elements |
| Extension disappeared after Chrome update | Go to `chrome://extensions/` → re-enable or re-load unpacked |

---

## Development

### Updating
Replace the files in the folder and click the **reload** button on `chrome://extensions/`. No reinstall needed.

### Cache Key Versioning
Cache keys are prefixed with version numbers (`lbe3:`, `mal:v3:`, etc.). When changing data format, bump the version to auto-invalidate old cached entries.

### CSS Class Prefix
All injected CSS classes use the `lbe-` prefix to avoid conflicts with Letterboxd's own styles.

---

## Credits & Acknowledgments

This extension was inspired by and borrows ideas from these projects:

- **[Letterboxd-Extras](https://github.com/duncanlang/Letterboxd-Extras)** by duncanlang — The approach of scraping TMDB IDs and IMDb IDs directly from Letterboxd's DOM, sidebar ratings panel design, and the overall architecture of fetching external ratings was inspired by this extension.
- **[letterboxd-userscripts](https://github.com/frozenpandaman/letterboxd-userscripts)** by frozenpandaman — Inspiration for the poster overlay concept and metadata rearrangement features.
- **[Letterboxd Lists Progress](https://www.crx4chrome.com/extensions/cjpnlmdbmlefonmfkobjpfpmpbaijldn/)** by Lucas Franco — Original concept for displaying list progress bars outside the list detail page.

### Data Sources
- [TMDB](https://www.themoviedb.org/) — primary film data source
- [OMDb API](https://www.omdbapi.com/) — IMDb, Rotten Tomatoes, Metacritic scores
- [Jikan](https://jikan.moe/) — unofficial MyAnimeList API

## License

MIT
