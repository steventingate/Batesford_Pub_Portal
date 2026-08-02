# Task 1.1: Create Date Preset Utility

**Goal:** Implement `src/lib/datePresets.ts` with type definitions, preset resolution logic, and comprehensive tests.

**Scope:** Single file (`src/lib/datePresets.ts`) + test file (`src/lib/__tests__/datePresets.test.ts`).

**Interfaces:**

Produces:
- Type: `DatePreset = 'today' | 'yesterday' | 'thisWeek' | 'thisMonth' | 'last7' | 'last30' | 'custom'`
- Interface: `DateRange { startDate: Date; endDate: Date; label: string; preset: DatePreset }`
- Function: `getDateRange(preset: DatePreset, customStart?: string, customEnd?: string): DateRange`
  - Returns a `DateRange` object mapping the preset to actual start/end dates
  - For 'custom', requires both `customStart` and `customEnd` (format: 'YYYY-MM-DD'); throws Error if missing
  - Throws Error for invalid dates
- Object: `PRESET_LABELS: Record<DatePreset, string>` mapping each preset to human-readable label
- Function: `formatDateForQuery(date: Date): string` — returns ISO date string in 'YYYY-MM-DD' format

**Test Requirements:**

Use Vitest (already installed). Tests must pass:
1. `should return today range for today preset` — verify startDate is today
2. `should return yesterday range for yesterday preset`
3. `should throw for custom preset without dates`
4. `should parse custom dates correctly` (dates: '2026-07-20' to '2026-07-30')
5. `should format dates as YYYY-MM-DD`
6. `should return correct labels for each preset`
7. `should handle thisWeek range`
8. `should handle thisMonth range`
9. `should handle last7 and last30 ranges`

**Implementation Notes:**

- Use `date-fns` (already installed): `startOfToday`, `endOfToday`, `startOfYesterday`, `endOfYesterday`, `startOfWeek`, `endOfWeek`, `startOfMonth`, `endOfMonth`, `subDays`, `parse`
- No external state or side effects
- All date math is deterministic

**Deliverables:**

1. `src/lib/datePresets.ts` — fully implemented with all types and functions
2. `src/lib/__tests__/datePresets.test.ts` — all tests passing
3. Commit: "feat: add date preset utility with 7 preset types"

