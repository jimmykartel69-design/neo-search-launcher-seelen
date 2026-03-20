const { invoke } = window.__TAURI__.core;

const input = document.getElementById("searchInput");
const resultsEl = document.getElementById("results");
const metaLeft = document.getElementById("metaLeft");
const metaRight = document.getElementById("metaRight");
const refreshBtn = document.getElementById("refreshBtn");

let catalog = [];
let filtered = [];
let activeIndex = 0;

function normalize(v) {
  return (v || "").toLowerCase().trim();
}

function score(item, query) {
  if (!query) return 1 + (item.usage || 0) * 2;

  const q = normalize(query);
  const title = normalize(item.title);
  const path = normalize(item.path);
  const keywords = normalize((item.keywords || []).join(" "));

  let s = item.usage || 0;

  if (title === q) s += 100;
  if (title.startsWith(q)) s += 60;
  if (title.includes(q)) s += 40;
  if (keywords.includes(q)) s += 25;
  if (path.includes(q)) s += 8;

  for (const part of q.split(/\s+/)) {
    if (title.includes(part)) s += 10;
    if (keywords.includes(part)) s += 8;
  }

  return s;
}

function buildWebResults(query) {
  const q = normalize(query);
  if (!q) return [];

  if (q.startsWith("g ")) {
    const real = query.slice(2).trim();
    if (real) {
      return [{
        title: `Google : ${real}`,
        path: "Commande rapide",
        kind: "Web",
        icon: "⚡",
        webUrl: `https://www.google.com/search?q=${encodeURIComponent(real)}`,
        usage: 999
      }];
    }
  }

  if (q.startsWith("yt ")) {
    const real = query.slice(3).trim();
    if (real) {
      return [{
        title: `YouTube : ${real}`,
        path: "Commande rapide",
        kind: "Web",
        icon: "⚡",
        webUrl: `https://www.youtube.com/results?search_query=${encodeURIComponent(real)}`,
        usage: 999
      }];
    }
  }

  if (q.startsWith("gh ")) {
    const real = query.slice(3).trim();
    if (real) {
      return [{
        title: `GitHub : ${real}`,
        path: "Commande rapide",
        kind: "Web",
        icon: "⚡",
        webUrl: `https://github.com/search?q=${encodeURIComponent(real)}`,
        usage: 999
      }];
    }
  }

  return [
    {
      title: `Google : ${query}`,
      path: "Recherche web",
      kind: "Web",
      icon: "🌍",
      webUrl: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
      usage: 0
    },
    {
      title: `YouTube : ${query}`,
      path: "Recherche vidéo",
      kind: "Web",
      icon: "▶️",
      webUrl: `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`,
      usage: 0
    },
    {
      title: `GitHub : ${query}`,
      path: "Recherche code",
      kind: "Web",
      icon: "💻",
      webUrl: `https://github.com/search?q=${encodeURIComponent(query)}`,
      usage: 0
    }
  ];
}

function computeResults(query) {
  const base = catalog
    .map(item => ({ ...item, _score: score(item, query), icon: item.icon || "🪟" }))
    .filter(item => item._score > 0);

  const web = buildWebResults(query)
    .map(item => ({ ...item, _score: score(item, query) + (item.usage || 0) }));

  return [...base, ...web]
    .sort((a, b) => b._score - a._score)
    .slice(0, 12);
}

function escapeHtml(str) {
  return (str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function render() {
  filtered = computeResults(input.value);
  activeIndex = Math.min(activeIndex, Math.max(filtered.length - 1, 0));
  metaRight.textContent = `${filtered.length} résultat${filtered.length > 1 ? "s" : ""}`;

  resultsEl.innerHTML = filtered.map((item, idx) => `
    <div class="item ${idx === activeIndex ? "active" : ""}" data-idx="${idx}">
      <div class="left">
        <div class="icon">${item.icon || "🧩"}</div>
        <div class="texts">
          <div class="name">${escapeHtml(item.title || "")}</div>
          <div class="path">${escapeHtml(item.path || "")}</div>
        </div>
      </div>
      <div class="actions">
        ${item.webUrl ? "" : `<button class="action-btn reveal-btn" data-path="${escapeHtml(item.path)}">Révéler</button>`}
        <button class="action-btn open-btn" data-idx="${idx}">Ouvrir</button>
      </div>
    </div>
  `).join("");

  document.querySelectorAll(".open-btn").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const idx = Number(btn.dataset.idx);
      await runItem(filtered[idx]);
    });
  });

  document.querySelectorAll(".reveal-btn").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const path = btn.dataset.path;
      try {
        console.log("reveal_item =>", path);
        await invoke("reveal_item", { path });
      } catch (err) {
        console.error("reveal_item error", err);
        metaLeft.textContent = `Erreur reveal: ${String(err)}`;
      }
    });
  });

  document.querySelectorAll(".item").forEach(row => {
    row.addEventListener("click", async () => {
      const idx = Number(row.dataset.idx);
      await runItem(filtered[idx]);
    });
  });
}

async function runItem(item) {
  if (!item) return;

  try {
    if (item.webUrl) {
      console.log("open web =>", item.webUrl);
      window.open(item.webUrl, "_blank");
      await invoke("hide_main_window");
      return;
    }

    console.log("launch_item =>", item.path);
    await invoke("launch_item", { path: item.path });
    await invoke("hide_main_window");
  } catch (err) {
    console.error("runItem error", err);
    metaLeft.textContent = `Erreur lancement: ${String(err)}`;
  }
}

async function loadCatalog() {
  try {
    metaLeft.textContent = "Chargement...";
    const data = await invoke("get_catalog");
    console.log("get_catalog =>", data);

    if (!Array.isArray(data)) {
      metaLeft.textContent = "Catalogue invalide";
      catalog = [];
      render();
      return;
    }

    catalog = data;
    metaLeft.textContent = `${catalog.length} applications indexées`;
    render();
  } catch (err) {
    console.error("loadCatalog error", err);
    metaLeft.textContent = `Erreur chargement: ${String(err)}`;
    catalog = [];
    render();
  }
}

async function refreshCatalog() {
  try {
    metaLeft.textContent = "Rafraîchissement...";
    const data = await invoke("refresh_catalog");
    console.log("refresh_catalog =>", data);

    if (!Array.isArray(data)) {
      metaLeft.textContent = "Rafraîchissement invalide";
      return;
    }

    catalog = data;
    metaLeft.textContent = `${catalog.length} applications indexées`;
    activeIndex = 0;
    render();
  } catch (err) {
    console.error("refreshCatalog error", err);
    metaLeft.textContent = `Erreur refresh: ${String(err)}`;
  }
}

document.addEventListener("keydown", async (e) => {
  if (e.key === "ArrowDown") {
    e.preventDefault();
    activeIndex = Math.min(activeIndex + 1, filtered.length - 1);
    render();
  }

  if (e.key === "ArrowUp") {
    e.preventDefault();
    activeIndex = Math.max(activeIndex - 1, 0);
    render();
  }

  if (e.key === "Enter") {
    e.preventDefault();
    await runItem(filtered[activeIndex]);
  }

  if (e.key === "Escape") {
    e.preventDefault();
    try {
      await invoke("hide_main_window");
    } catch (err) {
      console.error("hide_main_window error", err);
    }
  }
});

input.addEventListener("input", () => {
  activeIndex = 0;
  render();
});

refreshBtn.addEventListener("click", refreshCatalog);

loadCatalog();
setTimeout(() => input.focus(), 50);