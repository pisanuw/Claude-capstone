import type { ShortcutSet } from '../core/types';

/**
 * Bundled libraries. Combos are the Windows/Linux defaults; macOS matching
 * translates Ctrl→Cmd automatically, with explicit `mac` overrides where the
 * real macOS binding differs. Browser-reserved combos (Ctrl+W, Ctrl+T, …)
 * are deliberately absent: they cannot be captured by a web page.
 */

export const vscodeSet: ShortcutSet = {
  id: 'vscode',
  name: 'VS Code essentials',
  tool: 'VS Code',
  version: 1,
  shortcuts: [
    { id: 'command-palette', task: 'Open the Command Palette', combo: 'Ctrl+Shift+P' },
    { id: 'quick-open', task: 'Quick Open a file by name', combo: 'Ctrl+P' },
    { id: 'go-to-definition', task: 'Go to definition', combo: 'F12' },
    { id: 'peek-definition', task: 'Peek definition inline', combo: 'Alt+F12' },
    { id: 'toggle-terminal', task: 'Toggle the integrated terminal', combo: 'Ctrl+`', mac: 'Ctrl+`' },
    { id: 'split-editor', task: 'Split the editor', combo: 'Ctrl+\\' },
    { id: 'toggle-comment', task: 'Toggle line comment', combo: 'Ctrl+/' },
    { id: 'format-document', task: 'Format the whole document', combo: 'Shift+Alt+F' },
    { id: 'rename-symbol', task: 'Rename the symbol under the cursor', combo: 'F2' },
    { id: 'find', task: 'Find in the current file', combo: 'Ctrl+F' },
    { id: 'replace', task: 'Find and replace in the current file', combo: 'Ctrl+H', mac: 'Alt+Meta+F' },
    { id: 'search-files', task: 'Search across all files', combo: 'Ctrl+Shift+F' },
    { id: 'go-to-line', task: 'Go to a line number', combo: 'Ctrl+G', mac: 'Ctrl+G' },
    { id: 'move-line-up', task: 'Move the current line up', combo: 'Alt+ArrowUp' },
    { id: 'copy-line-down', task: 'Copy the current line down', combo: 'Shift+Alt+ArrowDown' },
    { id: 'add-cursor-below', task: 'Add a cursor on the line below', combo: 'Ctrl+Alt+ArrowDown' },
    { id: 'select-next-match', task: 'Select the next occurrence of the selection', combo: 'Ctrl+D' },
    { id: 'toggle-sidebar', task: 'Toggle the sidebar', combo: 'Ctrl+B' },
    { id: 'keyboard-shortcuts', task: 'Open Keyboard Shortcuts', combo: 'Ctrl+K Ctrl+S' },
    { id: 'go-back', task: 'Navigate back to the previous location', combo: 'Alt+ArrowLeft', mac: 'Ctrl+-' },
    { id: 'zen-mode', task: 'Enter Zen Mode', combo: 'Ctrl+K Z' },
    { id: 'fold-region', task: 'Fold the current region', combo: 'Ctrl+Shift+[' },
  ],
};

export const devtoolsSet: ShortcutSet = {
  id: 'devtools',
  name: 'Chrome DevTools',
  tool: 'DevTools',
  version: 1,
  shortcuts: [
    { id: 'open-devtools', task: 'Open DevTools', combo: 'F12' },
    { id: 'inspect-element', task: 'Inspect an element (pick from the page)', combo: 'Ctrl+Shift+C' },
    { id: 'console-drawer', task: 'Toggle the console drawer from any panel', combo: 'Escape' },
    { id: 'open-console', task: 'Jump straight to the Console panel', combo: 'Ctrl+Shift+J', mac: 'Alt+Meta+J' },
    { id: 'command-menu', task: 'Open the Command Menu', combo: 'Ctrl+Shift+P' },
    { id: 'go-to-source', task: 'Open a source file by name', combo: 'Ctrl+P' },
    { id: 'search-all-sources', task: 'Search text across all loaded sources', combo: 'Ctrl+Shift+F', mac: 'Alt+Meta+F' },
    { id: 'device-toolbar', task: 'Toggle the device (responsive) toolbar', combo: 'Ctrl+Shift+M' },
    { id: 'clear-console', task: 'Clear the console', combo: 'Ctrl+L', mac: 'Meta+K' },
    { id: 'pause-script', task: 'Pause or resume script execution', combo: 'F8' },
    { id: 'step-over', task: 'Step over the next function call', combo: 'F10' },
    { id: 'step-into', task: 'Step into the next function call', combo: 'F11' },
    { id: 'next-panel', task: 'Switch to the next panel', combo: 'Ctrl+]' },
    { id: 'previous-panel', task: 'Switch to the previous panel', combo: 'Ctrl+[' },
  ],
};

