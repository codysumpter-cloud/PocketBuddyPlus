/**
 * The two Pocket Buddy Plus UI surfaces.
 *
 * A. The creature-attached menu -- a compact panel that opens beside the
 *    selected Buddy, following the Pocket Buddy interaction model.
 * B. The collapsible dock -- a slim quick-access strip that routes into the
 *    existing OpenPets Control Center pages rather than reimplementing them.
 *
 * Both windows are frameless, sandboxed, contextIsolated, have no Node
 * integration, and load a data: URL under a strict CSP, matching the pattern the
 * inherited plugin command form already uses.
 */
import { BrowserWindow, app, ipcMain, screen, type IpcMainEvent, type IpcMainInvokeEvent } from "electron";
import { pathToFileURL } from "node:url";

import { debug, error as logError, info } from "../logger.js";
import { openControlCenterWindow, type ControlCenterRoute } from "../windows.js";
import type { BuddySnapshot } from "./buddy-core.js";
import { getBuddyMenuItems, type BuddyMenuAction } from "./buddy-menu.js";
import {
  computeAttachedMenuBounds,
  computeDockBounds,
  type Rect,
} from "./buddy-layout.js";
import {
  getBuddySnapshot,
  getDockPreferences,
  requestBuddyCare,
  setDockPreferences,
  subscribeToBuddy,
} from "./buddy-host.js";
import { buddyThemes, dockEdges, type DockEdge, type BuddyTheme } from "./buddy-store.js";
import { isPlusRuntime } from "../product-runtime.js";
import type { PetMenuPresentation } from "../pet-window.js";

const menuWidth = 258;
const menuHeight = 430;

let menuWindow: BrowserWindow | null = null;
let dockWindow: BrowserWindow | null = null;
/** Pet handle whose menu is currently open, so multi-pet routing stays correct. */
let menuOwnerPetId: string | null = null;
let menuOpen = false;
/** Live surfaces, so preference changes can be pushed to all of them. */
const surfaceTokens = new Map<BrowserWindow, string>();

export function isBuddyMenuOpen(): boolean {
  return menuOpen;
}

export function getBuddyMenuOwnerPetId(): string | null {
  return menuOwnerPetId;
}

/**
 * Menu items without a ported implementation must say so honestly rather than
 * pretend to work. `pet` and `status` are real in this slice.
 */
const implementedActions = new Set<BuddyMenuAction>(["pet", "status", "settings", "quit"]);

const placeholderSources: Readonly<Record<string, string>> = {
  talk: "Buddy conversation system (Godot Pocket Buddy dialogue + memory)",
  name: "Buddy identity/naming (Godot Pocket Buddy identity store)",
  buddies: "Multi-Buddy roster (Godot Pocket Buddy buddies registry)",
  collection: "Collection / unlockables (Godot Pocket Buddy collection)",
  "notes-and-tasks": "Notes & Tasks (Godot Pocket Buddy productivity surfaces)",
  guide: "How Buddy works (Godot Pocket Buddy onboarding/help)",
  "field-guide": "Field Guide (Godot Pocket Buddy species compendium)",
  wardrobe: "Wardrobe / cosmetics (Godot Pocket Buddy wardrobe)",
};

