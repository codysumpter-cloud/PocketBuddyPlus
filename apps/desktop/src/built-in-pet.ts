// The built-in/default pet owns the attached Pocket Buddy menu. Load the
// compatibility integration before pet-window builds that Electron menu so the
// protected Buddy actions stay present alongside the newer plugin surfaces.
import "./buddy/buddy-menu-integration.js";

export const builtInPet = {
  id: "builtin",
  displayName: "Professor Hoot",
  builtIn: true,
  protected: true,
  installed: true,
} as const;
