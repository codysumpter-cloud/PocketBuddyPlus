(() => {
  "use strict";

  const api = Object.freeze({
    grabOffset(pointer, anchor) {
      return {
        x: Number(pointer.x) - Number(anchor.x),
        y: Number(pointer.y) - Number(anchor.y),
      };
    },

    anchorFromPointer(pointer, offset) {
      return {
        x: Number(pointer.x) - Number(offset.x),
        y: Number(pointer.y) - Number(offset.y),
      };
    },

    snapshotPlacement(placement) {
      return {
        column: placement.column,
        row: placement.row,
        x: placement.x,
        y: placement.y,
        supportId: placement.supportId,
        supportOffsetX: placement.supportOffsetX,
      };
    },

    restorePlacement(placement, snapshot) {
      placement.column = snapshot.column;
      placement.row = snapshot.row;
      placement.x = snapshot.x;
      placement.y = snapshot.y;
      placement.supportId = snapshot.supportId;
      placement.supportOffsetX = snapshot.supportOffsetX;
      return placement;
    },
  });

  window.TinyHouseDragCore = api;
})();