function buildSurfaceUrl(kind: "menu" | "dock", payload: unknown): string {
  // font-src file: mirrors the inherited pet window, which loads its bundled
  // emoji font the same way. Everything else stays locked down.
  const csp = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; font-src file:; img-src 'none'; connect-src 'none'; form-action 'none'; base-uri 'none'; frame-src 'none'";
  const data = JSON.stringify(payload).replace(/</g, "\\u003c");
  const theme = getDockPreferences().theme;
  const html = kind === "menu" ? renderMenuDocument(csp, data, theme) : renderDockDocument(csp, data, theme);
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

// Shared visual language: dark translucent pixel-friendly surface, warm gold
// accent, hard-edged rendering rather than blurry game UI.
function bundledFontUrl(): string {
  return pathToFileURL(`${app.getAppPath()}/assets/Monocraft.otf`).toString();
}

/**
 * Shared visual language for both Plus surfaces.
 *
 * Monocraft (SIL OFL 1.1, Idrees Hassan) is the same pixel face the Pocket Bird
 * and Godot Pocket Buddy UIs use, bundled in assets/ with its license. Themes are
 * plain CSS custom properties so the menu and dock always render identically;
 * the active theme is persisted with the dock preferences.
 */
function sharedStyle(): string {
  return `
@font-face{font-family:"Monocraft";src:url("${bundledFontUrl()}") format("opentype");font-display:block}
*{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%;background:transparent;overflow:hidden;-webkit-user-select:none;user-select:none}
:root{
  --surface:rgba(18,16,22,.94);--accent:#c9a227;--accent-bright:#f7d774;
  --text:#f4ead8;--muted:#a79c8a;--faint:#8d8272;--hover:rgba(201,162,39,.22);
  --line:rgba(201,162,39,.5);--track:rgba(255,255,255,.10);--good:#8fd694;
  --shadow:0 6px 0 rgba(0,0,0,.45);--on-accent:#12101a;
}
:root[data-theme="light"]{
  --surface:rgba(247,242,230,.97);--accent:#a8791b;--accent-bright:#6b4a06;
  --text:#241f18;--muted:#6b6151;--faint:#857a67;--hover:rgba(168,121,27,.20);
  --line:rgba(168,121,27,.55);--track:rgba(36,31,24,.14);--good:#1f7a34;
  --shadow:0 6px 0 rgba(120,100,60,.28);--on-accent:#fdf8ec;
}
body{font-family:"Monocraft",ui-monospace,"SF Mono",Menlo,Consolas,monospace;font-size:12px;color:var(--text);image-rendering:pixelated;-webkit-font-smoothing:none}
.panel{background:var(--surface);border:2px solid var(--accent);border-radius:2px;box-shadow:var(--shadow)}
button{font:inherit;color:inherit;background:none;border:0;cursor:pointer;text-align:left}
`;
}

function renderMenuDocument(csp: string, data: string, theme: BuddyTheme): string {
  return `<!doctype html><html data-theme="${theme}"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><title>Buddy</title><style>${sharedStyle()}
.panel{height:100%;display:flex;flex-direction:column}
header{padding:8px 10px;border-bottom:2px solid var(--line);display:flex;flex-direction:column;gap:2px}
header .name{color:var(--accent-bright);letter-spacing:.5px}
header .mood{font-size:10px;color:var(--muted)}
nav{flex:1;overflow-y:auto;padding:4px 0}
nav button{display:block;width:100%;padding:6px 10px;line-height:1.2}
nav button:hover,nav button:focus{background:var(--hover);outline:none}
nav button .hint{display:block;font-size:9px;color:var(--faint)}
nav .sect{padding:7px 10px 3px;font-size:9px;color:var(--faint);letter-spacing:1px;border-top:1px solid var(--line);margin-top:4px}
nav .sect:first-child{border-top:0;margin-top:0}
nav button .arrow{float:right;color:var(--faint)}
nav button[disabled]{opacity:.45;cursor:default}
.view{flex:1;overflow-y:auto;padding:8px 10px;display:none}
.view.active{display:block}
nav.hidden{display:none}
.row{display:flex;justify-content:space-between;gap:8px;padding:2px 0;font-size:11px}
.row span:last-child{color:var(--accent-bright)}
.bar{height:5px;background:var(--track);margin-top:2px}
.bar i{display:block;height:100%;background:var(--accent)}
h2{font-size:11px;color:var(--accent-bright);margin-bottom:6px;letter-spacing:.5px}
.note{font-size:10px;color:var(--muted);line-height:1.45}
.src{margin-top:6px;font-size:10px;color:var(--accent-bright);line-height:1.4}
footer{padding:6px 10px;border-top:2px solid var(--line);display:flex;justify-content:space-between;gap:8px}
footer button{font-size:10px;color:var(--muted)}
footer button:hover{color:var(--accent-bright)}
.react{padding:6px 10px;font-size:10px;color:var(--good);min-height:14px}
</style></head><body><div class="panel">
<header><span class="name" id="name">Buddy</span><span class="mood" id="mood"></span></header>
<div class="react" id="react"></div>
<nav id="nav"></nav>
<div class="view" id="view"></div>
<footer><button id="back" type="button">&lt; Back</button><button id="theme" type="button">Theme</button></footer>
</div><script>
const data=${data};const api=window.pocketBuddyPlus;
const nav=document.getElementById('nav'),view=document.getElementById('view'),back=document.getElementById('back');
const nameEl=document.getElementById('name'),moodEl=document.getElementById('mood'),reactEl=document.getElementById('react');
let snapshot=null;
function pct(v){return Math.round(v*100);}
function paintHeader(){if(!snapshot)return;nameEl.textContent=snapshot.name;moodEl.textContent=snapshot.mood+' \\u00b7 '+snapshot.activity;}
function showNav(){nav.classList.remove('hidden');view.classList.remove('active');back.style.visibility='hidden';}
function showView(html){nav.classList.add('hidden');view.innerHTML=html;view.classList.add('active');back.style.visibility='visible';}
function renderStatus(){if(!snapshot)return'<p class="note">No Buddy snapshot available.</p>';
var rows='';for(var i=0;i<snapshot.drives.length;i++){var d=snapshot.drives[i];
rows+='<div class="row"><span>'+d.label+'</span><span>'+pct(d.value)+'%</span></div><div class="bar"><i style="width:'+pct(d.value)+'%"></i></div>';}
return '<h2>Status</h2>'+
'<div class="row"><span>Name</span><span>'+snapshot.name+'</span></div>'+
'<div class="row"><span>Mood</span><span>'+snapshot.mood+'</span></div>'+
'<div class="row"><span>Activity</span><span>'+snapshot.activity+'</span></div>'+
'<div class="row"><span>Affection</span><span>'+pct(snapshot.affection)+'%</span></div>'+
'<div class="row"><span>Needs most</span><span>'+snapshot.dominantNeed+'</span></div>'+
'<h2 style="margin-top:8px">Need pressure</h2>'+rows;}
function renderPlaceholder(item){return '<h2>'+item.label+'</h2><p class="note">Not ported yet. This panel is a placeholder so the menu never pretends a feature works.</p><p class="src">Source system still to port:<br>'+item.source+'</p>';}
function section(title){var d=document.createElement('div');d.className='sect';d.textContent=title;nav.appendChild(d);}
function openPetsButton(item){
  if(item.type==='separator')return null;
  var b=document.createElement('button');b.type='button';
  b.textContent=(item.checked?'\u2713 ':'')+item.label;
  if(!item.enabled)b.disabled=true;
  if(item.submenu&&item.submenu.length){
    var a=document.createElement('span');a.className='arrow';a.textContent='\u203a';b.appendChild(a);
    b.addEventListener('click',function(){renderSubmenu(item);});
  }else{
    b.addEventListener('click',function(){api.invokeMenuAction('openpets:'+item.id);});
  }
  return b;
}
function renderSubmenu(parent){
  nav.innerHTML='';section(parent.label.toUpperCase());
  for(var i=0;i<parent.submenu.length;i++){var b=openPetsButton(parent.submenu[i]);if(b)nav.appendChild(b);}
  var back=document.createElement('button');back.type='button';back.textContent='\u2039 Back';
  back.addEventListener('click',paintNav);nav.appendChild(back);
}
function paintNav(){nav.innerHTML='';
  section('POCKET BUDDY');
  for(var i=0;i<data.items.length;i++){(function(item){
    var b=document.createElement('button');b.type='button';b.textContent=item.label;
    if(!item.implemented){var h=document.createElement('span');h.className='hint';h.textContent='not ported yet';b.appendChild(h);}
    b.addEventListener('click',function(){onAction(item);});nav.appendChild(b);})(data.items[i]);}
  var op=data.openPets||[];
  if(op.length){section('OPENPETS');
    for(var j=0;j<op.length;j++){var b2=openPetsButton(op[j]);if(b2)nav.appendChild(b2);}}
}
async function onAction(item){
  if(item.action==='status'){showView(renderStatus());return;}
  if(!item.implemented){showView(renderPlaceholder(item));return;}
  var result=await api.invokeMenuAction(item.action);
  if(result&&result.snapshot){snapshot=result.snapshot;paintHeader();}
  if(result&&result.reaction){reactEl.textContent=result.reaction;setTimeout(function(){reactEl.textContent='';},2200);}
  if(result&&result.closed)return;
  if(item.action==='pet'&&view.classList.contains('active'))showView(renderStatus());
}
back.addEventListener('click',showNav);
document.getElementById('theme').addEventListener('click',function(){
  var next=document.documentElement.getAttribute('data-theme')==='light'?'dark':'light';
  document.documentElement.setAttribute('data-theme',next);api.setDockPreferences({theme:next});});
api.onPreferences(function(p){if(p&&p.theme)document.documentElement.setAttribute('data-theme',p.theme);});
document.addEventListener('keydown',function(e){if(e.key==='Escape'){if(view.classList.contains('active'))showNav();else api.close();}});
api.onSnapshot(function(next){snapshot=next;paintHeader();if(view.classList.contains('active')&&view.querySelector('h2')&&view.querySelector('h2').textContent==='Status')showView(renderStatus());});
api.getSnapshot().then(function(next){snapshot=next;paintHeader();});
paintNav();showNav();
</script></body></html>`;
}

function renderDockDocument(csp: string, data: string, theme: BuddyTheme): string {
  return `<!doctype html><html data-theme="${theme}"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><title>Dock</title><style>${sharedStyle()}
.panel{height:100%;display:flex;align-items:center;gap:6px;padding:6px 8px;overflow:hidden}
.panel.vertical{flex-direction:column;align-items:stretch}
.panel.collapsed{padding:0;justify-content:center;align-items:center;cursor:pointer}
.buddy{display:flex;flex-direction:column;justify-content:center;min-width:120px;padding-right:8px;border-right:2px solid var(--line)}
.panel.vertical .buddy{border-right:0;border-bottom:2px solid var(--line);padding:0 0 6px;min-width:0}
.buddy .n{color:var(--accent-bright)}
.buddy .m{font-size:10px;color:var(--muted)}
.acts{display:flex;gap:4px;flex:1;overflow:auto}
.panel.vertical .acts{flex-direction:column}
.acts button{padding:6px 8px;border:1px solid var(--line);border-radius:2px;white-space:nowrap;font-size:11px}
.acts button:hover{background:var(--hover)}
.ctrl{display:flex;gap:4px}
.panel.vertical .ctrl{flex-direction:column}
.ctrl button{padding:4px 6px;font-size:10px;color:var(--muted);border:1px solid var(--line);border-radius:2px}
.ctrl button:hover{color:var(--accent-bright)}
.ctrl button[aria-pressed="true"]{color:var(--on-accent);background:var(--accent)}
.handle{font-size:10px;color:var(--accent);letter-spacing:2px}
</style></head><body><div class="panel" id="panel">
<div class="buddy" id="buddy"><span class="n" id="n">Buddy</span><span class="m" id="m"></span></div>
<div class="acts" id="acts"></div>
<div class="ctrl" id="ctrl"></div>
</div><script>
const data=${data};const api=window.pocketBuddyPlus;
const panel=document.getElementById('panel'),acts=document.getElementById('acts'),ctrl=document.getElementById('ctrl');
const nEl=document.getElementById('n'),mEl=document.getElementById('m'),buddyEl=document.getElementById('buddy');
let prefs=data.dock;
function paintSnapshot(s){if(!s)return;nEl.textContent=s.name;mEl.textContent=s.mood+' \\u00b7 '+Math.round(s.affection*100)+'%';}
function applyLayout(){
  panel.className='panel'+(prefs.edge==='bottom'?'':' vertical')+(prefs.collapsed?' collapsed':'');
  if(prefs.collapsed){panel.innerHTML='<span class="handle">\\u25b2 BUDDY PLUS</span>';
    panel.onclick=function(){setPrefs({collapsed:false});};return;}
  panel.onclick=null;panel.innerHTML='';panel.appendChild(buddyEl);panel.appendChild(acts);panel.appendChild(ctrl);
}
function setPrefs(patch){prefs=Object.assign({},prefs,patch);api.setDockPreferences(prefs).then(function(next){if(next)prefs=next;applyLayout();});}
for(var i=0;i<data.routes.length;i++){(function(r){
  var b=document.createElement('button');b.type='button';b.textContent=r.label;
  b.addEventListener('click',function(){api.openControlCenter(r.route);});acts.appendChild(b);})(data.routes[i]);}
for(var j=0;j<data.edges.length;j++){(function(e){
  var b=document.createElement('button');b.type='button';b.textContent=e.toUpperCase()[0];b.title='Dock to '+e;
  b.setAttribute('aria-pressed',String(prefs.edge===e));
  b.addEventListener('click',function(){setPrefs({edge:e});
    var all=ctrl.querySelectorAll('button[aria-pressed]');for(var k=0;k<all.length;k++)all[k].setAttribute('aria-pressed','false');
    b.setAttribute('aria-pressed','true');});ctrl.appendChild(b);})(data.edges[j]);}
var themeBtn=document.createElement('button');themeBtn.type='button';themeBtn.textContent='\\u25d1';themeBtn.title='Toggle light/dark theme';
themeBtn.addEventListener('click',function(){
  var next=document.documentElement.getAttribute('data-theme')==='light'?'dark':'light';
  document.documentElement.setAttribute('data-theme',next);setPrefs({theme:next});});ctrl.appendChild(themeBtn);
var collapse=document.createElement('button');collapse.type='button';collapse.textContent='\\u2212';collapse.title='Collapse dock';
collapse.addEventListener('click',function(){setPrefs({collapsed:true});});ctrl.appendChild(collapse);
api.onPreferences(function(p){if(p&&p.theme)document.documentElement.setAttribute('data-theme',p.theme);});
api.onSnapshot(paintSnapshot);api.getSnapshot().then(paintSnapshot);
applyLayout();
</script></body></html>`;
}

interface SurfaceHandlers {
  readonly dispose: () => void;
}

function registerSurfaceIpc(
  window: BrowserWindow,
  token: string,
  onMenuAction: ((action: unknown) => Promise<unknown>) | null,
): SurfaceHandlers {
  const channel = `pocketbuddyplus:surface:${token}`;
  const fromWindow = (event: IpcMainEvent | IpcMainInvokeEvent): boolean => event.sender === window.webContents;

  const handleGetSnapshot = (event: IpcMainInvokeEvent): BuddySnapshot | null => (fromWindow(event) ? getBuddySnapshot() : null);
  const handleGetDock = (event: IpcMainInvokeEvent): unknown => (fromWindow(event) ? getDockPreferences() : null);
  const handleSetDock = (event: IpcMainInvokeEvent, preferences: unknown): unknown => {
    if (!fromWindow(event)) return null;
    const next = setDockPreferences(preferences);
    applyDockBounds();
    // Keep the other surface in sync so the menu and dock never disagree.
    broadcastPreferences(next);
    return next;
  };
  const handleMenuAction = async (event: IpcMainInvokeEvent, action: unknown): Promise<unknown> => {
    if (!fromWindow(event) || !onMenuAction) return null;
    return onMenuAction(action);
  };
  const handleOpenControlCenter = (event: IpcMainEvent, route: unknown): void => {
    if (!fromWindow(event)) return;
    openControlCenterWindow(normalizeControlCenterRoute(route));
  };
  const handleClose = (event: IpcMainEvent): void => {
    if (!fromWindow(event)) return;
    if (!window.isDestroyed()) window.close();
  };

  ipcMain.handle(`${channel}:get-snapshot`, handleGetSnapshot);
  ipcMain.handle(`${channel}:get-dock`, handleGetDock);
  ipcMain.handle(`${channel}:set-dock`, handleSetDock);
  ipcMain.handle(`${channel}:menu-action`, handleMenuAction);
  ipcMain.on(`${channel}:open-control-center`, handleOpenControlCenter);
  ipcMain.on(`${channel}:close`, handleClose);

  surfaceTokens.set(window, token);
  const unsubscribe = subscribeToBuddy((snapshot) => {
    if (!window.isDestroyed()) window.webContents.send(`${channel}:snapshot`, snapshot);
  });

  return {
    dispose: () => {
      surfaceTokens.delete(window);
      ipcMain.removeHandler(`${channel}:get-snapshot`);
      ipcMain.removeHandler(`${channel}:get-dock`);
      ipcMain.removeHandler(`${channel}:set-dock`);
      ipcMain.removeHandler(`${channel}:menu-action`);
      ipcMain.off(`${channel}:open-control-center`, handleOpenControlCenter);
      ipcMain.off(`${channel}:close`, handleClose);
      unsubscribe();
    },
  };
}

/** Push preference changes (notably the theme) to every open Plus surface. */
function broadcastPreferences(preferences: unknown): void {
  for (const [window, token] of surfaceTokens) {
    if (window.isDestroyed()) continue;
    window.webContents.send(`pocketbuddyplus:surface:${token}:preferences`, preferences);
  }
}

const controlCenterRoutes: readonly ControlCenterRoute[] = ["dashboard", "pets", "settings", "plugins", "integrations"];

function normalizeControlCenterRoute(route: unknown): ControlCenterRoute {
  return controlCenterRoutes.includes(route as ControlCenterRoute) ? (route as ControlCenterRoute) : "dashboard";
}

function createSurfaceWindow(kind: "menu" | "dock", token: string, bounds: Rect, focusable: boolean): BrowserWindow {
  return new BrowserWindow({
    ...bounds,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    focusable,
    hasShadow: false,
    title: kind === "menu" ? "Pocket Buddy" : "Pocket Buddy Plus Dock",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      preload: `${app.getAppPath()}/buddy-surface-preload.cjs`,
      additionalArguments: [`--pocket-buddy-surface=${token}`],
    },
  });
}

