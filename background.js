// background.js — Letterboxd Enhanced
// When grid posters lack IDs: fetch letterboxd.com/film/{slug}/ to scrape TMDB/IMDb IDs

let OMDB_KEYS = [];
let TMDB_API_KEY = "";
let keyStats = {};

function parseOmdbKeys(raw) { return (raw || "").split(/[,\n]+/).map(k => k.trim()).filter(k => k.length > 0 && k !== "YOUR_OMDB_API_KEY"); }
function getOmdbKey() {
  const now = Date.now(), today = new Date().toDateString();
  for (const k of Object.keys(keyStats)) { if (keyStats[k].day !== today) keyStats[k] = { used: 0, exhaustedUntil: 0, day: today }; }
  const a = OMDB_KEYS.filter(k => !keyStats[k] || keyStats[k].exhaustedUntil <= now);
  if (!a.length) return OMDB_KEYS[0] || null;
  a.sort((x, y) => (keyStats[x]?.used || 0) - (keyStats[y]?.used || 0));
  return a[0];
}
function markUsed(k) { const d = new Date().toDateString(); if (!keyStats[k] || keyStats[k].day !== d) keyStats[k] = { used: 0, exhaustedUntil: 0, day: d }; keyStats[k].used++; }
function markExhausted(k) { const d = new Date().toDateString(); if (!keyStats[k]) keyStats[k] = { used: 0, exhaustedUntil: 0, day: d }; const t = new Date(); t.setHours(24, 1, 0, 0); keyStats[k].exhaustedUntil = t.getTime(); }

chrome.storage.sync.get({ omdbKey: "", tmdbKey: "" }, s => { OMDB_KEYS = parseOmdbKeys(s.omdbKey); TMDB_API_KEY = s.tmdbKey || ""; });
chrome.storage.onChanged.addListener((c, a) => { if (a === "sync") { if (c.omdbKey?.newValue) { OMDB_KEYS = parseOmdbKeys(c.omdbKey.newValue); keyStats = {}; } if (c.tmdbKey?.newValue) TMDB_API_KEY = c.tmdbKey.newValue; } });

// ── Cache ────────────────────────────────────────────────────────
async function getLocal(user, slug) {
  if (!user || !slug) return null;
  try { const s = await chrome.storage.local.get(`lbe4:${user}:${slug}`); return s[`lbe4:${user}:${slug}`] || null; } catch (e) { return null; }
}
async function setLocal(user, slug, data) {
  if (!user || !slug) return;
  try { await chrome.storage.local.set({ [`lbe4:${user}:${slug}`]: { ...data, ts: Date.now() } }); } catch (e) {}
}
const mem = new Map(), TTL = 86400000;
async function cached(key, fn) {
  const m = mem.get(key);
  if (m && Date.now() - m.ts < TTL) return m.data;
  try { const s = await chrome.storage.local.get(key); if (s[key] && Date.now() - s[key].ts < TTL) { mem.set(key, s[key]); return s[key].data; } } catch (e) {}
  const data = await fn(), entry = { data, ts: Date.now() }; mem.set(key, entry);
  try { await chrome.storage.local.set({ [key]: entry }); } catch (e) {}
  return data;
}

