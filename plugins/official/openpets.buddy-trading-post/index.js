export const STATE_VERSION = 1;

export const tradingOffers = [
  {
    id: "gold-star",
    title: "Trade for Gold Star",
    itemId: "consumable.apple",
    quantity: 2,
    receivedItemId: "wardrobe.gold-star",
    receivedQuantity: 1,
    label: "2 apples for a Gold Star",
  },
  {
    id: "blue-scarf",
    title: "Trade for Blue Scarf",
    itemId: "consumable.apple",
    quantity: 2,
    receivedItemId: "wardrobe.blue-scarf",
    receivedQuantity: 1,
    label: "2 apples for a Blue Scarf",
  },
  {
    id: "night-cap",
    title: "Trade for Night Cap",
    itemId: "consumable.apple",
    quantity: 1,
    receivedItemId: "wardrobe.night-cap",
    receivedQuantity: 1,
    label: "1 apple for a Night Cap",
  },
];

function nonNegativeInteger(value) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : 0;
}

function cleanPendingTrade(value) {
  if (!value || typeof value !== "object") return null;
  if (typeof value.offerId !== "string" || typeof value.transactionId !== "string" || typeof value.reason !== "string") return null;
  if (typeof value.itemId !== "string" || typeof value.receivedItemId !== "string") return null;
  const quantity = nonNegativeInteger(value.quantity);
  const receivedQuantity = nonNegativeInteger(value.receivedQuantity);
  if (quantity < 1 || receivedQuantity < 1) return null;
  return {
    offerId: value.offerId,
    transactionId: value.transactionId,
    itemId: value.itemId,
    quantity,
    receivedItemId: value.receivedItemId,
    receivedQuantity,
    reason: value.reason,
  };
}

export function cleanTradingState(value = {}) {
  const source = value && typeof value === "object" ? value : {};
  return {
    version: STATE_VERSION,
    trades: nonNegativeInteger(source.trades),
    itemsReceived: nonNegativeInteger(source.itemsReceived),
    lastTradeAt: typeof source.lastTradeAt === "number" && Number.isFinite(source.lastTradeAt) && source.lastTradeAt >= 0 ? source.lastTradeAt : 0,
    lastOfferId: typeof source.lastOfferId === "string" && tradingOffers.some((offer) => offer.id === source.lastOfferId) ? source.lastOfferId : null,
    pendingTrade: cleanPendingTrade(source.pendingTrade),
  };
}

export function getTradingOffer(offerId) {
  return tradingOffers.find((offer) => offer.id === offerId) ?? null;
}

export function tradeTransactionId(profileId, tradeNumber, offerId) {
  const safeProfileId = typeof profileId === "string" && /^[A-Za-z0-9._:-]{1,80}$/u.test(profileId) ? profileId : "primary-buddy";
  const safeOffer = typeof offerId === "string" && /^[a-z0-9-]{1,32}$/u.test(offerId) ? offerId : "offer";
  return `trade.exchange:${safeProfileId}:${Math.max(1, nonNegativeInteger(tradeNumber))}:${safeOffer}`;
}

async function readPrimaryProfile(ctx) {
  const pets = await ctx.pets.list();
  return pets.find((pet) => pet.kind === "default")?.buddyProfile ?? null;
}

async function saveState(ctx, state) {
  const clean = cleanTradingState(state);
  await ctx.storage.set("state", clean);
  return clean;
}

export async function settlePendingTrade(ctx, stateValue, now = Date.now()) {
  const state = cleanTradingState(stateValue);
  if (!state.pendingTrade) return { state, settled: false };
  if (!ctx.inventory?.exchange) return { state, settled: false, unavailable: true };

  const snapshot = await ctx.inventory.exchange({
    transactionId: state.pendingTrade.transactionId,
    itemId: state.pendingTrade.itemId,
    quantity: state.pendingTrade.quantity,
    receivedItemId: state.pendingTrade.receivedItemId,
    receivedQuantity: state.pendingTrade.receivedQuantity,
    reason: state.pendingTrade.reason,
  });
  const next = await saveState(ctx, {
    ...state,
    trades: state.trades + 1,
    itemsReceived: state.itemsReceived + state.pendingTrade.receivedQuantity,
    lastTradeAt: now,
    lastOfferId: state.pendingTrade.offerId,
    pendingTrade: null,
  });
  return { state: next, settled: true, snapshot };
}

function definitionById(snapshot, itemId) {
  return Array.isArray(snapshot?.definitions) ? snapshot.definitions.find((definition) => definition?.id === itemId) : undefined;
}

export function canAcceptOffer(snapshot, offer) {
  if (!snapshot || !offer) return { ok: false, reason: "inventory-unavailable" };
  const offeredDefinition = definitionById(snapshot, offer.itemId);
  const receivedDefinition = definitionById(snapshot, offer.receivedItemId);
  if (!offeredDefinition || !receivedDefinition || offeredDefinition.tradable !== true || receivedDefinition.tradable !== true) {
    return { ok: false, reason: "offer-unavailable" };
  }
  const currentOffered = snapshot.quantities?.[offer.itemId] ?? 0;
  if (currentOffered < offer.quantity) return { ok: false, reason: "insufficient-items" };
  const currentReceived = snapshot.quantities?.[offer.receivedItemId] ?? 0;
  if (currentReceived + offer.receivedQuantity > receivedDefinition.maxStack) return { ok: false, reason: "stack-limit" };
  return { ok: true };
}

