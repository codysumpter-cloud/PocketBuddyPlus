import {
  advanceBuddyState,
  applyBuddyCare,
  createBuddySnapshot,
  createBuddyState,
  type BuddyCareAction,
  type BuddyState,
} from "../../buddy/buddy-core.ts";

import "./product-ui.css";

type ThemeMode = "system" | "light" | "dark";
type BuddySection = "status" | "talk" | "notes" | "collection" | "field-guide" | "wardrobe";

type BuddyTask = {
  readonly id: string;
  readonly text: string;
  readonly completed: boolean;
};

type BuddyUiState = {
  readonly version: 1;
  readonly buddy: BuddyState;
  readonly notes: readonly string[];
  readonly tasks: readonly BuddyTask[];
  readonly messages: readonly { readonly role: "user" | "buddy"; readonly text: string; readonly at: number }[];
  readonly careCounts: Readonly<Record<BuddyCareAction, number>>;
  readonly wardrobe: "classic" | "gold-star" | "blue-scarf" | "night-cap";
  readonly activeSection: BuddySection;
};

const PRODUCT_NAME = "Pocket Buddy+";
const THEME_STORAGE_KEY = "pocket-buddy-plus:theme:v1";
const BUDDY_STORAGE_KEY = "pocket-buddy-plus:buddy-ui:v1";
const themeModes: readonly ThemeMode[] = ["system", "light", "dark"];
const buddySections: readonly BuddySection[] = ["status", "talk", "notes", "collection", "field-guide", "wardrobe"];

const media = window.matchMedia("(prefers-color-scheme: dark)");
let currentTheme: ThemeMode = readTheme();
let buddyUiState = readBuddyUiState();
let buddyModal: HTMLDivElement | null = null;
let observerQueued = false;

function brandVisibleText(value: string): string {
  return value
    .replace(/Pocket\s+Buddy\s+Plus/giu, PRODUCT_NAME)
    .replace(/Buddy\s+Plus/giu, "Buddy+")
    .replace(/Open(?:\s|-)*Pets/giu, PRODUCT_NAME);
}

function readTheme(): ThemeMode {
  const value = window.localStorage.getItem(THEME_STORAGE_KEY);
  return themeModes.includes(value as ThemeMode) ? value as ThemeMode : "system";
}

function resolvedTheme(mode: ThemeMode): "light" | "dark" {
  return mode === "system" ? media.matches ? "dark" : "light" : mode;
}

function applyTheme(mode: ThemeMode): void {
  currentTheme = mode;
  window.localStorage.setItem(THEME_STORAGE_KEY, mode);
  const resolved = resolvedTheme(mode);
  document.documentElement.dataset.theme = resolved;
  document.documentElement.dataset.themeMode = mode;
  // color-scheme is declared per theme in product-ui.css. Assigning it here as an
  // inline style is blocked by the Control Center CSP (style-src 'self') and was
  // silently dropped, so native controls kept the light scheme in dark mode.
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-pb-theme]")) {
    const active = button.dataset.pbTheme === mode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  }
}