// ══════════════════════════════════════════════════════════════════
// SCRAPE Letterboxd film page to get TMDB ID + IMDb ID
// This is how Letterboxd-Extras does it for grid posters
// ══════════════════════════════════════════════════════════════════
async function scrapeLetterboxdPage(filmSlug) {
  if (!filmSlug) return { tmdbId: null, imdbId: null, genres: [], runtime: null, contentRating: null };
  try {
    const url = `https://letterboxd.com/film/${filmSlug}/`;
    console.log("LBE: scraping", url);
    const res = await fetch(url);
    const html = await res.text();

    let tmdbId = null, imdbId = null;

    // IDs via regex (these are reliable — simple patterns)
    const tmdbMatch = html.match(/data-tmdb-id="(\d+)"/);
    if (tmdbMatch) tmdbId = tmdbMatch[1];
    const imdbMatch = html.match(/imdb\.com\/title\/(tt\d+)/);
    if (imdbMatch) imdbId = imdbMatch[1];
    if (!tmdbId) { const m = html.match(/themoviedb\.org\/movie\/(\d+)/); if (m) tmdbId = m[1]; }

    // Extract genres via regex
    // Letterboxd HTML pattern: <a class="text-slug" href="/films/genre/action/">Action</a>
    // OR inside tab: href="/films/genre/crime/">Crime</a>
    const genres = [];
    const genreRe = /href="\/films\/genre\/[^"]+">([^<]+)<\/a>/g;
    let gm;
    while ((gm = genreRe.exec(html)) !== null) {
      const name = gm[1].trim();
      if (name && name.length < 30 && !genres.includes(name)) genres.push(name);
    }

    // Extract runtime — Letterboxd puts it as "X mins" or "Xmins" in the page
    // Also appears in <p class="text-link text-footer">106 mins</p>
    let runtime = null;
    const rtMatch = html.match(/(\d{2,4})\s*&nbsp;mins|(\d{2,4})\s+mins|>(\d{2,4})\s*mins</);
    if (rtMatch) {
      const mins = parseInt(rtMatch[1] || rtMatch[2] || rtMatch[3]);
      if (mins > 0 && mins < 1000) {
        const h = Math.floor(mins / 60);
        runtime = h > 0 ? `${h}h ${mins % 60}min` : `${mins}min`;
      }
    }

    // Content rating — <a href="/films/rated/r/">R</a> or /rated/pg-13/
    let contentRating = null;
    const ratedRe = /href="\/films\/rated\/([^"]+)"[^>]*>([^<]+)<\/a>/g;
    let rm;
    while ((rm = ratedRe.exec(html)) !== null) {
      const t = rm[2].trim();
      if (/^(G|PG|PG-13|R|NC-17|NR|TV-MA|TV-14|TV-PG|U|UA|A|12A|12|15|18)$/i.test(t)) {
        contentRating = t;
        break;
      }
    }

    console.log("LBE: scraped", filmSlug, "→ tmdb:", tmdbId, "imdb:", imdbId, "genres:", genres, "runtime:", runtime, "rated:", contentRating);
    return { tmdbId, imdbId, genres, runtime, contentRating };
  } catch (e) {
    console.error("LBE: scrape error", filmSlug, e);
    return { tmdbId: null, imdbId: null, genres: [], runtime: null, contentRating: null };
  }
}

// ── TMDB by ID ───────────────────────────────────────────────────
async function tmdbById(tmdbId) {
  if (!TMDB_API_KEY || !tmdbId) return null;
  try {
    const r = await fetch(`https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${TMDB_API_KEY}&append_to_response=external_ids`);
    const d = await r.json();
    if (d.success === false) return null;
    console.log("LBE: TMDB", tmdbId, "→", d.title, "imdb:", d.imdb_id || d.external_ids?.imdb_id);
    const mins = parseInt(d.runtime);
    const runtime = mins > 0
      ? `${Math.floor(mins / 60)}h ${mins % 60}min`.replace(/^0h\s*/, "")
      : null;
    return {
      tmdbRating: d.vote_average ? d.vote_average.toFixed(1) : null,
      tmdbVotes: d.vote_count,
      imdbId: d.imdb_id || d.external_ids?.imdb_id || null,
      genres: (d.genres || []).map(g => g.name),
      runtime,
      originalTitle: d.original_title || null,
      originalLanguage: d.original_language || null,
    };
  } catch (e) { return null; }
}

// ── TMDB by title search (last resort) ───────────────────────────
async function tmdbByTitle(title, year) {
  if (!TMDB_API_KEY || !title) return null;
  try {
    const sp = new URLSearchParams({ api_key: TMDB_API_KEY, query: title, include_adult: false });
    if (year) sp.append("year", year);
    const sr = await fetch(`https://api.themoviedb.org/3/search/movie?${sp}`);
    const sd = await sr.json();
    if (!sd.results?.length) return null;
    let best = sd.results[0];
    if (year) { for (const r of sd.results) { if (r.release_date?.startsWith(year)) { best = r; break; } } }
    return tmdbById(best.id);
  } catch (e) { return null; }
}

