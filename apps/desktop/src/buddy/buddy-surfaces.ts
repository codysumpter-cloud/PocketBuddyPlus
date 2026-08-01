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
import { dockEdges, type DockEdge } from "./buddy-store.js";
import { isPlusRuntime } from "../product-runtime.js";

const menuWidth = 236;
const menuHeight = 372;

let menuWindow: BrowserWindow | null = null;
let dockWindow: BrowserWindow | null = null;
/** Pet handle whose menu is currently open, so multi-pet routing stays correct. */
let menuOwnerPetId: string | null = null;
let menuOpen = false;

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
  const csp = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'none'; connect-src 'none'; form-action 'none'; base-uri 'none'; frame-src 'none'";
  const data = JSON.stringify(payload).replace(/</g, "\\u003c");
  const html = kind === "menu" ? renderMenuDocument(csp, data) : renderDockDocument(csp, data);
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

// Shared visual language: dark translucent pixel-friendly surface, warm gold
// accent, hard-edged rendering rather than blurry game UI.
const sharedStyle = `
*{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%;background:transparent;overflow:hidden;-webkit-user-select:none;user-select:none}
body{font-family:"Monocraft","Minecraftia",ui-monospace,"SF Mono",Menlo,Consolas,monospace;font-size:12px;color:#f4ead8;image-rendering:pixelated;-webkit-font-smoothing:none}
.panel{background:rgba(18,16,22,.94);border:2px solid #c9a227;border-radius:2px;box-shadow:0 6px 0 rgba(0,0,0,.45)}
button{font:inherit;color:inherit;background:none;border:0;cursor:pointer;text-align:left}
`;

