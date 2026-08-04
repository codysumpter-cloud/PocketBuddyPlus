import assert from "node:assert/strict";
import { test } from "node:test";

import {
  BuddyCreatureState,
  advanceHomeSession,
  applyHomeItemAction,
  createHomePlayState,
  createHomeRoomDocument,
  interactHomeItem,
  moveHomeActor,
  parseHomePlayState,
  petHomeBuddy,
  placeHomeCatalogItem,
} from "../src/index.js";

test("starter catalog items keep canonical footprints and persistent object state", () => {
  let room = createHomeRoomDocument({ roomId: "home", width: 6, height: 4 });
  room = placeHomeCatalogItem(room, {
    id: "bed",
    assetId: "home.bed.basic",
    anchor: { x: 1, y: 1 },
  });
  room = placeHomeCatalogItem(room, {
    id: "tv",
    assetId: "home.tv.basic",
    anchor: { x: 4, y: 1 },
  });

  assert.deepEqual(room.items[0]?.placement.footprint, { width: 2, height: 1 });
  const powered = applyHomeItemAction(room, "tv", "toggle");
  assert.equal(powered.room.items.find((item) => item.id === "tv")?.state.powered, true);
  const channel = applyHomeItemAction(powered.room, "tv", "next-channel");
  assert.equal(channel.room.items.find((item) => item.id === "tv")?.state.channel, "arcade");
});

test("player movement respects room bounds and blocking furniture", () => {
  let room = createHomeRoomDocument({ roomId: "home", width: 4, height: 3 });
  room = placeHomeCatalogItem(room, {
    id: "chair",
    assetId: "home.chair.basic",
    anchor: { x: 1, y: 2 },
  });
  const play = createHomePlayState(room, 10);
  assert.deepEqual(play.player.cell, { x: 0, y: 2 });

  const blocked = moveHomeActor(room, play, "player", "east");
  assert.deepEqual(blocked.player.cell, { x: 0, y: 2 });
  assert.equal(blocked.player.facing, "east");

  const moved = moveHomeActor(room, blocked, "player", "north");
  assert.deepEqual(moved.player.cell, { x: 0, y: 1 });
});

test("feeding uses the same durable Buddy drives and consumes a real serving", () => {
  let room = createHomeRoomDocument({ roomId: "home", width: 6, height: 4 });
  room = placeHomeCatalogItem(room, {
    id: "bowl",
    assetId: "home.food-bowl.basic",
    anchor: { x: 3, y: 1 },
  });
  let play = createHomePlayState(room, 20);
  const creature = BuddyCreatureState.fromData(play.creature, 20);
  creature.drives.setPressure("hunger", 0.9);
  play = { ...play, creature: creature.toData() };

  const result = interactHomeItem(room, play, "bowl", "feed", 21);
  const updated = BuddyCreatureState.fromData(result.play.creature, 21);
  assert.ok(updated.drives.pressure("hunger") < 0.3);
  assert.equal(result.room.items[0]?.state.servings, 4);
  assert.equal(updated.actionCounts["home.feed"], 1);
  assert.match(result.play.thought, /Crunch crunch/);
});

test("Buddy autonomously uses a nearby need-matching object on deterministic time", () => {
  let room = createHomeRoomDocument({ roomId: "home", width: 6, height: 4 });
  room = placeHomeCatalogItem(room, {
    id: "bowl",
    assetId: "home.food-bowl.basic",
    anchor: { x: 3, y: 1 },
  });
  let play = createHomePlayState(room, 100);
  const creature = BuddyCreatureState.fromData(play.creature, 100);
  creature.drives.setPressure("hunger", 0.95);
  play = {
    ...play,
    buddy: { cell: { x: 3, y: 2 }, facing: "north" },
    creature: creature.toData(),
  };

  const result = advanceHomeSession(room, play, 101);
  const updated = BuddyCreatureState.fromData(result.play.creature, 101);
  assert.equal(result.room.items[0]?.state.servings, 4);
  assert.ok(updated.drives.pressure("hunger") < 0.5);
  assert.equal(updated.actionCounts["home.auto.feed"], 1);
});

test("petting updates the authoritative relationship instead of renderer-only affection", () => {
  const room = createHomeRoomDocument({ roomId: "home", width: 4, height: 3 });
  const play = createHomePlayState(room, 5);
  const before = BuddyCreatureState.fromData(play.creature, 5).relationshipValue("affection");
  const petted = petHomeBuddy(play, 6);
  const after = BuddyCreatureState.fromData(petted.creature, 6).relationshipValue("affection");
  assert.ok(after > before);
  assert.equal(BuddyCreatureState.fromData(petted.creature, 6).actionCounts["home.pet"], 1);
});

test("untrusted play saves fail rather than placing an actor outside the room", () => {
  const room = createHomeRoomDocument({ roomId: "home", width: 4, height: 3 });
  const play = createHomePlayState(room, 0);
  assert.throws(
    () => parseHomePlayState({ ...play, player: { ...play.player, cell: { x: 99, y: 2 } } }, room),
    /outside the room/,
  );
});
