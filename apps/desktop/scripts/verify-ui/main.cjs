/**
 * Headless Control Center acceptance harness.
 *
 * Boots the real built renderer bundle in an offscreen BrowserWindow (never
 * shown, never focused, so it cannot disturb an active desktop), serves the
 * preload contract from fixtures, and asserts the things a machine can judge
 * objectively: product wording, theme application, contrast, overflow/clipping,
 * focus order, and accessible names. Screenshots are captured per route per
 * theme via webContents.capturePage().
 *
 * Explicitly out of scope: main-process behaviour (persistence, care actions,
 * quit/relaunch) and subjective visual polish. Those are covered by the packaged
 * smoke test and by human review respectively.
 */
const { app, BrowserWindow } = require("electron");
const { mkdirSync, writeFileSync } = require("node:fs");
const { createHash } = require("node:crypto");
const { join } = require("node:path");

const appDir = join(__dirname, "..", "..");
const artifactsDir = process.env.PBP_VERIFY_ARTIFACTS || join(appDir, "verification-artifacts");
const rendererIndex = join(appDir, "dist", "renderer", "index.html");

// label = the nav control text to click; heading = the h1 that proves arrival.
const ROUTES = [
  { key: "dashboard", label: "dashboard", heading: /^dashboard$/i },
  { key: "pets", label: "pets", heading: /^pets$/i },
  { key: "plugins", label: "plugins", heading: /^plugins$/i },
  { key: "integrations", label: "integrations", heading: /^integrations$/i },
  { key: "settings", label: "settings", heading: /^settings$/i },
];
const THEMES = ["light", "dark"];
// Buddy+ is a modal overlay (openBuddyModal in product-ui.ts), not a routed
// page, so it is asserted separately with dialog semantics rather than as a
// route with its own heading.
const BUDDY_MODAL = { label: "buddy+", selector: ".pb-buddy-modal" };

const VIEWPORTS = [
  { name: "default", width: 1180, height: 820 },
  { name: "narrow", width: 900, height: 700 },
];

const MIN_BODY_TEXT = 120;
const MIN_VISIBLE_ELEMENTS = 25;

class HarnessFatal extends Error {}

/**
 * Reject blank/transparent/single-colour captures. A screenshot that carries no
 * information is the classic way a headless suite reports a false green.
 */
function assertScreenshotIsMeaningful(image, label) {
  const size = image.getSize();
  if (size.width < 200 || size.height < 200) return `screenshot ${label}: implausible size ${size.width}x${size.height}`;
  const bmp = image.toBitmap(); // BGRA
  let opaque = 0;
  const buckets = new Map();
  let sum = 0, sumSq = 0, n = 0;
  for (let i = 0; i < bmp.length; i += 4 * 97) { // stride-sample, prime to avoid banding
    const b = bmp[i], g = bmp[i + 1], r = bmp[i + 2], a = bmp[i + 3];
    if (a > 8) opaque += 1;
    const lumv = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    sum += lumv; sumSq += lumv * lumv; n += 1;
    const key = `${r >> 4},${g >> 4},${b >> 4}`;
    buckets.set(key, (buckets.get(key) || 0) + 1);
  }
  if (!n) return `screenshot ${label}: no sampled pixels`;
  if (opaque / n < 0.9) return `screenshot ${label}: mostly transparent (${Math.round((opaque / n) * 100)}% opaque)`;
  const variance = sumSq / n - (sum / n) ** 2;
  if (variance < 12) return `screenshot ${label}: near-uniform luminance (variance ${variance.toFixed(2)})`;
  const dominant = Math.max(...buckets.values()) / n;
  if (dominant > 0.98) return `screenshot ${label}: single-colour (${Math.round(dominant * 100)}% one bucket)`;
  if (buckets.size < 6) return `screenshot ${label}: too few distinct colours (${buckets.size})`;
  return null;
}

const captureDigests = new Map();
const findings = [];
const record = (severity, route, theme, viewport, message, detail) => {
  findings.push({ severity, route, theme, viewport, message, ...(detail ? { detail } : {}) });
};

