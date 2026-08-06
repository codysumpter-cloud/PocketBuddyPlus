# Buddy profile contract

Pocket Buddy+ owns one durable primary Buddy profile. The profile is persisted by the Electron host and exposed read-only to approved plugins through the existing multi-pet API.

## Plugin access

A JavaScript plugin declares `pets:read`, then reads the default entry:

```ts
const defaultBuddy = (await ctx.pets.list()).find((pet) => pet.kind === "default");
const profile = defaultBuddy?.buddyProfile;

if (profile) {
  console.log(profile.displayName, profile.mood, profile.dominantNeed);
}
```

`ctx.pets.onChange(...)` also receives a refreshed default entry when either the pet registry or the public profile changes.

## Public fields

The version 1 profile contains:

- stable Buddy id and display name
- created, updated, and age timestamps
- affection from `0` to `1`
- need pressure from `0` to `1` for hunger, energy, social contact, play, comfort, and cleanliness
- derived mood, activity, and dominant need
- most recent care action, when present
- the selected wardrobe id

Need values are **pressure**, not satisfaction: `0` means satisfied and `1` means urgent.

## Privacy boundary

The profile intentionally excludes:

- Talk messages and AI prompts
- notes and tasks
- files, screen contents, and clipboard contents
- provider credentials and other secrets
- plugin configuration and plugin-owned storage

Plugins cannot write the profile through this contract. Profile mutations remain host/Control Center operations so future inventory, battles, trading, and sync features share one authoritative identity.

## Persistence and migration

The host stores a versioned document named `pocket-buddy-plus-buddy-profile.json` in the application user-data directory. Writes use a temporary file followed by an atomic rename.

On first launch after this feature ships, the Control Center submits only its existing Buddy state and wardrobe as a migration candidate. The host validates and imports that candidate when no established profile exists. Existing Talk history, notes, tasks, and other local UI data stay where they are and are not copied into the public profile.

Stale renderer snapshots cannot roll the host profile backwards. Invalid values, unsupported enum values, forged derived mood fields, and out-of-range needs are rejected or canonicalized before persistence.

## Compatibility

The profile is attached to the existing `OpenPetsPetInfo` default entry instead of introducing another pet registry. This keeps `pets:read` as the single read permission and lets old plugins ignore the optional field without breaking.
