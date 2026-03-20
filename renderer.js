const input = document.getElementById("searchInput");
const resultsEl = document.getElementById("results");
const resultCount = document.getElementById("resultCount");
const statusText = document.getElementById("statusText");
const refreshBtn = document.getElementById("refreshBtn");

let library = [];
let filtered = [];
let activeIndex = 0;

function normalize(str) {
  return (str || "").toLowerCase().trim();
}

function scoreItem(item, query) {
  if (!query) return 1;

  const q = normalize(query);
  const title = normalize(item.title);
  const subtitle = normalize(item.subtitle);
  const keywords = normalize((item.keywords || []).join(" "));

  let score = 0;

  if (title === q) score += 100;
  if (title.startsWith(q)) score += 60;
  if (title.includes(q)) score += 40;
  if (keywords.includes(q)) score += 25;
  if (subtitle.includes(q)) score += 10;

  const parts = q.split(/\s+/);
  for (const part of parts) {
    if (title.includes(part)) score += 10;
    if (keywords.includes(part)) score += 8;
    if (subtitle.includes(part)) score += 4;
  }

  return score;
}

function buildDynamicResults(query) {
  const q = normalize(query);
  if (!q) return [];

  const dynamic = [
    {
      title: `Rechercher "${query}" sur Google`,
      subtitle: "Recherche web",
      type: "Web",
      icon: "🌍",
      keywords: [q, "google", "web"],
      score: 5,
      action: {
        type: "url",
        value: `https://www.google.com/search?q=${encodeURIComponent(query)}`
      }
    },
    {
      title: `Rechercher "${query}" sur YouTube`,
      subtitle: "Vidéo / musique",
      type: "Web",
      icon: "▶️",
      keywords: [q, "youtube", "video"],
      score: 4,
      action: {
        type: "url",
        value: `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`
      }
    },
    {
      title: `Rechercher "${query}" sur GitHub`,
      subtitle: "Code / repository",
      type: "Web",
      icon: "💻",
      keywords: [q, "github", "code"],
      score: 3,
      action: {
        type: "url",
        value: `https://github.com/search?q=${encodeURIComponent(query)}`
      }
    }
  ];

  if (q.startsWith("g ")) {
    const real = query.slice(2).trim();
    if (real) {
      dynamic.unshift({
        title: `Google : ${real}`,
        subtitle: "Commande rapide",
        type: "Shortcut",
        icon: "⚡",
        keywords: [real, "google"],
        score: 120,
        action: {
          type: "url",
          value: `https://www.google.com/search?q=${encodeURIComponent(real)}`
        }
      });
    }
  }

  if (q.startsWith("yt ")) {
    const real = query.slice(3).trim();
    if (real) {
      dynamic.unshift({
        title: `YouTube : ${real}`,
        subtitle: "Commande rapide",
        type: "Shortcut",
        icon: "⚡",
        keywords: [real, "youtube"],
        score: 120,
        action: {
          type: "url",
          value: `https://www.youtube.com/results?search_query=${encodeURIComponent(real)}`
        }
      });
    }
  }

  if (q.startsWith("gh ")) {
    const real = query.slice(3).trim();
    if (real) {
      dynamic.unshift({
        title: `GitHub : ${real}`,
        subtitle: "Commande rapide",
        type: "Shortcut",
        icon: "⚡",
        keywords: [real, "github"],
        score: 120,
        action: {
          type: "url",
          value: `https://github.com/search?q=${encodeURIComponent(real)}`
        }
      });
    }
  }

  return dynamic;
}

function getResults(query) {
  const base = library
    .map(item => ({
      ...item,
      score: scoreItem(item, query)
    }))
    .filter(item => item.score > 0);

  const dynamic = buildDynamicResults(query);

  return [...base, ...dynamic]
    .sort((a, b) => b.score - a.score)
    .slice(0, 12);
}

function render() {
  filtered = getResults(input.value);
  activeIndex = Math.min(activeIndex, filtered.length - 1);
  if (activeIndex < 0) activeIndex = 0;

  resultCount.textContent = `${filtered.length} résultat${filtered.length > 1 ? "s" : ""}`;

  resultsEl.innerHTML = filtered.map((item, index) => `
    <div class="result-item ${index === activeIndex ? "active" : ""}" data-index="${index}">
      <div class="result-left">
        <div class="result-icon">${item.icon || "🧩"}</div>
        <div class="result-text">
          <div class="result-title">${item.title}</div>
          <div class="result-sub">${item.subtitle || ""}</div>
        </div>
      </div>
      <div class="result-tag">${item.type || "Item"}</div>
    </div>
  `).join("");

  document.querySelectorAll(".result-item").forEach((itemEl) => {
    itemEl.addEventListener("click", async () => {
      const index = Number(itemEl.dataset.index);
      await runAction(filtered[index]);
    });
  });
}

async function runAction(item) {
  if (!item || !item.action) return;
  await window.neoAPI.launchAction(item.action);
  await window.neoAPI.hideLauncher();
}

async function loadApps() {
  statusText.textContent = "Chargement des applications...";
  const response = await window.neoAPI.getApps();

  if (!response?.ok) {
    statusText.textContent = "Erreur de chargement";
    return;
  }

  library = [...response.apps, ...response.commands];
  statusText.textContent = `${response.apps.length} applications détectées`;
  render();
}

async function refreshApps() {
  statusText.textContent = "Rafraîchissement...";
  const response = await window.neoAPI.refreshApps();

  if (!response?.ok) {
    statusText.textContent = "Erreur de rafraîchissement";
    return;
  }

  library = [...response.apps, ...response.commands];
  statusText.textContent = `${response.apps.length} applications détectées`;
  activeIndex = 0;
  render();
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
    await runAction(filtered[activeIndex]);
  }

  if (e.key === "Escape") {
    e.preventDefault();
    await window.neoAPI.hideLauncher();
  }
});

input.addEventListener("input", () => {
  activeIndex = 0;
  render();
});

refreshBtn.addEventListener("click", async () => {
  await refreshApps();
});

window.neoAPI.onLauncherShown(() => {
  setTimeout(() => {
    input.value = "";
    activeIndex = 0;
    render();
    input.focus();
  }, 30);
});

window.neoAPI.onLauncherHidden(() => {
  input.value = "";
  activeIndex = 0;
  render();
});

loadApps();