function defaultBuddyUiState(): BuddyUiState {
  return {
    version: 1,
    buddy: createBuddyState({ id: "primary-buddy", displayName: "Buddy", nowMs: Date.now(), affection: 0.18 }),
    notes: [],
    tasks: [],
    messages: [{ role: "buddy", text: "Hey! I’m here whenever you need me.", at: Date.now() }],
    careCounts: { pet: 0, feed: 0, play: 0, rest: 0, clean: 0 },
    wardrobe: "classic",
    activeSection: "status",
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readBuddyUiState(): BuddyUiState {
  const fallback = defaultBuddyUiState();
  try {
    const raw = window.localStorage.getItem(BUDDY_STORAGE_KEY);
    if (!raw) return fallback;
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || parsed.version !== 1 || !isRecord(parsed.buddy)) return fallback;
    const buddy = parsed.buddy as unknown as BuddyState;
    if (typeof buddy.id !== "string" || typeof buddy.displayName !== "string" || typeof buddy.updatedAtMs !== "number" || !isRecord(buddy.needs)) return fallback;
    const elapsedMs = Math.max(0, Math.min(Date.now() - buddy.updatedAtMs, 7 * 24 * 60 * 60 * 1000));
    const advanced = advanceBuddyState(buddy, elapsedMs);
    const careCounts = isRecord(parsed.careCounts) ? parsed.careCounts : fallback.careCounts;
    return {
      version: 1,
      buddy: advanced,
      notes: Array.isArray(parsed.notes) ? parsed.notes.filter((item): item is string => typeof item === "string").slice(0, 100) : [],
      tasks: Array.isArray(parsed.tasks) ? parsed.tasks.filter((item): item is BuddyTask => isRecord(item) && typeof item.id === "string" && typeof item.text === "string" && typeof item.completed === "boolean").slice(0, 100) : [],
      messages: Array.isArray(parsed.messages) ? parsed.messages.filter((item): item is BuddyUiState["messages"][number] => isRecord(item) && (item.role === "user" || item.role === "buddy") && typeof item.text === "string" && typeof item.at === "number").slice(-80) : fallback.messages,
      careCounts: {
        pet: numberOrZero(careCounts.pet),
        feed: numberOrZero(careCounts.feed),
        play: numberOrZero(careCounts.play),
        rest: numberOrZero(careCounts.rest),
        clean: numberOrZero(careCounts.clean),
      },
      wardrobe: parsed.wardrobe === "gold-star" || parsed.wardrobe === "blue-scarf" || parsed.wardrobe === "night-cap" ? parsed.wardrobe : "classic",
      activeSection: buddySections.includes(parsed.activeSection as BuddySection) ? parsed.activeSection as BuddySection : "status",
    };
  } catch {
    return fallback;
  }
}

function numberOrZero(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

function persistBuddyUiState(): void {
  window.localStorage.setItem(BUDDY_STORAGE_KEY, JSON.stringify(buddyUiState));
}

function updateBuddyUiState(updater: (current: BuddyUiState) => BuddyUiState): void {
  buddyUiState = updater(buddyUiState);
  persistBuddyUiState();
  renderBuddyModal();
  renderDashboardBuddyCard();
}

function applyCare(action: BuddyCareAction): void {
  updateBuddyUiState((current) => ({
    ...current,
    buddy: applyBuddyCare(current.buddy, action, Date.now()),
    careCounts: { ...current.careCounts, [action]: current.careCounts[action] + 1 },
  }));
}

function buddyReply(input: string): string {
  const snapshot = createBuddySnapshot(buddyUiState.buddy);
  const normalized = input.trim().toLowerCase();
  if (/hello|hey|hi\b/u.test(normalized)) return `Hey! I’m feeling ${snapshot.mood} today.`;
  if (/how are you|status|feel/u.test(normalized)) return `I’m ${snapshot.mood}. My biggest need right now is ${snapshot.dominantNeed}.`;
  if (/love|good buddy|thank/u.test(normalized)) return "That means a lot. I’ll remember the feeling, even before the full memory system arrives.";
  if (/hungry|food|feed/u.test(normalized)) return snapshot.dominantNeed === "hunger" ? "Yeah… a snack would be perfect." : "I’m okay on food right now, but I won’t complain.";
  if (/sleep|tired|rest/u.test(normalized)) return snapshot.dominantNeed === "energy" ? "A nap sounds incredible." : "I still have some energy. Maybe we can play first?";
  const options = [
    `I’m listening. Right now I’m ${snapshot.mood}, so that changes how I’m taking it in.`,
    "Tell me more. I like being included in what you’re doing.",
    `My ${snapshot.dominantNeed} need is the loudest one at the moment, but I’m still here with you.`,
  ];
  return options[(input.length + Math.round(snapshot.affection * 10)) % options.length];
}

function createThemeControl(): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.className = "pb-theme-control";
  wrapper.setAttribute("aria-label", "Appearance");
  wrapper.innerHTML = `
    <span class="pb-theme-label">Appearance</span>
    <div class="pb-theme-options" role="group" aria-label="Color theme">
      ${themeModes.map((mode) => `<button type="button" data-pb-theme="${mode}" aria-pressed="false">${mode === "system" ? "System" : mode === "light" ? "Light" : "Dark"}</button>`).join("")}
    </div>
  `;
  wrapper.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-pb-theme]");
    if (!button) return;
    const mode = button.dataset.pbTheme as ThemeMode;
    if (themeModes.includes(mode)) applyTheme(mode);
  });
  return wrapper;
}