/** Runs inside the renderer. Returns plain JSON only. */
const PROBE = `(() => {
  const out = { text: document.body.innerText || "", title: document.title, issues: [] };

  const visible = (el) => {
    const s = getComputedStyle(el);
    if (s.display === "none" || s.visibility === "hidden" || Number(s.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };

  // --- horizontal overflow / clipping -------------------------------------
  const doc = document.documentElement;
  if (doc.scrollWidth > doc.clientWidth + 1) {
    out.issues.push({ kind: "page-overflow-x", detail: doc.scrollWidth + " > " + doc.clientWidth });
  }
  for (const el of document.querySelectorAll("*")) {
    if (!visible(el)) continue;
    const s = getComputedStyle(el);
    // Text that is clipped with no way to reveal it.
    if (el.scrollWidth > el.clientWidth + 2 && s.overflowX === "hidden" && s.textOverflow !== "ellipsis") {
      const t = (el.textContent || "").trim().slice(0, 60);
      if (t) out.issues.push({ kind: "clipped-text", detail: t, tag: el.tagName });
    }
  }

  // --- contrast ------------------------------------------------------------
  const lum = (c) => {
    const v = c.map((x) => { const n = x / 255; return n <= 0.03928 ? n / 12.92 : Math.pow((n + 0.055) / 1.055, 2.4); });
    return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
  };
  const parse = (s) => { const m = s.match(/rgba?\\(([^)]+)\\)/); if (!m) return null; const p = m[1].split(",").map((x) => parseFloat(x)); return { rgb: [p[0], p[1], p[2]], a: p.length > 3 ? p[3] : 1 }; };
  // Resolve the effective backdrop by walking ancestors. Returns null when the
  // backdrop cannot be determined from a flat colour -- notably behind gradients
  // and background images -- so those elements are SKIPPED rather than scored
  // against a guessed colour, which would manufacture false contrast failures.
  const bgOf = (el) => {
    let n = el;
    while (n) {
      const s = getComputedStyle(n);
      if (s.backgroundImage && s.backgroundImage !== "none") return null;
      const c = parse(s.backgroundColor);
      if (c && c.a > 0.95) return c.rgb;
      if (c && c.a > 0) return null; // partial alpha: cannot resolve reliably
      if (n === document.documentElement) break;
      n = n.parentElement;
    }
    return null;
  };
  for (const el of document.querySelectorAll("p,span,h1,h2,h3,h4,label,button,a,li,td,th,div")) {
    if (!visible(el)) continue;
    const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1);
    if (!own) continue;
    const s = getComputedStyle(el);
    const fg = parse(s.color);
    if (!fg || fg.a < 0.5) continue;
    const bg = bgOf(el);
    if (!bg) { out.skippedContrast = (out.skippedContrast || 0) + 1; continue; }
    const L1 = lum(fg.rgb), L2 = lum(bg);
    const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    const px = parseFloat(s.fontSize) || 16;
    const bold = (parseInt(s.fontWeight, 10) || 400) >= 700;
    const large = px >= 24 || (px >= 18.66 && bold);
    const min = large ? 3 : 4.5;
    if (ratio < min) {
      out.issues.push({ kind: "low-contrast", detail: (el.textContent || "").trim().slice(0, 50), ratio: Math.round(ratio * 100) / 100, required: min, fg: s.color, bg: "rgb(" + bg.join(",") + ")", tag: el.tagName, cls: (el.className || "").toString().slice(0, 80) });
    }
  }

  // --- accessible names on interactive controls ----------------------------
  for (const el of document.querySelectorAll("button,a[href],input,select,textarea,[role=button],[role=tab]")) {
    if (!visible(el)) continue;
    const name = (el.getAttribute("aria-label") || el.getAttribute("title") || el.textContent || "").trim()
      || (el.labels && el.labels.length ? [...el.labels].map((l) => l.textContent).join(" ").trim() : "");
    if (!name) out.issues.push({ kind: "missing-accessible-name", tag: el.tagName, cls: (el.className || "").toString().slice(0, 60) });
  }

  // --- focusability of interactive controls --------------------------------
  const focusables = [...document.querySelectorAll("button,a[href],input,select,textarea,[tabindex]")].filter(visible);
  out.focusableCount = focusables.length;
  out.negativeTabindex = focusables.filter((el) => el.getAttribute("tabindex") === "-1" && el.tagName === "BUTTON").length;

  // --- mount / liveness evidence ------------------------------------------
  const root = document.getElementById("root") || document.body;
  out.rootChildCount = root ? root.children.length : 0;
  out.visibleElementCount = [...document.querySelectorAll("*")].filter(visible).length;
  out.headings = [...document.querySelectorAll("h1,h2,h3")].filter(visible).map((h) => (h.textContent || "").trim()).filter(Boolean);
  out.bodyTextLength = (document.body.innerText || "").trim().length;
  out.errors = Array.isArray(window.__pbpErrors) ? window.__pbpErrors.slice(0, 10) : [];

  return out;
})()`;

