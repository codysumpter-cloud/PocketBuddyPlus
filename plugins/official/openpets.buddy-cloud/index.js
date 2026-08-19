export const PROJECT_URL = "https://uipxgyzvcrxjfcidvsbl.supabase.co";
export const PUBLISHABLE_KEY = "sb_publishable_eiqbrslQ2LMpEKYnwO8rug_TwfeugdZ";
export const PROFILE_NAMESPACE = "pocketbuddyplus";
export const PROFILE_STATE_KEY = "profile";
export const AUTO_BACKUP_INTERVAL_MS = 15 * 60 * 1000;

const ACCESS_KEY = "buddy-cloud-access-token";
const REFRESH_KEY = "buddy-cloud-refresh-token";
const EMAIL_KEY = "buddy-cloud-email";

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function decodeBase64Url(value) {
  const normalized = String(value).replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  try { return atob(padded); } catch { return ""; }
}

export function jwtClaims(token) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) return null;
  try {
    const parsed = JSON.parse(decodeBase64Url(parts[1]));
    return asObject(parsed);
  } catch {
    return null;
  }
}

export function jwtSubject(token) {
  const subject = jwtClaims(token)?.sub;
  return typeof subject === "string" && /^[0-9a-f-]{36}$/i.test(subject) ? subject : null;
}

export function tokenExpiresWithin(token, seconds = 90, nowMs = Date.now()) {
  const exp = jwtClaims(token)?.exp;
  if (typeof exp !== "number" || !Number.isFinite(exp)) return false;
  return exp * 1000 - nowMs <= Math.max(0, seconds) * 1000;
}

function safeJson(response) {
  if (response?.json !== undefined) return response.json;
  try { return JSON.parse(response?.text || "null"); } catch { return null; }
}

function errorMessage(response) {
  const payload = asObject(safeJson(response));
  for (const key of ["msg", "message", "error_description", "error"]) {
    if (typeof payload?.[key] === "string" && payload[key]) return payload[key];
  }
  return response?.text || `HTTP ${response?.status ?? "error"}`;
}

function headers(accessToken) {
  return {
    apikey: PUBLISHABLE_KEY,
    Accept: "application/json",
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
  };
}

async function request(ctx, path, options = {}) {
  const method = options.method || "GET";
  const body = options.body === undefined ? undefined : JSON.stringify(options.body);
  const response = await ctx.net.fetch(`${PROJECT_URL}${path}`, {
    method,
    headers: {
      ...headers(options.accessToken),
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...(options.headers || {}),
    },
    ...(body === undefined ? {} : { body }),
  });
  if (!response.ok) throw new Error(errorMessage(response));
  return safeJson(response);
}

function parseSession(payload, fallbackRefreshToken) {
  const value = asObject(payload);
  const accessToken = typeof value?.access_token === "string" ? value.access_token : null;
  const refreshToken = typeof value?.refresh_token === "string" && value.refresh_token
    ? value.refresh_token
    : fallbackRefreshToken || null;
  if (!accessToken || !refreshToken || !jwtSubject(accessToken)) throw new Error("Buddy Cloud returned an invalid session.");
  const user = asObject(value?.user);
  return {
    accessToken,
    refreshToken,
    email: typeof user?.email === "string" ? user.email : typeof jwtClaims(accessToken)?.email === "string" ? jwtClaims(accessToken).email : null,
  };
}

async function saveSession(ctx, session) {
  await ctx.secrets.set(ACCESS_KEY, session.accessToken);
  await ctx.secrets.set(REFRESH_KEY, session.refreshToken);
  if (session.email) await ctx.secrets.set(EMAIL_KEY, session.email);
}

async function clearSession(ctx) {
  await Promise.all([
    ctx.secrets.delete(ACCESS_KEY),
    ctx.secrets.delete(REFRESH_KEY),
    ctx.secrets.delete(EMAIL_KEY),
  ]);
}

