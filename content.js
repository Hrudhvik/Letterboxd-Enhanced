// content.js — Letterboxd Enhanced

(function () {
  "use strict";

  function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

  let _username = null;
  function getUsername() {
    if (_username) return _username;
    // Try multiple nav selectors
    const selectors = [
      '.main-nav .subnav-trigger',
      '.main-nav .dropdown-trigger',
      'nav .subnav-trigger',
      '.nav-account .name',
      '.header .subnav-trigger',
      // The profile link in the nav dropdown
      '.main-nav a[href*="/films/"]',
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) {
        // For links, extract from href
        if (el.tagName === 'A' && el.href) {
          const m = el.getAttribute("href").match(/^\/([a-z0-9_]+)\//i);
          if (m) { _username = m[1].toLowerCase(); return _username; }
        }
        const text = el.textContent.trim().toLowerCase();
        if (text && text.length > 0 && text.length < 30) {
          _username = text;
          return _username;
        }
      }
    }
    // Try "Reply as Username..." placeholder text
    const replyBox = document.querySelector('textarea[placeholder*="Reply as"]');
    if (replyBox) {
      const m = replyBox.placeholder.match(/Reply as (\w+)/i);
      if (m) { _username = m[1].toLowerCase(); return _username; }
    }
    return _username;
  }

  function slugFromUrl(url) { const m = (url || "").match(/\/film\/([^/?#]+)/); return m ? m[1] : null; }
  function isFilmPage() { return /^\/film\/[^/]+\/?$/.test(location.pathname); }

  // Review/user-film pages: /username/film/slug/ (viewing a review or user's film activity)
  function isReviewPage() {
    if (isFilmPage()) return false;
    // Only match /username/film/slug/ URL pattern (review pages)
    return /^\/[^/]+\/film\/[^/]+\/?$/.test(location.pathname);
  }

  function getFilmSlugFromReviewPage() {
    // Try URL first: /username/film/slug/
    const urlMatch = location.pathname.match(/^\/[^/]+\/film\/([^/?#]+)/);
    if (urlMatch) return urlMatch[1];
    // Try data attribute
    const el = document.querySelector('[data-film-slug]');
    if (el) return el.dataset.filmSlug;
    // Try the film poster link
    const posterLink = document.querySelector('.film-poster a[href*="/film/"], .poster a[href*="/film/"], a.film-poster[href*="/film/"]');
    if (posterLink) return slugFromUrl(posterLink.getAttribute("href"));
    // Try any link to /film/ in the header area
    const filmLink = document.querySelector('h1 a[href*="/film/"], .headline-1 a[href*="/film/"], .film-title a[href*="/film/"]');
    if (filmLink) return slugFromUrl(filmLink.getAttribute("href"));
    // Try the body-level data attribute
    const body = document.querySelector('body[data-film-slug], #content[data-film-slug]');
    if (body) return body.dataset.filmSlug;
    // Fallback: look for any /film/ link on the page
    const anyFilmLink = document.querySelector('a[href*="/film/"]');
    if (anyFilmLink) return slugFromUrl(anyFilmLink.getAttribute("href"));
    return null;
  }

  function getPageIds() {
    let tmdbId = null, imdbId = null, tmdbType = "movie";
    const tmdbEl = document.querySelector('[data-tmdb-id]');
    if (tmdbEl) {
      tmdbId = tmdbEl.dataset.tmdbId;
      if (tmdbEl.dataset.tmdbType) tmdbType = tmdbEl.dataset.tmdbType;
    }
    const imdbLink = document.querySelector('a[href*="imdb.com/title/"]');
    if (imdbLink) { const m = imdbLink.href.match(/title\/(tt\d+)/); if (m) imdbId = m[1]; }
    if (!tmdbId) { const tmdbLink = document.querySelector('a[href*="themoviedb.org/"]'); if (tmdbLink) { const m = tmdbLink.href.match(/(movie|tv)\/(\d+)/); if (m) { tmdbType = m[1]; tmdbId = m[2]; } } }
    return { tmdbId, imdbId, tmdbType };
  }

  function getFilmInfo() {
    const h = document.querySelector("h1.headline-1") || document.querySelector("h1");
    if (!h) return null;
    const title = h.textContent.trim();
    const yearEl = document.querySelector(".releaseyear a") || document.querySelector("[href*='/films/year/']");
    const year = yearEl ? yearEl.textContent.trim() : null;
    let runtime = null;
    document.querySelectorAll("p.text-link.text-footer").forEach(el => {
      const m = el.textContent.match(/(\d+)\s*mins?/);
      if (m) { const mins = parseInt(m[1]); const hr = Math.floor(mins / 60); runtime = hr > 0 ? `${hr}h ${mins % 60}min` : `${mins}min`; }
    });
    const genres = [];
    const junkWords = new Set(["here", "show", "all", "more", "view", "see", "hide", "less", "show all", "view all"]);
    document.querySelectorAll('a[href*="/films/genre/"]').forEach(el => {
      const n = el.textContent.trim();
      if (n && n.length > 2 && !junkWords.has(n.toLowerCase()) && !genres.find(g => g.name === n)) {
        genres.push({ name: n, href: el.href });
      }
    });
    let contentRating = null;
    document.querySelectorAll('a[href*="/rated/"]').forEach(el => {
      const t = el.textContent.trim();
      if (/^(G|PG|PG-13|R|NC-17|NR|TV-MA|TV-14|TV-PG|U|UA|A|12A|12|15|18)$/i.test(t)) contentRating = t;
    });
    let lbRating = null;
    const lbEl = document.querySelector('.average-rating');
    if (lbEl) { const p = parseFloat(lbEl.textContent); if (!isNaN(p)) lbRating = p; }
    const ids = getPageIds();
    return { title, year, runtime, genres, contentRating, lbRating, filmSlug: slugFromUrl(location.pathname), tmdbId: ids.tmdbId, imdbId: ids.imdbId, tmdbType: ids.tmdbType };
  }

  function getGridInfo(el) {
    const slug = el.dataset?.filmSlug || slugFromUrl(el.querySelector("a")?.href);
    const rawTitle = el.dataset?.filmName || el.querySelector("img")?.alt || "";
    const title = rawTitle.replace(/^Poster for\s*/i, "");
    const year = el.dataset?.filmReleaseYear || null;
    const r = el.dataset?.averageRating;
    const tmdbId = el.dataset?.tmdbId || el.querySelector('[data-tmdb-id]')?.dataset?.tmdbId || null;
    const tmdbType = el.dataset?.tmdbType || el.querySelector('[data-tmdb-type]')?.dataset?.tmdbType || "movie";
    return { title, year, runtime: null, genres: [], contentRating: null, lbRating: r ? parseFloat(r) : null, filmSlug: slug, tmdbId, tmdbType, imdbId: null };
  }

  // ── Stars ──────────────────────────────────────────────────────
  function star(on, sz = 9) { return `<svg class="lbe-star${on ? "" : " lbe-star-off"}" viewBox="0 0 12 12" width="${sz}" height="${sz}"><polygon points="6,1 7.5,4.2 11,4.6 8.5,7 9.2,10.5 6,8.8 2.8,10.5 3.5,7 1,4.6 4.5,4.2" fill="currentColor"/></svg>`; }
  function stars(r, sz = 9) { const f = Math.floor(r), h = r - f >= 0.3, e = 5 - f - (h ? 1 : 0); let s = ""; for (let i = 0; i < f; i++) s += star(1, sz); if (h) s += star(0, sz); for (let i = 0; i < e; i++) s += star(0, sz); return s; }

  // ── Info card HTML (grid i-button) ─────────────────────────────
  function infoCardHTML(info, resp) {
    const t = (info.title || "").replace(/^Poster for\s*/i, "");
    let h = `<div class="lbe-ic-title">${t}</div>`;

    // Merge scraped runtime/genres/contentRating from resp
    const runtime = info.runtime || resp?.runtime || null;
    const contentRating = info.contentRating || resp?.contentRating || null;
    const genres = info.genres?.length ? info.genres : (resp?.genres || []);

    const meta = [info.year, runtime, contentRating].filter(Boolean).join(" · ");
    if (meta) h += `<div class="lbe-ic-meta">${meta}</div>`;

    let lb = "";
    if (info.lbRating) lb = `<div class="lbe-ic-lb"><span class="lbe-ic-stars">${stars(info.lbRating, 8)}</span><span class="lbe-ic-lbv">${info.lbRating.toFixed(1)}</span></div>`;

    // Show badges that have data — order: I, R, M, MC
    let ext = "";
    if (resp?.imdb?.score) ext += `<span class="lbe-ic-er"><span class="lbe-ic-b lbe-ic-bi">I</span>${resp.imdb.score}</span>`;
    if (resp?.rt?.score) ext += `<span class="lbe-ic-er"><span class="lbe-ic-b lbe-ic-br">R</span>${resp.rt.score}</span>`;
    if (resp?.mal?.score) ext += `<span class="lbe-ic-er"><span class="lbe-ic-b lbe-ic-bm">M</span>${resp.mal.score}</span>`;
    if (resp?.mc?.score) ext += `<span class="lbe-ic-er"><span class="lbe-ic-b lbe-ic-bmc">MC</span>${resp.mc.score}</span>`;

    if (lb || ext) h += `<div class="lbe-ic-row">${lb}${ext ? `<div class="lbe-ic-ext">${ext}</div>` : ""}</div>`;
    if (genres.length) h += `<div class="lbe-ic-genres">${genres.map(g => `<span class="lbe-ic-g">${g.name || g}</span>`).join("")}</div>`;
    return h;
  }

  // ── Film page overlay HTML ─────────────────────────────────────
  function overlayHTML(info, resp) {
    const t = (info.title || "").replace(/^Poster for\s*/i, "");
    let h = `<div class="lbe-ot">${t}</div>`;
    const meta = [info.year, info.runtime, info.contentRating].filter(Boolean).join(" · ");
    if (meta) h += `<div class="lbe-om">${meta}</div>`;
    let lb = "";
    if (info.lbRating) lb = `<div class="lbe-lb"><span class="lbe-stars">${stars(info.lbRating, 10)}</span><span class="lbe-lbv">${info.lbRating.toFixed(1)}</span></div>`;

    // Only show badges that have actual data — hide null ones
    let ext = "";
    if (resp?.imdb?.score) ext += `<span class="lbe-er"><span class="lbe-b lbe-bi">I</span>${resp.imdb.score}</span>`;
    if (resp?.rt?.score) ext += `<span class="lbe-er"><span class="lbe-b lbe-br">R</span>${resp.rt.score}</span>`;
    if (resp?.mal?.score) ext += `<span class="lbe-er"><span class="lbe-b lbe-bm">M</span>${resp.mal.score}</span>`;
    if (resp?.mc?.score) ext += `<span class="lbe-er"><span class="lbe-b lbe-bmc">MC</span>${resp.mc.score}</span>`;

    if (lb || ext) h += `<div class="lbe-or">${lb}${ext ? `<div class="lbe-ext">${ext}</div>` : ""}</div>`;
    if (info.genres?.length) h += `<div class="lbe-og">${info.genres.map(g => `<a class="lbe-gt" href="${g.href}">${g.name}</a>`).join("")}</div>`;
    return h;
  }

  // ── Sidebar — only shows ratings that exist ────────────────────
  function buildSidebar(resp) {
    document.querySelector(".lbe-rp")?.remove();
    const p = document.createElement("div"); p.className = "lbe-rp";
    p.innerHTML = `<div class="lbe-rh">EXTERNAL RATINGS</div>`;
    const g = document.createElement("div"); g.className = "lbe-rg";

    let hasAny = false;

    if (resp?.imdb) {
      hasAny = true;
      g.innerHTML += `<div class="lbe-rc" data-url="${resp.imdb.url || "#"}" style="--a:#F5C518"><span class="lbe-b lbe-bi" style="width:24px;height:24px;font-size:10px;border-radius:4px">IMDb</span><div class="lbe-ri"><div class="lbe-rs">${resp.imdb.score}/10</div><div class="lbe-rd">${resp.imdb.votes || ""}</div></div></div>`;
    }
    if (resp?.rt) {
      hasAny = true;
      g.innerHTML += `<div class="lbe-rc" data-url="${resp.rt.url || "#"}" style="--a:#FA320A"><span class="lbe-b lbe-br" style="width:24px;height:24px;font-size:10px;border-radius:4px">RT</span><div class="lbe-ri"><div class="lbe-rs">${resp.rt.score}</div><div class="lbe-rd">${parseInt(resp.rt.score) >= 60 ? "Fresh" : "Rotten"}</div></div></div>`;
    }
    if (resp?.mal) {
      hasAny = true;
      g.innerHTML += `<div class="lbe-rc" data-url="${resp.mal.url || "#"}" style="--a:#2E51A2"><span class="lbe-b lbe-bm" style="width:24px;height:24px;font-size:10px;border-radius:4px">MAL</span><div class="lbe-ri"><div class="lbe-rs">${resp.mal.score}/10</div><div class="lbe-rd">${resp.mal.members ? Math.round(resp.mal.members / 1000) + "K members" : ""}</div></div></div>`;
    }
    if (resp?.mc) {
      hasAny = true;
      const mcS = parseInt(resp.mc.score);
      const mcC = mcS >= 61 ? "#6c3" : mcS >= 40 ? "#fc3" : "#f00";
      const mcTitle = document.querySelector("h1.headline-1")?.textContent?.trim() || document.querySelector(".film-title-wrapper h1")?.textContent?.trim() || "";
      const mcUrl = resp.mc.url || `https://www.metacritic.com/search/${encodeURIComponent(mcTitle)}/`;
      g.innerHTML += `<a class="lbe-rc" href="${mcUrl}" target="_blank" rel="noopener noreferrer" style="--a:${mcC}"><span style="background:${mcC};color:#fff;width:24px;height:24px;border-radius:4px;display:inline-flex;align-items:center;justify-content:center;font-size:10px;font-weight:700">${mcS}</span><div class="lbe-ri"><div class="lbe-rs">${mcS}/100</div><div class="lbe-rd">Metacritic</div></div></a>`;
    }

    if (!hasAny) return null;
    p.appendChild(g);

    // Attach click handlers via JS to bypass Letterboxd's router
    p.querySelectorAll(".lbe-rc[data-url]").forEach(card => {
      card.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const url = card.dataset.url;
        if (url && url !== "#") window.open(url, "_blank");
      });
    });

    return p;
  }

  // ── Fetch ──────────────────────────────────────────────────────
  async function fetchRatings(info) {
    return chrome.runtime.sendMessage({
      type: "FETCH_RATINGS", title: info.title, year: info.year,
      username: getUsername(), filmSlug: info.filmSlug,
      tmdbId: info.tmdbId || null, imdbId: info.imdbId || null, tmdbType: info.tmdbType || "movie",
    });
  }

  // ── Film page poster overlay ───────────────────────────────────
  async function injectPoster(info) {
    const c = document.querySelector("div.film-poster") || document.querySelector("div.poster");
    if (!c || c.querySelector(".lbe-ov")) return;
    c.style.position = "relative"; c.style.overflow = "hidden";
    const img = c.querySelector("img"); if (img) { img.alt = ""; img.title = ""; }
    const ov = document.createElement("div"); ov.className = "lbe-ov lbe-h"; ov.style.pointerEvents = "none";
    ov.innerHTML = overlayHTML(info, null);
    c.appendChild(ov);
    c.addEventListener("mouseenter", () => ov.classList.remove("lbe-h"));
    c.addEventListener("mouseleave", () => ov.classList.add("lbe-h"));
    const resp = await fetchRatings(info);
    ov.innerHTML = overlayHTML(info, resp);
  }

  async function injectSidebar(info, showFriendsHisto) {
    const sb = document.querySelector(".sidebar");
    if (!sb || sb.querySelector(".lbe-rp")) return;
    const resp = await fetchRatings(info);
    const panel = buildSidebar(resp);
    if (panel) sb.appendChild(panel);

    // Friends histogram
    if (showFriendsHisto && info.filmSlug && !sb.querySelector(".lbe-fh")) {
      try {
        const fr = await chrome.runtime.sendMessage({ type: "FETCH_FRIENDS_RATINGS", filmSlug: info.filmSlug, username: getUsername() || "hrudhvik" });
        if (fr && fr.count > 0) {
          const fPanel = buildFriendsHistogram(fr);
          // Insert after Letterboxd's native RATINGS section or after our panel
          const insertAfter = panel || sb.querySelector("section") || sb.firstChild;
          if (insertAfter?.nextSibling) {
            sb.insertBefore(fPanel, insertAfter.nextSibling);
          } else {
            sb.appendChild(fPanel);
          }
        }
      } catch (e) { console.error("LBE: friends histogram error", e); }
    }
  }

  // ── Friends Histogram Builder ──────────────────────────────────
  function buildFriendsHistogram(data, userRating = null) {
    const panel = document.createElement("div");
    panel.className = "lbe-fh";

    const histogram = { ...data.histogram };
    let totalCount = data.count;
    let totalSum = data.ratings ? data.ratings.reduce((a, b) => a + b, 0) : (data.avg || 0) * data.count;

    // Include user's own rating
    const hasUser = userRating && userRating >= 0.5 && userRating <= 5;
    if (hasUser) {
      if (histogram[userRating] !== undefined) histogram[userRating]++;
      totalCount++;
      totalSum += userRating;
    }

    const histogramValues = Object.values(histogram);
    const maxCount = Math.max(...histogramValues, 1);
    const avg = totalCount > 0 ? (totalSum / totalCount).toFixed(1) : "—";

    const starLabel = (rating) => {
      const full = Math.floor(rating);
      const half = rating % 1 !== 0;
      return "★".repeat(full) + (half ? "½" : "");
    };

    let barsHTML = "";
    for (let i = 1; i <= 10; i++) {
      const rating = i / 2;
      const count = histogram[rating] || 0;
      const pctOfMax = Math.round((count / maxCount) * 100);
      const pctOfTotal = totalCount ? Math.round((count / totalCount) * 100) : 0;
      const tip = `${count.toLocaleString()} ${starLabel(rating)} rating${count === 1 ? "" : "s"} (${pctOfTotal}%)`;
      barsHTML += `<div class="lbe-fh-bar-wrap" tabindex="0" aria-label="${tip}" data-tip="${tip}"><div class="lbe-fh-bar" style="height:${Math.max(pctOfMax, 6)}%"></div></div>`;
    }

    const countLabel = hasUser
      ? `YOU + ${data.count.toLocaleString()} ${data.count === 1 ? "FRIEND" : "FRIENDS"}`
      : `${data.count.toLocaleString()} ${data.count === 1 ? "FRIEND" : "FRIENDS"}`;

    panel.innerHTML = `
      <div class="lbe-fh-header">
        <span class="lbe-fh-label">FRIENDS RATINGS</span>
        <span class="lbe-fh-count">${countLabel}</span>
      </div>
      <div class="lbe-fh-main">
        <div class="lbe-fh-chart">
          <div class="lbe-fh-bars">${barsHTML}</div>
          <div class="lbe-fh-labels">
            <span>★</span><span></span><span></span><span></span><span></span>
            <span></span><span></span><span></span><span></span><span>★★★★★</span>
          </div>
        </div>
        <div class="lbe-fh-avg">
          <span class="lbe-fh-avg-val">${avg}</span>
          <span class="lbe-fh-avg-stars">${stars(totalCount > 0 ? totalSum / totalCount : 0, 10)}</span>
        </div>
      </div>
    `;
    return panel;
  }

  // ── Grid posters — i-button ────────────────────────────────────
  const gridCache = new Map(), pending = new Set();

  const INFO_SVG = `<svg viewBox="0 0 16 16" fill="none" width="12" height="12"><circle cx="8" cy="8" r="7" stroke="#fff" stroke-width="1.5"/><text x="8" y="11.5" text-anchor="middle" fill="#fff" font-size="10" font-weight="700" font-family="serif">i</text></svg>`;

  function setupGrid(el) {
    if (el.dataset.lbe) return;
    el.dataset.lbe = "1";
    el.style.position = "relative";
    const img = el.querySelector("img"); if (img) img.title = "";

    const btn = document.createElement("div");
    btn.className = "lbe-ibtn";
    btn.innerHTML = INFO_SVG;
    el.appendChild(btn);

    // Card is appended to body — avoids all overflow clipping
    const card = document.createElement("div");
    card.className = "lbe-icard";
    card.innerHTML = `<div class="lbe-ic-loading">Loading...</div>`;
    document.body.appendChild(card);

    let fetched = false;

    el.addEventListener("mouseenter", () => btn.classList.add("lbe-ibtn-show"));
    el.addEventListener("mouseleave", (e) => {
      if (!card.contains(e.relatedTarget) && !btn.contains(e.relatedTarget)) {
        btn.classList.remove("lbe-ibtn-show");
        card.classList.remove("lbe-icard-show");
      }
    });

    btn.addEventListener("mouseenter", async () => {
      const btnRect = btn.getBoundingClientRect();
      const cardW = 188, cardH = 250, gap = 6;

      // Default: pop RIGHT
      let left = btnRect.right + gap;
      let top = btnRect.top;

      // If overflows right edge, pop LEFT instead
      if (left + cardW > window.innerWidth - 10) {
        left = btnRect.left - cardW - gap;
      }
      // If still overflows left, just pin to left edge
      if (left < 10) left = 10;

      // Vertical clamping
      if (top + cardH > window.innerHeight - 10) top = window.innerHeight - cardH - 10;
      if (top < 10) top = 10;

      card.style.left = Math.round(left) + "px";
      card.style.top = Math.round(top) + "px";
      card.classList.add("lbe-icard-show");

      if (fetched) return;

      const info = getGridInfo(el);
      if (!info.filmSlug && !info.title) return;
      const k = info.filmSlug || info.title;

      const c = gridCache.get(k);
      if (c) { card.innerHTML = infoCardHTML(info, c); fetched = true; return; }

      card.innerHTML = infoCardHTML(info, null);

      if (pending.has(k)) return; pending.add(k);
      try {
        const resp = await fetchRatings(info);
        gridCache.set(k, resp);
        card.innerHTML = infoCardHTML(info, resp);
        fetched = true;
      } catch (e) {} finally { pending.delete(k); }
    });

    btn.addEventListener("mouseleave", (e) => {
      if (!card.contains(e.relatedTarget)) card.classList.remove("lbe-icard-show");
    });
    card.addEventListener("mouseleave", (e) => {
      if (!btn.contains(e.relatedTarget)) {
        card.classList.remove("lbe-icard-show");
        btn.classList.remove("lbe-ibtn-show");
      }
    });
  }

  function setupGrids() {
    document.querySelectorAll('.film-poster, .poster-container, .linked-film-poster').forEach(el => {
      if (isFilmPage() && el.closest(".film-detail-content")) return;
      if (!el.dataset.filmSlug && !el.querySelector('a[href*="/film/"]')) return;
      setupGrid(el);
    });
  }

  // ── Metadata bar ───────────────────────────────────────────────
  function metaBar() {
    if (document.querySelector(".lbe-mb")) return;
    const info = getFilmInfo(); if (!info) return;
    if (!info.runtime && !info.genres.length && !info.contentRating) return;
    const bar = document.createElement("div"); bar.className = "lbe-mb";
    if (info.runtime) bar.innerHTML += `<span class="lbe-mt lbe-mr">${info.runtime}</span>`;
    if (info.contentRating) bar.innerHTML += `<span class="lbe-mt lbe-mc">${info.contentRating}</span>`;
    info.genres.forEach(g => { bar.innerHTML += `<a class="lbe-mt lbe-mg" href="${g.href}">${g.name}</a>`; });
    const h = document.querySelector("h1.headline-1") || document.querySelector("h1");
    if (h) h.parentElement.insertBefore(bar, h.nextSibling);
  }

  // ── List Progress ──────────────────────────────────────────────
  const listProgressCache = new Map();
  const listPending = new Set();

  async function fetchListProgress(listUrl) {
    const url = listUrl.startsWith("http") ? listUrl : "https://letterboxd.com" + listUrl;
    try {
      const resp = await fetch(url, { credentials: "same-origin" });
      if (!resp.ok) return null;
      const html = await resp.text();
      const doc = new DOMParser().parseFromString(html, "text/html");

      // Method 1: Native progress panel (the standard Letterboxd way)
      const panel = doc.querySelector(".progress-panel");
      if (panel) {
        const pctEl = panel.querySelector(".progress-percentage");
        const countEl = panel.querySelector(".js-progress-count");
        const totalEl = panel.querySelector(".progress-count");
        if (pctEl && countEl && totalEl) {
          const percentage = pctEl.textContent.trim();
          const count = countEl.textContent.trim();
          const totalMatch = totalEl.textContent.match(/of\s+([\d,]+)/);
          const total = totalMatch ? totalMatch[1] : "?";
          if (percentage) return { count, total, percentage };
        }
      }

      // Method 2: Try .list-progress or any progress bar on the page
      const altProgress = doc.querySelector(".list-progress, [data-progress], .progress");
      if (altProgress) {
        const pct = altProgress.dataset.progress || altProgress.querySelector("[data-progress]")?.dataset.progress;
        if (pct) {
          const numMatch = doc.body.textContent.match(/(\d+)\s+of\s+([\d,]+)/);
          if (numMatch) return { count: numMatch[1], total: numMatch[2], percentage: pct };
        }
      }

      // Method 3: Look for "You've seen X of Y" text anywhere on the page
      const bodyText = doc.body?.textContent || "";
      const seenMatch = bodyText.match(/You.ve\s+(?:seen|watched)\s+(\d+)\s+of\s+([\d,]+)/i);
      if (seenMatch) {
        const count = parseInt(seenMatch[1]);
        const total = parseInt(seenMatch[2].replace(/,/g, ""));
        const pct = total > 0 ? Math.round((count / total) * 100) : 0;
        return { count: seenMatch[1], total: seenMatch[2], percentage: String(pct) };
      }

      // Method 4: Count watched films from poster overlays on the list page
      const allFilms = doc.querySelectorAll(".poster-list .film-poster, .poster-list .poster-container, .poster-list li");
      if (allFilms.length > 0) {
        let watched = 0;
        allFilms.forEach(el => {
          if (el.querySelector(".watched-overlay") || el.classList.contains("film-watched") ||
              el.dataset.ownerRating || el.querySelector("[data-owner-rating]") ||
              el.querySelector(".icon-watched") || el.querySelector(".has-overlay")) {
            watched++;
          }
        });

        // Get the real total from header/body text — page 1 might not show all films
        let total = allFilms.length;
        const filmCountMatch = bodyText.match(/([\d,]+)\s+films?\b/);
        if (filmCountMatch) {
          const parsedTotal = parseInt(filmCountMatch[1].replace(/,/g, ""));
          if (parsedTotal >= total) total = parsedTotal;
        }
        const pct = total > 0 ? Math.round((watched / total) * 100) : 0;
        if (watched > 0) return { count: String(watched), total: String(total), percentage: String(pct) };
      }

      return null;
    } catch { return null; }
  }

  function createListProgressBar(data) {
    const c = document.createElement("div");
    c.className = "lbe-lp-container";
    const pct = parseFloat(data.percentage);
    c.innerHTML = `
      <div class="lbe-lp-bar-track"><div class="lbe-lp-bar" style="width:${Math.min(pct, 100)}%"></div></div>
      <div class="lbe-lp-text">
        <span class="lbe-lp-label">You've watched ${data.count} of ${data.total}</span>
        <span class="lbe-lp-pct">${data.percentage}%</span>
      </div>`;
    return c;
  }

  // Track which DOM nodes already have a bar injected after them
  const injectedBars = new WeakSet();

  async function processListLink(el, key) {
    if (injectedBars.has(el)) return;

    // Check cache
    if (listProgressCache.has(key)) {
      const cached = listProgressCache.get(key);
      if (cached && cached.percentage) {
        injectedBars.add(el);
        el.insertAdjacentElement("afterend", createListProgressBar(cached));
      }
      return;
    }

    if (listPending.has(key)) return;
    listPending.add(key);

    try {
      const href = el.getAttribute("href") || "";
      const data = await fetchListProgress(href);
      console.log("LBE: List Progress —", key, "→", data);
      listProgressCache.set(key, data);
      if (injectedBars.has(el)) return; // check again after async
      if (data && data.percentage && parseInt(data.percentage) >= 0) {
        injectedBars.add(el);
        el.insertAdjacentElement("afterend", createListProgressBar(data));
      }
    } catch { /* silently skip */ }
    finally { listPending.delete(key); }
  }

  function scanListProgress() {
    const listUrlPattern = /\/[^/]+\/list\/[^/]+/;

    // Remove any previously orphaned bars (safety cleanup)
    // Not needed normally but helps if DOM changes

    // Gather ALL <a> tags linking to lists
    const allLinks = document.querySelectorAll('a[href*="/list/"]');

    // Group by: which <a> with images should get the bar?
    // For each link, find its closest "card-like" ancestor and only pick
    // the FIRST image-bearing link per card.
    const processed = new Set(); // "cardId::listKey" → prevents duplicates

    const toProcess = [];

    allLinks.forEach(el => {
      if (injectedBars.has(el)) return;
      // Already has a bar right after it?
      if (el.nextElementSibling?.classList?.contains("lbe-lp-container")) return;

      const href = el.getAttribute("href") || "";
      if (!listUrlPattern.test(href)) return;
      if (el.closest(".lbe-lp-container") || el.closest("nav") || el.closest("footer")) return;
      // Skip tiny text-only links (no images, very little content)
      const hasImages = !!el.querySelector("img");
      if (!hasImages) return; // ONLY attach to poster-collage links

      const key = href.replace(/^https?:\/\/letterboxd\.com/, "").replace(/\/$/, "");

      // Create a unique ID for this card position to prevent duplicates
      // Use the element's offset position as a rough card identifier
      const rect = el.getBoundingClientRect();
      const cardId = `${Math.round(rect.left)}:${Math.round(rect.top)}`;
      const dedupKey = cardId + "::" + key;

      if (processed.has(dedupKey)) return;
      processed.add(dedupKey);

      toProcess.push({ el, key });
    });

    if (toProcess.length > 0) console.log("LBE: List Progress — found", toProcess.length, "list cards to process");
    toProcess.forEach(({ el, key }, i) => {
      setTimeout(() => processListLink(el, key), i * 200);
    });
  }

  // ── Review page: friends histogram above "YOUR FRIENDS" ──────
  let _reviewHistoInjected = false;
  async function injectReviewPageHistogram() {
    if (_reviewHistoInjected) return;

    const sb = document.querySelector(".sidebar");
    if (!sb) { console.log("LBE: review page — no sidebar found"); return; }
    if (sb.querySelector(".lbe-fh")) { _reviewHistoInjected = true; return; }

    _reviewHistoInjected = true; // set early to prevent re-entry from MutationObserver

    const filmSlug = getFilmSlugFromReviewPage();
    if (!filmSlug) { console.log("LBE: review page — couldn't find film slug"); _reviewHistoInjected = false; return; }

    // Always use the logged-in user's username (from nav), NOT the URL author
    let username = getUsername();
    if (!username) {
      // Last resort: if we're on our OWN review page, the URL username is ours
      // But we can't be sure, so log a warning
      const m = location.pathname.match(/^\/([^/]+)\/film\//);
      if (m) {
        username = m[1].toLowerCase();
        console.log("LBE: review page — using URL username as fallback:", username);
      }
    }
    if (!username) { console.log("LBE: review page — couldn't find username"); _reviewHistoInjected = false; return; }

    console.log("LBE: review page — fetching friends histogram for", filmSlug, "user:", username);

    try {
      const fr = await chrome.runtime.sendMessage({ type: "FETCH_FRIENDS_RATINGS", filmSlug, username });
      console.log("LBE: review page — friends data:", fr);
      if (!fr || fr.count <= 0) return;

      const fPanel = buildFriendsHistogram(fr);

      // Final guard before inserting into DOM
      if (sb.querySelector(".lbe-fh")) return;

      // Simple consistent placement: insert right AFTER the "YOUR FRIENDS" section
      let inserted = false;
      const allH2s = sb.querySelectorAll("h2");
      for (const h of allH2s) {
        if (/your\s+friends/i.test(h.textContent)) {
          const section = h.closest("section") || h.parentElement;
          // Insert after this section
          if (section && section.nextSibling) {
            section.parentElement.insertBefore(fPanel, section.nextSibling);
          } else if (section && section.parentElement) {
            section.parentElement.appendChild(fPanel);
          }
          inserted = true;
          break;
        }
      }

      if (!inserted) {
        sb.appendChild(fPanel);
      }

      console.log("LBE: review page — histogram injected");
    } catch (e) { console.error("LBE: review page histogram error", e); }
  }

  // ── Diary Stats ─────────────────────────────────────────────────
  function isDiaryPage() {
    return /^\/[^/]+\/diary(\/|$)/.test(location.pathname);
  }

  function getDiaryUsername() {
    const m = location.pathname.match(/^\/([^/]+)\/diary/);
    return m ? m[1].toLowerCase() : null;
  }

  let _diaryStatsInjected = false;
  let _diaryExpandedMonth = null;

  async function injectDiaryStats() {
    if (_diaryStatsInjected) return;
    if (document.querySelector(".lbe-ds")) { _diaryStatsInjected = true; return; }
    _diaryStatsInjected = true;

    const username = getDiaryUsername();
    console.log("LBE: diary stats — detected diary page, username:", username);
    if (!username) return;

    const currentYear = new Date().getFullYear();
    let year = currentYear;

    // Try to detect year from URL: /username/diary/for/2025/
    const ym = location.pathname.match(/\/diary\/for\/(\d{4})/);
    if (ym) year = parseInt(ym[1], 10);
    console.log("LBE: diary stats — year:", year);

    // Create container
    const container = document.createElement("div");
    container.className = "lbe-ds";
    container.innerHTML = buildDiaryStatsLoading(year);

    // Insert into page — try multiple selectors for robustness
    let inserted = false;
    const insertTargets = [
      ".diary-navigation",
      "nav.sub-nav",
      ".content-nav",
      ".diary-filters",
      "#diary-table",
      ".diary-table",
      "table.diary-table",
      ".pagination",
    ];

    // Strategy 1: Insert after a navigation element
    for (const sel of insertTargets.slice(0, 4)) {
      const el = document.querySelector(sel);
      if (el) {
        el.parentElement.insertBefore(container, el.nextSibling);
        console.log("LBE: diary stats — inserted after", sel);
        inserted = true;
        break;
      }
    }

    // Strategy 2: Insert before the diary table / entries
    if (!inserted) {
      for (const sel of insertTargets.slice(4)) {
        const el = document.querySelector(sel);
        if (el) {
          el.parentElement.insertBefore(container, el);
          console.log("LBE: diary stats — inserted before", sel);
          inserted = true;
          break;
        }
      }
    }

    // Strategy 3: Insert at start of #content or section.s-body
    if (!inserted) {
      const fallbacks = ["#content", "section.s-body", ".body-content", "main", ".content-wrap", "body"];
      for (const sel of fallbacks) {
        const el = document.querySelector(sel);
        if (el) {
          // Try to insert after the first header/nav-like child
          const firstChild = el.querySelector("header, nav, .content-nav, h1, h2");
          if (firstChild) {
            firstChild.parentElement.insertBefore(container, firstChild.nextSibling);
          } else {
            el.prepend(container);
          }
          console.log("LBE: diary stats — fallback inserted into", sel);
          inserted = true;
          break;
        }
      }
    }

    if (!inserted) {
      console.log("LBE: diary stats — couldn't find insertion point!");
      return;
    }

    // Fetch and render
    await fetchAndRenderDiaryStats(container, username, year);

    // Year navigation handlers
    container.addEventListener("click", async (e) => {
      const btn = e.target.closest(".lbe-ds-yr-btn");
      if (btn) {
        const dir = btn.dataset.dir;
        year += dir === "prev" ? -1 : 1;
        if (year > currentYear) year = currentYear;
        if (year < 2000) year = 2000;
        container.innerHTML = buildDiaryStatsLoading(year);
        _diaryExpandedMonth = null;
        await fetchAndRenderDiaryStats(container, username, year);
        return;
      }

      // Month bar click
      const bar = e.target.closest(".lbe-ds-col");
      if (bar) {
        const mi = parseInt(bar.dataset.month, 10);
        if (isNaN(mi)) return;
        if (_diaryExpandedMonth === mi) {
          _diaryExpandedMonth = null;
          container.querySelector(".lbe-ds-expand")?.remove();
          container.querySelectorAll(".lbe-ds-col.lbe-ds-act").forEach(c => c.classList.remove("lbe-ds-act"));
        } else {
          _diaryExpandedMonth = mi;
          container.querySelectorAll(".lbe-ds-col.lbe-ds-act").forEach(c => c.classList.remove("lbe-ds-act"));
          bar.classList.add("lbe-ds-act");
          renderMonthExpand(container, mi);
        }
        return;
      }

      // Toggle view (Monthly / Weekly / Day)
      const togBtn = e.target.closest(".lbe-ds-tog-btn");
      if (togBtn) {
        const view = togBtn.dataset.view;
        container.querySelectorAll(".lbe-ds-tog-btn").forEach(b => b.classList.remove("lbe-ds-tog-active"));
        togBtn.classList.add("lbe-ds-tog-active");
        container.querySelectorAll(".lbe-ds-view").forEach(v => {
          v.style.display = v.dataset.viewId === view ? "" : "none";
        });
        return;
      }

      // Refresh button
      if (e.target.closest(".lbe-ds-refresh")) {
        await chrome.runtime.sendMessage({ type: "CLEAR_DIARY_CACHE", username, year });
        container.innerHTML = buildDiaryStatsLoading(year);
        _diaryExpandedMonth = null;
        await fetchAndRenderDiaryStats(container, username, year);
      }
    });
  }

  let _lastDiaryStats = null;

  async function fetchAndRenderDiaryStats(container, username, year) {
    try {
      console.log("LBE: diary stats — fetching for", username, year);
      const resp = await chrome.runtime.sendMessage({ type: "FETCH_DIARY_STATS", username, year });
      console.log("LBE: diary stats — response:", resp ? `${resp.entries?.length || 0} entries, cached: ${resp.cached}` : "null");
      if (!resp || resp.error || !resp.stats) {
        container.innerHTML = buildDiaryStatsEmpty(year);
        _lastDiaryStats = null;
        return;
      }
      _lastDiaryStats = resp.stats;
      container.innerHTML = buildDiaryStatsHTML(resp.stats, year);
    } catch (e) {
      console.error("LBE: diary stats render error", e);
      container.innerHTML = buildDiaryStatsEmpty(year);
    }
  }

  function buildDiaryStatsLoading(year) {
    return `<div class="lbe-ds-hdr"><span class="lbe-ds-ttl">DIARY STATS</span><div class="lbe-ds-yr"><span class="lbe-ds-yr-btn" data-dir="prev">&#8249;</span><span class="lbe-ds-yr-v">${year}</span><span class="lbe-ds-yr-btn" data-dir="next">&#8250;</span></div></div>
      <div class="lbe-ds-loading"><div class="lbe-ds-spinner"></div><span>Scanning diary pages...</span></div>`;
  }

  function buildDiaryStatsEmpty(year) {
    return `<div class="lbe-ds-hdr"><span class="lbe-ds-ttl">DIARY STATS</span><div class="lbe-ds-yr"><span class="lbe-ds-yr-btn" data-dir="prev">&#8249;</span><span class="lbe-ds-yr-v">${year}</span><span class="lbe-ds-yr-btn" data-dir="next">&#8250;</span></div></div>
      <div class="lbe-ds-empty">No diary entries found for ${year}</div>`;
  }

  function buildDiaryStatsHTML(stats, year) {
    const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const MONTH_FULL = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

    const maxMonthTotal = Math.max(...stats.monthly.map(m => m.total), 1);

    // Build bars
    let barsHTML = "";
    for (let i = 0; i < 12; i++) {
      const m = stats.monthly[i];
      const totalH = Math.round((m.total / maxMonthTotal) * 80);
      const rwH = m.total > 0 ? Math.max(Math.round((m.rewatchCount / maxMonthTotal) * 80), m.rewatchCount > 0 ? 3 : 0) : 0;
      const newH = Math.max(totalH - rwH, m.newCount > 0 ? 2 : 0);
      const rwText = m.rewatchCount === 0 ? "no rewatches" : m.rewatchCount === 1 ? "1 rewatch" : `${m.rewatchCount} rewatches`;
      const tip = `${MONTH_FULL[i]}: ${m.total} ${m.total === 1 ? "film" : "films"}, ${rwText}`;

      barsHTML += `<div class="lbe-ds-col" data-month="${i}" data-tip="${tip}"><div class="lbe-ds-stk"><div class="lbe-ds-bar-new" style="height:${newH}px"></div>${rwH > 0 ? `<div class="lbe-ds-bar-rw" style="height:${rwH}px"></div>` : ""}</div></div>`;
    }

    // Labels
    let labelsHTML = MONTH_SHORT.map(m => `<span>${m}</span>`).join("");

    // Genres
    let genresHTML = stats.topGenres.map(g => `<span class="lbe-ds-g">${g.name}<b>${g.count}</b></span>`).join("");

    const avgStr = stats.avgRating !== null ? stats.avgRating.toFixed(1) : "—";
    const perMonthStr = stats.perMonth.toFixed(1);

    return `<div class="lbe-ds-hdr">
        <span class="lbe-ds-ttl">DIARY STATS</span>
        <div class="lbe-ds-yr-wrap">
          <span class="lbe-ds-refresh" title="Refresh stats">&#8635;</span>
          <div class="lbe-ds-yr"><span class="lbe-ds-yr-btn" data-dir="prev">&#8249;</span><span class="lbe-ds-yr-v">${year}</span><span class="lbe-ds-yr-btn" data-dir="next">&#8250;</span></div>
        </div>
      </div>
      <div class="lbe-ds-stats">
        <div><span class="lbe-ds-big">${stats.totalFilms}</span><span class="lbe-ds-unit">films</span></div>
        <div class="lbe-ds-sep"></div>
        <div><span class="lbe-ds-v">${avgStr}</span><span class="lbe-ds-unit">avg</span><div class="lbe-ds-sub">${perMonthStr} per month</div></div>
        <div class="lbe-ds-sep"></div>
        <div><span class="lbe-ds-v">${stats.rewatchCount}</span><span class="lbe-ds-unit">rewatches</span></div>
        <div class="lbe-ds-sep"></div>
        <div><span class="lbe-ds-v">${stats.totalHours}h</span><div class="lbe-ds-sub">total runtime</div></div>
        <div class="lbe-ds-sep"></div>
        <div><span class="lbe-ds-v">${stats.likedCount || 0}</span><span class="lbe-ds-unit">liked</span></div>
        <div class="lbe-ds-sep"></div>
        <div><span class="lbe-ds-v">${stats.reviewCount}</span><span class="lbe-ds-unit">reviews</span></div>
      </div>
      ${genresHTML ? `<div class="lbe-ds-genres">${genresHTML}</div>` : ""}
      <div class="lbe-ds-toggle">
        <button class="lbe-ds-tog-btn lbe-ds-tog-active" data-view="monthly">Monthly</button>
        <button class="lbe-ds-tog-btn" data-view="weekly">Weekly</button>
        <button class="lbe-ds-tog-btn" data-view="day">Day</button>
      </div>
      <div class="lbe-ds-view" data-view-id="monthly">
        <div class="lbe-ds-bars">${barsHTML}</div>
        <div class="lbe-ds-lbl">${labelsHTML}</div>
        <div class="lbe-ds-leg"><span><span class="lbe-ds-dot" style="background:#5a6572"></span>New</span><span><span class="lbe-ds-dot" style="background:#FAC775"></span>Rewatch</span></div>
      </div>
      <div class="lbe-ds-view" data-view-id="weekly" style="display:none">
        ${buildWeeklyHTML(stats, year)}
      </div>
      <div class="lbe-ds-view" data-view-id="day" style="display:none">
        ${buildYearlyDayOfWeekHTML(stats)}
      </div>`;
  }

  function buildWeeklyHTML(stats, year) {
    if (!stats.weekly || stats.weekly.every(w => w === 0)) return "";
    const max = stats.maxWeekly || 1;
    const MSHORT = ["Jan", "", "", "Apr", "", "", "Jul", "", "", "Oct", "", ""];
    let bars = "";
    for (let w = 0; w < 53; w++) {
      const count = stats.weekly[w];
      const h = Math.round((count / max) * 48);
      const isTop = w === stats.mostWatchedWeekIdx;
      bars += `<div class="lbe-ds-wk-bar-col${isTop ? " lbe-ds-wk-top" : ""}" style="height:${Math.max(h, count > 0 ? 2 : 0)}px" data-tip="Week ${w + 1}: ${count} ${count === 1 ? "film" : "films"}"></div>`;
    }
    const topLabel = stats.maxWeekly > 0
      ? `<span class="lbe-ds-wkly-peak"><b>${stats.maxWeekly}</b> films · Week ${stats.mostWatchedWeekIdx + 1} · ${stats.mostWatchedWeekRange}</span>`
      : "";
    return `<div class="lbe-ds-weekly">
      <div class="lbe-ds-wkly-hdr"><span class="lbe-ds-wk-ttl">Films by week</span>${topLabel}</div>
      <div class="lbe-ds-wkly-bars">${bars}</div>
      <div class="lbe-ds-wkly-lbl"><span>Jan</span><span>Apr</span><span>Jul</span><span>Oct</span><span></span></div>
    </div>`;
  }

  function buildYearlyDayOfWeekHTML(stats) {
    if (!stats.yearlyDayOfWeek) return "";
    const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
    // Reorder from Sun-first to Mon-first for display
    const reordered = [
      stats.yearlyDayOfWeek[1], // Mon
      stats.yearlyDayOfWeek[2], // Tue
      stats.yearlyDayOfWeek[3], // Wed
      stats.yearlyDayOfWeek[4], // Thu
      stats.yearlyDayOfWeek[5], // Fri
      stats.yearlyDayOfWeek[6], // Sat
      stats.yearlyDayOfWeek[0], // Sun
    ];
    const max = Math.max(...reordered, 1);
    let bars = "";
    for (let d = 0; d < 7; d++) {
      const count = reordered[d];
      const pct = Math.round((count / max) * 100);
      const isTop = count === max && count > 0;
      bars += `<div class="lbe-ds-dow-row">
        <span class="lbe-ds-dow-day">${DAYS[d]}</span>
        <div class="lbe-ds-dow-track"><div class="lbe-ds-dow-fill${isTop ? " lbe-ds-dow-top" : ""}" style="width:${Math.max(pct, count > 0 ? 3 : 0)}%"></div></div>
        ${isTop ? `<span class="lbe-ds-dow-count">${count} Films</span>` : ""}
      </div>`;
    }
    return `<div class="lbe-ds-dow">
      <div class="lbe-ds-wk-ttl">Most watched day</div>
      <div class="lbe-ds-dow-chart">${bars}</div>
    </div>`;
  }

  function renderMonthExpand(container, monthIdx) {
    container.querySelector(".lbe-ds-expand")?.remove();
    if (!_lastDiaryStats) return;

    const m = _lastDiaryStats.monthly[monthIdx];
    if (!m || m.total === 0) return;

    const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const DAYS_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const maxDay = Math.max(...m.dayOfWeek, 1);

    let barsHTML = "";
    for (let d = 0; d < 7; d++) {
      const pct = Math.round((m.dayOfWeek[d] / maxDay) * 100);
      const filmWord = m.dayOfWeek[d] === 1 ? "film" : "films";
      barsHTML += `<div class="lbe-ds-wk-c" data-tip="${DAYS_FULL[d]}: ${m.dayOfWeek[d]} ${filmWord}"><div class="lbe-ds-wk-b" style="height:${Math.max(pct, m.dayOfWeek[d] > 0 ? 8 : 4)}%"></div><span class="lbe-ds-wk-l">${DAYS[d]}</span></div>`;
    }

    const avgStr = m.avgRating !== null ? m.avgRating.toFixed(1) : "—";

    const expand = document.createElement("div");
    expand.className = "lbe-ds-expand";
    expand.innerHTML = `
      <div class="lbe-ds-exp-h"><span><span class="lbe-ds-exp-m">${m.name}</span><span class="lbe-ds-exp-c">${m.total} ${m.total === 1 ? "film" : "films"}</span></span><span class="lbe-ds-exp-arr">&#9660;</span></div>
      <div class="lbe-ds-exp-body">
        <div class="lbe-ds-wk-ttl">Day of week</div>
        <div class="lbe-ds-wk">${barsHTML}</div>
        <div class="lbe-ds-m-meta">
          <span>Average rating: <span>${avgStr}</span></span>
          <span>Most watched: <span>${m.mostWatchedDay || "—"}</span></span>
          <span>Rewatches: <span>${m.rewatchCount}</span></span>
          <span>Liked: <span>${m.likedCount || 0}</span></span>
          <span>Reviews: <span>${m.reviewCount}</span></span>
        </div>
      </div>`;

    // Insert inside the monthly view after legend
    const monthlyView = container.querySelector('[data-view-id="monthly"]');
    const leg = monthlyView?.querySelector(".lbe-ds-leg");
    if (leg) leg.after(expand);
    else if (monthlyView) monthlyView.appendChild(expand);
    else container.appendChild(expand);
  }

  // ── Init ───────────────────────────────────────────────────────
  function init() {
    chrome.storage.sync.get({ togglePoster: true, toggleRatings: true, toggleMeta: true, toggleFriendsHisto: true, toggleListProgress: true, toggleDiaryStats: true }, s => {
      if (isFilmPage()) {
        const info = getFilmInfo();
        if (info) {
          if (s.toggleMeta) metaBar();
          if (s.togglePoster) injectPoster(info);
          if (s.toggleRatings || s.toggleFriendsHisto) injectSidebar(info, s.toggleFriendsHisto);
        }
      } else if (s.toggleFriendsHisto && isReviewPage()) {
        injectReviewPageHistogram();
      }
      if (s.toggleDiaryStats && isDiaryPage()) {
        injectDiaryStats();
      }
      if (s.togglePoster) setupGrids();
      if (s.toggleListProgress) scanListProgress();
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  let last = location.href;
  new MutationObserver(debounce(() => {
    if (location.href !== last) {
      last = location.href;
      _reviewHistoInjected = false;
      _diaryStatsInjected = false;
      _lastDiaryStats = null;
      _diaryExpandedMonth = null;
      setTimeout(init, 500);
      return;
    }
    setupGrids();
    chrome.storage.sync.get({ toggleListProgress: true }, s => {
      if (s.toggleListProgress) scanListProgress();
    });
  }, 300)).observe(document.body, { childList: true, subtree: true });
})();