function hardenSurface(window: BrowserWindow): void {
  window.setMenu(null);
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event) => event.preventDefault());
  window.webContents.on("will-redirect", (event) => event.preventDefault());
}

// --- A. Creature-attached menu ------------------------------------------------

export function closeBuddyMenu(): void {
  if (menuWindow && !menuWindow.isDestroyed()) menuWindow.close();
}

/**
 * Open the compact menu beside the given Buddy. Reopening for a different pet
 * closes the previous menu first so the menu always belongs to one selected
 * Buddy.
 */
export function openBuddyMenuForPet(petHandleId: string, petBounds: Rect, presentation: PetMenuPresentation): void {
  if (menuWindow && !menuWindow.isDestroyed()) {
    const sameBuddy = menuOwnerPetId === petHandleId;
    closeBuddyMenu();
    if (sameBuddy) return;
  }

  const display = screen.getDisplayNearestPoint({
    x: Math.round(petBounds.x + petBounds.width / 2),
    y: Math.round(petBounds.y + petBounds.height / 2),
  });
  const bounds = computeAttachedMenuBounds(petBounds, { width: menuWidth, height: menuHeight }, display.workArea);

  const token = `menu-${Date.now()}-${Math.round(petBounds.x)}`;
  const window = createSurfaceWindow("menu", token, bounds, true);
  menuWindow = window;
  menuOwnerPetId = petHandleId;
  menuOpen = true;
  hardenSurface(window);

  const buddyItems = getBuddyMenuItems({ supportsProcessExit: true }).map((item) => ({
    action: item.action,
    label: item.label,
    implemented: implementedActions.has(item.action),
    source: placeholderSources[item.action] ?? "",
  }));

  const handlers = registerSurfaceIpc(window, token, async (action) => {
    // Ids coming back from the inherited OpenPets section are addressed by id;
    // the Pocket Buddy section uses its own action names.
    if (typeof action === "string" && action.startsWith("openpets:")) {
      presentation.invoke(action.slice("openpets:".length));
      closeBuddyMenu();
      return { closed: true };
    }
    return handleMenuAction(action, petHandleId);
  });

  // Click-away closes the menu, matching the Pocket Buddy interaction model --
  // but only once the menu has actually held focus. A pet click does not
  // activate the app, so when another application is frontmost the menu receives
  // a blur before it is ever focused and would otherwise close instantly,
  // leaving the menu invisible even though it was created.
  let hasBeenFocused = false;
  window.on("focus", () => { hasBeenFocused = true; });
  window.on("blur", () => { if (hasBeenFocused && !window.isDestroyed()) window.close(); });
  window.once("ready-to-show", () => {
    window.show();
    // Take focus the way a context menu does, so click-away and Escape work and
    // the pet cannot be dragged out from under the open menu.
    app.focus({ steal: true });
    window.focus();
  });
  window.once("closed", () => {
    handlers.dispose();
    if (menuWindow === window) { menuWindow = null; menuOwnerPetId = null; menuOpen = false; }
  });

  window.loadURL(buildSurfaceUrl("menu", { items: buddyItems, openPets: presentation.items })).catch((error: unknown) => {
    logError("buddy", "attached menu load failed", error);
  });
  debug("buddy", "combined pet menu opened", { petHandleId, bounds, openPetsItems: presentation.items.length });
}

