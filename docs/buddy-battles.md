# Buddy Battles

Buddy Battles is Pocket Buddy+'s first battle experience built on the shared Buddy profile and inventory contracts.

## Version 1 scope

The first version is deliberately local and deterministic:

- one persistent Buddy controlled by the user
- three built-in sparring opponents
- profile-derived power, guard, speed, and health
- equipment bonuses from the shared inventory
- escalating opponent tiers
- persistent wins, losses, draws, streaks, and best streak
- one shared apple reward for each win
- a 20-second cooldown between matches

It does not claim online PvP, matchmaking, remote player identity, wagering, or server-authoritative combat.

## Profile and equipment

Battle stats are derived from public Buddy data only:

- affection improves power and health
- satisfied play needs improve power
- satisfied comfort needs improve guard
- satisfied energy needs improve speed
- satisfied hunger needs improve health

Equipped shared items provide explicit bonuses:

- Gold Star: power
- Blue Scarf: speed
- Night Cap: guard
- Basic Bed: guard
- Food Bowl: health

The plugin cannot read Talk history, notes, tasks, files, secrets, or provider credentials.

## Deterministic simulation

Each match is seeded from the Buddy profile id, battle number, and selected opponent. Replaying the same inputs produces the same result. This makes tests, receipts, future replay views, and eventual server verification practical.

Opponents rotate through Paper Drone, Moss Golem, and Spark Fox. Every full rotation increases the opponent tier.

## Reward integrity

A win creates a pending reward before inventory settlement:

```text
battle.reward:<buddy-profile-id>:<battle-number>
```

The plugin then grants one `consumable.apple` through the host inventory ledger. If the app stops after the host commits the reward but before the plugin clears its pending state, startup retries the same transaction id. The ledger acknowledges the retry without duplicating the item.

Losses and draws never delete inventory, damage the persistent Buddy profile, or create negative balances.

## Future battle work

This local slice establishes reusable battle state and deterministic resolution. Online battles still require separate host-owned contracts for player identity, signed challenges, authoritative result validation, reconnect handling, anti-replay protection, and abuse controls.