function renderMenuDocument(csp: string, data: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><title>Buddy</title><style>${sharedStyle}
.panel{height:100%;display:flex;flex-direction:column}
header{padding:8px 10px;border-bottom:2px solid rgba(201,162,39,.5);display:flex;flex-direction:column;gap:2px}
header .name{color:#f7d774;letter-spacing:.5px}
header .mood{font-size:10px;color:#a79c8a}
nav{flex:1;overflow-y:auto;padding:4px 0}
nav button{display:block;width:100%;padding:6px 10px;line-height:1.2}
nav button:hover,nav button:focus{background:rgba(201,162,39,.22);outline:none}
nav button .hint{display:block;font-size:9px;color:#8d8272}
.view{flex:1;overflow-y:auto;padding:8px 10px;display:none}
.view.active{display:block}
nav.hidden{display:none}
.row{display:flex;justify-content:space-between;gap:8px;padding:2px 0;font-size:11px}
.row span:last-child{color:#f7d774}
.bar{height:5px;background:rgba(255,255,255,.10);margin-top:2px}
.bar i{display:block;height:100%;background:#c9a227}
h2{font-size:11px;color:#f7d774;margin-bottom:6px;letter-spacing:.5px}
.note{font-size:10px;color:#a79c8a;line-height:1.45}
.src{margin-top:6px;font-size:10px;color:#f0c04a;line-height:1.4}
footer{padding:6px 10px;border-top:2px solid rgba(201,162,39,.5)}
footer button{font-size:10px;color:#a79c8a}
footer button:hover{color:#f7d774}
.react{padding:6px 10px;font-size:10px;color:#8fd694;min-height:14px}
</style></head><body><div class="panel">
<header><span class="name" id="name">Buddy</span><span class="mood" id="mood"></span></header>
<div class="react" id="react"></div>
<nav id="nav"></nav>
<div class="view" id="view"></div>
<footer><button id="back" type="button">&lt; Back</button></footer>
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
function paintNav(){nav.innerHTML='';for(var i=0;i<data.items.length;i++){(function(item){
var b=document.createElement('button');b.type='button';b.textContent=item.label;
if(!item.implemented){var h=document.createElement('span');h.className='hint';h.textContent='not ported yet';b.appendChild(h);}
b.addEventListener('click',function(){onAction(item);});nav.appendChild(b);})(data.items[i]);}}
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
document.addEventListener('keydown',function(e){if(e.key==='Escape'){if(view.classList.contains('active'))showNav();else api.close();}});
api.onSnapshot(function(next){snapshot=next;paintHeader();if(view.classList.contains('active')&&view.querySelector('h2')&&view.querySelector('h2').textContent==='Status')showView(renderStatus());});
api.getSnapshot().then(function(next){snapshot=next;paintHeader();});
paintNav();showNav();
</script></body></html>`;
}

function renderDockDocument(csp: string, data: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><title>Dock</title><style>${sharedStyle}
.panel{height:100%;display:flex;align-items:center;gap:6px;padding:6px 8px;overflow:hidden}
.panel.vertical{flex-direction:column;align-items:stretch}
.panel.collapsed{padding:0;justify-content:center;align-items:center;cursor:pointer}
.buddy{display:flex;flex-direction:column;justify-content:center;min-width:120px;padding-right:8px;border-right:2px solid rgba(201,162,39,.4)}
.panel.vertical .buddy{border-right:0;border-bottom:2px solid rgba(201,162,39,.4);padding:0 0 6px;min-width:0}
.buddy .n{color:#f7d774}
.buddy .m{font-size:10px;color:#a79c8a}
.acts{display:flex;gap:4px;flex:1;overflow:auto}
.panel.vertical .acts{flex-direction:column}
.acts button{padding:6px 8px;border:1px solid rgba(201,162,39,.45);border-radius:2px;white-space:nowrap;font-size:11px}
.acts button:hover{background:rgba(201,162,39,.22)}
.ctrl{display:flex;gap:4px}
.panel.vertical .ctrl{flex-direction:column}
.ctrl button{padding:4px 6px;font-size:10px;color:#a79c8a;border:1px solid rgba(201,162,39,.3);border-radius:2px}
.ctrl button:hover{color:#f7d774}
.ctrl button[aria-pressed="true"]{color:#12101a;background:#c9a227}
.handle{font-size:10px;color:#c9a227;letter-spacing:2px}
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
var collapse=document.createElement('button');collapse.type='button';collapse.textContent='\\u2212';collapse.title='Collapse dock';
collapse.addEventListener('click',function(){setPrefs({collapsed:true});});ctrl.appendChild(collapse);
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

  const unsubscribe = subscribeToBuddy((snapshot) => {
    if (!window.isDestroyed()) window.webContents.send(`${channel}:snapshot`, snapshot);
  });

  return {
    dispose: () => {
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
export function openBuddyMenuForPet(petHandleId: string, petBounds: Rect): void {
  if (menuWindow && !menuWindow.isDestroyed()) {
    if (menuOwnerPetId === petHandleId) { closeBuddyMenu(); return; }
    closeBuddyMenu();
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

  const items = getBuddyMenuItems({ supportsProcessExit: true }).map((item) => ({
    action: item.action,
    label: item.label,
    implemented: implementedActions.has(item.action),
    source: placeholderSources[item.action] ?? "",
  }));

  const handlers = registerSurfaceIpc(window, token, async (action) => handleMenuAction(action, petHandleId));

  window.once("ready-to-show", () => { window.show(); window.focus(); });
  // Click-away closes the menu, matching the Pocket Buddy interaction model.
  window.on("blur", () => { if (!window.isDestroyed()) window.close(); });
  window.once("closed", () => {
    handlers.dispose();
    if (menuWindow === window) { menuWindow = null; menuOwnerPetId = null; menuOpen = false; }
  });

  window.loadURL(buildSurfaceUrl("menu", { items })).catch((error: unknown) => {
    logError("buddy", "attached menu load failed", error);
  });
  debug("buddy", "attached menu opened", { petHandleId, bounds });
}

/**
 * Convenience entry point for pet controllers: open the attached menu for a live
 * pet window. No-ops on the inherited OpenPets build so that target keeps its
 * original behavior.
 */
export function openBuddyMenuForPetWindow(petHandleId: string, window: BrowserWindow | null): void {
  if (!isPlusRuntime()) return;
  if (!window || window.isDestroyed() || !window.isVisible()) return;
  try {
    openBuddyMenuForPet(petHandleId, window.getBounds());
  } catch (error) {
    logError("buddy", "attached menu open failed", error);
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
