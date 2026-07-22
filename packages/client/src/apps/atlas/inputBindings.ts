/**
 * The seam between raw input chords and the commands they mean — the runtime
 * mirror of the input-command bindings table in doc01.07.04. App code never
 * reads a modifier flag or names a key in user-facing text directly: it asks
 * this module by command id. Rebinding a command here updates the behavior
 * and every hint that describes it together, so the two cannot drift.
 *
 * Deliberately small (unfolding step 1-2): commands exist only for inputs
 * that carry a modifier chord today. A user-editable keymap, if forces ever
 * demand one, lands here as configuration.
 */

/** Commands whose input carries a modifier chord. Ids follow the bindings
 * table's Action column: `<target>.<verb>`. */
export type AtlasCommand =
  /** R5: Ctrl during a node drag keeps the Node in its Container, expanding
   * the Container's boundary instead of reparenting. */
  | 'container.keepMembership'
  /** R52: Ctrl at edge-preview completion creates a new Node under the
   * pointer and completes the Edge into it. */
  | 'edge.connectToNewNode';

/** 'Mod' is the platform primary modifier: Ctrl, or Cmd on macOS — the same
 * convention as cactus chrome hotkeys ('Mod+z'). */
type ModifierChord = 'Mod';

const BINDINGS: Record<AtlasCommand, { modifier: ModifierChord }> = {
  'container.keepMembership': { modifier: 'Mod' },
  'edge.connectToNewNode': { modifier: 'Mod' },
};

const IS_MAC = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform || navigator.userAgent);

/** Whether `command`'s chord is held, read from any event or state object
 * carrying the modifier flags. cactus pre-resolves Meta into `ctrlKey` on
 * gesture payloads (useGesture's `complete`), so `metaKey` may be absent. */
export function chordHeld(command: AtlasCommand, state: { ctrlKey: boolean; metaKey?: boolean }): boolean {
  switch (BINDINGS[command].modifier) {
    case 'Mod':
      return state.ctrlKey || state.metaKey === true;
  }
}

/** The `KeyboardEvent.key` names that toggle `command`'s chord — for
 * keydown/keyup tracking of a chord held across a gesture. */
export function chordKeys(command: AtlasCommand): readonly string[] {
  switch (BINDINGS[command].modifier) {
    case 'Mod':
      return ['Control', 'Meta'];
  }
}

/** The chord's name in user-facing text ("hold ctrl to …"). */
export function describeChord(command: AtlasCommand): string {
  switch (BINDINGS[command].modifier) {
    case 'Mod':
      return IS_MAC ? 'cmd' : 'ctrl';
  }
}
