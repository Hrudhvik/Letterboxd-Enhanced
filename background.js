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
  try { const s = await chrome.storage.local.get(`lbe5:${user}:${slug}`); return s[`lbe5:${user}:${slug}`] || null; } catch (e) { return null; }
}
async function setLocal(user, slug, data) {
  if (!user || !slug) return;
  try { await chrome.storage.local.set({ [`lbe5:${user}:${slug}`]: { ...data, ts: Date.now() } }); } catch (e) {}
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
  if (!filmSlug) return { tmdbId: null, imdbId: null, tmdbType: null, genres: [], runtime: null, contentRating: null, originalTitle: null };
  try {
    const url = `https://letterboxd.com/film/${filmSlug}/`;
    console.log("LBE: scraping", url);
    const res = await fetch(url);
    const html = await res.text();

    let tmdbId = null, imdbId = null, tmdbType = null;

    // IDs via regex (these are reliable — simple patterns)
    const tmdbMatch = html.match(/data-tmdb-id="(\d+)"/);
    if (tmdbMatch) {
      tmdbId = tmdbMatch[1];
      const typeMatch = html.match(/data-tmdb-type="([^"]+)"/);
      if (typeMatch) tmdbType = typeMatch[1];
    }
    const imdbMatch = html.match(/imdb\.com\/title\/(tt\d+)/);
    if (imdbMatch) imdbId = imdbMatch[1];
    if (!tmdbId) { const m = html.match(/themoviedb\.org\/(movie|tv)\/(\d+)/); if (m) { tmdbType = m[1]; tmdbId = m[2]; } }

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
    // Original title
    let originalTitle = null;
    const otMatch = html.match(/<em[^>]*class="[^"]*originalTitle[^"]*"[^>]*>([^<]+)<\/em>/i);
      if (otMatch) {
         originalTitle = otMatch[1].trim();
      }
      if (!originalTitle) {
        const altRe = /<h3><span>Alternative Titles<\/span><\/h3>\s*<div[^>]*>\s*<p>(.*?)<\/p>/is;
        const otMatchAlt = html.match(altRe);
        if (otMatchAlt) {
           originalTitle = otMatchAlt[1].split(',')[0].trim();
        }
      }

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

    console.log("LBE: scraped", filmSlug, "→ tmdb:", tmdbId, "imdb:", imdbId, "genres:", genres, "runtime:", runtime, "rated:", contentRating, "originalTitle:", originalTitle);
    return { tmdbId, imdbId, tmdbType, genres, runtime, contentRating, originalTitle };
  } catch (e) {
    console.error("LBE: scrape error", filmSlug, e);
    return { tmdbId: null, imdbId: null, genres: [], runtime: null, contentRating: null };
  }
}