function ensureThemeControl(): void {
  if (document.querySelector(".pb-theme-control")) return;
  const nav = document.querySelector(".nav-bar");
  if (!nav) return;
  nav.append(createThemeControl());
  applyTheme(currentTheme);
}

function ensureWordmark(): void {
  const container = document.querySelector(".hero-logo-container");
  if (!container || container.querySelector(".pb-wordmark")) return;
  container.querySelector<HTMLElement>(".hero-brand-logo")?.setAttribute("aria-hidden", "true");
  const wordmark = document.createElement("div");
  wordmark.className = "pb-wordmark";
  wordmark.innerHTML = `<span class="pb-wordmark-pocket">Pocket</span><span class="pb-wordmark-buddy">Buddy</span><span class="pb-wordmark-plus">+</span>`;
  container.append(wordmark);
}

function createBuddyNavButton(): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "nav-tab pb-buddy-nav";
  button.innerHTML = `<span class="pb-buddy-nav-icon" aria-hidden="true">♥</span><span>Buddy+</span>`;
  button.addEventListener("click", () => openBuddyModal());
  return button;
}

function ensureBuddyNavButton(): void {
  if (document.querySelector(".pb-buddy-nav")) return;
  const nav = document.querySelector(".nav-bar");
  if (!nav) return;
  const button = createBuddyNavButton();
  const secondTab = nav.querySelectorAll(".nav-tab")[1];
  if (secondTab) nav.insertBefore(button, secondTab);
  else nav.prepend(button);
}

function createBuddyModal(): HTMLDivElement {
  const modal = document.createElement("div");
  modal.className = "pb-buddy-modal";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-label", "Buddy+ center");
  modal.addEventListener("click", handleBuddyModalClick);
  modal.addEventListener("submit", handleBuddyModalSubmit);
  modal.addEventListener("change", handleBuddyModalChange);
  return modal;
}

function openBuddyModal(section: BuddySection = buddyUiState.activeSection): void {
  buddyUiState = { ...buddyUiState, activeSection: section };
  persistBuddyUiState();
  if (!buddyModal) buddyModal = createBuddyModal();
  if (!buddyModal.isConnected) document.body.append(buddyModal);
  renderBuddyModal();
  requestAnimationFrame(() => buddyModal?.querySelector<HTMLElement>("button, input, textarea, select")?.focus());
}

function closeBuddyModal(): void {
  buddyModal?.remove();
}

function setSection(section: BuddySection): void {
  updateBuddyUiState((current) => ({ ...current, activeSection: section }));
}

function handleBuddyModalClick(event: MouseEvent): void {
  const target = event.target as HTMLElement;
  if (target.matches(".pb-buddy-backdrop") || target.closest("[data-pb-close]")) {
    closeBuddyModal();
    return;
  }
  const section = target.closest<HTMLElement>("[data-pb-section]")?.dataset.pbSection as BuddySection | undefined;
  if (section && buddySections.includes(section)) {
    setSection(section);
    return;
  }
  const care = target.closest<HTMLElement>("[data-pb-care]")?.dataset.pbCare as BuddyCareAction | undefined;
  if (care && ["pet", "feed", "play", "rest", "clean"].includes(care)) {
    applyCare(care);
    return;
  }
  const taskToggle = target.closest<HTMLElement>("[data-pb-task-toggle]")?.dataset.pbTaskToggle;
  if (taskToggle) {
    updateBuddyUiState((current) => ({ ...current, tasks: current.tasks.map((task) => task.id === taskToggle ? { ...task, completed: !task.completed } : task) }));
    return;
  }
  const taskDelete = target.closest<HTMLElement>("[data-pb-task-delete]")?.dataset.pbTaskDelete;
  if (taskDelete) {
    updateBuddyUiState((current) => ({ ...current, tasks: current.tasks.filter((task) => task.id !== taskDelete) }));
    return;
  }
  const noteDelete = target.closest<HTMLElement>("[data-pb-note-delete]")?.dataset.pbNoteDelete;
  if (noteDelete) {
    updateBuddyUiState((current) => ({ ...current, notes: current.notes.filter((_, index) => String(index) !== noteDelete) }));
  }
}

