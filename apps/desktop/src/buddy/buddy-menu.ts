export type BuddyMenuAction =
  | "pet"
  | "talk"
  | "name"
  | "buddies"
  | "status"
  | "collection"
  | "notes-and-tasks"
  | "guide"
  | "field-guide"
  | "wardrobe"
  | "settings"
  | "quit";

export interface BuddyMenuItem {
  readonly action: BuddyMenuAction;
  readonly label: string;
}

export interface BuddyMenuContext {
  readonly supportsProcessExit: boolean;
}

const baseBuddyMenuItems: readonly BuddyMenuItem[] = [
  { action: "pet", label: "Pet the bird" },
  { action: "talk", label: "Talk to Buddy" },
  { action: "name", label: "Name your Buddy" },
  { action: "buddies", label: "Buddies" },
  { action: "status", label: "Status" },
  { action: "collection", label: "Collection" },
  { action: "notes-and-tasks", label: "Notes & Tasks" },
  { action: "guide", label: "How Buddy works" },
  { action: "field-guide", label: "Field Guide" },
  { action: "wardrobe", label: "Wardrobe" },
  { action: "settings", label: "Settings" },
];

export function getBuddyMenuItems(context: BuddyMenuContext): readonly BuddyMenuItem[] {
  if (!context.supportsProcessExit) return baseBuddyMenuItems;
  return [...baseBuddyMenuItems, { action: "quit", label: "Quit" }];
}
