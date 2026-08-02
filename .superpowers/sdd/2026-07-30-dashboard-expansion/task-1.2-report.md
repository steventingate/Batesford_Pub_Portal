# Task 1.2 Report: DatePresetSelector Component

**Status:** DONE_WITH_CONCERNS
**Commit:** `998836b` — feat: add DatePresetSelector component with pill-shaped buttons and custom date range
**Branch:** main

## Deliverables

| # | Deliverable | Path | Status |
|---|---|---|---|
| 1 | Component | `src/components/dashboard/DatePresetSelector.tsx` | Done |
| 2 | Tests (7, brief asked 4–5) | `src/components/dashboard/__tests__/DatePresetSelector.test.tsx` | Done |
| 3 | CSS | `src/index.css` (new block + mobile rules in the 720px media query) | Done |
| 4 | Commit | `998836b` | Done |

## Verification

`npm test` — exit 0

```
 Test Files  2 passed (2)
      Tests  23 passed (23)
```

(23 = 16 pre-existing `datePresets` tests from Task 1.1 + 7 new DatePresetSelector tests. No pre-existing test was modified.)

`npm run build` — exit 0

```
✓ 430 modules transformed.
dist/index.html                 0.47 kB │ gzip:   0.30 kB
dist/assets/index-DBUkl-_l.css 73.17 kB │ gzip:  18.88 kB
dist/assets/index-xQ0hIH6M.js  781.56 kB │ gzip: 219.54 kB
✓ built in 23.52s
```

Build includes `tsc -b`, so the component and the test file both typecheck under `strict` + `noUnusedLocals` + `noUnusedParameters`.

## Test coverage

All five required cases, plus two extra:

1. `should render all 6 preset buttons + Custom button` — required
2. `should highlight active preset with green class` — required
3. `should call onPresetChange when preset clicked` — required
4. `should show custom date inputs when Custom clicked` — required
5. `should validate and apply custom date range` — required (covers both the missing-dates alert path and the successful apply)
6. `should alert instead of crashing when the custom range is invalid` — extra; end-before-start makes `getDateRange` throw, asserts the component catches it
7. `should seed the custom inputs from customStart and customEnd props` — extra; covers the `customStart` / `customEnd` props, which nothing else exercised

## Implementation notes

- Props match the brief exactly: `preset`, `onPresetChange`, `customStart?`, `customEnd?`.
- 6 quick presets render from a `QUICK_PRESETS` array; `custom` renders separately because it toggles the inline panel rather than firing a change.
- Labels come from `PRESET_LABELS`, so the Custom button reads "Custom Range".
- Custom panel is inline (not a modal), opens on Custom click, and is open on mount when `preset === 'custom'`. Clicking any quick preset closes it.
- Apply validates both dates are present (alert, no callback), then calls `getDateRange('custom', start, end)` inside a `try/catch` — a thrown range error becomes an alert, never a crash.
- Uses the repo's `Input` component from `../ui/Input` and `clsx`, per existing patterns.
- Accessibility beyond the brief: `aria-pressed` on each pill, `aria-expanded` on Custom, and a labelled `role="group"` wrapper.
- Date inputs cross-constrain via `min`/`max` so the picker itself discourages an inverted range.

## Concerns

1. **New devDependencies were required.** The repo had no DOM test environment: `vitest.config.ts` sets `environment: 'node'` and neither jsdom nor testing-library was installed, so component interaction tests were impossible as-is. I added `jsdom`, `@testing-library/react`, `@testing-library/dom`, and `@testing-library/user-event` as devDependencies. I deliberately did **not** change the global vitest environment — the new test file opts in with a `// @vitest-environment jsdom` docblock, so existing node-environment tests are untouched. If the project prefers a global jsdom environment or a different testing library, this is the place to revisit.

2. **`node_modules/` is tracked in git despite being in `.gitignore`** (9,498 tracked files). This is pre-existing, not something this task introduced. Consequence: I committed `package.json` and `package-lock.json` for the new devDeps but did **not** commit the ~52 packages' worth of `node_modules` churn, so the tracked `node_modules` tree is now out of sync with the lockfile. Anyone relying on the committed `node_modules` will need to run `npm install`. Worth a separate cleanup task (`git rm -r --cached node_modules`).

3. **Inactive border colour deviates slightly from the brief.** The brief specifies `rgba(255,255,255,0.1)` for the inactive pill border, which is invisible on this app's light theme. I used `var(--dashboard-card-border)`, which the repo already defines as `rgba(17,35,29,0.08)` in light and `rgba(255,255,255,0.08)` in dark — same visual intent as the brief, but correct in both themes. Active green is exactly `#22c55e` as specified.

4. **Not yet wired into the Dashboard.** This task scoped to the component only; nothing imports `DatePresetSelector` yet. Integration presumably lands in a later task.

5. **Pre-existing build warnings**, unrelated to this change: a Tailwind config ES-module load warning and a >500 kB chunk-size warning. Both were present before this commit.