function handleBuddyModalSubmit(event: SubmitEvent): void {
  event.preventDefault();
  const form = event.target as HTMLFormElement;
  const data = new FormData(form);
  if (form.dataset.pbForm === "rename") {
    const displayName = String(data.get("name") ?? "").trim().slice(0, 40);
    if (!displayName) return;
    updateBuddyUiState((current) => ({ ...current, buddy: { ...current.buddy, displayName, updatedAtMs: Date.now() } }));
  }
  if (form.dataset.pbForm === "talk") {
    const text = String(data.get("message") ?? "").trim().slice(0, 500);
    if (!text) return;
    const now = Date.now();
    const reply = buddyReply(text);
    const userMessage: BuddyUiState["messages"][number] = { role: "user", text, at: now };
    const buddyMessage: BuddyUiState["messages"][number] = { role: "buddy", text: reply, at: now + 1 };
    updateBuddyUiState((current) => ({ ...current, messages: [...current.messages, userMessage, buddyMessage].slice(-80) }));
  }
  if (form.dataset.pbForm === "note") {
    const text = String(data.get("note") ?? "").trim().slice(0, 500);
    if (!text) return;
    updateBuddyUiState((current) => ({ ...current, notes: [text, ...current.notes].slice(0, 100) }));
  }
  if (form.dataset.pbForm === "task") {
    const text = String(data.get("task") ?? "").trim().slice(0, 240);
    if (!text) return;
    updateBuddyUiState((current) => ({ ...current, tasks: [{ id: crypto.randomUUID(), text, completed: false }, ...current.tasks].slice(0, 100) }));
  }
  form.reset();
}

function handleBuddyModalChange(event: Event): void {
  const select = (event.target as HTMLElement).closest<HTMLSelectElement>("[data-pb-wardrobe]");
  if (!select) return;
  const wardrobe = select.value as BuddyUiState["wardrobe"];
  if (!["classic", "gold-star", "blue-scarf", "night-cap"].includes(wardrobe)) return;
  updateBuddyUiState((current) => ({ ...current, wardrobe }));
}

function renderBuddyModal(): void {
  if (!buddyModal?.isConnected) return;
  const snapshot = createBuddySnapshot(buddyUiState.buddy);
  buddyModal.innerHTML = `
    <button class="pb-buddy-backdrop" type="button" aria-label="Close Buddy+ center"></button>
    <section class="pb-buddy-dialog">
      <header class="pb-buddy-header">
        <div class="pb-avatar" data-wardrobe="${buddyUiState.wardrobe}"><span>♥</span></div>
        <div>
          <p class="pb-kicker">Pocket Buddy+</p>
          <h2>${escapeHtml(snapshot.name)}</h2>
          <p>${capitalize(snapshot.mood)} · ${capitalize(snapshot.activity)} · ${Math.round(snapshot.affection * 100)}% affection</p>
        </div>
        <button class="pb-icon-button" type="button" data-pb-close aria-label="Close">×</button>
      </header>
      <nav class="pb-buddy-tabs" aria-label="Buddy+ features">
        ${buddySections.map((section) => `<button type="button" data-pb-section="${section}" class="${section === buddyUiState.activeSection ? "active" : ""}">${sectionLabel(section)}</button>`).join("")}
      </nav>
      <div class="pb-buddy-content">${renderBuddySection(buddyUiState.activeSection)}</div>
      <footer class="pb-buddy-care">
        ${careButton("pet", "Pet", "♥")}
        ${careButton("feed", "Feed", "●")}
        ${careButton("play", "Play", "◆")}
        ${careButton("rest", "Rest", "☾")}
        ${careButton("clean", "Clean", "✦")}
      </footer>
    </section>
  `;
}

