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

export const emacsSet: ShortcutSet = {
  id: 'emacs',
  name: 'Emacs essentials',
  tool: 'Emacs',
  version: 1,
  shortcuts: [
    { id: 'forward-char', task: 'Move forward one character', combo: 'Ctrl+F', mac: 'Ctrl+F' },
    { id: 'backward-char', task: 'Move backward one character', combo: 'Ctrl+B', mac: 'Ctrl+B' },
    { id: 'next-page', task: 'Move to the next screenful of text', combo: 'Ctrl+V', mac: 'Ctrl+V' },
    { id: 'previous-line', task: 'Move to the previous line', combo: 'Ctrl+P', mac: 'Ctrl+P' },
    { id: 'beginning-line', task: 'Move to the beginning of the line', combo: 'Ctrl+A', mac: 'Ctrl+A' },
    { id: 'end-line', task: 'Move to the end of the line', combo: 'Ctrl+E', mac: 'Ctrl+E' },
    { id: 'forward-word', task: 'Move forward one word', combo: 'Alt+F' },
    { id: 'backward-word', task: 'Move backward one word', combo: 'Alt+B' },
    { id: 'delete-char', task: 'Delete the next character', combo: 'Ctrl+D', mac: 'Ctrl+D' },
    { id: 'delete-backward-char', task: 'Delete the previous character', combo: 'Backspace' },
    { id: 'kill-line', task: 'Kill text to the end of the line', combo: 'Ctrl+K', mac: 'Ctrl+K' },
    { id: 'yank', task: 'Yank the most recently killed text', combo: 'Ctrl+Y', mac: 'Ctrl+Y' },
    { id: 'search-forward', task: 'Start an incremental forward search', combo: 'Ctrl+S', mac: 'Ctrl+S' },
    { id: 'search-backward', task: 'Start an incremental backward search', combo: 'Ctrl+R', mac: 'Ctrl+R' },
    { id: 'keyboard-quit', task: 'Cancel the current command', combo: 'Ctrl+G', mac: 'Ctrl+G' },
    { id: 'execute-command', task: 'Execute an extended command', combo: 'Alt+X' },
    { id: 'set-mark', task: 'Set the mark at point', combo: 'Ctrl+Space', mac: 'Ctrl+Space' },
    { id: 'universal-argument', task: 'Start a universal argument', combo: 'Ctrl+U', mac: 'Ctrl+U' },
    { id: 'open-line', task: 'Open a new line below point', combo: 'Ctrl+O', mac: 'Ctrl+O' },
    { id: 'undo', task: 'Undo the last change', combo: 'Ctrl+/' },
  ],
};

/**
 * Excel for Mac keeps Control for number formats, date entry, and the
 * formula view, where ⌘ would hit macOS (⌘⇧4/⌘⇧5 take screenshots, ⌘` cycles
 * windows). Left out: AutoSum and Create Table, whose macOS bindings (⌘⇧T,
 * ⌘T) are browser-reserved, and sheet switching, since Ctrl+Page Down is
 * Chrome's next-tab key.
 */
