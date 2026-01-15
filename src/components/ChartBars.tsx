import clsx from 'clsx';

type ChartPoint = {
  label: string;
  value: number;
  tooltip: string;
  isToday?: boolean;
  dateKey: string;
};

type ChartBarsProps = {
  points: ChartPoint[];
  selectedKey?: string | null;
  onSelect?: (point: ChartPoint) => void;
};

export function ChartBars({ points, selectedKey, onSelect }: ChartBarsProps) {
  const maxValue = Math.max(...points.map((point) => point.value), 1);

  return (
    <div className="grid grid-cols-7 gap-2 items-end">
      {points.map((point) => (
        <button
          key={point.dateKey}
          type="button"
          className="flex flex-col items-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 rounded-xl"
          onClick={() => onSelect?.(point)}
          aria-pressed={selectedKey === point.dateKey}
        >
          <div
            className={clsx(
              'w-8 h-24 rounded-lg bg-[rgba(26,71,42,0.2)] relative overflow-hidden transition-transform duration-300 hover:scale-[1.02]',
              point.isToday && 'ring-2 ring-brand/30',
              selectedKey === point.dateKey && 'ring-2 ring-brand'
            )}
            title={point.tooltip}
          >
            <div
              className={clsx(
                'absolute bottom-0 left-0 right-0 transition-all duration-700 ease-out',
                point.isToday ? 'bg-brand' : 'bg-brand/70'
              )}
              style={{ height: `${(point.value / maxValue) * 100}%` }}
            />
          </div>
          <span className={clsx('text-[11px]', selectedKey === point.dateKey ? 'text-brand font-semibold' : 'text-muted')}>
            {point.label}
          </span>
        </button>
      ))}
    </div>
  );
}