/**
 * Presenter registered with pet-window: draws the combined themed panel instead
 * of the native context menu. Returns false so the caller falls back to the
 * native menu when this build should not draw it.
 */
export function presentPetContextMenu(window: BrowserWindow, presentation: PetMenuPresentation): boolean {
  if (!isPlusRuntime()) return false;
  if (window.isDestroyed() || !window.isVisible()) return false;
  try {
    openBuddyMenuForPet(`pet-${window.id}`, window.getBounds(), presentation);
    return true;
  } catch (error) {
    logError("buddy", "combined pet menu failed; falling back to the native menu", error);
    return false;
  }
}

async function handleMenuAction(action: unknown, petHandleId: string): Promise<unknown> {
  switch (action) {
    case "pet": {
      // Routes through the authoritative host; the renderer never writes state.
      const snapshot = requestBuddyCare("pet");
      info("buddy", "pet the bird", { petHandleId, affection: snapshot.affection });
      return { snapshot, reaction: `${snapshot.name} chirps happily!` };
    }
    case "status":
      return { snapshot: getBuddySnapshot() };
    case "settings":
      openControlCenterWindow("settings");
      closeBuddyMenu();
      return { closed: true };
    case "quit":
      closeBuddyMenu();
      app.quit();
      return { closed: true };
    default:
      return { snapshot: getBuddySnapshot() };
  }
}

