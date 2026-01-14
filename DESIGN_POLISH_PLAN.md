# Enterprise UI Polish Plan

## Problem Statement
The UI uses emoji characters extensively, creating an unprofessional "dev demo" appearance. A VP of Google would immediately notice this looks amateur.

## Critical Issues (Priority Order)

### 1. Emoji Icon Replacement (HIGHEST PRIORITY)
Replace ALL emoji with CSS/SVG icons. Current emoji usage:

| Location | Emoji | Replacement |
|----------|-------|-------------|
| Empty state sidebar | 🔍 magnifying glass | CSS circle with line |
| Changes empty | 📝 notepad | CSS file icon |
| Section headers | ↓ ◆ ⚡ | Remove or use subtle SVG |
| Tree toggles | ▼ ▶ | CSS triangles |
| Graph buttons | ⚡ ◎ ▲ | Text only or SVG |
| Copy buttons | 📋 | CSS clipboard icon |
| Show more/less | ▼ | CSS chevron |
| Disconnect banner | ⚠️ | CSS warning icon |
| Module diagram | ▼ | CSS chevron |

### 2. Typography Refinement
- Remove ALL CAPS from "SELECT A NODE TO EXPLORE" - use sentence case
- Section headers should be smaller, muted - not shouty
- Ensure consistent font stacks everywhere

### 3. Button Polish
- "Expand All" / "Collapse All" buttons look generic
- Add subtle background, better hover states
- Remove emoji from filter/focus buttons

### 4. Form Controls
- Native dropdown needs custom styling or at least better appearance
- Range slider needs custom styling

### 5. Empty States
- Remove giant icons
- Use subtle illustrations or just text
- Make them feel designed, not placeholder

### 6. Keyboard Hints
- Deduplicate (bottom bar + sidebar both show hints)
- Make them more subtle

---

## Implementation Strategy

### Phase 1: Create SVG Icon Components (or CSS-only)
Create `web/src/components/Icons.tsx` with:
- ChevronDown, ChevronRight (for tree toggles)
- Search (for empty state)
- Copy (for copy buttons)
- File (for changes empty)
- Warning (for disconnect)

Or use CSS-only icons where possible (preferred - no extra components).

### Phase 2: Fix Components (in order)
1. **NodeDetails.tsx** - Empty state, section headers, copy buttons
2. **ArchitectureView.tsx** - Tree toggles
3. **CallTreeView.tsx** - Tree toggles, show more
4. **ChangeFeed.tsx** - Empty state, tree toggles
5. **Graph.tsx** - Filter/focus/legend buttons
6. **App.tsx** - Disconnect banner

### Phase 3: Typography & Polish
1. Fix ALL CAPS text
2. Refine button styles
3. Polish form controls

---

## CSS-Only Icon Patterns

### Chevron Down (▼)
```css
.chevron-down::after {
  content: '';
  display: inline-block;
  width: 0;
  height: 0;
  border-left: 4px solid transparent;
  border-right: 4px solid transparent;
  border-top: 5px solid currentColor;
}
```

### Chevron Right (▶)
```css
.chevron-right::after {
  content: '';
  display: inline-block;
  width: 0;
  height: 0;
  border-top: 4px solid transparent;
  border-bottom: 4px solid transparent;
  border-left: 5px solid currentColor;
}
```

### Copy Icon
```css
.icon-copy::before {
  content: '';
  display: inline-block;
  width: 12px;
  height: 14px;
  background: currentColor;
  -webkit-mask: url("data:image/svg+xml,...") center/contain no-repeat;
  mask: url("data:image/svg+xml,...") center/contain no-repeat;
}
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `web/src/App.css` | Add CSS icon classes |
| `web/src/components/NodeDetails.tsx` | Replace emoji |
| `web/src/components/ArchitectureView.tsx` | Replace emoji |
| `web/src/components/CallTreeView.tsx` | Replace emoji |
| `web/src/components/ChangeFeed.tsx` | Replace emoji |
| `web/src/components/Graph.tsx` | Replace emoji |
| `web/src/App.tsx` | Fix disconnect banner |
| `web/src/components/ModuleDiagram.tsx` | Replace emoji |

---

## Success Criteria
- Zero emoji characters in the UI
- Consistent, subtle iconography
- Professional typography (no shouty ALL CAPS)
- Polished button and form controls
- Would pass "VP of Google" test