export const excelSet: ShortcutSet = {
  id: 'excel',
  name: 'Excel essentials',
  tool: 'Excel',
  version: 1,
  shortcuts: [
    { id: 'edit-cell', task: 'Edit the active cell', combo: 'F2' },
    { id: 'new-line-in-cell', task: 'Start a new line inside the same cell', combo: 'Alt+Enter' },
    { id: 'fill-selection', task: 'Fill every selected cell with the current entry', combo: 'Ctrl+Enter' },
    { id: 'fill-down', task: 'Fill down from the top cell of the selection', combo: 'Ctrl+D' },
    { id: 'fill-right', task: 'Fill right from the leftmost cell of the selection', combo: 'Ctrl+R' },
    { id: 'cycle-reference', task: 'Cycle a cell reference between absolute and relative ($A$1, A1)', combo: 'F4' },
    { id: 'insert-date', task: "Enter today's date", combo: 'Ctrl+;', mac: 'Ctrl+;' },
    { id: 'insert-time', task: 'Enter the current time', combo: 'Ctrl+Shift+;', mac: 'Meta+;' },
    { id: 'show-formulas', task: 'Toggle between showing values and formulas', combo: 'Ctrl+`', mac: 'Ctrl+`' },
    { id: 'format-cells', task: 'Open the Format Cells dialog', combo: 'Ctrl+1' },
    { id: 'currency-format', task: 'Apply the Currency number format', combo: 'Ctrl+Shift+4', mac: 'Ctrl+Shift+4' },
    { id: 'percent-format', task: 'Apply the Percentage number format', combo: 'Ctrl+Shift+5', mac: 'Ctrl+Shift+5' },
    { id: 'select-column', task: 'Select the entire column', combo: 'Ctrl+Space', mac: 'Ctrl+Space' },
    { id: 'select-row', task: 'Select the entire row', combo: 'Shift+Space' },
    { id: 'jump-to-edge', task: 'Jump down to the edge of the data region', combo: 'Ctrl+ArrowDown' },
    { id: 'select-to-edge', task: 'Extend the selection down to the last filled cell', combo: 'Ctrl+Shift+ArrowDown' },
    { id: 'go-to-a1', task: 'Jump to cell A1', combo: 'Ctrl+Home', mac: 'Ctrl+Home' },
    { id: 'insert-cells', task: 'Insert cells, rows, or columns', combo: 'Ctrl+Shift+=', mac: 'Ctrl+Shift+=' },
    { id: 'delete-cells', task: 'Delete the selected cells, rows, or columns', combo: 'Ctrl+-' },
    { id: 'toggle-filter', task: 'Turn filters on or off', combo: 'Ctrl+Shift+L', mac: 'Ctrl+Shift+L' },
    { id: 'paste-special', task: 'Open Paste Special', combo: 'Ctrl+Alt+V' },
    { id: 'find-replace', task: 'Find and replace', combo: 'Ctrl+H', mac: 'Ctrl+H' },
  ],
};

/**
 * Visio has no macOS app, so macOS mode keeps the Windows bindings (as the
 * Emacs set does) rather than inventing ⌘ ones. Page switching
 * (Ctrl+Page Down) and fit to window (Ctrl+Shift+W) are browser-reserved.
 */
