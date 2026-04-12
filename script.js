const rail = document.querySelector(".rail");
const cards = Array.from(document.querySelectorAll(".card"));

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function hexToRgb(hex) {
  const h = hex.replace("#", "").trim();
  const full = h.length === 3 ? h.split("").map(c => c + c).join("") : h;
  const num = parseInt(full, 16);
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

function mix(a, b, t) {
  return {
    r: Math.round(a.r + (b.r - a.r) * t),
    g: Math.round(a.g + (b.g - a.g) * t),
    b: Math.round(a.b + (b.b - a.b) * t),
  };
}

function rgbToCss(c) {
  return `rgb(${c.r} ${c.g} ${c.b})`;
}

function easeOutBack(t) {
  const c1 = 1.12;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

function animateScrollTo(targetLeft, duration = 340) {
  const startLeft = rail.scrollLeft;
  const delta = targetLeft - startLeft;
  if (Math.abs(delta) < 0.5) return;

  const start = performance.now();

  function frame(now) {
    const t = clamp((now - start) / duration, 0, 1);
    const eased = easeOutBack(t);
    rail.scrollLeft = startLeft + delta * eased;

    if (t < 1) {
      requestAnimationFrame(frame);
    } else {
      syncItineraryToCenteredCard();
    }
  }

  requestAnimationFrame(frame);
}

function getNearestCard() {
  const railRect = rail.getBoundingClientRect();
  const centerX = railRect.left + railRect.width / 2;

  let best = null;

  for (const card of cards) {
    const r = card.getBoundingClientRect();
    const cardCenter = r.left + r.width / 2;
    const dist = Math.abs(centerX - cardCenter);

    if (!best || dist < best.dist) best = { card, dist, rect: r };
  }

  if (!best) return null;

  const cardCenterX = best.rect.left + best.rect.width / 2;
  const railCenterX = railRect.left + railRect.width / 2;
  const deltaPx = cardCenterX - railCenterX;

  const maxDist = railRect.width * 0.70;
  const proximity = 1 - clamp(best.dist / maxDist, 0, 1);

  return { card: best.card, targetLeft: rail.scrollLeft + deltaPx, proximity };
}

let rafId = null;
let isPointerDown = false;
let lastPointerType = "unknown";

function updateVisuals() {
  rafId = null;

  const railRect = rail.getBoundingClientRect();
  const centerX = railRect.left + railRect.width / 2;

  let closest = null;
  let second = null;

  const MIN_SCALE = 0.90;
  const MAX_SCALE = 1.03;
  const MIN_OPACITY = 0.74;
  const MAX_OPACITY = 1.00;

  for (const card of cards) {
    const r = card.getBoundingClientRect();
    const cardCenter = r.left + r.width / 2;
    const dist = Math.abs(centerX - cardCenter);

    const maxDist = railRect.width * 0.70;
    const proximity = 1 - clamp(dist / maxDist, 0, 1);

    const scale = MIN_SCALE + (MAX_SCALE - MIN_SCALE) * proximity;
    const opacity = MIN_OPACITY + (MAX_OPACITY - MIN_OPACITY) * proximity;

    card.style.transform = `scale(${scale})`;
    card.style.opacity = opacity.toFixed(3);

    const item = { card, dist, proximity };
    if (!closest || item.dist < closest.dist) {
      second = closest;
      closest = item;
    } else if (!second || item.dist < second.dist) {
      second = item;
    }
  }

  if (closest) {
    const bg1 = closest.card.dataset.bg || "#f4f6f8";
    const fg1 = closest.card.dataset.accent || "#111111";

    if (second) {
      const bg2 = second.card.dataset.bg || bg1;
      const denom = (closest.proximity + second.proximity + 1e-6);
      const t = clamp(closest.proximity / denom, 0, 1);

      const c1 = hexToRgb(bg1);
      const c2 = hexToRgb(bg2);
      const mixed = mix(c2, c1, t);

      document.documentElement.style.setProperty("--page-bg", rgbToCss(mixed));
    } else {
      document.documentElement.style.setProperty("--page-bg", bg1);
    }

    document.documentElement.style.setProperty("--page-fg", fg1);
  }
}

function requestUpdate() {
  if (rafId) return;
  rafId = requestAnimationFrame(updateVisuals);
}

function centerCard(card) {
  const railRect = rail.getBoundingClientRect();
  const cardRect = card.getBoundingClientRect();

  const railCenterX = railRect.left + railRect.width / 2;
  const cardCenterX = cardRect.left + cardRect.width / 2;

  const deltaPx = cardCenterX - railCenterX;
  const targetLeft = rail.scrollLeft + deltaPx;

  animateScrollTo(targetLeft, 340);
}

function scrollToItinerary() {
  const overview = document.getElementById("overview");
  if (!overview) return;

  overview.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}

function openCardLink(card) {
  const url = card.dataset.link;
  if (!url) return;
  window.open(url, "_blank", "noopener");
}

cards.forEach((card) => {
  let clickTimer = null;
  const CLICK_DELAY = 220;

  card.addEventListener("click", () => {
    if (clickTimer) clearTimeout(clickTimer);

    clickTimer = setTimeout(() => {
      centerCard(card);

      setTimeout(() => {
        syncItineraryToCenteredCard();
        scrollToItinerary();
      }, 360);

      clickTimer = null;
    }, CLICK_DELAY);
  });

  card.addEventListener("dblclick", () => {
    if (clickTimer) {
      clearTimeout(clickTimer);
      clickTimer = null;
    }
    openCardLink(card);
  });
});

/* =========================
   DATA RENDERING
   ========================= */

let activeItineraryCard = null;

function safeJsonParse(str, fallback) {
  try { return JSON.parse(str); } catch { return fallback; }
}

/* ✅ NEW: OVERVIEW RENDER FUNCTION */
function renderOverviewFromCard(cardEl) {
  const titleEl = document.getElementById("overviewTitle");
  const subtitleEl = document.getElementById("overviewSubtitle");
  const bodyEl = document.getElementById("overviewBody");

  if (!cardEl || !titleEl || !subtitleEl || !bodyEl) return;

  const title = cardEl.dataset.overviewTitle || "Title";
  const subtitle = cardEl.dataset.overviewSubtitle || "Subtitle";
  const body = safeJsonParse(cardEl.dataset.overview, []);

  titleEl.textContent = title;
  subtitleEl.textContent = subtitle;

  bodyEl.innerHTML = "";

  if (Array.isArray(body) && body.length > 0) {
    body.forEach((p) => {
      const el = document.createElement("p");
      el.textContent = p;
      bodyEl.appendChild(el);
    });
  } else {
    bodyEl.innerHTML = "<p>Loading...</p>";
  }
}

/* EXISTING */
function renderItineraryFromCard(cardEl) {
  const list = document.getElementById("itineraryList");
  if (!list || !cardEl) return;

  const itinerary = safeJsonParse(cardEl.dataset.itinerary, []);
  list.innerHTML = "";

  itinerary.forEach((item) => {
    const row = document.createElement("div");
    row.className = "it-row";

    row.innerHTML = `
      <div class="it-day">${item.icon || "📍"} ${item.day || ""}</div>
      <div>
        <div class="it-stop">${item.title || ""}</div>
        <div class="it-sub">${item.detail || ""}</div>
      </div>
    `;

    list.appendChild(row);
  });
}

/* 🔥 UPDATED: NOW CALLS OVERVIEW TOO */
function syncItineraryToCenteredCard() {
  const centered = getNearestCard()?.card;
  if (!centered) return;

  if (centered !== activeItineraryCard) {
    activeItineraryCard = centered;

    renderItineraryFromCard(centered);
    renderOverviewFromCard(centered);
    syncOverviewToCenteredCard(); // ← THIS LINE FIXES IMAGES
  }
}

/* EVENTS */
rail.addEventListener("scroll", () => {
  requestUpdate();
  syncItineraryToCenteredCard();
}, { passive: true });

/* INIT */
requestUpdate();
syncItineraryToCenteredCard();

/* =========================
   OVERVIEW PHOTO CYCLE (RESTORED)
   ========================= */

let overviewTimer = null;
let activePhotosKey = "";

function stopOverviewCycle() {
  if (overviewTimer) {
    clearInterval(overviewTimer);
    overviewTimer = null;
  }
}

function startOverviewCycleFromCard(cardEl, { intervalMs = 5000, fadeMs = 320 } = {}) {
  const img = document.getElementById("overviewFrame");
  if (!img || !cardEl) return;

  const photos = safeJsonParse(cardEl.dataset.photos, []);
  if (!Array.isArray(photos) || photos.length === 0) {
    stopOverviewCycle();
    return;
  }

  const key = photos.join("|");
  if (key === activePhotosKey) return;
  activePhotosKey = key;

  stopOverviewCycle();

  photos.forEach((src) => {
    const pre = new Image();
    pre.src = src;
  });

  let idx = 0;

  const show = (i) => {
    img.classList.add("is-fading");
    setTimeout(() => {
      img.src = photos[i];
      img.classList.remove("is-fading");
    }, fadeMs);
  };

  show(0);

  if (photos.length > 1) {
    overviewTimer = setInterval(() => {
      idx = (idx + 1) % photos.length;
      show(idx);
    }, intervalMs);
  }
}

function syncOverviewToCenteredCard() {
  const centered = getNearestCard()?.card;
  if (!centered) return;
  startOverviewCycleFromCard(centered);
}
