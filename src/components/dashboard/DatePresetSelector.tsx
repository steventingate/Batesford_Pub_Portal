import { useState } from 'react';
import clsx from 'clsx';
import { Input } from '../ui/Input';
import {
  getDateRange,
  PRESET_LABELS,
  type DatePreset,
  type DateRange,
} from '../../lib/datePresets';

/**
 * Presets rendered as pills, in display order. `custom` is rendered
 * separately because it toggles the inline date-range panel.
 */
const QUICK_PRESETS: DatePreset[] = [
  'today',
  'yesterday',
  'thisWeek',
  'thisMonth',
  'last7',
  'last30',
];

export interface DatePresetSelectorProps {
  /** Currently selected preset. */
  preset: DatePreset;
  /** Called with the new preset and its resolved date range. */
  onPresetChange: (preset: DatePreset, range: DateRange) => void;
  /** Custom range start, `YYYY-MM-DD`. Seeds the custom start input. */
  customStart?: string;
  /** Custom range end, `YYYY-MM-DD`. Seeds the custom end input. */
  customEnd?: string;
}

export function DatePresetSelector({
  preset,
  onPresetChange,
  customStart,
  customEnd,
}: DatePresetSelectorProps) {
  const [showCustom, setShowCustom] = useState(preset === 'custom');
  const [startValue, setStartValue] = useState(customStart ?? '');
  const [endValue, setEndValue] = useState(customEnd ?? '');

  function handlePresetClick(next: DatePreset) {
    setShowCustom(false);
    try {
      onPresetChange(next, getDateRange(next));
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Could not apply that date range.');
    }
  }

  function handleApplyCustom() {
    if (!startValue || !endValue) {
      window.alert('Please choose both a start date and an end date.');
      return;
    }

    try {
      onPresetChange('custom', getDateRange('custom', startValue, endValue));
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Could not apply that date range.');
    }
  }

  return (
    <div className="date-preset-selector">
      <div className="preset-buttons" role="group" aria-label="Date range presets">
        {QUICK_PRESETS.map((item) => (
          <button
            key={item}
            type="button"
            aria-pressed={preset === item}
            className={clsx('preset-button', preset === item && 'preset-button-active')}
            onClick={() => handlePresetClick(item)}
          >
            {PRESET_LABELS[item]}
          </button>
        ))}

        <button
          type="button"
          aria-pressed={preset === 'custom'}
          aria-expanded={showCustom}
          className={clsx('preset-button', preset === 'custom' && 'preset-button-active')}
          onClick={() => setShowCustom((open) => !open)}
        >
          {PRESET_LABELS.custom}
        </button>
      </div>

      {showCustom && (
        <div className="preset-custom-range">
          <Input
            type="date"
            label="Start date"
            value={startValue}
            max={endValue || undefined}
            onChange={(event) => setStartValue(event.target.value)}
          />
          <Input
            type="date"
            label="End date"
            value={endValue}
            min={startValue || undefined}
            onChange={(event) => setEndValue(event.target.value)}
          />
          <button type="button" className="preset-apply-button" onClick={handleApplyCustom}>
            Apply
          </button>
        </div>
      )}
    </div>
  );
}