function renderBuddySection(section: BuddySection): string {
  const snapshot = createBuddySnapshot(buddyUiState.buddy);
  if (section === "status") {
    return `
      <div class="pb-two-column">
        <section class="pb-panel">
          <div class="pb-panel-heading"><div><p class="pb-kicker">Living status</p><h3>${capitalize(snapshot.mood)}</h3></div><span class="pb-status-chip">Needs ${escapeHtml(snapshot.dominantNeed)}</span></div>
          <div class="pb-needs">${snapshot.drives.map((drive) => `<div class="pb-need"><div><span>${escapeHtml(drive.label)}</span><strong>${Math.round(drive.value * 100)}%</strong></div><div class="pb-meter"><span data-fill="${Math.round(drive.value * 20) * 5}"></span></div></div>`).join("")}</div>
        </section>
        <section class="pb-panel">
          <p class="pb-kicker">Identity</p>
          <form data-pb-form="rename" class="pb-form-row"><input name="name" value="${escapeHtml(snapshot.name)}" maxlength="40" aria-label="Buddy name"><button type="submit">Rename</button></form>
          <dl class="pb-stats"><div><dt>Age together</dt><dd>${formatDuration(snapshot.ageMs)}</dd></div><div><dt>Affection</dt><dd>${Math.round(snapshot.affection * 100)}%</dd></div><div><dt>Activity</dt><dd>${capitalize(snapshot.activity)}</dd></div><div><dt>Last care</dt><dd>${buddyUiState.buddy.lastCareAction ? capitalize(buddyUiState.buddy.lastCareAction) : "Not yet"}</dd></div></dl>
        </section>
      </div>`;
  }
  if (section === "talk") {
    return `<section class="pb-panel pb-talk"><div class="pb-panel-heading"><div><p class="pb-kicker">Talk to Buddy</p><h3>Local conversation</h3></div><span class="pb-status-chip">Mood-aware</span></div><div class="pb-messages">${buddyUiState.messages.map((message) => `<article class="pb-message ${message.role}"><strong>${message.role === "buddy" ? escapeHtml(snapshot.name) : "You"}</strong><p>${escapeHtml(message.text)}</p></article>`).join("")}</div><form data-pb-form="talk" class="pb-compose"><textarea name="message" maxlength="500" placeholder="Say something to ${escapeHtml(snapshot.name)}…" required></textarea><button type="submit">Send</button></form></section>`;
  }
  if (section === "notes") {
    return `<div class="pb-two-column"><section class="pb-panel"><p class="pb-kicker">Notes</p><h3>Things Buddy remembers for you</h3><form data-pb-form="note" class="pb-compose compact"><textarea name="note" maxlength="500" placeholder="Add a note…" required></textarea><button type="submit">Save note</button></form><div class="pb-list">${buddyUiState.notes.length ? buddyUiState.notes.map((note, index) => `<article><p>${escapeHtml(note)}</p><button type="button" data-pb-note-delete="${index}" aria-label="Delete note">×</button></article>`).join("") : `<p class="pb-empty">No notes yet.</p>`}</div></section><section class="pb-panel"><p class="pb-kicker">Tasks</p><h3>A tiny shared to-do list</h3><form data-pb-form="task" class="pb-form-row"><input name="task" maxlength="240" placeholder="Add a task…" required><button type="submit">Add</button></form><div class="pb-list">${buddyUiState.tasks.length ? buddyUiState.tasks.map((task) => `<article class="pb-task ${task.completed ? "completed" : ""}"><button type="button" class="pb-task-check" data-pb-task-toggle="${task.id}" aria-label="Toggle task">${task.completed ? "✓" : ""}</button><p>${escapeHtml(task.text)}</p><button type="button" data-pb-task-delete="${task.id}" aria-label="Delete task">×</button></article>`).join("") : `<p class="pb-empty">Nothing on the list.</p>`}</div></section></div>`;
  }
  if (section === "collection") {
    const totalCare = Object.values(buddyUiState.careCounts).reduce((sum, value) => sum + value, 0);
    const unlocks = [
      { title: "First hello", detail: "Talk to your Buddy", unlocked: buddyUiState.messages.some((message) => message.role === "user") },
      { title: "Best buds", detail: "Pet your Buddy five times", unlocked: buddyUiState.careCounts.pet >= 5 },
      { title: "Play date", detail: "Play together three times", unlocked: buddyUiState.careCounts.play >= 3 },
      { title: "Well cared for", detail: "Use every care action", unlocked: Object.values(buddyUiState.careCounts).every((value) => value > 0) },
      { title: "Daily life", detail: "Complete ten care moments", unlocked: totalCare >= 10 },
    ];
    return `<section class="pb-panel"><div class="pb-panel-heading"><div><p class="pb-kicker">Collection</p><h3>Moments you’ve earned together</h3></div><span class="pb-status-chip">${unlocks.filter((item) => item.unlocked).length}/${unlocks.length} unlocked</span></div><div class="pb-collection">${unlocks.map((item) => `<article class="${item.unlocked ? "unlocked" : "locked"}"><span>${item.unlocked ? "★" : "◇"}</span><div><strong>${item.title}</strong><p>${item.detail}</p></div></article>`).join("")}</div></section>`;
  }
  if (section === "field-guide") {
    return `<div class="pb-two-column"><section class="pb-panel"><p class="pb-kicker">How Buddy works</p><h3>A companion, not a notification widget</h3><p class="pb-body-copy">Needs rise over time. Care actions relieve different pressures and slowly build affection. Mood follows the loudest need, so the same event can feel different depending on how your Buddy is doing.</p><dl class="pb-guide"><div><dt>Hunger</dt><dd>Relieved by food.</dd></div><div><dt>Rest</dt><dd>Relieved by sleep and downtime.</dd></div><div><dt>Company</dt><dd>Relieved by petting and conversation.</dd></div><div><dt>Play</dt><dd>Relieved by shared activities.</dd></div><div><dt>Comfort</dt><dd>Improves through gentle care.</dd></div><div><dt>Cleanliness</dt><dd>Relieved by grooming.</dd></div></dl></section><section class="pb-panel"><p class="pb-kicker">Field Guide</p><h3>${escapeHtml(snapshot.name)}</h3><div class="pb-field-card"><div class="pb-avatar large" data-wardrobe="${buddyUiState.wardrobe}"><span>♥</span></div><div><strong>Primary desktop Buddy</strong><p>Temperament: ${capitalize(snapshot.mood)}</p><p>Favorite activity right now: ${capitalize(snapshot.activity)}</p><p>Bond level: ${bondLabel(snapshot.affection)}</p></div></div></section></div>`;
  }
  return `<section class="pb-panel"><div class="pb-panel-heading"><div><p class="pb-kicker">Wardrobe</p><h3>Choose Buddy’s current look</h3></div><span class="pb-status-chip">Saved locally</span></div><div class="pb-wardrobe"><div class="pb-avatar wardrobe-preview" data-wardrobe="${buddyUiState.wardrobe}"><span>♥</span></div><label>Accessory<select data-pb-wardrobe><option value="classic" ${buddyUiState.wardrobe === "classic" ? "selected" : ""}>Classic</option><option value="gold-star" ${buddyUiState.wardrobe === "gold-star" ? "selected" : ""}>Gold star</option><option value="blue-scarf" ${buddyUiState.wardrobe === "blue-scarf" ? "selected" : ""}>Blue scarf</option><option value="night-cap" ${buddyUiState.wardrobe === "night-cap" ? "selected" : ""}>Night cap</option></select></label><p class="pb-body-copy">This preference is already durable. The pet-renderer attachment hook is the next visual pass, so the choice will not be lost when the sprite wardrobe connects.</p></div></section>`;
}

