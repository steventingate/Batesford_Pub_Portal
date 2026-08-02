# Task 1.2: Create DatePresetSelector Component

**Goal:** Implement `src/components/dashboard/DatePresetSelector.tsx` — a React component that renders date preset buttons and a custom date range picker.

**Scope:** Single component file + simple test.

**Dependencies (from Task 1.1):**
- `DatePreset` type
- `PRESET_LABELS` object
- `getDateRange(preset, customStart?, customEnd?): DateRange`
- `DateRange` interface

**Component Interface:**

```typescript
interface DatePresetSelectorProps {
  preset: DatePreset;
  onPresetChange: (preset: DatePreset, range: DateRange) => void;
  customStart?: string;  // YYYY-MM-DD format
  customEnd?: string;    // YYYY-MM-DD format
}

export function DatePresetSelector(props: DatePresetSelectorProps): JSX.Element
```

**Visual Design (from frontend-design review):**

- **Button styling:** Pill-shaped buttons in a horizontal row
  - Inactive: subtle border (1px, rgba(255,255,255,0.1)), transparent background, white/gray text
  - Active: green background (#22c55e), white text, no border
  - Spacing: gap-2 (Tailwind) between buttons, flex wrap on mobile
- **Preset list:** 6 buttons for presets: today, yesterday, thisWeek, thisMonth, last7, last30 (+ 7th Custom button)
- **Custom range:** Appears inline when Custom button clicked (not modal)
  - Two date inputs (type="date") for start and end
  - Apply button (green, #22c55e)
  - Validation: requires both dates; shows alert if missing

**Behavior:**

1. Render 6 preset buttons in a row + 1 Custom button
2. Highlight active preset with green (#22c55e) background
3. On preset button click: call `onPresetChange(preset, range)` where range = `getDateRange(preset)`
4. On Custom button click: show inline date inputs
5. On Apply button click:
   - Validate both dates are entered
   - Call `getDateRange('custom', customStart, customEnd)`
   - Call `onPresetChange('custom', range)`
6. Handle errors gracefully (show alert, do not crash)

**Styling (CSS):**

Add to your dashboard CSS file (or create a new one):
- `.date-preset-selector` — flex column container
- `.preset-buttons` — flex row, gap-2, flex-wrap
- `.preset-button` — pill shape, padding 0.5rem 1rem, border-radius 0.375rem, smooth transitions
- `.preset-button-active` — green (#22c55e) background, white text
- `.preset-custom-range` — flex row for date inputs, gap 0.75rem, align-items flex-end
- `.preset-apply-button` — green button, 0.75rem 1.5rem padding

**Dependencies:**
- React (useState)
- clsx (for conditional classNames)
- Input component from `../ui/Input`
- date-fns utilities (already in scope from Task 1.1)

**Deliverables:**

1. `src/components/dashboard/DatePresetSelector.tsx` — fully implemented component
2. `src/components/dashboard/__tests__/DatePresetSelector.test.tsx` — basic render + interaction tests (4-5 tests)
3. Add CSS to your dashboard stylesheet (or inline in component)
4. Commit: "feat: add DatePresetSelector component with pill-shaped buttons and custom date range"

**Test Coverage (minimum):**

1. `should render all 6 preset buttons + Custom button`
2. `should highlight active preset with green class`
3. `should call onPresetChange when preset clicked`
4. `should show custom date inputs when Custom clicked`
5. `should validate and apply custom date range`

