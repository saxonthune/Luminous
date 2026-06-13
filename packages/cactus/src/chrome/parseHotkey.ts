export interface ParsedHotkey {
  key: string;
  mod: boolean;
  shift: boolean;
  alt: boolean;
}

const isMac =
  typeof navigator !== 'undefined' &&
  /Mac|iPhone|iPad|iPod/.test(navigator.platform);

export function parseHotkey(hotkey: string): ParsedHotkey {
  const parts = hotkey.split('+');
  const key = parts[parts.length - 1]!;
  const mods = new Set(parts.slice(0, -1).map((p) => p.toLowerCase()));
  return {
    key,
    mod: mods.has('mod') || mods.has('cmd') || mods.has('ctrl'),
    shift: mods.has('shift'),
    alt: mods.has('alt'),
  };
}

export function matchesHotkey(event: KeyboardEvent, hotkey: string): boolean {
  const parsed = parseHotkey(hotkey);
  const modPressed = isMac ? event.metaKey : event.ctrlKey;
  return (
    event.key === parsed.key &&
    modPressed === parsed.mod &&
    event.shiftKey === parsed.shift &&
    event.altKey === parsed.alt
  );
}