// ── OMDb by IMDb ID ──────────────────────────────────────────────
async function omdbById(imdbId, retry = 0) {
  if (!OMDB_KEYS.length || !imdbId) return null;
  const key = getOmdbKey();
  if (!key) return null;
  try {
    const res = await fetch(`https://www.omdbapi.com/?apikey=${key}&i=${imdbId}`);
    const d = await res.json();
    if (d.Response === "False") {
      const err = (d.Error || "").toLowerCase();
      if (err.includes("limit") || err.includes("daily") || err.includes("invalid")) {
        markExhausted(key);
        if (retry < OMDB_KEYS.length - 1) return omdbById(imdbId, retry + 1);
      }
      return null;
    }
    markUsed(key);
    const result = {};
    if (d.imdbRating && d.imdbRating !== "N/A") result.imdb = { score: d.imdbRating, votes: d.imdbVotes, url: `https://www.imdb.com/title/${imdbId}/` };
    const rt = (d.Ratings || []).find(r => r.Source === "Rotten Tomatoes");
    if (rt) result.rt = { score: rt.Value, url: `https://www.rottentomatoes.com/search?search=${encodeURIComponent(d.Title || "")}` };
    if (d.Metascore && d.Metascore !== "N/A") result.mc = { score: d.Metascore };
    return result;
  } catch (e) { return null; }
}

// ── Helpers ──────────────────────────────────────────────────────
function wordSim(a, b) {
  const wa = new Set(a.toLowerCase().split(/\s+/).filter(w => w.length > 1));
  const wb = new Set(b.toLowerCase().split(/\s+/).filter(w => w.length > 1));
  if (!wa.size || !wb.size) return 0;
  let o = 0; for (const w of wa) { if (wb.has(w)) o++; }
  return o / Math.max(wa.size, wb.size);
}

// ── MAL ──────────────────────────────────────────────────────────
// Approach from Letterboxd-Extras: search Jikan with original_title,
// match against all title variants (title, title_english, title_japanese, synonyms).
// Works for Japanese anime, Chinese donghua, Korean animation, etc.

async function fetchMAL(title, originalTitle, year) {
  // Strategy: try original title first (more likely to match on MAL),
  // then English title as fallback
  const searches = [];
  if (originalTitle && originalTitle !== title) searches.push(originalTitle);
  searches.push(title);

  for (const q of searches) {
    const result = await malSearch(q, title, originalTitle, year);
    if (result) return result;
  }
  return null;
}

async function malSearch(query, englishTitle, originalTitle, year) {
  try {
    const p = new URLSearchParams({ q: query, type: "movie", limit: 10 });
    const r = await fetch(`https://api.jikan.moe/v4/anime?${p}`);
    const d = await r.json();
    if (!d.data?.length) return null;

    // Normalize: strip punctuation, lowercase
    const norm = s => (s || "").toLowerCase().replace(/[^\w\s\u3000-\u9fff\uac00-\ud7af\uff00-\uffef]/g, "").trim();
    const englishNorm = norm(englishTitle);
    const originalNorm = norm(originalTitle);

    let best = null, bestScore = 0;

    for (const item of d.data) {
      if (!item.score) continue;

      // Collect all title variants from MAL
      const malTitles = [
        item.title,
        item.title_english,
        item.title_japanese,
        ...(item.title_synonyms || [])
      ].filter(Boolean);

      let matchScore = 0;

      for (const mt of malTitles) {
        const mtNorm = norm(mt);

        // Exact match against English title
        if (mtNorm === englishNorm) { matchScore = 100; break; }
        // Exact match against original title
        if (originalNorm && mtNorm === originalNorm) { matchScore = 100; break; }

        // Partial: one contains the other (both > 3 chars, shorter >= 50% of longer)
        for (const candidate of [englishNorm, originalNorm].filter(Boolean)) {
          if (candidate.length > 3 && mtNorm.length > 3) {
            if (mtNorm.includes(candidate) || candidate.includes(mtNorm)) {
              const ratio = Math.min(candidate.length, mtNorm.length) / Math.max(candidate.length, mtNorm.length);
              if (ratio >= 0.5) matchScore = Math.max(matchScore, 60);
            }
          }
        }

        // Word overlap similarity
        for (const candidate of [englishNorm, originalNorm].filter(Boolean)) {
          const sim = wordSim(candidate, mtNorm);
          if (sim >= 0.7) matchScore = Math.max(matchScore, 70);
        }
      }

      if (matchScore === 0) continue;

      // Year bonus
      const ay = item.aired?.from ? new Date(item.aired.from).getFullYear() : null;
      if (ay && year && ay === parseInt(year)) matchScore += 20;

      if (matchScore > bestScore) { bestScore = matchScore; best = item; }
    }

    if (!best) return null;
    console.log("LBE: MAL matched", query, "→", best.title, "score:", bestScore);
    return { score: best.score.toFixed(1), members: best.members, url: best.url, title: best.title };
  } catch (e) { return null; }
}

