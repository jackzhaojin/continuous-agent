# Advanced Editor Features

## Undo / Redo

Implement a full undo/redo stack for the page editor canvas.

### Requirements

- Maintain an in-memory history stack of canvas states (JSON snapshots of the component array)
- Maximum history depth: 50 states
- **Undo**: Ctrl+Z (Cmd+Z on Mac) — reverts the canvas to the previous state
- **Redo**: Ctrl+Shift+Z (Cmd+Shift+Z on Mac) — re-applies a reverted change
- Undo/redo buttons in the editor toolbar with disabled state when stack is empty
- Actions that create history entries:
  - Add component (drop from palette)
  - Remove component (delete)
  - Reorder component (drag on canvas)
  - Edit component props (debounced — batch rapid edits into one entry after 500ms pause)
  - Paste component
  - Duplicate component
- The history stack resets when the user saves (save = new checkpoint)

### State Management

Use a React context (`EditorHistoryContext`) with:
```typescript
interface EditorHistory {
  past: ComponentBlock[][];    // Previous states
  present: ComponentBlock[];   // Current state
  future: ComponentBlock[][];  // Redo states
  canUndo: boolean;
  canRedo: boolean;
  push(state: ComponentBlock[]): void;  // Add new state
  undo(): void;
  redo(): void;
  reset(state: ComponentBlock[]): void; // Clear history, set new present
}
```

## Copy / Paste / Duplicate

### Requirements

- **Copy**: Ctrl+C copies the currently selected component to a clipboard (in-memory, not system clipboard)
- **Paste**: Ctrl+V inserts the copied component below the currently selected component (or at the bottom if none selected)
- **Duplicate**: Ctrl+D duplicates the selected component immediately below it
- All pasted/duplicated components get new unique IDs (`crypto.randomUUID()`)
- Deep-clone props to avoid reference sharing
- Show a brief toast notification: "Component duplicated" / "Component pasted"

### Cut

- **Cut**: Ctrl+X copies the selected component and removes it from the canvas
- Combines copy + delete into one history entry

## Multi-Select

### Requirements

- **Shift+Click**: Add/remove components to/from selection
- **Ctrl+A / Cmd+A**: Select all components on the canvas
- **Escape**: Deselect all
- Selected components show a blue outline (ring-2 ring-blue-500)
- Multi-selected components can be:
  - **Deleted** together (single history entry)
  - **Moved** together via drag (maintain relative order)
- Property panel shows "N components selected" when multi-select is active (no prop editing for multi-select)

## Responsive Preview

### Requirements

Add a viewport toggle in the editor toolbar with three modes:

| Mode | Width | Icon |
|------|-------|------|
| Desktop | 100% (full canvas width) | `Monitor` |
| Tablet | 768px centered | `Tablet` |
| Mobile | 375px centered | `Smartphone` |

- The canvas area constrains its width to the selected viewport
- Components should respond to the viewport width (they use Tailwind responsive classes)
- A subtle device frame outline around the constrained canvas
- The viewport mode is purely visual — it doesn't affect saved content
- Default mode: Desktop
- Persist the last-used viewport mode in localStorage

## Keyboard Shortcuts

### Full Shortcut Map

| Shortcut | Action |
|----------|--------|
| `Ctrl+Z` / `Cmd+Z` | Undo |
| `Ctrl+Shift+Z` / `Cmd+Shift+Z` | Redo |
| `Ctrl+C` / `Cmd+C` | Copy selected component |
| `Ctrl+V` / `Cmd+V` | Paste component |
| `Ctrl+X` / `Cmd+X` | Cut selected component |
| `Ctrl+D` / `Cmd+D` | Duplicate selected component |
| `Ctrl+A` / `Cmd+A` | Select all components |
| `Ctrl+S` / `Cmd+S` | Save page (prevent browser default) |
| `Delete` / `Backspace` | Delete selected component(s) |
| `Escape` | Deselect all / close property panel |
| `ArrowUp` | Move selection to previous component |
| `ArrowDown` | Move selection to next component |
| `Shift+ArrowUp` | Move selected component up in order |
| `Shift+ArrowDown` | Move selected component down in order |

### Implementation

- Use a global `useEffect` with `keydown` listener on the editor page
- Detect platform (Mac vs Windows/Linux) for modifier keys
- Prevent default browser behavior for Ctrl+S, Ctrl+A, etc.
- Shortcuts should only be active when the editor canvas is focused (not when typing in property panel inputs)
- Show a keyboard shortcut reference panel (toggle with `?` key) — a modal overlay listing all shortcuts

## Component Drag Handle

### Requirements

- Each component on the canvas shows a drag handle icon (grip dots / `GripVertical`) on hover
- The drag handle appears at the top-left corner of the component
- Dragging is initiated from the handle only (not the entire component block) to avoid conflicts with in-component interactions (e.g., clicking text in a Tiptap editor)
- A "move" cursor appears when hovering over the drag handle

## Canvas Empty State

When the canvas has no components, show a visually distinct empty state:

- Dashed border around the drop zone
- Icon: `Plus` or `Layout`
- Text: "Drag components from the palette to start building your page"
- The empty state itself is a valid drop target