function careButton(action: BuddyCareAction, label: string, icon: string): string {
  return `<button type="button" data-pb-care="${action}"><span>${icon}</span><strong>${label}</strong><small>${buddyUiState.careCounts[action]}</small></button>`;
}

function sectionLabel(section: BuddySection): string {
  return ({ status: "Status", talk: "Talk", notes: "Notes & Tasks", collection: "Collection", "field-guide": "Field Guide", wardrobe: "Wardrobe" } as const)[section];
}

function ensureDashboardBuddyCard(): void {
  if (document.querySelector(".pb-dashboard-card")) return;
  const hero = document.querySelector(".dashboard-hero");
  if (!hero?.parentElement) return;
  const card = document.createElement("section");
  card.className = "pb-dashboard-card";
  card.addEventListener("click", (event) => {
    const care = (event.target as HTMLElement).closest<HTMLElement>("[data-pb-care]")?.dataset.pbCare as BuddyCareAction | undefined;
    if (care) applyCare(care);
    if ((event.target as HTMLElement).closest("[data-pb-open]")) openBuddyModal();
  });
  hero.insertAdjacentElement("afterend", card);
  renderDashboardBuddyCard();
}

function renderDashboardBuddyCard(): void {
  const card = document.querySelector<HTMLElement>(".pb-dashboard-card");
  if (!card) return;
  const snapshot = createBuddySnapshot(buddyUiState.buddy);
  card.innerHTML = `<div class="pb-dashboard-avatar pb-avatar" data-wardrobe="${buddyUiState.wardrobe}"><span>♥</span></div><div class="pb-dashboard-copy"><p class="pb-kicker">Your living Buddy</p><h3>${escapeHtml(snapshot.name)} is ${escapeHtml(snapshot.mood)}</h3><p>Biggest need: ${escapeHtml(snapshot.dominantNeed)} · Affection ${Math.round(snapshot.affection * 100)}%</p></div><div class="pb-dashboard-actions"><button type="button" data-pb-care="pet">Pet</button><button type="button" data-pb-open>Open Buddy+</button></div>`;
}

