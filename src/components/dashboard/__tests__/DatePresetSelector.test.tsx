// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { DatePresetSelector } from '../DatePresetSelector';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('DatePresetSelector', () => {
  it('should render all 6 preset buttons + Custom button', () => {
    render(<DatePresetSelector preset="today" onPresetChange={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Today' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Yesterday' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'This Week' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'This Month' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Last 7 Days' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Last 30 Days' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Custom Range' })).toBeDefined();

    // 6 presets + Custom, with the custom panel closed there is no Apply button.
    expect(screen.getAllByRole('button')).toHaveLength(7);
  });

  it('should highlight active preset with green class', () => {
    render(<DatePresetSelector preset="last7" onPresetChange={vi.fn()} />);

    const active = screen.getByRole('button', { name: 'Last 7 Days' });
    const inactive = screen.getByRole('button', { name: 'Today' });

    expect(active.className).toContain('preset-button-active');
    expect(active.getAttribute('aria-pressed')).toBe('true');
    expect(inactive.className).not.toContain('preset-button-active');
    expect(inactive.getAttribute('aria-pressed')).toBe('false');
  });

  it('should call onPresetChange when preset clicked', () => {
    const onPresetChange = vi.fn();
    render(<DatePresetSelector preset="today" onPresetChange={onPresetChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Yesterday' }));

    expect(onPresetChange).toHaveBeenCalledTimes(1);
    const [preset, range] = onPresetChange.mock.calls[0];
    expect(preset).toBe('yesterday');
    expect(range.preset).toBe('yesterday');
    expect(range.label).toBe('Yesterday');
    expect(range.startDate).toBeInstanceOf(Date);
    expect(range.endDate).toBeInstanceOf(Date);
  });

  it('should show custom date inputs when Custom clicked', () => {
    render(<DatePresetSelector preset="today" onPresetChange={vi.fn()} />);

    expect(screen.queryByLabelText('Start date')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Custom Range' }));

    const start = screen.getByLabelText('Start date') as HTMLInputElement;
    const end = screen.getByLabelText('End date') as HTMLInputElement;

    expect(start.type).toBe('date');
    expect(end.type).toBe('date');
    expect(screen.getByRole('button', { name: 'Apply' })).toBeDefined();
  });

  it('should validate and apply custom date range', () => {
    const onPresetChange = vi.fn();
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    render(<DatePresetSelector preset="today" onPresetChange={onPresetChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Custom Range' }));

    // Missing dates -> alert, no callback.
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(onPresetChange).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2026-07-01' } });
    fireEvent.change(screen.getByLabelText('End date'), { target: { value: '2026-07-15' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    expect(onPresetChange).toHaveBeenCalledTimes(1);
    const [preset, range] = onPresetChange.mock.calls[0];
    expect(preset).toBe('custom');
    expect(range.preset).toBe('custom');
    expect(range.startDate.getFullYear()).toBe(2026);
    expect(range.startDate.getMonth()).toBe(6);
    expect(range.startDate.getDate()).toBe(1);
    expect(range.endDate.getDate()).toBe(15);
  });

  it('should alert instead of crashing when the custom range is invalid', () => {
    const onPresetChange = vi.fn();
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    render(<DatePresetSelector preset="today" onPresetChange={onPresetChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Custom Range' }));
    // End before start -> getDateRange throws, component must catch it.
    fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2026-07-20' } });
    fireEvent.change(screen.getByLabelText('End date'), { target: { value: '2026-07-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(onPresetChange).not.toHaveBeenCalled();
  });

  it('should seed the custom inputs from customStart and customEnd props', () => {
    render(
      <DatePresetSelector
        preset="custom"
        customStart="2026-06-01"
        customEnd="2026-06-30"
        onPresetChange={vi.fn()}
      />,
    );

    // preset="custom" opens the panel on mount.
    expect((screen.getByLabelText('Start date') as HTMLInputElement).value).toBe('2026-06-01');
    expect((screen.getByLabelText('End date') as HTMLInputElement).value).toBe('2026-06-30');
    expect(screen.getByRole('button', { name: 'Custom Range' }).className).toContain(
      'preset-button-active',
    );
  });
});