export const visioSet: ShortcutSet = {
  id: 'visio',
  name: 'Visio essentials',
  tool: 'Visio',
  version: 1,
  shortcuts: [
    { id: 'pointer-tool', task: 'Switch to the Pointer Tool', combo: 'Ctrl+1', mac: 'Ctrl+1' },
    { id: 'text-tool', task: 'Switch to the Text tool', combo: 'Ctrl+2', mac: 'Ctrl+2' },
    { id: 'connector-tool', task: 'Switch to the Connector tool', combo: 'Ctrl+3', mac: 'Ctrl+3' },
    { id: 'line-tool', task: 'Draw a line', combo: 'Ctrl+6', mac: 'Ctrl+6' },
    { id: 'rectangle-tool', task: 'Draw a rectangle', combo: 'Ctrl+8', mac: 'Ctrl+8' },
    { id: 'ellipse-tool', task: 'Draw an ellipse', combo: 'Ctrl+9', mac: 'Ctrl+9' },
    { id: 'connection-point-tool', task: 'Switch to the Connection Point tool', combo: 'Ctrl+Shift+1', mac: 'Ctrl+Shift+1' },
    { id: 'format-painter', task: 'Turn the Format Painter on or off', combo: 'Ctrl+Shift+P', mac: 'Ctrl+Shift+P' },
    { id: 'group', task: 'Group the selected shapes', combo: 'Ctrl+G', mac: 'Ctrl+G' },
    { id: 'ungroup', task: 'Ungroup the selected group', combo: 'Ctrl+Shift+U', mac: 'Ctrl+Shift+U' },
    { id: 'bring-to-front', task: 'Bring the selected shape to the front', combo: 'Ctrl+Shift+F', mac: 'Ctrl+Shift+F' },
    { id: 'send-to-back', task: 'Send the selected shape to the back', combo: 'Ctrl+Shift+B', mac: 'Ctrl+Shift+B' },
    { id: 'rotate-left', task: 'Rotate the selected shape 90° left', combo: 'Ctrl+L', mac: 'Ctrl+L' },
    { id: 'rotate-right', task: 'Rotate the selected shape 90° right', combo: 'Ctrl+R', mac: 'Ctrl+R' },
    { id: 'flip-horizontal', task: 'Flip the selected shape horizontally', combo: 'Ctrl+H', mac: 'Ctrl+H' },
    { id: 'flip-vertical', task: 'Flip the selected shape vertically', combo: 'Ctrl+J', mac: 'Ctrl+J' },
    { id: 'center-text', task: 'Center the text horizontally', combo: 'Ctrl+Shift+C', mac: 'Ctrl+Shift+C' },
    { id: 'edit-text', task: 'Switch between editing text and selecting the shape', combo: 'F2' },
    { id: 'format-shape', task: 'Open the Format Shape pane', combo: 'F3' },
    { id: 'align-shapes', task: 'Open the Align Shapes dialog', combo: 'F8' },
    { id: 'reorder-pages', task: 'Open the Reorder Pages dialog', combo: 'Ctrl+Alt+P', mac: 'Ctrl+Alt+P' },
    { id: 'full-screen', task: 'Enter full-screen view', combo: 'F5' },
  ],
};

/**
 * Word for Mac uses Control where ⌘ is taken: ⌃H for Find and Replace (⌘H
 * hides the app) and ⌃⇧M to indent (⌘M minimizes). Normal style
 * (Ctrl+Shift+N) and hanging indent (Ctrl+T) are browser-reserved.
 */
export const wordSet: ShortcutSet = {
  id: 'word',
  name: 'Word essentials',
  tool: 'Word',
  version: 1,
  shortcuts: [
    { id: 'center-paragraph', task: 'Center the paragraph', combo: 'Ctrl+E' },
    { id: 'justify-paragraph', task: 'Justify the paragraph', combo: 'Ctrl+J' },
    { id: 'heading-1', task: 'Apply the Heading 1 style', combo: 'Ctrl+Alt+1' },
    { id: 'heading-2', task: 'Apply the Heading 2 style', combo: 'Ctrl+Alt+2' },
    { id: 'bulleted-list', task: 'Turn the paragraph into a bulleted list', combo: 'Ctrl+Shift+L' },
    { id: 'indent', task: 'Indent the paragraph', combo: 'Ctrl+M', mac: 'Ctrl+Shift+M' },
    { id: 'remove-indent', task: 'Remove a paragraph indent', combo: 'Ctrl+Shift+M' },
    { id: 'grow-font', task: 'Increase the font size to the next preset', combo: 'Ctrl+Shift+.' },
    { id: 'grow-font-1pt', task: 'Increase the font size by one point', combo: 'Ctrl+]' },
    { id: 'change-case', task: 'Cycle the selection through UPPER, lower, and Title Case', combo: 'Shift+F3' },
    { id: 'all-caps', task: 'Format the selection as ALL CAPS', combo: 'Ctrl+Shift+A' },
    { id: 'font-dialog', task: 'Open the Font dialog', combo: 'Ctrl+D' },
    { id: 'line-break', task: 'Insert a line break without starting a new paragraph', combo: 'Shift+Enter' },
    { id: 'page-break', task: 'Insert a page break', combo: 'Ctrl+Enter' },
    { id: 'paste-text-only', task: 'Paste as plain text', combo: 'Ctrl+Shift+V' },
    { id: 'find-replace', task: 'Find and replace', combo: 'Ctrl+H', mac: 'Ctrl+H' },
    { id: 'go-to', task: 'Go to a page, section, or bookmark', combo: 'Ctrl+G', mac: 'Alt+Meta+G' },
    { id: 'insert-comment', task: 'Insert a comment', combo: 'Ctrl+Alt+M', mac: 'Alt+Meta+A' },
    { id: 'track-changes', task: 'Turn Track Changes on or off', combo: 'Ctrl+Shift+E' },
    { id: 'footnote', task: 'Insert a footnote', combo: 'Ctrl+Alt+F' },
    { id: 'previous-edit', task: 'Jump back to the previous edit', combo: 'Shift+F5' },
    { id: 'spelling', task: 'Check spelling and grammar', combo: 'F7' },
  ],
};