function replaceVisibleBranding(root: ParentNode): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  let node: Node | null;
  while ((node = walker.nextNode())) {
    if (!(node instanceof Text)) continue;
    const parent = node.parentElement;
    if (!parent || ["SCRIPT", "STYLE", "CODE", "PRE"].includes(parent.tagName)) continue;
    textNodes.push(node);
  }
  for (const text of textNodes) {
    const next = brandVisibleText(text.data);
    if (next !== text.data) text.data = next;
  }
  for (const element of root.querySelectorAll<HTMLElement>("[title], [aria-label], [placeholder], [alt]")) {
    for (const attribute of ["title", "aria-label", "placeholder", "alt"] as const) {
      const value = element.getAttribute(attribute);
      if (!value) continue;
      const next = brandVisibleText(value);
      if (next !== value) element.setAttribute(attribute, next);
    }
  }
}

function reconcileProductUi(): void {
  observerQueued = false;
  document.title = `${PRODUCT_NAME} — Control Center`;
  replaceVisibleBranding(document.body);
  ensureWordmark();
  ensureThemeControl();
  ensureBuddyNavButton();
  ensureDashboardBuddyCard();
}

function scheduleReconcile(): void {
  if (observerQueued) return;
  observerQueued = true;
  window.requestAnimationFrame(reconcileProductUi);
}

function capitalize(value: string): string {
  return value ? value[0].toUpperCase() + value.slice(1) : value;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ?? character);
}

function formatDuration(milliseconds: number): string {
  const days = Math.floor(milliseconds / 86_400_000);
  if (days > 0) return `${days} day${days === 1 ? "" : "s"}`;
  const hours = Math.floor(milliseconds / 3_600_000);
  if (hours > 0) return `${hours} hour${hours === 1 ? "" : "s"}`;
  return "Just met";
}

function bondLabel(affection: number): string {
  if (affection >= 0.8) return "Inseparable";
  if (affection >= 0.55) return "Close friends";
  if (affection >= 0.3) return "Growing bond";
  return "Getting acquainted";
}

media.addEventListener("change", () => {
  if (currentTheme === "system") applyTheme("system");
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && buddyModal?.isConnected) closeBuddyModal();
});

applyTheme(currentTheme);
new MutationObserver(scheduleReconcile).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", scheduleReconcile, { once: true });
else scheduleReconcile();
