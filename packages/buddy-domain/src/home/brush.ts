/**
 * Renderer-independent Home brush identifier.
 *
 * Concrete public material ids are selected by the content manifest; the domain
 * only owns the stable naming boundary and the erase intention.
 */
export type HomeBrush = `floor.${string}` | "erase";
