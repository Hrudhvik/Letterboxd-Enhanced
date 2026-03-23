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

  // ── Init ───────────────────────────────────────────────────────
  function init() {
    chrome.storage.sync.get({ togglePoster: true, toggleRatings: true, toggleMeta: true, toggleFriendsHisto: true, toggleListProgress: true }, s => {
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
      setTimeout(init, 500);
      return;
    }
    setupGrids();
    chrome.storage.sync.get({ toggleListProgress: true }, s => {
      if (s.toggleListProgress) scanListProgress();
    });
  }, 300)).observe(document.body, { childList: true, subtree: true });
})();
