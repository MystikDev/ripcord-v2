/**
 * Convert a KeyboardEvent.key or mouse-button identifier into a short
 * human-readable label.
 *
 * Keyboard examples:
 *   ' '       → 'Space'
 *   'Control' → 'Ctrl'
 *   'v'       → 'V'
 *   'F5'      → 'F5'
 *
 * Mouse examples:
 *   'Mouse3'  → 'Mouse 4'  (back)
 *   'Mouse4'  → 'Mouse 5'  (forward)
 *
 * Mouse buttons are stored as "Mouse{button}" where `button` is the
 * MouseEvent.button value (0-based). For display we show the 1-based
 * number that users see on their mouse (button 3 → "Mouse 4").
 */

const KEY_DISPLAY_MAP: Record<string, string> = {
  ' ': 'Space',
  'Control': 'Ctrl',
  'Meta': 'Cmd',
  'ArrowUp': 'Up',
  'ArrowDown': 'Down',
  'ArrowLeft': 'Left',
  'ArrowRight': 'Right',
  'Backspace': 'Bksp',
  'Delete': 'Del',
  'Escape': 'Esc',
  'CapsLock': 'Caps',
  'Tab': 'Tab',
  'Enter': 'Enter',
  'Shift': 'Shift',
  'Alt': 'Alt',
};

/** Check whether a PTT key identifier represents a mouse button. */
export function isMouseButton(key: string): boolean {
  return key.startsWith('Mouse');
}

/** Extract the MouseEvent.button value (0-based) from a mouse key id. */
export function parseMouseButton(key: string): number {
  return Number(key.replace('Mouse', ''));
}

/** Build a mouse key identifier from a MouseEvent.button value. */
export function mouseButtonKey(button: number): string {
  return `Mouse${button}`;
}

// ---------------------------------------------------------------------------
// Tauri accelerator mapping
// ---------------------------------------------------------------------------

/**
 * Map from KeyboardEvent.key → Tauri accelerator string.
 * Tauri uses a different naming convention for special keys.
 * Returns `null` for mouse buttons (not supported by Tauri global shortcuts).
 */
const TAURI_KEY_MAP: Record<string, string> = {
  ' ': 'Space',
  'Control': 'Control',
  'Meta': 'Super',
  'ArrowUp': 'Up',
  'ArrowDown': 'Down',
  'ArrowLeft': 'Left',
  'ArrowRight': 'Right',
  'Backspace': 'Backspace',
  'Delete': 'Delete',
  'Escape': 'Escape',
  'CapsLock': 'CapsLock',
  'Tab': 'Tab',
  'Enter': 'Return',
  'Shift': 'Shift',
  'Alt': 'Alt',
};

/**
 * Convert a KeyboardEvent.key value to a Tauri accelerator string.
 * Returns `null` for mouse buttons (Tauri can't register global mouse shortcuts).
 *
 * Examples:
 *   ' '       → 'Space'
 *   'v'       → 'V'
 *   'F5'      → 'F5'
 *   'Control' → 'Control'
 *   'Mouse3'  → null
 */
export function toTauriAccelerator(key: string): string | null {
  if (isMouseButton(key)) return null;
  if (TAURI_KEY_MAP[key]) return TAURI_KEY_MAP[key];
  // Single characters get uppercased (e.g. 'v' → 'V')
  if (key.length === 1) return key.toUpperCase();
  // Everything else passes through as-is (e.g. 'F5', 'PageUp')
  return key;
}

// ---------------------------------------------------------------------------
// Windows virtual key-code mapping
// ---------------------------------------------------------------------------

/**
 * Map from KeyboardEvent.key → Windows Virtual Key code (VK_*).
 * Used by the PTT hook to poll `GetAsyncKeyState` when the app is backgrounded.
 * Returns `null` for mouse buttons or unmapped keys.
 */
const VK_MAP: Record<string, number> = {
  ' ': 0x20,           // VK_SPACE
  'Control': 0x11,     // VK_CONTROL
  'Shift': 0x10,       // VK_SHIFT
  'Alt': 0x12,         // VK_MENU
  'Meta': 0x5b,        // VK_LWIN
  'Tab': 0x09,         // VK_TAB
  'CapsLock': 0x14,    // VK_CAPITAL
  'Escape': 0x1b,      // VK_ESCAPE
  'Enter': 0x0d,       // VK_RETURN
  'Backspace': 0x08,   // VK_BACK
  'Delete': 0x2e,      // VK_DELETE
  'ArrowUp': 0x26,     // VK_UP
  'ArrowDown': 0x28,   // VK_DOWN
  'ArrowLeft': 0x25,   // VK_LEFT
  'ArrowRight': 0x27,  // VK_RIGHT
};

export function toVirtualKeyCode(key: string): number | null {
  if (isMouseButton(key)) return null;
  if (VK_MAP[key] !== undefined) return VK_MAP[key];

  // Single letter a-z → VK_A (0x41) through VK_Z (0x5A)
  // Single digit 0-9 → 0x30 through 0x39
  if (key.length === 1) {
    const code = key.toUpperCase().charCodeAt(0);
    if (code >= 0x41 && code <= 0x5a) return code;
    if (code >= 0x30 && code <= 0x39) return code;
  }

  // F1–F24 → VK_F1 (0x70) through VK_F24 (0x87)
  const fMatch = key.match(/^F(\d+)$/);
  if (fMatch) {
    const n = parseInt(fMatch[1], 10);
    if (n >= 1 && n <= 24) return 0x6f + n;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Display labels
// ---------------------------------------------------------------------------

export function getKeyDisplayLabel(key: string): string {
  if (KEY_DISPLAY_MAP[key]) return KEY_DISPLAY_MAP[key];

  // Mouse buttons: "Mouse3" → "Mouse 4" (1-based for user display)
  if (isMouseButton(key)) {
    const btn = parseMouseButton(key);
    return `Mouse ${btn + 1}`;
  }

  // Single characters get uppercased (e.g. 'v' → 'V')
  if (key.length === 1) return key.toUpperCase();
  // Everything else passes through as-is (e.g. 'F5', 'PageUp')
  return key;
}