export const figmaSet: ShortcutSet = {
  id: 'figma',
  name: 'Figma basics',
  tool: 'Figma',
  version: 1,
  shortcuts: [
    { id: 'move-tool', task: 'Switch to the Move tool', combo: 'V' },
    { id: 'frame-tool', task: 'Switch to the Frame tool', combo: 'F' },
    { id: 'rectangle', task: 'Draw a rectangle', combo: 'R' },
    { id: 'ellipse', task: 'Draw an ellipse', combo: 'O' },
    { id: 'line', task: 'Draw a line', combo: 'L' },
    { id: 'text-tool', task: 'Add text', combo: 'T' },
    { id: 'pen-tool', task: 'Switch to the Pen tool', combo: 'P' },
    { id: 'hand-tool', task: 'Switch to the Hand (pan) tool', combo: 'H' },
    { id: 'comment', task: 'Add a comment', combo: 'C' },
    { id: 'group', task: 'Group the selection', combo: 'Ctrl+G' },
    { id: 'duplicate', task: 'Duplicate the selection in place', combo: 'Ctrl+D' },
    { id: 'toggle-ui', task: 'Show or hide the Figma UI', combo: 'Ctrl+\\' },
    { id: 'zoom-fit', task: 'Zoom to fit everything', combo: 'Shift+1' },
    { id: 'zoom-100', task: 'Zoom to 100%', combo: 'Shift+0' },
    { id: 'copy-properties', task: 'Copy properties of the selection', combo: 'Ctrl+Alt+C' },
    { id: 'paste-properties', task: 'Paste properties onto the selection', combo: 'Ctrl+Alt+V' },
    { id: 'bring-forward', task: 'Bring the selection forward', combo: 'Ctrl+]' },
    { id: 'send-backward', task: 'Send the selection backward', combo: 'Ctrl+[' },
  ],
};

export const vimSet: ShortcutSet = {
  id: 'vim',
  name: 'Vim survival kit',
  tool: 'Vim',
  version: 1,
  notation: 'vim',
  shortcuts: [
    { id: 'insert-mode', task: 'Enter insert mode before the cursor', combo: 'I' },
    { id: 'append-eol', task: 'Append at the end of the line', combo: 'Shift+A' },
    { id: 'escape-normal', task: 'Return to normal mode', combo: 'Escape' },
    { id: 'delete-line', task: 'Delete the current line', combo: 'D D' },
    { id: 'yank-line', task: 'Yank (copy) the current line', combo: 'Y Y' },
    { id: 'paste-after', task: 'Paste after the cursor', combo: 'P' },
    { id: 'undo', task: 'Undo the last change', combo: 'U' },
    { id: 'go-top', task: 'Jump to the top of the file', combo: 'G G' },
    { id: 'go-bottom', task: 'Jump to the bottom of the file', combo: 'Shift+G' },
    { id: 'line-start', task: 'Jump to the start of the line', combo: '0' },
    { id: 'line-end', task: 'Jump to the end of the line', combo: '$' },
    { id: 'next-word', task: 'Jump forward one word', combo: 'W' },
    { id: 'prev-word', task: 'Jump back one word', combo: 'B' },
    { id: 'delete-word', task: 'Delete from the cursor to the next word', combo: 'D W' },
    { id: 'change-inner-word', task: 'Change the word under the cursor', combo: 'C I W' },
    { id: 'delete-char', task: 'Delete the character under the cursor', combo: 'X' },
    { id: 'open-below', task: 'Open a new line below and insert', combo: 'O' },
    { id: 'search', task: 'Search forward', combo: '/' },
    { id: 'next-match', task: 'Jump to the next search match', combo: 'N' },
    { id: 'visual-mode', task: 'Enter visual mode', combo: 'V' },
    { id: 'join-lines', task: 'Join the next line onto this one', combo: 'Shift+J' },
  ],
};

export const bundledSets: ShortcutSet[] = [vscodeSet, devtoolsSet, figmaSet, vimSet];