// ── TMDB by ID ───────────────────────────────────────────────────
async function tmdbById(tmdbId, tmdbType = "movie") {
  if (!TMDB_API_KEY || !tmdbId) return null;
  try {
    const r = await fetch(`https://api.themoviedb.org/3/${tmdbType}/${tmdbId}?api_key=${TMDB_API_KEY}&append_to_response=external_ids`);
    const d = await r.json();
    if (d.success === false) return null;
    console.log("LBE: TMDB", tmdbId, "type:", tmdbType, "→", d.title, "imdb:", d.imdb_id || d.external_ids?.imdb_id);
    const mins = d.runtime ? parseInt(d.runtime) : (d.episode_run_time?.length ? parseInt(d.episode_run_time[0]) : 0);
    const runtime = mins > 0
      ? `${Math.floor(mins / 60)}h ${mins % 60}min`.replace(/^0h\s*/, "")
      : null;
    return {
      tmdbRating: d.vote_average ? d.vote_average.toFixed(1) : null,
      tmdbVotes: d.vote_count,
      imdbId: d.imdb_id || d.external_ids?.imdb_id || null,
      genres: (d.genres || []).map(g => g.name),
      runtime,
      originalTitle: d.original_title || d.original_name || null,
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
    const title = d.Title || "";
    if (d.imdbRating && d.imdbRating !== "N/A") result.imdb = { score: d.imdbRating, votes: d.imdbVotes, url: `https://www.imdb.com/title/${imdbId}/` };
    const rt = (d.Ratings || []).find(r => r.Source === "Rotten Tomatoes");
    if (rt) result.rt = { score: rt.Value, url: `https://www.rottentomatoes.com/search?search=${encodeURIComponent(title)}` };
    if (d.Metascore && d.Metascore !== "N/A") result.mc = { score: d.Metascore, url: `https://www.metacritic.com/search/${encodeURIComponent(title)}/` };
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
    const p = new URLSearchParams({ q: query, limit: 10 });
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
// Fetches /username/friends/film/{slug}/ to get friends' individual ratings
// and computes a histogram + average.
// Also scrapes the user's own rating from /film/{slug}/ for optional inclusion.
// Supports pagination — Letterboxd shows ~30 friends per page.
async function scrapeFriendsRatings(filmSlug, username) {
  if (!filmSlug || !username) return { ratings: [], avg: null, count: 0, histogram: {}, userRating: null };
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

    // Scrape the user's own rating from the film page
    let userRating = null;
    try {
      const filmRes = await fetch(`https://letterboxd.com/film/${filmSlug}/`, { credentials: "include" });
      if (filmRes.ok) {
        const filmHtml = await filmRes.text();
        // data-owner-rating is on the film poster container and reflects the logged-in user's rating
        // It's a value 1-10 (half-stars: 1=½, 2=★, 3=★½, ... 8=★★★★, 10=★★★★★)
        const ownRatingMatch = filmHtml.match(/data-owner-rating="(\d{1,2})"/);
        if (ownRatingMatch) {
          const v = parseInt(ownRatingMatch[1], 10);
          if (v >= 1 && v <= 10) {
            userRating = v / 2;
            console.log("LBE: scraped user rating from film page:", v, "→", userRating);
          }
        }
      }
    } catch (e) { console.log("LBE: couldn't scrape user rating", e); }

    // Build histogram (0.5 to 5.0 in 0.5 steps)
    const histogram = {};
    for (let i = 1; i <= 10; i++) histogram[i / 2] = 0;
    allRatings.forEach(r => { if (histogram[r] !== undefined) histogram[r]++; });

    const count = allRatings.length;
    const avg = count > 0 ? (allRatings.reduce((a, b) => a + b, 0) / count) : null;

    console.log("LBE: friends ratings", filmSlug, "count:", count, "avg:", avg?.toFixed(2), "userRating:", userRating, "histogram:", JSON.stringify(histogram));
    return { ratings: allRatings, avg, count, histogram, userRating };
  } catch (e) {
    console.error("LBE: friends ratings error", e);
    return { ratings: [], avg: null, count: 0, histogram: {}, userRating: null };
  }
}

// ── Combined fetch ───────────────────────────────────────────────

// -- WikiData ------------------------------------------------------------------
async function getWikiDataIds(imdbId, tmdbId, tmdbType) {
  if (!imdbId && !tmdbId) return {};
  const t = tmdbType === "tv" ? "wdt:P4983" : "wdt:P4947";
  
  let q = `SELECT ?rt ?mc ?al ?mal WHERE { `;
  const conditions = [];
  if (imdbId) conditions.push(`{ ?item wdt:P345 "${imdbId}" }`);
  if (tmdbId) conditions.push(`{ ?item ${t} "${tmdbId}" }`);
  
  q += conditions.join(" UNION ");
  q += `
    OPTIONAL { ?item wdt:P1258 ?rt. }
    OPTIONAL { ?item wdt:P1712 ?mc. }
    OPTIONAL { ?item wdt:P8729 ?al. }
    OPTIONAL { ?item wdt:P4086 ?mal. }
  } LIMIT 1`;
  
  try {
    const url = "https://query.wikidata.org/sparql?query=" + encodeURIComponent(q);
    const r = await fetch(url, { headers: { "Accept": "application/sparql-results+json", "User-Agent": "Letterboxd-Enhanced (hruday@example.com)" } });
    if (!r.ok) return {};
    const d = await r.json();
    const b = d.results?.bindings?.[0];
    if (!b) return {};
    return {
      rtId: b.rt?.value || null,
      mcId: b.mc?.value || null,
      alId: b.al?.value || null,
      malId: b.mal?.value || null
    };
  } catch (e) { return {}; }
}

async function fetchRT(rtId) {
  if (!rtId) return null;
  try {
    const url = "https://www.rottentomatoes.com/" + rtId;
    const res = await fetch(url);
    const html = await res.text();
    const match = html.match(/<script type="application\/ld\+json">(.*?)<\/script>/gs);
    if (match) {
      for (const m of match) {
        if (m.includes("AggregateRating") && m.includes("Tomatometer")) {
          const j = JSON.parse(m.replace(/<[^>]+>/g, ""));
          if (j.aggregateRating?.ratingValue) {
            return { score: j.aggregateRating.ratingValue + "%", url };
          }
        }
      }
    }
    return null;
  } catch (e) { return null; }
}

async function fetchMC(mcId) {
  if (!mcId) return null;
  let t = mcId;
  if (!t.startsWith("movie/") && !t.startsWith("tv/")) t = "movie/" + t;
  try {
    const url = "https://www.metacritic.com/" + t;
    const res = await fetch(url);
    if (!res.ok) return null;
    const html = await res.text();
    const match = html.match(/<script type="application\/ld\+json">(.*?)<\/script>/gs);
    if (match) {
      for (const m of match) {
        if (m.includes("AggregateRating") && m.includes("Metascore")) {
          const str = m.replace(/<script[^>]*>|<\/script>/g, "").trim();
          const j = JSON.parse(str);
          if (j.aggregateRating?.ratingValue) {
            return { score: j.aggregateRating.ratingValue.toString(), url };
          }
        }
      }
    }
    return null;
  } catch (e) { return null; }
}

async function fetchMalDirect(malId) {
  if (!malId) return null;
  try {
    const r = await fetch("https://api.jikan.moe/v4/anime/" + malId);
    if (!r.ok) return null;
    const d = await r.json();
    if (d.data?.score) {
      return { score: d.data.score.toFixed(1), url: d.data.url, members: d.data.members };
    }
  } catch (e) { return null; }
}

async function fetchAllRatings(title, year, tmdbId, imdbId, filmSlug, tmdbType = "movie") {
  console.log("LBE: fetch", title, year, "tmdb:", tmdbId, "imdb:", imdbId, "slug:", filmSlug);

  // Step 0: Scrape the Letterboxd film page whenever we have a slug.
  // Grid cards need runtime / genres even when a TMDB ID is already present.
  let scrapedData = null;
  if (filmSlug) {
    scrapedData = await cached(`scrape:v2:${filmSlug}`, () => scrapeLetterboxdPage(filmSlug));
    if (!tmdbId && scrapedData.tmdbId) { tmdbId = scrapedData.tmdbId; tmdbType = scrapedData.tmdbType || tmdbType; } else if (scrapedData.tmdbType) { tmdbType = scrapedData.tmdbType; }
    if (!imdbId && scrapedData.imdbId) imdbId = scrapedData.imdbId;
  }

  // Step 1: TMDB
  let tmdb = null;
  if (tmdbId) {
    tmdb = await cached(`tmdb:${tmdbType}:${tmdbId}`, () => tmdbById(tmdbId, tmdbType));
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

  // Step 4: Wikidata IDs
  const wiki = await cached(`wiki:${resolvedImdbId}|${tmdbId}`, () => getWikiDataIds(resolvedImdbId, tmdbId, tmdbType));

// Step 5: Fetch RT & MC directly with guessing fallback if no WD ID
    const guessRT = async (id, t, y, type) => {
      let r = id ? await cached(`rt:id:${id}`, () => fetchRT(id)) : null;
      if (r) return r;
      if (!t) return null;
      const c = t.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9\s\-:]/g,"").replace(/[:\-]/g, " ").trim().replace(/\s+/g,"_");
      if (!c) return null;
      for (const u of [type === "tv" ? `tv/${c}` : `m/${c}`, type === "tv" ? `tv/${c}_${y}` : `m/${c}_${y}`]) {
        r = await cached(`rt:id:${u}`, () => fetchRT(u));
        if (r) return r;
      }
      return null;
    };

    const guessMC = async (id, t, y, type) => {
      let r = id ? await cached(`mc:id:${id}`, () => fetchMC(id)) : null;
      if (r) return r;
      if (!t) return null;
      const c = t.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9\s\-:]/g,"").replace(/[:\-]/g, " ").trim().replace(/\s+/g,"-");
      if (!c) return null;
      for (const u of [type === "tv" ? `tv/${c}` : `movie/${c}`, type === "tv" ? `tv/${c}-${y}` : `movie/${c}-${y}`]) {
        r = await cached(`mc:id:${u}`, () => fetchMC(u));
        if (r) return r;
      }
      return null;
    };

    const [rtScraped, mcScraped] = await Promise.all([
      guessRT(wiki.rtId, title, year, tmdbType || initialTmdbType),
      guessMC(wiki.mcId, title, year, tmdbType || initialTmdbType)
  ]);

  // Step 6: MAL
  let mal = null;
  const isAnimation = tmdb?.genres?.some(g => /animation/i.test(g)) || tmdbType === "tv"; 
  if (isAnimation) {
    if (wiki.malId) {
      mal = await cached(`mal:direct:${wiki.malId}`, () => fetchMalDirect(wiki.malId));
    }
    if (!mal) {
      mal = await cached(`mal:v3:${title}|${year}`, () => fetchMAL(title, scrapedData?.originalTitle || tmdb?.originalTitle, year));
    }
  }

  const result = {
    imdb: omdb?.imdb || null,
    rt: rtScraped || omdb?.rt || null,
    mc: mcScraped || omdb?.mc || null,
    mal: mal,
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
    const { title, year, username, filmSlug, tmdbId, imdbId, tmdbType } = msg;
    (async () => {
      const local = await getLocal(username, filmSlug);
      if (local && local.imdb !== undefined) {
        sendResponse({ ...local, error: null, cached: true });
        return;
      }
      try {
        const result = await fetchAllRatings(title, year, tmdbId, imdbId, filmSlug, tmdbType);
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
        const result = await cached(`friends:v5:${username}:${filmSlug}`, () => scrapeFriendsRatings(filmSlug, username));
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

  // ── Diary Stats ────────────────────────────────────────────────
  if (msg.type === "FETCH_DIARY_STATS") {
    const { username, year } = msg;
    console.log("LBE: FETCH_DIARY_STATS received for", username, year);
    (async () => {
      try {
        const cacheKey = `diary-stats:v7:${username}:${year}`;
        // Check cache
        try {
          const c = await chrome.storage.local.get(cacheKey);
          if (c[cacheKey] && Date.now() - c[cacheKey].ts < 3600000) {
            console.log("LBE: diary stats — returning cached data");
            sendResponse({ ...c[cacheKey].data, cached: true, error: null });
            return;
          }
        } catch (e) {}

        // Scrape diary pages
        console.log("LBE: diary stats — starting scrape...");
        const entries = await scrapeDiaryYear(username, year);
        console.log("LBE: diary stats — scraped", entries.length, "entries");
        if (!entries.length) {
          sendResponse({ entries: [], stats: null, error: null, cached: false });
          return;
        }

        // Enrich with genres/runtime from film pages (uses existing cache)
        console.log("LBE: diary stats — enriching entries...");
        const enriched = await enrichDiaryEntries(entries);

        // Compute stats
        const stats = computeDiaryStats(entries, enriched, year);
        console.log("LBE: diary stats — computed:", stats.totalFilms, "films,", stats.rewatchCount, "rewatches,", stats.totalHours, "hours");

        // Cache result
        const result = { entries, stats };
        try { await chrome.storage.local.set({ [cacheKey]: { data: result, ts: Date.now() } }); } catch (e) {}

        sendResponse({ ...result, cached: false, error: null });
      } catch (err) {
        console.error("LBE: diary stats error", err);
        sendResponse({ entries: [], stats: null, error: err.message });
      }
    })();
    return true;
  }

  if (msg.type === "CLEAR_DIARY_CACHE") {
    const { username, year } = msg;
    (async () => {
      try { await chrome.storage.local.remove(`diary-stats:v7:${username}:${year}`); } catch (e) {}
      sendResponse({ ok: true });
    })();
    return true;
  }
});

// ══════════════════════════════════════════════════════════════════
// DIARY SCRAPING
// ══════════════════════════════════════════════════════════════════

async function scrapeDiaryPage(username, page, year) {
  // Letterboxd diary URL: /username/films/diary/for/YYYY/page/N/
  const url = year
    ? (page > 1
        ? `https://letterboxd.com/${username}/films/diary/for/${year}/page/${page}/`
        : `https://letterboxd.com/${username}/films/diary/for/${year}/`)
    : `https://letterboxd.com/${username}/films/diary/page/${page}/`;
  console.log("LBE: diary scraping", url);
  const res = await fetch(url);
  if (!res.ok) {
    console.log("LBE: diary page fetch failed:", res.status);
    return { entries: [], hasNext: false };
  }
  const html = await res.text();
  console.log("LBE: diary page HTML length:", html.length);

  const entries = [];

  // Letterboxd diary uses <tr class="diary-entry-row"> rows
  // Title in <h3 class="headline-3"><a>Title</a></h3>
  // Year in <td class="td-released">
  // Rating in <span class="rating rated-N">
  // Rewatch: icon-rewatch class
  // Review: icon-review class
  // Date: links to /diary/for/YYYY/MM/DD/

  let rowRe = /<tr[^>]*class="[^"]*diary-entry-row[^"]*"[^>]*>([\s\S]*?)<\/tr>/gi;
  let rm;
  while ((rm = rowRe.exec(html)) !== null) {
    const entry = parseDiaryRow(rm[1]);
    if (entry) entries.push(entry);
  }

  // Fallback: try matching any <tr> that contains data-film-slug or /film/ link
  if (entries.length === 0) {
    console.log("LBE: diary — no diary-entry-row matches, trying broader patterns");
    rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    while ((rm = rowRe.exec(html)) !== null) {
      const row = rm[1];
      if (row.includes("data-film-slug") || (row.includes("/film/") && row.includes("rated-"))) {
        const entry = parseDiaryRow(row);
        if (entry && (entry.filmSlug || entry.title)) entries.push(entry);
      }
    }
  }

  console.log("LBE: diary page", page, "→", entries.length, "entries");
  if (entries.length > 0) {
    console.log("LBE: diary first entry:", JSON.stringify(entries[0]));
    // Log stats for first page to debug rewatch/like detection
    if (page <= 2) {
      const rwCount = entries.filter(e => e.isRewatch).length;
      const likeCount = entries.filter(e => e.isLiked).length;
      const revCount = entries.filter(e => e.hasReview).length;
      console.log(`LBE: diary page ${page} stats — ${rwCount}/${entries.length} rewatches, ${likeCount}/${entries.length} liked, ${revCount}/${entries.length} reviews`);
    }
  }

  // Detect if there's a next page
  const hasNext = html.includes(`/page/${page + 1}/`) || html.includes('class="next"');

  return { entries, hasNext };
}

function parseDiaryRow(row) {
  let filmSlug = null, title = "", year = null, watchedDate = null, rating = null;
  let isRewatch = false, hasReview = false, isLiked = false;

  // Film slug from poster
  const slugMatch = row.match(/data-film-slug="([^"]+)"/);
  if (slugMatch) filmSlug = slugMatch[1];
  if (!filmSlug) {
    const linkMatch = row.match(/\/film\/([^/"]+)\//);
    if (linkMatch) filmSlug = linkMatch[1];
  }

  // Title — try headline-3 first (Letterboxd diary uses <h3 class="headline-3">)
  const h3Match = row.match(/<h3[^>]*class="[^"]*headline-3[^"]*"[^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>/i);
  if (h3Match) title = h3Match[1].trim();
  if (!title) {
    const nameMatch = row.match(/data-film-name="([^"]+)"/);
    if (nameMatch) title = nameMatch[1];
  }
  if (!title) {
    const imgAlt = row.match(/alt="([^"]+)"/);
    if (imgAlt) title = imgAlt[1].replace(/^Poster for\s*/i, "");
  }

  // Film release year — td-released cell
  const releasedMatch = row.match(/<td[^>]*class="[^"]*td-released[^"]*"[^>]*>\s*(\d{4})\s*<\/td>/i);
  if (releasedMatch) year = releasedMatch[1];
  if (!year) {
    const yearMatch = row.match(/data-film-release-year="(\d{4})"/);
    if (yearMatch) year = yearMatch[1];
  }

  // Watched date — from calendar link: /diary/for/2026/03/15/
  const dateLink = row.match(/\/diary\/for\/(\d{4})\/(\d{2})\/(\d{2})\//);
  if (dateLink) {
    watchedDate = `${dateLink[1]}-${dateLink[2]}-${dateLink[3]}`;
  }
  if (!watchedDate) {
    const vdMatch = row.match(/data-viewing-date="(\d{4}-\d{2}-\d{2})"/);
    if (vdMatch) watchedDate = vdMatch[1];
  }
  if (!watchedDate) {
    const anyDate = row.match(/\/for\/(\d{4})\/(\d{1,2})\/(\d{1,2})\//);
    if (anyDate) {
      watchedDate = `${anyDate[1]}-${anyDate[2].padStart(2, "0")}-${anyDate[3].padStart(2, "0")}`;
    }
  }

  // Rating: <span class="rating rated-7"> means 7/2 = 3.5 stars
  const ratingMatch = row.match(/rated-(\d{1,2})/);
  if (ratingMatch) {
    const n = parseInt(ratingMatch[1], 10);
    if (n >= 1 && n <= 10) rating = n / 2;
  }

  // Rewatch: Every row has <span class="has-icon icon-rewatch icon-16"> but
  // the parent <td> has class "icon-status-off" when it's NOT a rewatch.
  // So: rewatch = the rewatch td does NOT have icon-status-off
  const rwTd = row.match(/<td[^>]*class="([^"]*(?:col-rewatch|td-rewatch|js-td-rewatch)[^"]*)"[^>]*>/i);
  if (rwTd) {
    isRewatch = !/icon-status-off/i.test(rwTd[1]);
  }

  // Review: same pattern — td has icon-status-off when no review
  const rvTd = row.match(/<td[^>]*class="([^"]*(?:col-review|td-review|js-td-review)[^"]*)"[^>]*>/i);
  if (rvTd) {
    hasReview = !/icon-status-off/i.test(rvTd[1]);
  }

  // Like: "icon-liked" (with 'd') only appears when liked.
  // "icon-like" (without 'd') appears when not liked.
  // Use word boundary to avoid matching icon-like when looking for icon-liked.
  isLiked = /\bicon-liked\b/.test(row);

  if (!filmSlug && !title) return null;

  return { filmSlug, title, year, watchedDate, rating, isRewatch, hasReview, isLiked };
}

async function scrapeDiaryYear(username, year) {
  const allEntries = [];
  let page = 1;
  const maxPages = 50; // safety cap
  const yearStr = String(year);

  while (page <= maxPages) {
    const result = await scrapeDiaryPage(username, page, year);
    if (!result.entries || result.entries.length === 0) break;

    for (const entry of result.entries) {
      // When using /diary/for/YYYY/ URL, all entries are from that year
      // but some may lack watchedDate if parsing failed — assign year+month fallback
      if (!entry.watchedDate) {
        // Skip entries without dates — we can't bucket them
        console.log("LBE: diary entry missing date, skipping:", entry.title);
        continue;
      }
      const entryYear = entry.watchedDate.substring(0, 4);
      if (entryYear === yearStr) {
        allEntries.push(entry);
      }
    }

    if (!result.hasNext) break;
    page++;
    // Small delay to avoid hammering
    await new Promise(r => setTimeout(r, 200));
  }

  console.log("LBE: diary scraped", allEntries.length, "entries for", year, "across", page, "pages");
  return allEntries;
}

async function enrichDiaryEntries(entries) {
  // Get unique film slugs
  const slugs = [...new Set(entries.map(e => e.filmSlug).filter(Boolean))];
  const enriched = {};

  console.log("LBE: enriching", slugs.length, "unique films...");

  for (let i = 0; i < slugs.length; i++) {
    const slug = slugs[i];
    try {
      // Step 1: Get TMDB ID from Letterboxd page (this is fast/cached)
      const scraped = await cached(`scrape:v2:${slug}`, () => scrapeLetterboxdPage(slug));
      let genres = scraped?.genres || [];
      let runtime = scraped?.runtime || null;

      // Step 2: If genres missing (common), use TMDB API which reliably returns them
      if (genres.length === 0 && scraped?.tmdbId && TMDB_API_KEY) {
        const tmdbType = scraped.tmdbType || "movie";
        const tmdb = await cached(`tmdb:${tmdbType}:${scraped.tmdbId}`, () => tmdbById(scraped.tmdbId, tmdbType));
        if (tmdb) {
          if (tmdb.genres?.length) genres = tmdb.genres;
          if (!runtime && tmdb.runtime) runtime = tmdb.runtime;
        }
      }

      enriched[slug] = { ...scraped, genres, runtime };
      if (i < 3) console.log("LBE: enriched", slug, "→ genres:", genres.length, JSON.stringify(genres.slice(0, 3)), "runtime:", runtime);
    } catch (e) {
      enriched[slug] = { genres: [], runtime: null };
    }
    // Throttle: small delay every 5 fetches to avoid TMDB rate limit
    if (i > 0 && i % 5 === 0) {
      await new Promise(r => setTimeout(r, 150));
    }
  }

  console.log("LBE: enriched", Object.keys(enriched).length, "unique films");
  return enriched;
}

function computeDiaryStats(entries, enriched, year) {
  const MONTHS = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"];
  const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  const totalFilms = entries.length;
  const ratings = entries.filter(e => e.rating !== null).map(e => e.rating);
  const avgRating = ratings.length > 0 ? (ratings.reduce((a, b) => a + b, 0) / ratings.length) : null;
  const rewatchCount = entries.filter(e => e.isRewatch).length;
  const reviewCount = entries.filter(e => e.hasReview).length;
  const likedCount = entries.filter(e => e.isLiked).length;

  // Total runtime — parse "Xh Ymin" or "Xmin" format
  let totalMinutes = 0;
  let runtimeHits = 0;
  const seenSlugs = new Set();
  for (const entry of entries) {
    const data = enriched[entry.filmSlug];
    if (data?.runtime) {
      // Only count runtime once per unique film (not per rewatch)
      // Actually — user watches the film each time, so count every entry
      const rt = data.runtime;
      let mins = 0;
      const hm = rt.match(/(\d+)h\s*(\d+)/);
      const mOnly = rt.match(/^(\d+)\s*min/);
      if (hm) mins = parseInt(hm[1]) * 60 + parseInt(hm[2]);
      else if (mOnly) mins = parseInt(mOnly[1]);
      if (mins > 0) {
        totalMinutes += mins;
        runtimeHits++;
      }
    }
  }
  const totalHours = Math.round(totalMinutes / 60);
  console.log("LBE: runtime — found for", runtimeHits, "/", totalFilms, "entries, total:", totalMinutes, "min =", totalHours, "h");

  // Genre counts — count per diary entry (so rewatches of a Drama add to Drama count)
  const genreCounts = {};
  let genreHits = 0;
  for (const entry of entries) {
    const data = enriched[entry.filmSlug];
    if (data?.genres && data.genres.length > 0) {
      genreHits++;
      for (const g of data.genres) {
        const name = typeof g === "string" ? g : (g.name || String(g));
        if (name && name.length > 0 && name.length < 30) {
          genreCounts[name] = (genreCounts[name] || 0) + 1;
        }
      }
    }
  }
  console.log("LBE: genres — found for", genreHits, "/", totalFilms, "entries, unique genres:", Object.keys(genreCounts).length);
  const topGenres = Object.entries(genreCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => ({ name, count }));

  // Monthly breakdown
  const monthly = [];
  for (let m = 0; m < 12; m++) {
    const monthEntries = entries.filter(e => {
      const em = parseInt(e.watchedDate.substring(5, 7), 10) - 1;
      return em === m;
    });
    const mRatings = monthEntries.filter(e => e.rating !== null).map(e => e.rating);
    const mAvg = mRatings.length > 0 ? (mRatings.reduce((a, b) => a + b, 0) / mRatings.length) : null;
    const mRewatches = monthEntries.filter(e => e.isRewatch).length;
    const mReviews = monthEntries.filter(e => e.hasReview).length;
    const mLikes = monthEntries.filter(e => e.isLiked).length;
    const mNew = monthEntries.length - mRewatches;

    // Day of week distribution
    const dayOfWeek = [0, 0, 0, 0, 0, 0, 0]; // Sun=0 .. Sat=6
    for (const e of monthEntries) {
      const d = new Date(e.watchedDate + "T12:00:00");
      if (!isNaN(d)) dayOfWeek[d.getDay()]++;
    }
    const maxDay = Math.max(...dayOfWeek);
    const mostWatchedDayIdx = dayOfWeek.indexOf(maxDay);

    monthly.push({
      name: MONTHS[m],
      shortName: MONTHS[m].substring(0, 3),
      total: monthEntries.length,
      newCount: mNew,
      rewatchCount: mRewatches,
      reviewCount: mReviews,
      likedCount: mLikes,
      avgRating: mAvg,
      dayOfWeek,
      mostWatchedDay: maxDay > 0 ? DAYS[mostWatchedDayIdx] : null,
    });
  }

  const currentMonth = new Date().getFullYear() === parseInt(year, 10) ? new Date().getMonth() : 11;
  const activeMonths = monthly.filter(m => m.total > 0).length || 1;
  const perMonth = totalFilms / activeMonths;

  // Yearly day-of-week aggregate
  const yearlyDayOfWeek = [0, 0, 0, 0, 0, 0, 0]; // Sun=0 .. Sat=6
  for (const e of entries) {
    const d = new Date(e.watchedDate + "T12:00:00");
    if (!isNaN(d)) yearlyDayOfWeek[d.getDay()]++;
  }
  const maxYearlyDay = Math.max(...yearlyDayOfWeek);
  const mostWatchedDayIdx = yearlyDayOfWeek.indexOf(maxYearlyDay);
  const mostWatchedDay = maxYearlyDay > 0 ? DAYS[mostWatchedDayIdx] : null;
  const mostWatchedDayCount = maxYearlyDay;

  // Weekly histogram (week 1-53)
  const weekly = [];
  for (let w = 0; w < 53; w++) weekly.push(0);
  for (const e of entries) {
    const d = new Date(e.watchedDate + "T12:00:00");
    if (isNaN(d)) continue;
    // ISO week number calculation
    const jan1 = new Date(d.getFullYear(), 0, 1);
    const dayOfYear = Math.floor((d - jan1) / 86400000) + 1;
    const weekNum = Math.ceil((dayOfYear + jan1.getDay()) / 7);
    const idx = Math.min(Math.max(weekNum - 1, 0), 52);
    weekly[idx]++;
  }
  const maxWeekly = Math.max(...weekly);
  const mostWatchedWeekIdx = weekly.indexOf(maxWeekly);

  // Find the date range for a given week number
  function weekDateRange(weekNum, yr) {
    const jan1 = new Date(yr, 0, 1);
    const startDay = (weekNum - 1) * 7 - jan1.getDay() + 1;
    const start = new Date(yr, 0, startDay);
    const end = new Date(yr, 0, startDay + 6);
    const MSHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${MSHORT[start.getMonth()]} ${start.getDate()}–${start.getMonth() !== end.getMonth() ? MSHORT[end.getMonth()] + " " : ""}${end.getDate()}`;
  }

  return {
    totalFilms,
    avgRating,
    rewatchCount,
    reviewCount,
    likedCount,
    totalHours,
    perMonth,
    topGenres,
    monthly,
    currentMonth,
    yearlyDayOfWeek,
    mostWatchedDay,
    mostWatchedDayCount,
    weekly,
    maxWeekly,
    mostWatchedWeekIdx,
    mostWatchedWeekRange: weekDateRange(mostWatchedWeekIdx + 1, parseInt(year, 10)),
  };
}

