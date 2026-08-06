(() => {
  "use strict";

  const TEMPLATE_VERSION = 1;

  const templates = Object.freeze([
    {
      id: "bathroom",
      name: "Bathroom",
      description: "Animated bath, sink, toilet, shelves, mirror, window, toiletries, and plants.",
      previewKeywords: ["bath", "bathroom", "wc"],
      structure: { columns: 5, rows: 5 },
      theme: {
        floorAssetId: "floor-wall-tiles-128-floor-128-whitecheck",
        leftWallAssetId: "floor-wall-tiles-128-wall-l-128-bluelight",
        rightWallAssetId: "floor-wall-tiles-128-wall-r-128-bluelight",
      },
      placements: [
        { key: "bath", assetId: "ani-bath", column: 2.1, row: 4, layer: 30 },
        { key: "mat", assetId: "bathroom-bath-carpet", column: 1.25, row: 3.55, layer: 5 },
        { key: "sink", assetId: "ani-wc-tap", column: 2.85, row: 1.15, layer: 24 },
        { key: "toilet", assetId: "ani-wc-front", column: 4, row: 2.7, layer: 22 },
        { key: "bin", assetId: "bathroom-shower-bin", column: 3.35, row: 4, layer: 28 },
        { key: "plant", assetId: "plants-plant-2", column: 0.45, row: 4, layer: 18 },
        { key: "paper", assetId: "bathroom-toilet-paper", column: 4, row: 1.9, layer: 27 },
        { key: "mirror", assetId: "bathroom-mirror", wall: { axis: "right", column: 2, row: 0, offsetX: 64, offsetY: 58 }, layer: 8 },
        { key: "window", assetId: "bathroom-bath-window", wall: { axis: "right", column: 4, row: 0, offsetX: 64, offsetY: 64 }, layer: 9 },
        { key: "shelf", assetId: "bathroom-long-shelf", wall: { axis: "left", column: 0, row: 1, offsetX: 68, offsetY: 58 }, layer: 10 },
        { key: "hanger", assetId: "bathroom-hanger", wall: { axis: "left", column: 0, row: 3, offsetX: 58, offsetY: 64 }, layer: 11 },
        { key: "soap-red", assetId: "bathroom-soap-red", supportKey: "sink", supportOffsetX: -18, layer: 50 },
        { key: "soap-green", assetId: "bathroom-soap-green", supportKey: "sink", supportOffsetX: 18, layer: 51 },
        { key: "tissues", assetId: "bathroom-tissues", supportKey: "sink", supportOffsetX: 2, layer: 52 },
        { key: "towel", assetId: "bathroom-towel-blue", supportKey: "shelf", supportOffsetX: -12, layer: 53 },
      ],
    },
    {
      id: "kitchen",
      name: "Kitchen",
      description: "Orange cabinets, animated sink, fridge, washing machine, oven, table, seating, window, and countertop props.",
      previewKeywords: ["kitchen", "cook", "fridge"],
      structure: { columns: 5, rows: 5 },
      theme: {
        floorAssetId: "floor-wall-tiles-128-floor-128-checkboard",
        leftWallAssetId: "floor-wall-tiles-128-wall-l-128-green",
        rightWallAssetId: "floor-wall-tiles-128-wall-r-128-green",
      },
      placements: [
        { key: "cabinets", assetId: "kitchen-kitchen-furnitures-colors-kitchen-furniture-orange-kitchen-furniture-orange-1", column: 2.4, row: 0.85, layer: 20 },
        { key: "fridge", assetId: "kitchen-fridge-fridge-2-a-tile", column: 0.65, row: 1.15, layer: 22 },
        { key: "washer", assetId: "state-washing-machine", column: 0.25, row: 3.15, layer: 26 },
        { key: "oven", assetId: "kitchen-oven", column: 4, row: 2.05, layer: 25 },
        { key: "table", assetId: "kitchen-kitchen-table", column: 2.2, row: 4, layer: 32 },
        { key: "stool-a", assetId: "kitchen-kitchen-stool", column: 1.25, row: 4.25, layer: 34 },
        { key: "stool-b", assetId: "kitchen-kitchen-stool", column: 3.2, row: 4.15, layer: 35 },
        { key: "rug", assetId: "kitchen-kitchen-rug", column: 0.7, row: 3.75, layer: 4 },
        { key: "sink", assetId: "ani-sink", supportKey: "cabinets", supportOffsetX: 10, layer: 48 },
        { key: "toaster", assetId: "ani-toaster", supportKey: "cabinets", supportOffsetX: 58, layer: 49 },
        { key: "pot", assetId: "kitchen-pot", supportKey: "cabinets", supportOffsetX: -45, layer: 50 },
        { key: "tea", assetId: "kitchen-teapot", supportKey: "table", supportOffsetX: -20, layer: 51 },
        { key: "wine", assetId: "kitchen-wine", supportKey: "table", supportOffsetX: 26, layer: 52 },
        { key: "window", assetId: "kitchen-kitchen-window", wall: { axis: "left", column: 0, row: 1, offsetX: 64, offsetY: 60 }, layer: 8 },
        { key: "shelf", assetId: "kitchen-shelf", wall: { axis: "right", column: 3, row: 0, offsetX: 64, offsetY: 58 }, layer: 9 },
        { key: "rack", assetId: "kitchen-rack", wall: { axis: "right", column: 4, row: 0, offsetX: 64, offsetY: 58 }, layer: 10 },
        { key: "cat", assetId: "ani-cat", supportKey: "cabinets", supportOffsetX: 82, layer: 55 },
      ],
    },
    {
      id: "office",
      name: "Office",
      description: "A larger animated workstation template with desks, computers, partitions, printers, storage, whiteboards, and office machines.",
      previewKeywords: ["office", "workspace", "computer"],
      structure: { columns: 6, rows: 6 },
      theme: {
        floorAssetId: "floor-wall-tiles-128-floor-128-classyblue",
        leftWallAssetId: "floor-wall-tiles-128-wall-l-128-brokenwhite",
        rightWallAssetId: "floor-wall-tiles-128-wall-r-128-brokenwhite",
      },
      placements: [
        { key: "desk-a", assetId: "state-office-normal-table", column: 1.2, row: 2, layer: 20 },
        { key: "desk-b", assetId: "state-office-normal-table", column: 3.1, row: 1.35, layer: 21 },
        { key: "desk-c", assetId: "state-office-normal-table", column: 4.35, row: 3.65, layer: 22 },
        { key: "chair-a", assetId: "chairs-office-main-chair", column: 1.8, row: 2.85, layer: 35 },
        { key: "chair-b", assetId: "chairs-gaming-chair-gchair-9-a", column: 3.4, row: 2.25, layer: 36 },
        { key: "chair-c", assetId: "chairs-basic-office-chair-a", column: 4.8, row: 4.5, layer: 37 },
        { key: "macbook", assetId: "ani-macbook", supportKey: "desk-a", supportOffsetX: -20, layer: 50 },
        { key: "screen-a", assetId: "ani-bended-screen", supportKey: "desk-b", supportOffsetX: 0, layer: 51 },
        { key: "tower-a", assetId: "ani-pc-tower", column: 3.7, row: 2.1, layer: 34 },
        { key: "screen-b", assetId: "computer-rotationscreen-a-tile", supportKey: "desk-c", supportOffsetX: -22, layer: 52 },
        { key: "screen-c", assetId: "computer-rotationscreen-b-tile", supportKey: "desk-c", supportOffsetX: 28, layer: 53 },
        { key: "printer", assetId: "ani-printer", column: 0.4, row: 3.1, layer: 31 },
        { key: "copier", assetId: "ani-copy-machine-white", column: 0.2, row: 1.25, layer: 28 },
        { key: "water", assetId: "ani-water-dispenser", column: 2.2, row: 0.4, layer: 29 },
        { key: "closet", assetId: "state-metallic-closet", column: 5.1, row: 1.1, layer: 27 },
        { key: "rack", assetId: "office-rack", column: 5.05, row: 2.45, scale: 0.75, layer: 26 },
        { key: "partition-a", assetId: "office-office-partition", column: 2.25, row: 3.15, layer: 24 },
        { key: "partition-b", assetId: "office-office-partition", column: 3.35, row: 4.05, flip: true, layer: 25 },
        { key: "robot", assetId: "office-rumba-robot", column: 2.8, row: 5, layer: 38 },
        { key: "board", assetId: "office-board-full", wall: { axis: "right", column: 3, row: 0, offsetX: 64, offsetY: 60 }, layer: 8 },
        { key: "clock", assetId: "ani-clock", wall: { axis: "right", column: 1, row: 0, offsetX: 64, offsetY: 52 }, layer: 9 },
        { key: "diploma", assetId: "office-diploma", wall: { axis: "left", column: 0, row: 1, offsetX: 64, offsetY: 55 }, layer: 10 },
        { key: "ac", assetId: "office-ac", wall: { axis: "left", column: 0, row: 4, offsetX: 64, offsetY: 52 }, layer: 11 },
      ],
    },
    {
      id: "japanese",
      name: "Japanese Room",
      description: "Tatami-inspired room with closet, low table, cushions, tea, shelving, bonsai, lantern, artwork, and a working sliding door.",
      previewKeywords: ["japanese", "tatami", "japan"],
      structure: { columns: 4, rows: 4 },
      theme: {
        floorAssetId: "floor-wall-tiles-128-floor-128-japan-1",
        leftWallAssetId: "floor-wall-tiles-128-wall-l-128-japan-1",
        rightWallAssetId: "floor-wall-tiles-128-wall-r-128-japan-1",
      },
      placements: [
        { key: "closet", assetId: "japanese-room-japanese-closet", column: 1.1, row: 0.65, scale: 0.8, layer: 20 },
        { key: "shelf", assetId: "japanese-room-japanese-shelf", column: 3.15, row: 1.15, layer: 21 },
        { key: "table", assetId: "japanese-room-japanese-table", column: 2.1, row: 3.1, layer: 28 },
        { key: "seat-a", assetId: "japanese-room-japanese-seat", column: 1.35, row: 3.45, layer: 30 },
        { key: "seat-b", assetId: "japanese-room-japanese-seat", column: 2.9, row: 3.25, layer: 31 },
        { key: "tea", assetId: "japanese-room-japanese-tea", supportKey: "table", supportOffsetX: -8, layer: 48 },
        { key: "candle", assetId: "japanese-room-candle", supportKey: "table", supportOffsetX: 32, layer: 49 },
        { key: "bonsai", assetId: "japanese-room-bonsai", supportKey: "shelf", supportOffsetX: 12, layer: 50 },
        { key: "vase", assetId: "japanese-room-japanese-vase", supportKey: "shelf", supportOffsetX: -26, layer: 51 },
        { key: "plant", assetId: "japanese-room-japanese-plant", column: 3.55, row: 3.4, layer: 32 },
        { key: "clothes", assetId: "japanese-room-clothes-case", column: 0.45, row: 2, layer: 29 },
        { key: "lamp", assetId: "japanese-room-japanese-lamp", column: 3.35, row: 0.65, layer: 24 },
        { key: "canvas", assetId: "japanese-room-japanese-canvas", wall: { axis: "left", column: 0, row: 1, offsetX: 64, offsetY: 58 }, layer: 8 },
        { key: "letters", assetId: "japanese-room-japanese-canvas-leters", wall: { axis: "right", column: 3, row: 0, offsetX: 64, offsetY: 60 }, layer: 9 },
        { key: "door", assetId: "ani-japanese-door", wall: { axis: "left", column: 0, row: 0, offsetX: 72, offsetY: 80 }, scale: 0.65, layer: 12 },
      ],
    },
  ]);

  function templateById(id) {
    return templates.find((template) => template.id === id) || null;
  }

  function allAssetIds(template) {
    return [
      template.theme.floorAssetId,
      template.theme.leftWallAssetId,
      template.theme.rightWallAssetId,
      ...template.placements.map((placement) => placement.assetId),
    ].filter(Boolean);
  }

  function missingAssetIds(template, manifest) {
    const ids = new Set((manifest || []).map((asset) => asset.id));
    return [...new Set(allAssetIds(template).filter((id) => !ids.has(id)))];
  }

  function matchPreviewFile(fileName) {
    const normalized = String(fileName || "").toLowerCase();
    return templates.find((template) =>
      template.previewKeywords.some((keyword) => normalized.includes(keyword))
    )?.id || null;
  }

  window.TinyHouseRoomTemplatesCore = Object.freeze({
    TEMPLATE_VERSION,
    templates,
    templateById,
    allAssetIds,
    missingAssetIds,
    matchPreviewFile,
  });
})();