export async function signIn(ctx, email, password) {
  const cleanedEmail = String(email || "").trim().toLowerCase();
  if (!cleanedEmail.includes("@") || String(password || "").length < 6) throw new Error("Enter a valid email and password.");
  const payload = await request(ctx, "/auth/v1/token?grant_type=password", {
    method: "POST",
    body: { email: cleanedEmail, password: String(password) },
  });
  const session = parseSession(payload);
  await saveSession(ctx, session);
  return session;
}

export async function signUp(ctx, email, password) {
  const cleanedEmail = String(email || "").trim().toLowerCase();
  if (!cleanedEmail.includes("@") || String(password || "").length < 6) throw new Error("Enter a valid email and password.");
  const payload = await request(ctx, "/auth/v1/signup", {
    method: "POST",
    body: { email: cleanedEmail, password: String(password), data: { display_name: "Buddy" } },
  });
  if (asObject(payload)?.access_token) {
    const session = parseSession(payload);
    await saveSession(ctx, session);
    return { session, confirmationRequired: false };
  }
  await ctx.secrets.set(EMAIL_KEY, cleanedEmail);
  return { session: null, confirmationRequired: true };
}

export async function currentSession(ctx, forceRefresh = false) {
  const accessToken = await ctx.secrets.get(ACCESS_KEY);
  if (!accessToken) return null;
  if (!forceRefresh && !tokenExpiresWithin(accessToken, 90)) {
    return { accessToken, refreshToken: await ctx.secrets.get(REFRESH_KEY), email: await ctx.secrets.get(EMAIL_KEY) };
  }
  const refreshToken = await ctx.secrets.get(REFRESH_KEY);
  if (!refreshToken) throw new Error("Buddy Cloud session expired. Sign in again.");
  const payload = await request(ctx, "/auth/v1/token?grant_type=refresh_token", {
    method: "POST",
    body: { refresh_token: refreshToken },
  });
  const session = parseSession(payload, refreshToken);
  await saveSession(ctx, session);
  return session;
}

async function primaryProfile(ctx) {
  const pets = await ctx.pets.list();
  return pets.find((pet) => pet.kind === "default")?.buddyProfile ?? null;
}

async function appendReceipt(ctx, accessToken, action, status, evidence = {}) {
  const ownerId = jwtSubject(accessToken);
  if (!ownerId) throw new Error("Buddy Cloud session is missing an owner id.");
  await request(ctx, "/rest/v1/buddy_receipts", {
    method: "POST",
    accessToken,
    headers: { Prefer: "return=minimal" },
    body: {
      owner_id: ownerId,
      source: "pocketbuddyplus",
      action,
      status,
      evidence,
    },
  });
}

export async function backupProfile(ctx, options = {}) {
  const session = await currentSession(ctx);
  if (!session?.accessToken) {
    if (options.quiet) return { ok: false, reason: "not-linked" };
    throw new Error("Buddy Cloud is not linked yet.");
  }
  const profile = await primaryProfile(ctx);
  if (!profile) throw new Error("Pocket Buddy+ profile is unavailable.");
  const ownerId = jwtSubject(session.accessToken);
  if (!ownerId) throw new Error("Buddy Cloud session is missing an owner id.");
  const now = new Date().toISOString();
  await request(ctx, "/rest/v1/buddy_state?on_conflict=owner_id,namespace,state_key", {
    method: "POST",
    accessToken: session.accessToken,
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: {
      owner_id: ownerId,
      namespace: PROFILE_NAMESPACE,
      state_key: PROFILE_STATE_KEY,
      state: { profile, syncedAt: now, source: "pocketbuddyplus" },
    },
  });
  await appendReceipt(ctx, session.accessToken, "buddy_profile_backup", "ok", {
    profile_id: profile.id,
    profile_updated_at_ms: profile.updatedAtMs,
  });
  await ctx.storage.set("lastBackupAt", now);
  await ctx.status.set({ text: `Buddy Cloud · backed up ${profile.displayName}`, tone: "success" });
  if (!options.quiet) await ctx.ui.toast({ text: `${profile.displayName} is backed up to Buddy Cloud.`, tone: "success" });
  return { ok: true, profile, syncedAt: now };
}

