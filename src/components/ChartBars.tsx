import clsx from 'clsx';

type ChartPoint = {
  label: string;
  value: number;
  tooltip: string;
  isToday?: boolean;
};

type ChartBarsProps = {
  points: ChartPoint[];
};

export function ChartBars({ points }: ChartBarsProps) {
  const maxValue = Math.max(...points.map((point) => point.value), 1);

  return (
    <div className="grid grid-cols-7 gap-2 items-end">
      {points.map((point) => (
        <div key={point.label} className="flex flex-col items-center gap-2">
          <div
            className={clsx(
              'w-8 h-24 rounded-lg bg-[rgba(26,71,42,0.2)] relative overflow-hidden transition-transform duration-300 hover:scale-[1.02]',
              point.isToday && 'ring-2 ring-brand/30'
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
          <span className="text-[11px] text-muted">{point.label}</span>
        </div>
      ))}
    </div>
  );
}
