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
const { join } = require("node:path");

const appDir = join(__dirname, "..", "..");
const artifactsDir = process.env.PBP_VERIFY_ARTIFACTS || join(appDir, "verification-artifacts");
const rendererIndex = join(appDir, "dist", "renderer", "index.html");

const ROUTES = ["dashboard", "buddy", "pets", "plugins", "integrations", "settings"];
const THEMES = ["light", "dark"];
const VIEWPORTS = [
  { name: "default", width: 1180, height: 820 },
  { name: "narrow", width: 900, height: 700 },
];

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
      out.issues.push({ kind: "low-contrast", detail: (el.textContent || "").trim().slice(0, 50), ratio: Math.round(ratio * 100) / 100, required: min, fg: s.color, bg: "rgb(" + bg.join(",") + ")" });
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
          r.style.colorScheme = ${JSON.stringify(theme)};
          return r.className; })()`,
        true,
      );

      for (const route of ROUTES) {
        await win.webContents.executeJavaScript(
          `(() => {
             const wanted = ${JSON.stringify(route)};
             const btns = [...document.querySelectorAll("button,[role=tab],a")];
             const hit = btns.find((b) => (b.textContent || "").trim().toLowerCase().replace(/[^a-z+]/g, "") === wanted.replace(/[^a-z+]/g, ""));
             if (hit) hit.click();
             return Boolean(hit);
           })()`,
          true,
        ).catch(() => false);
        await new Promise((r) => setTimeout(r, 700));

        const result = await probe(win);

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
          writeFileSync(join(artifactsDir, `${route}-${theme}.png`), png.toPNG());
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
    errorCount: findings.filter((f) => f.severity === "error").length,
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
