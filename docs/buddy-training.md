# Buddy Training

Buddy Training is the first bundled Pocket Buddy+ experience built entirely on the shared host contracts.

It demonstrates the platform rule:

> Pocket Buddy+ owns the Buddy and inventory. Plugins own experiences.

## How it works

The plugin reads the public profile attached to the default Buddy and chooses a drill from the current mood and dominant need:

- energy → balance and breathing
- hunger → patience practice
- social → teamwork signals
- play → agility course
- comfort or cleanliness → gentle focus drills

A session can be run every 15 seconds. Progress is stored in the plugin's private state, while earned items are written to the host-owned shared inventory.

## Rewards

Every third completed session earns one `consumable.apple`.

The plugin first persists a pending reward containing a deterministic transaction id:

```text
training.reward:<buddy-profile-id>:<session-number>
```

It then submits that reward to `ctx.inventory.grant(...)`. If the process stops after the host commits the item but before the plugin clears its pending state, the next startup retries the same transaction id. The host ledger treats the retry as idempotent, so the reward is acknowledged without being duplicated.

## Permissions

- `pets:read` — read the public Buddy profile and shared inventory contract
- `pets:manage` — grant a trusted host-defined reward
- `storage` — save sessions and pending settlement
- `commands` — expose training and status actions
- `status` — show progress in the plugin surface
- `ui:toast` — report results and cooldowns
- `pet:reaction` — animate the Buddy during and after training

The plugin cannot define arbitrary items, mint an unknown currency, read Talk history, inspect notes/tasks, or access provider credentials.

## Why this matters

Buddy Training proves that future battles, minigames, quests, shops, gifting, and trading can share one identity and one item ledger. Those experiences no longer need separate copies of the Buddy, progress, or rewards.
