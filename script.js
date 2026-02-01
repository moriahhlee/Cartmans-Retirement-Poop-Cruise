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

/* Soft bounce for swipe-release settle */
function easeOutBack(t) {
  const c1 = 1.12; // suggestion: 1.05 subtle, 1.25 bouncier
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

/**
 * Find nearest card to center and compute:
 * - targetLeft to center it
 * - proximity score (1 = centered)
 */
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

  /**
   * Focus sizing suggestions:
   * - If you want more shrink on sides: MIN_SCALE = 0.88
   * - If you want less contrast: MIN_SCALE = 0.92
   * - If you want more center pop: MAX_SCALE = 1.05
   * Default below is a noticeable but not overwhelming pop.
   */
  const MIN_SCALE = 0.90;
  const MAX_SCALE = 1.03;

  /**
   * Opacity suggestions:
   * - More “focused” feeling: base 0.70
   * - Less dimming: base 0.80
   */
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

  // Background blend while moving (closest + second closest)
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

/**
 * App UI feel:
 * - NEVER auto-settle on wheel/trackpad hovering.
 * - Settle only when user finishes a direct swipe/drag (pointerup).
 * - Also: don’t pick a side if they’re truly between cards.
 */
function settleToNearestIfCommitted() {
  if (isPointerDown) return;

  const nearest = getNearestCard();
  if (!nearest) return;

  const COMMIT_THRESHOLD = 0.86; // suggestion: 0.82 more willing, 0.90 stricter
  if (nearest.proximity < COMMIT_THRESHOLD) return;

  animateScrollTo(nearest.targetLeft, 340); // suggestion: 280 snappier, 420 smoother
}

/* Mark wheel/trackpad interactions so we do not “decide” for them */
rail.addEventListener("wheel", () => {
  lastPointerType = "wheel";
}, { passive: true });

rail.addEventListener("scroll", () => {
  requestUpdate();
}, { passive: true });

rail.addEventListener("pointerdown", (e) => {
  isPointerDown = true;
  lastPointerType = e.pointerType || "unknown";
}, { passive: true });

window.addEventListener("pointerup", () => {
  if (!isPointerDown) return;
  isPointerDown = false;

  // Only settle after direct swipes/drags (touch/mouse/pen), not trackpad wheel.
  if (lastPointerType === "touch" || lastPointerType === "mouse" || lastPointerType === "pen") {
    setTimeout(settleToNearestIfCommitted, 80); // suggestion: 40 tighter, 120 looser
  }
}, { passive: true });

window.addEventListener("resize", () => {
  requestUpdate();
});

// click card script (single click = center + scroll to itinerary, double click = open link)

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
  const CLICK_DELAY = 220; // ms (controls how fast single click reacts)

  // SINGLE click: center card + scroll down to itinerary
  card.addEventListener("click", (e) => {
    // If a second click comes quickly, dblclick will clear this.
    if (clickTimer) clearTimeout(clickTimer);

    clickTimer = setTimeout(() => {
      centerCard(card);

      // wait for the rail centering animation to finish, then scroll down
      setTimeout(() => {
        syncItineraryToCenteredCard(); // keeps itinerary aligned with centered card
        scrollToItinerary();
      }, 360);

      clickTimer = null;
    }, CLICK_DELAY);
  });

  // DOUBLE click: open link
  card.addEventListener("dblclick", (e) => {
    if (clickTimer) {
      clearTimeout(clickTimer);
      clickTimer = null;
    }
    openCardLink(card);
  });

  // Keyboard: Enter/Space behaves like single click
  card.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      centerCard(card);
      setTimeout(() => {
        syncItineraryToCenteredCard();
        scrollToItinerary();
      }, 360);
    }
  });
});

// Initial render
requestUpdate();
syncItineraryToCenteredCard();
syncOverviewToCenteredCard();


/* --- Itinerary widget (below the rail), driven by centered card --- */

let activeItineraryCard = null;

function safeJsonParse(str, fallback) {
  try { return JSON.parse(str); } catch { return fallback; }
}
/* =========================
   OVERVIEW PHOTO CYCLE (per centered card)
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
  if (key === activePhotosKey) return; // already running this set
  activePhotosKey = key;

  stopOverviewCycle();

  // Preload to prevent flashing
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

  // Show first image immediately
  show(0);

  // Cycle if more than one
  if (photos.length > 1) {
    overviewTimer = setInterval(() => {
      idx = (idx + 1) % photos.length;
      show(idx);
    }, intervalMs);
  }
}

function syncOverviewToCenteredCard() {
  const centered = getCenteredCard();
  if (!centered) return;
  startOverviewCycleFromCard(centered, { intervalMs: 5000, fadeMs: 320 });
}

function getCenteredCard() {
  const nearest = getNearestCard();
  return nearest ? nearest.card : null;
}

function renderItineraryFromCard(cardEl) {
  const list = document.getElementById("itineraryList");
  const detail = document.getElementById("itineraryDetail");
  const detailTitle = document.getElementById("itineraryDetailTitle");
  const detailBody = document.getElementById("itineraryDetailBody");
  const closeBtn = document.getElementById("itineraryClose");

if (!list) return;
if (!cardEl) return;

  const itinerary = safeJsonParse(cardEl.dataset.itinerary, []);
  list.innerHTML = "";

  itinerary.forEach((item) => {
    const row = document.createElement("div");
    row.className = "it-row";
    row.tabIndex = 0;
    row.setAttribute("role", "button");
    row.setAttribute("aria-label", `${item.day || ""}: ${item.title || ""}`);

    row.innerHTML = `
      <div class="it-day">${item.icon || "📍"} ${item.day || ""}</div>
      <div>
        <div class="it-stop">${item.title || ""}</div>
        <div class="it-sub">${item.detail || "Tap for details"}</div>
      </div>
    `;

    const open = () => {
      detailTitle.textContent = `${item.day || ""}: ${item.title || ""}`;
      detailBody.textContent = item.detail || "";
      detail.hidden = false;
      closeBtn.focus();
    };

    row.addEventListener("click", open);
    row.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        open();
      }
    });

    list.appendChild(row);
  });

  // Prevent stacking multiple close listeners
  if (!closeBtn.dataset.bound) {
    closeBtn.addEventListener("click", () => {
      detail.hidden = true;
    });
    closeBtn.dataset.bound = "true";
  }
}

function syncItineraryToCenteredCard() {
  const centered = getCenteredCard();
  if (!centered) return;

 if (centered !== activeItineraryCard) {
  activeItineraryCard = centered;
  renderItineraryFromCard(centered);
  syncOverviewToCenteredCard();
}
}

// Hook itinerary updates AFTER the functions exist
rail.addEventListener("scroll", () => {
  syncItineraryToCenteredCard();
}, { passive: true });

// Run once on load
requestUpdate();
syncItineraryToCenteredCard();
syncOverviewToCenteredCard();

const content = document.querySelector(".content");
if (content) {
  const obs = new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting) {
      // When the user is looking at the content area, return to a calm base bg.
      document.documentElement.style.setProperty("--page-bg", "#f4f6f8");
      document.documentElement.style.setProperty("--page-fg", "#111111");
    }
  }, { threshold: 0.05 });

  obs.observe(content);
}






