const DEFAULTS = { omdbKey: "", tmdbKey: "", togglePoster: true, toggleRatings: true, toggleMeta: true, toggleFriendsHisto: true, toggleListProgress: true };

chrome.storage.sync.get(DEFAULTS, (s) => {
  document.getElementById("omdbKey").value = s.omdbKey;
  document.getElementById("tmdbKey").value = s.tmdbKey;
  document.getElementById("togglePoster").checked = s.togglePoster;
  document.getElementById("toggleRatings").checked = s.toggleRatings;
  document.getElementById("toggleMeta").checked = s.toggleMeta;
  document.getElementById("toggleFriendsHisto").checked = s.toggleFriendsHisto;
  document.getElementById("toggleListProgress").checked = s.toggleListProgress;
});

function refreshStats() {
  chrome.runtime.sendMessage({ type: "GET_KEY_STATS" }, (r) => {
    const el = document.getElementById("keyStats");
    if (!r) { el.textContent = ""; return; }
    let html = "";
    if (r.tmdbConfigured) html += `<span style="color:#00e054;font-size:10px">✓ TMDB key active (primary)</span><br>`;
    else html += `<span style="color:#fa320a;font-size:10px">⚠ TMDB key missing — ratings won't work</span><br>`;
    if (r.keys?.length) html += r.keys.map(k => `<span style="font-family:monospace;font-size:10px">${k.key} ${k.exhausted ? "⛔" : "✓ " + k.used + " today"}</span>`).join("<br>");
    else html += `<span style="font-size:10px;color:#678">OMDb keys optional (adds RT scores)</span>`;
    el.innerHTML = html;
  });
}
refreshStats();

document.getElementById("save").addEventListener("click", () => {
  chrome.storage.sync.set({
    omdbKey: document.getElementById("omdbKey").value.trim(),
    tmdbKey: document.getElementById("tmdbKey").value.trim(),
    togglePoster: document.getElementById("togglePoster").checked,
    toggleRatings: document.getElementById("toggleRatings").checked,
    toggleMeta: document.getElementById("toggleMeta").checked,
    toggleFriendsHisto: document.getElementById("toggleFriendsHisto").checked,
    toggleListProgress: document.getElementById("toggleListProgress").checked,
  }, () => {
    document.getElementById("status").style.display = "block";
    setTimeout(() => document.getElementById("status").style.display = "none", 2000);
    setTimeout(refreshStats, 500);
  });
});