const SINGLE_KEY_HINT = 'single-letter tools need Preferences > General > Use single-key accelerators to access tools';

/**
 * Acrobat Reader (the same keys work in Acrobat Pro). Go to Page
 * (Ctrl+Shift+N) is browser-reserved, as is page flipping with
 * Ctrl+Page Up/Down, so the set navigates with Home and End.
 */
export const acrobatSet: ShortcutSet = {
  id: 'acrobat',
  name: 'Acrobat Reader essentials',
  tool: 'Acrobat',
  version: 1,
  shortcuts: [
    { id: 'find', task: 'Find text in the PDF', combo: 'Ctrl+F' },
    { id: 'find-next', task: 'Jump to the next search result', combo: 'Ctrl+G' },
    { id: 'zoom-in', task: 'Zoom in', combo: 'Ctrl+=' },
    { id: 'zoom-out', task: 'Zoom out', combo: 'Ctrl+-' },
    { id: 'zoom-page', task: 'Zoom to fit the whole page', combo: 'Ctrl+0' },
    { id: 'actual-size', task: 'Show the page at actual size', combo: 'Ctrl+1' },
    { id: 'fit-width', task: 'Fit the page width to the window', combo: 'Ctrl+2' },
    { id: 'reflow', task: 'Reflow a tagged PDF to the window width', combo: 'Ctrl+4' },
    { id: 'rotate-view', task: 'Rotate the view clockwise', combo: 'Ctrl+Shift+=' },
    { id: 'full-screen', task: 'Enter Full Screen mode', combo: 'Ctrl+L' },
    { id: 'first-page', task: 'Go to the first page', combo: 'Home' },
    { id: 'last-page', task: 'Go to the last page', combo: 'End' },
    { id: 'navigation-pane', task: 'Open the navigation pane', combo: 'Ctrl+Shift+F5' },
    { id: 'hand-tool', task: 'Switch to the Hand tool', combo: 'H', hint: SINGLE_KEY_HINT },
    { id: 'select-tool', task: 'Switch to the Select tool', combo: 'V', hint: SINGLE_KEY_HINT },
    { id: 'marquee-zoom', task: 'Switch to the Marquee Zoom tool', combo: 'Z', hint: SINGLE_KEY_HINT },
    { id: 'add-comment', task: 'Add a sticky-note comment', combo: 'S', hint: SINGLE_KEY_HINT },
    { id: 'highlight', task: 'Highlight text', combo: 'U', hint: SINGLE_KEY_HINT },
    { id: 'read-out-loud', task: 'Turn Read Out Loud on or off', combo: 'Ctrl+Shift+Y' },
    { id: 'read-page', task: 'Read the current page out loud', combo: 'Ctrl+Shift+V' },
  ],
};

export const bundledSets: ShortcutSet[] = [
  vscodeSet,
  devtoolsSet,
  figmaSet,
  vimSet,
  emacsSet,
  excelSet,
  visioSet,
  wordSet,
  acrobatSet,
];