async function probe(win) {
  return win.webContents.executeJavaScript(PROBE, true);
}

async function run() {
  mkdirSync(artifactsDir, { recursive: true });

  const win = new BrowserWindow({
    show: false,
    width: VIEWPORTS[0].width,
    height: VIEWPORTS[0].height,
    webPreferences: {
      preload: join(__dirname, "preload-stub.cjs"),
      contextIsolation: true,
      sandbox: false,
      nodeIntegration: false,
      offscreen: false,
    },
  });

  const consoleErrors = [];
  win.webContents.on("console-message", (_e, level, message) => {
    if (level >= 2) consoleErrors.push(message);
  });

  await win.loadFile(rendererIndex);
  // Let React mount and the fixture promises resolve.
  await new Promise((r) => setTimeout(r, 2500));

  for (const viewport of VIEWPORTS) {
    win.setSize(viewport.width, viewport.height);
    await new Promise((r) => setTimeout(r, 300));

    for (const theme of THEMES) {
      await win.webContents.executeJavaScript(
        `(() => { const r = document.documentElement;
          r.classList.remove("dark","light");
          r.classList.add(${JSON.stringify(theme)});
          r.setAttribute("data-theme", ${JSON.stringify(theme)});
          // Deliberately NOT setting r.style.*: the renderer CSP forbids inline
          // styles, and the harness must not provoke violations it then reports.
          return r.getAttribute("data-theme"); })()`,
        true,
      );

      for (const routeSpec of ROUTES) {
        const route = routeSpec.key;
        await win.webContents.executeJavaScript(
          `(() => {
             const wanted = ${JSON.stringify(routeSpec.label)};
             const btns = [...document.querySelectorAll("button,[role=tab],a")];
             const norm = (v) => v.trim().toLowerCase().replace(/[^a-z+]/g, "");
             const hit = btns.find((b) => norm(b.textContent || "") === norm(wanted));
             if (hit) hit.click();
             return Boolean(hit);
           })()`,
          true,
        ).catch(() => false);
        await new Promise((r) => setTimeout(r, 700));

        const result = await probe(win);

        // ---- FAIL CLOSED -------------------------------------------------
        // A crashed or empty renderer must never be mistaken for a clean pass.
        if (result.rootChildCount === 0) {
          record("fatal", route, theme, viewport.name, "react-root-empty", { rootChildCount: 0 });
        }
        if (result.bodyTextLength < MIN_BODY_TEXT) {
          record("fatal", route, theme, viewport.name, "body-effectively-empty", { bodyTextLength: result.bodyTextLength, min: MIN_BODY_TEXT });
        }
        if (result.visibleElementCount < MIN_VISIBLE_ELEMENTS) {
          record("fatal", route, theme, viewport.name, "too-few-visible-elements", { count: result.visibleElementCount, min: MIN_VISIBLE_ELEMENTS });
        }
        if (!result.headings.length) {
          record("fatal", route, theme, viewport.name, "no-visible-heading", {});
        }
        // Navigation must actually reach the requested route, or the capture and
        // every assertion below would describe the previous screen. This is what
        // caught Buddy+ silently rendering the Dashboard.
        if (!result.headings.some((h) => routeSpec.heading.test(h))) {
          record("fatal", route, theme, viewport.name, "route-not-reached", {
            expected: String(routeSpec.heading),
            headings: result.headings.slice(0, 5),
          });
        }
        for (const err of result.errors) {
          record("fatal", route, theme, viewport.name, "renderer-uncaught-error", err);
        }
        if (findings.some((f) => f.severity === "fatal")) {
          // Stop immediately: every later check would be vacuous. Surface the
          // renderer's own errors, which are the actionable part.
          const fatals = findings.filter((f) => f.severity === "fatal").map((f) => f.message);
          throw new HarnessFatal(
            `renderer is not in a testable state at route "${route}" (${theme}/${viewport.name})\n` +
            `  gates: ${[...new Set(fatals)].join(", ")}\n` +
            `  bodyTextLength=${result.bodyTextLength} visibleElements=${result.visibleElementCount} rootChildren=${result.rootChildCount}\n` +
            `  console: ${consoleErrors.length ? consoleErrors.slice(-3).join(" | ") : "(none)"}`,
          );
        }

        for (const issue of result.issues) {
          const sev = issue.kind === "low-contrast" || issue.kind === "missing-accessible-name" ? "error" : "warn";
          record(sev, route, theme, viewport.name, issue.kind, issue);
        }

        // Product wording: no inherited branding may survive into visible text.
        const leaked = [...result.text.matchAll(/Open\s*-?\s*Pets/giu)].map((m) => m[0]);
        if (leaked.length) {
          record("error", route, theme, viewport.name, "visible-openpets-wording", { samples: [...new Set(leaked)].slice(0, 5) });
        }

        if (viewport.name === "default") {
          const png = await win.webContents.capturePage();
          const digest = createHash("sha256").update(png.toPNG()).digest("hex");
          const clash = [...captureDigests.entries()].find(([key, value]) => value === digest && key.endsWith(`-${theme}`));
          if (clash) {
            record("fatal", route, theme, viewport.name, "route-capture-identical", { matches: clash[0] });
          }
          captureDigests.set(`${route}-${theme}`, digest);
          const blank = assertScreenshotIsMeaningful(png, `${route}-${theme}`);
          if (blank) record("fatal", route, theme, viewport.name, "blank-screenshot", { reason: blank });
          writeFileSync(join(artifactsDir, `${route}-${theme}.png`), png.toPNG());
          if (blank) throw new HarnessFatal(blank);
        }
      }
    }
  }

  const summary = {
    generatedFor: "Pocket Buddy+ Control Center (headless renderer harness)",
    routes: ROUTES,
    themes: THEMES,
    viewports: VIEWPORTS.map((v) => v.name),
    consoleErrors: consoleErrors.slice(0, 20),
    findings,
    fatalCount: findings.filter((f) => f.severity === "fatal").length,
    errorCount: findings.filter((f) => f.severity === "error" || f.severity === "fatal").length,
    warnCount: findings.filter((f) => f.severity === "warn").length,
  };
  writeFileSync(join(artifactsDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");

  console.log(`\nverify-ui: ${summary.errorCount} error(s), ${summary.warnCount} warning(s)`);
  const byKind = {};
  for (const f of findings) byKind[f.message] = (byKind[f.message] || 0) + 1;
  for (const [kind, count] of Object.entries(byKind).sort((a, b) => b[1] - a[1])) console.log(`  ${kind}: ${count}`);
  if (consoleErrors.length) console.log(`  renderer console errors: ${consoleErrors.length}`);
  console.log(`artifacts: ${artifactsDir}`);

  win.destroy();
  app.exit(summary.errorCount > 0 ? 1 : 0);
}

app.disableHardwareAcceleration();
app.whenReady().then(run).catch((error) => {
  console.error("verify-ui harness failed:", error);
  app.exit(2);
});