// ── Friends Ratings — scrape from Letterboxd ─────────────────────
// Fetches /film/{slug}/friends/rated/ to get friends' individual ratings
// and computes a histogram + average.
// Supports pagination — Letterboxd shows ~30 friends per page.
async function scrapeFriendsRatings(filmSlug, username) {
  if (!filmSlug || !username) return { ratings: [], avg: null, count: 0, histogram: {} };
  try {
    const allRatings = [];
    let page = 1;
    const maxPages = 20; // safety cap

    while (page <= maxPages) {
      const url = page === 1
        ? `https://letterboxd.com/${username}/friends/film/${filmSlug}/`
        : `https://letterboxd.com/${username}/friends/film/${filmSlug}/page/${page}/`;
      console.log("LBE: fetching friends ratings", url);
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) break;
      const html = await res.text();

      const pageRatings = [];

      // Primary parser: rating classes like rated-8 inside rating spans.
      const ratingSpanRe = /<span[^>]+class="[^"]*rating[^"]*\brated-(\d{1,2})\b[^"]*"[^>]*>/g;
      let rm;
      while ((rm = ratingSpanRe.exec(html)) !== null) {
        const n = parseInt(rm[1], 10);
        if (n >= 1 && n <= 10) pageRatings.push(n / 2);
      }

      // Fallback parser: visible star glyphs from the friends page body.
      if (pageRatings.length === 0) {
        const starRe = /(★★★★★|★★★★½|★★★★|★★★½|★★★|★★½|★★|★½|★)/g;
        const map = {
          "★": 1, "★½": 1.5, "★★": 2, "★★½": 2.5, "★★★": 3,
          "★★★½": 3.5, "★★★★": 4, "★★★★½": 4.5, "★★★★★": 5,
        };
        let sm;
        while ((sm = starRe.exec(html)) !== null) {
          const val = map[sm[1]];
          if (val) pageRatings.push(val);
        }
      }

      if (pageRatings.length === 0) break;
      allRatings.push(...pageRatings);

      const hasNext = html.includes(`/friends/film/${filmSlug}/page/${page + 1}/`) || html.includes('class="next"');
      if (!hasNext) break;
      page++;
    }

    // Build histogram (0.5 to 5.0 in 0.5 steps)
    const histogram = {};
    for (let i = 1; i <= 10; i++) histogram[i / 2] = 0;
    allRatings.forEach(r => { if (histogram[r] !== undefined) histogram[r]++; });

    const count = allRatings.length;
    const avg = count > 0 ? (allRatings.reduce((a, b) => a + b, 0) / count) : null;

    console.log("LBE: friends ratings", filmSlug, "count:", count, "avg:", avg?.toFixed(2), "histogram:", JSON.stringify(histogram));
    return { ratings: allRatings, avg, count, histogram };
  } catch (e) {
    console.error("LBE: friends ratings error", e);
    return { ratings: [], avg: null, count: 0, histogram: {} };
  }
}