// --- B. Collapsible dock ------------------------------------------------------

const dockRoutes: readonly { readonly label: string; readonly route: ControlCenterRoute }[] = [
  { label: "Buddy", route: "dashboard" },
  { label: "Pets", route: "pets" },
  { label: "Plugins", route: "plugins" },
  { label: "Integrations", route: "integrations" },
  { label: "AI", route: "settings" },
  { label: "Settings", route: "settings" },
  { label: "Control Center", route: "dashboard" },
];

function currentWorkArea(): Rect {
  return screen.getPrimaryDisplay().workArea;
}

export function applyDockBounds(): void {
  if (!dockWindow || dockWindow.isDestroyed()) return;
  const prefs = getDockPreferences();
  dockWindow.setBounds(computeDockBounds(prefs.edge as DockEdge, prefs.collapsed, currentWorkArea()));
}

export function isBuddyDockOpen(): boolean {
  return dockWindow !== null && !dockWindow.isDestroyed();
}

export function closeBuddyDock(): void {
  if (dockWindow && !dockWindow.isDestroyed()) dockWindow.close();
}

export function openBuddyDock(): void {
  if (dockWindow && !dockWindow.isDestroyed()) { dockWindow.show(); return; }

  const prefs = getDockPreferences();
  const bounds = computeDockBounds(prefs.edge as DockEdge, prefs.collapsed, currentWorkArea());
  const token = `dock-${Date.now()}`;
  const window = createSurfaceWindow("dock", token, bounds, true);
  dockWindow = window;
  hardenSurface(window);

  const handlers = registerSurfaceIpc(window, token, null);

  window.once("ready-to-show", () => window.show());
  window.once("closed", () => {
    handlers.dispose();
    if (dockWindow === window) dockWindow = null;
  });

  window.loadURL(buildSurfaceUrl("dock", { dock: prefs, routes: dockRoutes, edges: dockEdges })).catch((error: unknown) => {
    logError("buddy", "dock load failed", error);
  });
  info("buddy", "dock opened", { edge: prefs.edge, collapsed: prefs.collapsed });
}

export function toggleBuddyDock(): void {
  if (isBuddyDockOpen()) closeBuddyDock();
  else openBuddyDock();
}