export async function fetchCloudProfile(ctx) {
  const session = await currentSession(ctx);
  if (!session?.accessToken) return null;
  const rows = await request(ctx, `/rest/v1/buddy_state?select=state,version,updated_at&namespace=eq.${PROFILE_NAMESPACE}&state_key=eq.${PROFILE_STATE_KEY}&limit=1`, {
    accessToken: session.accessToken,
  });
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

export async function remember(ctx, text) {
  const content = String(text || "").trim();
  if (!content) throw new Error("Memory text is empty.");
  const session = await currentSession(ctx);
  if (!session?.accessToken) throw new Error("Buddy Cloud is not linked yet.");
  const ownerId = jwtSubject(session.accessToken);
  await request(ctx, "/rest/v1/buddy_memories", {
    method: "POST",
    accessToken: session.accessToken,
    headers: { Prefer: "return=minimal" },
    body: {
      owner_id: ownerId,
      kind: "note",
      content,
      metadata: { client: "pocketbuddyplus" },
      source: "pocketbuddyplus",
      importance: 5,
    },
  });
  await appendReceipt(ctx, session.accessToken, "buddy_memory_append", "ok", { chars: content.length });
  await ctx.ui.toast({ text: "Buddy remembered that in the cloud.", tone: "success" });
}

export async function recall(ctx, query) {
  const searchQuery = String(query || "").trim();
  if (!searchQuery) throw new Error("Recall query is empty.");
  const session = await currentSession(ctx);
  if (!session?.accessToken) throw new Error("Buddy Cloud is not linked yet.");
  const rows = await request(ctx, "/rest/v1/rpc/search_buddy_memories", {
    method: "POST",
    accessToken: session.accessToken,
    body: { search_query: searchQuery, result_limit: 5 },
  });
  const matches = Array.isArray(rows) ? rows : [];
  const summary = matches.length
    ? matches.slice(0, 3).map((row, index) => `${index + 1}. ${String(row.content || "").slice(0, 180)}`).join("\n")
    : `No cloud memories matched “${searchQuery}”.`;
  await ctx.ui.toast({ text: summary, tone: matches.length ? "info" : "warning", durationMs: 8_000 });
  return matches;
}

export async function recentMissions(ctx) {
  const session = await currentSession(ctx);
  if (!session?.accessToken) throw new Error("Buddy Cloud is not linked yet.");
  const rows = await request(ctx, "/rest/v1/buddy_missions?select=title,status,priority,due_at,updated_at&order=updated_at.desc&limit=5", {
    accessToken: session.accessToken,
  });
  const missions = Array.isArray(rows) ? rows : [];
  const summary = missions.length
    ? missions.map((mission) => `${mission.status === "done" ? "✓" : "•"} ${mission.title}`).join("\n")
    : "No Buddy Cloud missions yet.";
  await ctx.ui.toast({ text: summary, tone: "info", durationMs: 8_000 });
  return missions;
}

export async function showCloudStatus(ctx) {
  const session = await currentSession(ctx);
  if (!session?.accessToken) {
    await ctx.status.set({ text: "Buddy Cloud · not linked", tone: "warning" });
    await ctx.ui.toast({ text: "Buddy Cloud is not linked yet.", tone: "warning" });
    return { linked: false };
  }
  const [cloud, email, lastBackupAt] = await Promise.all([
    fetchCloudProfile(ctx),
    ctx.secrets.get(EMAIL_KEY),
    ctx.storage.get("lastBackupAt"),
  ]);
  const version = Number(cloud?.version || 0);
  const label = cloud ? `Buddy Cloud · synced v${version}` : "Buddy Cloud · linked, no backup yet";
  await ctx.status.set({ text: label, tone: cloud ? "success" : "info" });
  await ctx.ui.toast({
    text: cloud
      ? `Buddy Cloud is linked${email ? ` as ${email}` : ""}. Cloud profile revision ${version}. Last local backup ${lastBackupAt || "unknown"}.`
      : `Buddy Cloud is linked${email ? ` as ${email}` : ""}. Back up Buddy to create the first cloud snapshot.`,
    tone: cloud ? "success" : "info",
    durationMs: 8_000,
  });
  return { linked: true, cloud, email, lastBackupAt };
}

export async function disconnect(ctx) {
  await clearSession(ctx);
  await ctx.storage.delete("lastBackupAt");
  await ctx.status.set({ text: "Buddy Cloud · not linked", tone: "warning" });
  await ctx.ui.toast({ text: "Buddy Cloud disconnected from this device.", tone: "info" });
}

export function createConnectMessageHandler(ctx, panel) {
  return async (message) => {
    if (!asObject(message)) return;
    try {
      if (message.type === "sign-in") {
        const session = await signIn(ctx, message.email, message.password);
        await backupProfile(ctx, { quiet: true });
        await panel.postMessage({ type: "auth-result", ok: true, email: session.email || String(message.email || "") });
        return;
      }
      if (message.type === "sign-up") {
        const result = await signUp(ctx, message.email, message.password);
        if (result.session) await backupProfile(ctx, { quiet: true });
        await panel.postMessage({
          type: "auth-result",
          ok: true,
          confirmationRequired: result.confirmationRequired,
          email: String(message.email || "").trim().toLowerCase(),
        });
        return;
      }
      if (message.type === "disconnect") {
        await disconnect(ctx);
        await panel.postMessage({ type: "auth-result", ok: true, disconnected: true });
      }
    } catch (error) {
      await panel.postMessage({ type: "auth-result", ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  };
}

export async function openConnectPanel(ctx) {
  const panel = await ctx.ui.panel({ panel: "connect", title: "Buddy Cloud", width: 520, height: 620 });
  panel.onMessage(createConnectMessageHandler(ctx, panel));
  const email = await ctx.secrets.get(EMAIL_KEY);
  const linked = Boolean(await ctx.secrets.get(ACCESS_KEY));
  await panel.postMessage({ type: "session-status", linked, email: email || null });
  return panel;
}

export function register(OpenPetsPlugin) {
  OpenPetsPlugin.register({
    async start(ctx) {
      await ctx.commands.register({
        id: "buddy-cloud-connect",
        title: "Buddy Cloud account",
        description: "Sign in, create an account, or disconnect Buddy Cloud.",
        featured: true,
      }, () => openConnectPanel(ctx));
      await ctx.commands.register({
        id: "buddy-cloud-backup",
        title: "Back up Buddy now",
        description: "Save the canonical Pocket Buddy+ profile to Buddy Cloud.",
      }, () => backupProfile(ctx));
      await ctx.commands.register({
        id: "buddy-cloud-status",
        title: "Buddy Cloud status",
        description: "Check the account and current cloud profile revision.",
      }, () => showCloudStatus(ctx));
      await ctx.commands.register({
        id: "buddy-cloud-remember",
        title: "Remember in Buddy Cloud",
        description: "Save a durable memory for Buddy.",
        form: { fields: [{ id: "text", type: "textarea", label: "Memory", maxLength: 4000, required: true }], submitLabel: "Remember" },
      }, (values) => remember(ctx, values?.text));
      await ctx.commands.register({
        id: "buddy-cloud-recall",
        title: "Recall from Buddy Cloud",
        description: "Search durable Buddy memories.",
        form: { fields: [{ id: "query", type: "text", label: "Search", maxLength: 300, required: true }], submitLabel: "Recall" },
      }, (values) => recall(ctx, values?.query));
      await ctx.commands.register({
        id: "buddy-cloud-missions",
        title: "Recent cloud missions",
        description: "Show the latest owner-scoped Buddy missions.",
      }, () => recentMissions(ctx));

      await ctx.schedule.every("buddy-cloud-profile-backup", AUTO_BACKUP_INTERVAL_MS, async () => {
        try { await backupProfile(ctx, { quiet: true }); } catch (error) { ctx.log.warn("Buddy Cloud automatic backup failed", error instanceof Error ? error.message : String(error)); }
      });

      try {
        const session = await currentSession(ctx);
        await ctx.status.set({ text: session ? "Buddy Cloud · linked" : "Buddy Cloud · not linked", tone: session ? "success" : "warning" });
      } catch {
        await ctx.status.set({ text: "Buddy Cloud · sign in again", tone: "warning" });
      }
    },
    async stop() {},
  });
}
