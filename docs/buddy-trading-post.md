# Buddy Trading Post

Buddy Trading Post is Pocket Buddy+'s first trading experience built on the host-owned shared inventory.

## Version 1 scope

The first version is a local barter shop. It offers three fixed, transparent exchanges:

- two apples for a Gold Star
- two apples for a Blue Scarf
- one apple for a Night Cap

The plugin reads only the public Buddy profile and shared inventory. It does not access Talk history, notes, tasks, files, secrets, provider credentials, or another player's data.

## Atomic exchange

Trading Post uses one host operation for both sides of a barter:

```ts
await ctx.inventory.exchange({
  transactionId,
  itemId: "consumable.apple",
  quantity: 2,
  receivedItemId: "wardrobe.gold-star",
  receivedQuantity: 1,
  reason: "Buddy Trading Post: 2 apples for a Gold Star",
});
```

The host validates all conditions before committing:

- both item definitions exist
- both items are marked tradable
- the offered and received item ids differ
- the offered quantity is owned
- the received quantity will not exceed its stack limit

A failure changes neither quantity and does not advance the inventory revision.

## Retry safety

Before settlement, the plugin saves a pending trade with a deterministic transaction id:

```text
trade.exchange:<buddy-profile-id>:<trade-number>:<offer-id>
```

If Pocket Buddy+ stops after the host commits the exchange but before the plugin records completion, startup retries the exact transaction. The host ledger recognizes the identical receipt and returns the current inventory without exchanging the items twice.

A conflicting reuse of the transaction id is rejected.

## User experience

The plugin registers one command per offer plus a Trading Post status command. It reports insufficient stock and stack limits before attempting settlement. A failed settlement remains visible as a pending trade rather than silently discarding or duplicating items.

The plugin is bundled but not enabled automatically. The normal Pocket Buddy+ permission approval flow controls its access to `pets:read`, `pets:manage`, storage, commands, status, toasts, and Buddy reactions.

## Not online trading

This implementation does not provide:

- player-to-player item exchange
- a marketplace or auction house
- remote inventory lookup
- currency purchases or wagering
- escrow between devices
- server-authoritative settlement

Those features require authenticated player identity, signed and expiring offers, two-party confirmation, server-side atomic settlement, replay protection, reconnect recovery, moderation, and abuse controls. The local Trading Post establishes the safe one-ledger primitive those systems can later call; it does not pretend to replace them.
