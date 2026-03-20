const invoke = window.__TAURI__?.core?.invoke;

const input = document.getElementById("searchInput");
const resultsEl = document.getElementById("results");
const metaLeft = document.getElementById("metaLeft");
const metaRight = document.getElementById("metaRight");
const refreshBtn = document.getElementById("refreshBtn");
const quickModeButtons = Array.from(document.querySelectorAll(".mode-chip"));

const MAX_RESULTS = 14;
const URL_PATTERN = /^(https?:\/\/|www\.)/i;

let catalog = [];
let filtered = [];
let activeIndex = 0;

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function tokenize(value) {
  return normalize(value).split(/\s+/).filter(Boolean);
}

function escapeHtml(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeRegex(str) {
  return String(str || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildAcronym(text) {
  return tokenize(text).map((chunk) => chunk[0]).join("");
}

function mathEval(inputExpr) {
  const expr = String(inputExpr || "").trim().replace(",", ".");
  if (!expr) return null;
  if (!/^[\d\s+\-*/().%]+$/.test(expr)) return null;

  try {
    const result = Function(`"use strict"; return (${expr});`)();
    if (!Number.isFinite(result)) return null;
    return Number.isInteger(result) ? String(result) : String(Number(result.toFixed(6)));
  } catch {
    return null;
  }
}

function limitedLevenshtein(a, b, maxDistance = 2) {
  if (!a || !b) return Math.max(a.length, b.length);
  if (Math.abs(a.length - b.length) > maxDistance) return maxDistance + 1;

  const row = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j += 1) row[j] = j;

  for (let i = 1; i <= a.length; i += 1) {
    let prev = row[0];
    row[0] = i;
    let minInRow = row[0];

    for (let j = 1; j <= b.length; j += 1) {
      const temp = row[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;

      row[j] = Math.min(
        row[j] + 1,
        row[j - 1] + 1,
        prev + cost
      );

      prev = temp;
      if (row[j] < minInRow) minInRow = row[j];
    }

    if (minInRow > maxDistance) return maxDistance + 1;
  }

  return row[b.length];
}

function subsequenceScore(query, text) {
  if (!query || !text) return 0;
  let q = 0;
  let t = 0;

  while (q < query.length && t < text.length) {
    if (query[q] === text[t]) q += 1;
    t += 1;
  }

  if (q !== query.length) return 0;
  return q / Math.max(text.length, 1);
}

function looksLikeUrl(query) {
  if (URL_PATTERN.test(query)) return true;
  return /^[a-z0-9-]+\.[a-z]{2,}(\/.*)?$/i.test(query) && !query.includes(" ");
}

function toUrl(query) {
  if (URL_PATTERN.test(query)) {
    if (query.toLowerCase().startsWith("www.")) return `https://${query}`;
    return query;
  }
  return `https://${query}`;
}

function inferIcon(item) {
  const kind = normalize(item.kind);
  const path = normalize(item.path);

  if (kind === "web") return "🌐";
  if (kind === "math") return "🧮";
  if (kind === "system") return "⚙️";
  if (path.endsWith(".url")) return "🔗";
  if (path.endsWith(".exe")) return "🪟";
  if (path.endsWith(".lnk")) return "🚀";
  return "📦";
}

function inferKindLabel(item) {
  const kind = normalize(item.kind);
  if (kind === "web") return "Web";
  if (kind === "math") return "Math";
  if (kind === "system") return "Systeme";
  return "Application";
}

function inferReasonLabel(reason) {
  if (!reason) return "Pertinent";
  return reason;
}

function enrichCatalogItem(item) {
  return {
    ...item,
    icon: inferIcon(item),
    kind: item.kind || "App"
  };
}

function scoreCatalogItem(item, query) {
  const q = normalize(query);
  const title = normalize(item.title);
  const path = normalize(item.path);
  const keywords = normalize((item.keywords || []).join(" "));
  const tokens = tokenize(q);
  const titleTokens = tokenize(title);
  const acronym = buildAcronym(title);
  const usageBoost = Math.log2((item.usage || 0) + 1) * 28;

  if (!q) {
    return {
      value: 30 + usageBoost + (normalize(item.kind) === "system" ? 8 : 0),
      reason: (item.usage || 0) > 0 ? "Frequent" : "Catalogue"
    };
  }

  let score = usageBoost;
  let reason = "";

  if (title === q) {
    score += 430;
    reason = "Exact";
  } else if (title.startsWith(q)) {
    score += 250;
    reason = "Prefixe";
  } else if (title.includes(q)) {
    score += 160;
    reason = "Titre";
  }

  if (acronym && q.length >= 2 && acronym.startsWith(q)) {
    score += 125;
    reason ||= "Acronyme";
  }

  let matchedTokens = 0;
  for (const token of tokens) {
    if (titleTokens.some((part) => part.startsWith(token))) {
      score += 52;
      matchedTokens += 1;
    } else if (title.includes(token)) {
      score += 28;
      matchedTokens += 0.5;
    } else if (keywords.includes(token)) {
      score += 18;
      matchedTokens += 0.4;
    } else if (path.includes(token)) {
      score += 12;
      matchedTokens += 0.2;
    }
  }

  if (matchedTokens >= tokens.length && tokens.length > 0) {
    score += 78;
    reason ||= "Multi-termes";
  }

  const subseq = subsequenceScore(q, title);
  if (subseq > 0) {
    score += Math.round(subseq * 95);
    reason ||= "Fuzzy";
  }

  if (path.includes(q)) {
    score += 48;
    reason ||= "Chemin";
  }

  if (q.length >= 3 && q.length <= 7 && title.length <= 38) {
    const candidate = title.slice(0, Math.min(title.length, q.length + 2));
    const distance = limitedLevenshtein(q, candidate, 2);
    if (distance === 1) {
      score += 34;
      reason ||= "Tolere faute";
    } else if (distance === 2) {
      score += 15;
      reason ||= "Approchant";
    }
  }

  if (normalize(item.kind) === "system") score += 10;

  return { value: score, reason: reason || "Pertinent" };
}

function buildSmartResults(rawQuery) {
  const qRaw = String(rawQuery || "");
  const q = qRaw.trim();
  const qNorm = normalize(q);
  const rawLower = qRaw.toLowerCase();
  if (!qNorm && !rawLower.endsWith(" ")) return [];

  const smart = [];

  if (rawLower.startsWith("g ")) {
    const target = qRaw.slice(2).trim();
    if (target) {
      smart.push({
        title: `Google: ${target}`,
        path: "Commande rapide",
        kind: "Web",
        icon: "⚡",
        webUrl: `https://www.google.com/search?q=${encodeURIComponent(target)}`,
        _score: 500,
        _reason: "Commande"
      });
    }
  }

  if (rawLower.startsWith("yt ")) {
    const target = qRaw.slice(3).trim();
    if (target) {
      smart.push({
        title: `YouTube: ${target}`,
        path: "Commande rapide",
        kind: "Web",
        icon: "⚡",
        webUrl: `https://www.youtube.com/results?search_query=${encodeURIComponent(target)}`,
        _score: 500,
        _reason: "Commande"
      });
    }
  }

  if (rawLower.startsWith("gh ")) {
    const target = qRaw.slice(3).trim();
    if (target) {
      smart.push({
        title: `GitHub: ${target}`,
        path: "Commande rapide",
        kind: "Web",
        icon: "⚡",
        webUrl: `https://github.com/search?q=${encodeURIComponent(target)}`,
        _score: 500,
        _reason: "Commande"
      });
    }
  }

  if (rawLower.startsWith("=") || rawLower.startsWith("calc ")) {
    const expression = rawLower.startsWith("=") ? qRaw.slice(1) : qRaw.slice(5);
    const value = mathEval(expression);
    if (value !== null) {
      smart.push({
        title: `${expression.trim()} = ${value}`,
        path: "Copier le resultat",
        kind: "Math",
        icon: "🧮",
        mathValue: value,
        _score: 520,
        _reason: "Calcul"
      });
    }
  }

  if (looksLikeUrl(q)) {
    smart.push({
      title: `Ouvrir ${q}`,
      path: "Navigation directe",
      kind: "Web",
      icon: "🌍",
      webUrl: toUrl(q),
      _score: 360,
      _reason: "URL"
    });
  }

  if (q.length >= 2 && !rawLower.startsWith("yt ") && !rawLower.startsWith("gh ") && !rawLower.startsWith("g ")) {
    smart.push(
      {
        title: `Google: ${q}`,
        path: "Recherche web",
        kind: "Web",
        icon: "🌐",
        webUrl: `https://www.google.com/search?q=${encodeURIComponent(q)}`,
        _score: 170,
        _reason: "Web"
      },
      {
        title: `YouTube: ${q}`,
        path: "Recherche video",
        kind: "Web",
        icon: "▶️",
        webUrl: `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`,
        _score: 150,
        _reason: "Video"
      },
      {
        title: `GitHub: ${q}`,
        path: "Recherche code",
        kind: "Web",
        icon: "💻",
        webUrl: `https://github.com/search?q=${encodeURIComponent(q)}`,
        _score: 140,
        _reason: "Code"
      }
    );
  }

  return smart;
}

function dedupeResults(items) {
  const seen = new Set();
  const out = [];

  for (const item of items) {
    const key = normalize(item.path || item.webUrl || item.title);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }

  return out;
}

function computeResults(query) {
  const scoredCatalog = catalog
    .map((item) => {
      const rank = scoreCatalogItem(item, query);
      return {
        ...item,
        _score: rank.value,
        _reason: rank.reason
      };
    })
    .filter((item) => item._score > 10);

  const smart = buildSmartResults(query);

  const merged = dedupeResults([...smart, ...scoredCatalog])
    .sort((a, b) => {
      if (b._score !== a._score) return b._score - a._score;
      return normalize(a.title).localeCompare(normalize(b.title));
    })
    .slice(0, MAX_RESULTS);

  return merged;
}

function highlightText(value, query) {
  const raw = String(value || "");
  const terms = tokenize(query).filter((token) => token.length >= 2).slice(0, 4);
  if (!terms.length) return escapeHtml(raw);

  const pattern = new RegExp(`(${terms.map(escapeRegex).join("|")})`, "ig");
  const chunks = raw.split(pattern);
  const termSet = new Set(terms.map(normalize));

  return chunks
    .map((chunk) => {
      if (termSet.has(normalize(chunk))) {
        return `<mark>${escapeHtml(chunk)}</mark>`;
      }
      return escapeHtml(chunk);
    })
    .join("");
}

function render() {
  const query = input.value;
  filtered = computeResults(query);
  activeIndex = Math.max(0, Math.min(activeIndex, filtered.length - 1));

  const queryText = query.trim();
  if (!queryText) {
    metaLeft.textContent = `${catalog.length} applications indexees`;
  } else {
    metaLeft.textContent = filtered.length
      ? `Top ${filtered.length} resultats pour "${queryText}"`
      : `Aucun resultat pour "${queryText}"`;
  }
  metaRight.textContent = `${filtered.length} resultat${filtered.length > 1 ? "s" : ""}`;

  if (filtered.length === 0) {
    resultsEl.innerHTML = `
      <div class="empty">
        <strong>Aucune correspondance.</strong><br />
        Essaie un terme plus court, ou un mode rapide comme <strong>g</strong>, <strong>yt</strong>, <strong>gh</strong> ou <strong>=</strong>.
      </div>
    `;
    return;
  }

  resultsEl.innerHTML = filtered
    .map((item, idx) => {
      const iconClass = normalize(item.kind) === "web"
        ? "web"
        : normalize(item.kind) === "math"
          ? "math"
          : normalize(item.kind) === "system"
            ? "system"
            : "";

      const titleHtml = highlightText(item.title || "", query);
      const pathHtml = highlightText(item.path || "", query);
      const kindLabel = inferKindLabel(item);
      const reason = inferReasonLabel(item._reason);

      return `
        <div class="item ${idx === activeIndex ? "active" : ""}" data-idx="${idx}" style="--i:${idx}">
          <div class="left">
            <div class="icon ${iconClass}">${item.icon || "📦"}</div>
            <div class="texts">
              <div class="name">${titleHtml}</div>
              <div class="path">${pathHtml}</div>
              <div class="chips">
                <span class="chip kind">${escapeHtml(kindLabel)}</span>
                <span class="chip reason">${escapeHtml(reason)}</span>
              </div>
            </div>
          </div>
          <div class="actions">
            ${item.webUrl || normalize(item.kind) === "math"
              ? ""
              : `<button class="action-btn reveal-btn" data-path="${escapeHtml(item.path || "")}">Reveler</button>`}
            <button class="action-btn open-btn" data-idx="${idx}">Ouvrir</button>
          </div>
        </div>
      `;
    })
    .join("");
}

async function revealPath(path) {
  if (!path) return;
  try {
    await invoke("reveal_item", { path });
  } catch (err) {
    console.error("reveal_item error", err);
    metaLeft.textContent = `Erreur reveal: ${String(err)}`;
  }
}

async function runItem(item) {
  if (!item) return;

  try {
    const kind = normalize(item.kind);

    if (kind === "math" && item.mathValue) {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(String(item.mathValue));
        metaLeft.textContent = `Resultat copie: ${item.mathValue}`;
      } else {
        metaLeft.textContent = `Resultat: ${item.mathValue}`;
      }
      return;
    }

    if (item.webUrl) {
      window.open(item.webUrl, "_blank");
      await invoke("hide_main_window");
      return;
    }

    await invoke("launch_item", { path: item.path });
    await invoke("hide_main_window");
  } catch (err) {
    console.error("runItem error", err);
    metaLeft.textContent = `Erreur lancement: ${String(err)}`;
  }
}

function focusActiveItem() {
  const activeRow = resultsEl.querySelector(".item.active");
  if (activeRow) {
    activeRow.scrollIntoView({ block: "nearest" });
  }
}

function updateModeButtons() {
  const value = normalize(input.value);
  quickModeButtons.forEach((button) => {
    const prefix = normalize(button.dataset.prefix || "");
    button.classList.toggle("active", prefix && value.startsWith(prefix));
  });
}

async function loadCatalog() {
  try {
    metaLeft.textContent = "Chargement du catalogue...";
    const data = await invoke("get_catalog");

    if (!Array.isArray(data)) {
      metaLeft.textContent = "Catalogue invalide";
      catalog = [];
      render();
      return;
    }

    catalog = data.map(enrichCatalogItem);
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
    metaLeft.textContent = "Rafraichissement du catalogue...";
    const data = await invoke("refresh_catalog");

    if (!Array.isArray(data)) {
      metaLeft.textContent = "Rafraichissement invalide";
      return;
    }

    catalog = data.map(enrichCatalogItem);
    activeIndex = 0;
    render();
  } catch (err) {
    console.error("refreshCatalog error", err);
    metaLeft.textContent = `Erreur rafraichissement: ${String(err)}`;
  }
}

resultsEl.addEventListener("click", async (event) => {
  const openBtn = event.target.closest(".open-btn");
  if (openBtn) {
    event.stopPropagation();
    const idx = Number(openBtn.dataset.idx);
    await runItem(filtered[idx]);
    return;
  }

  const revealBtn = event.target.closest(".reveal-btn");
  if (revealBtn) {
    event.stopPropagation();
    await revealPath(revealBtn.dataset.path);
    return;
  }

  const row = event.target.closest(".item");
  if (!row) return;
  const idx = Number(row.dataset.idx);
  await runItem(filtered[idx]);
});

document.addEventListener("keydown", async (event) => {
  if (event.key === "ArrowDown") {
    event.preventDefault();
    activeIndex = Math.min(activeIndex + 1, filtered.length - 1);
    render();
    focusActiveItem();
  }

  if (event.key === "ArrowUp") {
    event.preventDefault();
    activeIndex = Math.max(activeIndex - 1, 0);
    render();
    focusActiveItem();
  }

  if (event.key === "Enter") {
    event.preventDefault();
    await runItem(filtered[activeIndex]);
  }

  if (event.key === "Escape") {
    event.preventDefault();
    try {
      await invoke("hide_main_window");
    } catch (err) {
      console.error("hide_main_window error", err);
    }
  }
});

input.addEventListener("input", () => {
  activeIndex = 0;
  updateModeButtons();
  render();
});

quickModeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const prefix = button.dataset.prefix || "";
    const raw = input.value;

    if (normalize(raw).startsWith(normalize(prefix))) {
      input.value = raw.replace(new RegExp(`^${escapeRegex(prefix)}`, "i"), "").trimStart();
    } else if (raw.length > 0) {
      input.value = `${prefix}${raw.trimStart()}`;
    } else {
      input.value = prefix;
    }

    input.focus();
    activeIndex = 0;
    updateModeButtons();
    render();
  });
});

refreshBtn.addEventListener("click", refreshCatalog);

if (typeof invoke !== "function") {
  metaLeft.textContent = "Erreur: API Tauri introuvable";
  console.error("window.__TAURI__.core.invoke is unavailable.");
} else {
  loadCatalog();
  updateModeButtons();
  setTimeout(() => input.focus(), 60);
}