function statusText(profile, state) {
  const name = profile?.displayName ?? "Buddy";
  if (state.pendingTrade) return `${name} has a pending trade at the Trading Post.`;
  return `${name} Trading Post · ${state.trades} completed trade${state.trades === 1 ? "" : "s"}`;
}

async function refreshStatus(ctx, profile, state) {
  await ctx.status.set({ text: statusText(profile, state), tone: state.pendingTrade ? "warning" : "info" });
}

export async function runTrade(ctx, offerId, now = Date.now()) {
  let state = cleanTradingState(await ctx.storage.get("state"));
  if (state.pendingTrade) {
    try {
      state = (await settlePendingTrade(ctx, state, now)).state;
    } catch (error) {
      await ctx.ui.toast({ text: `The pending trade still needs attention: ${error instanceof Error ? error.message : String(error)}`, tone: "warning" });
      return { ok: false, reason: "pending-trade", state };
    }
  }

  const profile = await readPrimaryProfile(ctx);
  if (!profile) {
    await ctx.ui.toast({ text: "Buddy Trading Post needs the Pocket Buddy+ profile contract.", tone: "error" });
    return { ok: false, reason: "profile-unavailable", state };
  }
  if (!ctx.inventory?.snapshot || !ctx.inventory?.exchange) {
    await ctx.ui.toast({ text: "This Pocket Buddy+ host does not support atomic trading yet.", tone: "error" });
    return { ok: false, reason: "exchange-unavailable", state, profile };
  }

  const offer = getTradingOffer(offerId);
  if (!offer) {
    await ctx.ui.toast({ text: "That Trading Post offer is unavailable.", tone: "error" });
    return { ok: false, reason: "offer-unavailable", state, profile };
  }
  const inventory = await ctx.inventory.snapshot();
  const eligibility = canAcceptOffer(inventory, offer);
  if (!eligibility.ok) {
    const message = eligibility.reason === "insufficient-items"
      ? `You need ${offer.quantity} apple${offer.quantity === 1 ? "" : "s"} for that trade.`
      : eligibility.reason === "stack-limit"
        ? `You already own the maximum number of that item.`
        : "That trade cannot be completed with the current inventory catalog.";
    await ctx.ui.toast({ text: message, tone: "warning" });
    return { ok: false, reason: eligibility.reason, state, profile, offer };
  }

  const tradeNumber = state.trades + 1;
  const pendingTrade = {
    offerId: offer.id,
    transactionId: tradeTransactionId(profile.id, tradeNumber, offer.id),
    itemId: offer.itemId,
    quantity: offer.quantity,
    receivedItemId: offer.receivedItemId,
    receivedQuantity: offer.receivedQuantity,
    reason: `Buddy Trading Post: ${offer.label}`,
  };
  state = await saveState(ctx, { ...state, pendingTrade });
  await ctx.pet.react("working", { showMessage: false });

  try {
    const settled = await settlePendingTrade(ctx, state, now);
    state = settled.state;
    await ctx.ui.toast({ text: `${profile.displayName} completed the trade: ${offer.label}.`, tone: "success", durationMs: 5_000 });
    await ctx.pet.react("celebrating", { showMessage: false });
    await refreshStatus(ctx, profile, state);
    return { ok: true, state, profile, offer, snapshot: settled.snapshot };
  } catch (error) {
    await ctx.ui.toast({ text: `The trade is saved for a safe retry: ${error instanceof Error ? error.message : String(error)}`, tone: "warning" });
    await ctx.pet.react("waiting", { showMessage: false });
    await refreshStatus(ctx, profile, state);
    return { ok: false, reason: "settlement-failed", state, profile, offer };
  }
}

export async function showTradingStatus(ctx) {
  let state = cleanTradingState(await ctx.storage.get("state"));
  if (state.pendingTrade) {
    try { state = (await settlePendingTrade(ctx, state)).state; } catch { /* preserve pending trade */ }
  }
  const profile = await readPrimaryProfile(ctx);
  await refreshStatus(ctx, profile, state);
  await ctx.ui.toast({ text: statusText(profile, state), tone: state.pendingTrade ? "warning" : "info" });
  return { state, profile };
}

export function register(OpenPetsPlugin) {
  OpenPetsPlugin.register({
    async start(ctx) {
      let state = cleanTradingState(await ctx.storage.get("state"));
      if (state.pendingTrade) {
        try { state = (await settlePendingTrade(ctx, state)).state; } catch { /* preserve pending trade */ }
      }
      const profile = await readPrimaryProfile(ctx);
      await refreshStatus(ctx, profile, state);
      for (const offer of tradingOffers) {
        await ctx.commands.register({
          id: `trade-${offer.id}`,
          title: offer.title,
          description: offer.label,
          featured: offer.id === "gold-star",
        }, () => runTrade(ctx, offer.id));
      }
      await ctx.commands.register({
        id: "trading-status",
        title: "Trading Post status",
        description: "Show completed trades and any pending retry-safe exchange.",
      }, () => showTradingStatus(ctx));
    },
    async stop() {},
  });
}
