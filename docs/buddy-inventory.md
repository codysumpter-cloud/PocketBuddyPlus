# Shared Buddy inventory

Pocket Buddy+ owns one durable inventory and equipment ledger so plugins can exchange items without creating incompatible private economies.

## Core guarantees

- one host-owned inventory document per Pocket Buddy+ profile
- atomic persistence through temporary-file replacement
- immutable item definitions supplied by the trusted host
- integer quantities with per-item stack limits
- typed equipment slots
- append-only recent mutation receipts
- idempotent transaction ids for safe retries
- atomic rejection when a mutation is invalid or stock is insufficient

The initial catalog reuses canonical Buddy Home identifiers where they already exist, including `home.bed.basic`, `home.food-bowl.basic`, and `home.toy.ball`. It also includes the current Pocket Buddy+ wardrobe accessories and a first tradeable consumable, `consumable.apple`.

## Plugin access

Inventory uses the existing Buddy permissions:

- `pets:read` permits `ctx.inventory.snapshot()` and `ctx.inventory.onChange(...)`.
- `pets:manage` permits grants, consumption, equipping, and unequipping.

Example reward:

```ts
await ctx.inventory.grant({
  transactionId: `battle.reward:${battleId}`,
  itemId: "consumable.apple",
  quantity: 1,
  reason: "Battle victory reward",
});
```

Example equipment change:

```ts
await ctx.inventory.equip({
  transactionId: `outfit:${crypto.randomUUID()}`,
  itemId: "wardrobe.blue-scarf",
  reason: "Player selected the blue scarf",
});
```

Transaction ids must be stable across retries. Repeating the same source, operation, and transaction id returns the current snapshot without applying the mutation twice. Reusing an id for a conflicting mutation is rejected.

## Snapshot

The public snapshot includes:

- schema version and monotonic revision
- host item definitions
- owned quantities
- equipped item ids by slot
- the latest ledger receipts

The ledger records the source plugin, operation, item, quantity or slot, reason, timestamp, and resulting revision. It does not contain provider keys, Talk history, notes, files, or plugin-private storage.

## Trading boundary

This is the local foundation for battles, rewards, crafting, gifting, and trading. Network trading is intentionally not implemented here. A future trade system must add signed offers, explicit confirmations, atomic two-party settlement, expiry, replay protection, and abuse controls on top of this ledger rather than transferring raw plugin storage.