// ── Combined fetch ───────────────────────────────────────────────
async function fetchAllRatings(title, year, tmdbId, imdbId, filmSlug) {
  console.log("LBE: fetch", title, year, "tmdb:", tmdbId, "imdb:", imdbId, "slug:", filmSlug);

  // Step 0: Scrape the Letterboxd film page whenever we have a slug.
  // Grid cards need runtime / genres even when a TMDB ID is already present.
  let scrapedData = null;
  if (filmSlug) {
    scrapedData = await cached(`scrape:v2:${filmSlug}`, () => scrapeLetterboxdPage(filmSlug));
    if (!tmdbId && scrapedData.tmdbId) tmdbId = scrapedData.tmdbId;
    if (!imdbId && scrapedData.imdbId) imdbId = scrapedData.imdbId;
  }

  // Step 1: TMDB
  let tmdb = null;
  if (tmdbId) {
    tmdb = await cached(`tmdb:${tmdbId}`, () => tmdbById(tmdbId));
  } else if (title) {
    tmdb = await cached(`tmdb:s:${title}|${year}`, () => tmdbByTitle(title, year));
  }

  // Step 2: Resolve IMDb ID
  const resolvedImdbId = imdbId || tmdb?.imdbId || null;

  // Step 3: OMDb
  let omdb = null;
  if (resolvedImdbId) {
    omdb = await cached(`omdb:${resolvedImdbId}`, () => omdbById(resolvedImdbId));
  }

  // Step 4: MAL — any animation (Japanese, Chinese donghua, Korean, etc.)
  let mal = null;
  const isAnimation = tmdb?.genres?.some(g => /animation/i.test(g));
  if (isAnimation) {
    mal = await cached(`mal:v3:${title}|${year}`, () => fetchMAL(title, tmdb?.originalTitle, year));
  }

  const result = {
    imdb: omdb?.imdb || null,
    rt: omdb?.rt || null,
    mc: omdb?.mc || null,
    mal: mal,
    // Extra info for grid/info cards.
    // Prefer Letterboxd scrape for genres/content rating, then fall back to TMDB runtime/genres.
    genres: scrapedData?.genres?.length ? scrapedData.genres : (tmdb?.genres || []),
    runtime: scrapedData?.runtime || tmdb?.runtime || null,
    contentRating: scrapedData?.contentRating || null,
  };

  // Fallback: TMDB rating if no OMDb IMDb score
  if (!result.imdb && tmdb?.tmdbRating && tmdb.tmdbRating !== "0.0") {
    result.imdb = {
      score: tmdb.tmdbRating,
      votes: tmdb.tmdbVotes ? `${Math.round(tmdb.tmdbVotes / 1000)}K` : "",
      url: resolvedImdbId ? `https://www.imdb.com/title/${resolvedImdbId}/` : "#",
    };
  }

  console.log("LBE: result", JSON.stringify(result));
  return result;
}

// ── Message handler ──────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "FETCH_RATINGS") {
    const { title, year, username, filmSlug, tmdbId, imdbId } = msg;
    (async () => {
      const local = await getLocal(username, filmSlug);
      if (local && local.imdb !== undefined) {
        sendResponse({ ...local, error: null, cached: true });
        return;
      }
      try {
        const result = await fetchAllRatings(title, year, tmdbId, imdbId, filmSlug);
        if (username && filmSlug) await setLocal(username, filmSlug, result);
        sendResponse({ ...result, error: null, cached: false });
      } catch (err) {
        console.error("LBE: error", err);
        sendResponse({ imdb: null, rt: null, mc: null, mal: null, error: err.message });
      }
    })();
    return true;
  }

  // Friends ratings — scrape from Letterboxd's activity-from-friends page
  if (msg.type === "FETCH_FRIENDS_RATINGS") {
    const { filmSlug, username } = msg;
    (async () => {
      try {
        const result = await cached(`friends:v3:${username}:${filmSlug}`, () => scrapeFriendsRatings(filmSlug, username));
        sendResponse(result);
      } catch (err) {
        sendResponse({ ratings: [], avg: null, count: 0 });
      }
    })();
    return true;
  }

  if (msg.type === "GET_KEY_STATS") {
    sendResponse({
      keys: OMDB_KEYS.map(k => ({ key: k.slice(0, 4) + "****", used: keyStats[k]?.used || 0, exhausted: (keyStats[k]?.exhaustedUntil || 0) > Date.now() })),
      totalKeys: OMDB_KEYS.length,
      tmdbConfigured: !!TMDB_API_KEY,
    });
    return false;
  }
});
