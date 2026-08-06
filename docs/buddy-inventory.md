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
- atomic exchanges that remove and receive items in one revision

The initial catalog reuses canonical Buddy Home identifiers where they already exist, including `home.bed.basic`, `home.food-bowl.basic`, and `home.toy.ball`. It also includes the current Pocket Buddy+ wardrobe accessories and a first tradeable consumable, `consumable.apple`.

## Plugin access

Inventory uses the existing Buddy permissions:

- `pets:read` permits `ctx.inventory.snapshot()` and `ctx.inventory.onChange(...)`.
- `pets:manage` permits grants, consumption, atomic exchanges, equipping, and unequipping.

Example reward:

```ts
await ctx.inventory.grant({
  transactionId: `battle.reward:${battleId}`,
  itemId: "consumable.apple",
  quantity: 1,
  reason: "Battle victory reward",
});
```

Example atomic barter:

```ts
await ctx.inventory.exchange({
  transactionId: `trade.exchange:${tradeId}`,
  itemId: "consumable.apple",
  quantity: 2,
  receivedItemId: "wardrobe.blue-scarf",
  receivedQuantity: 1,
  reason: "Trading Post barter",
});
```

The exchange validates both host item definitions, tradable flags, offered stock, and the received stack limit before committing. If any validation fails, neither side of the exchange is applied. If the last owned copy of an equipped offered item is exchanged away, it is unequipped in the same transaction.

Example equipment change:

```ts
await ctx.inventory.equip({
  transactionId: `outfit:${crypto.randomUUID()}`,
  itemId: "wardrobe.blue-scarf",
  reason: "Player selected the blue scarf",
});
```

Transaction ids must be stable across retries. Repeating the same source, operation, transaction id, and complete mutation returns the current snapshot without applying it twice. Reusing an id for a conflicting mutation is rejected.

## Snapshot

The public snapshot includes:

- schema version and monotonic revision
- host item definitions
- owned quantities
- equipped item ids by slot
- the latest ledger receipts

The ledger records the source plugin, operation, offered item and quantity, received item and quantity for exchanges, equipment slot where relevant, reason, timestamp, and resulting revision. It does not contain provider keys, Talk history, notes, files, or plugin-private storage.

## Trading boundary

The atomic `exchange` operation supports local shops, barter, crafting transforms, and other one-inventory experiences without unsafe compensating writes. Buddy Trading Post is the first consumer.

Player-to-player or network trading is intentionally not implemented by this ledger alone. A future remote trade system must add authenticated player identity, signed offers, explicit confirmations, atomic two-party server settlement, expiry, replay protection, reconnect recovery, and abuse controls. Plugins must not simulate remote settlement by passing raw storage records or by performing unrelated consume and grant calls.
