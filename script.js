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

    if (t < 1) requestAnimationFrame(frame);
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

// click card script
cards.forEach((card) => {
  const open = () => {
  const url = card.dataset.link;
  if (!url) return;

  window.open(url, "_blank", "noopener");
};


  card.addEventListener("click", open);

  card.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      open();
    }
  });
});

// Initial render
requestUpdate();

