import clsx from 'clsx';

type ChartBarsProps = {
  labels: string[];
  values: number[];
};

export function ChartBars({ labels, values }: ChartBarsProps) {
  const maxValue = Math.max(...values, 1);

  return (
    <div className="grid grid-cols-7 gap-2 items-end h-32">
      {values.map((value, index) => (
        <div key={labels[index]} className="flex flex-col items-center gap-2">
          <div className={clsx('w-8 rounded-lg bg-[rgba(26,71,42,0.2)] relative overflow-hidden')} style={{ height: '100%' }}>
            <div
              className="absolute bottom-0 left-0 right-0 bg-brand"
              style={{ height: `${(value / maxValue) * 100}%` }}
            />
          </div>
          <span className="text-[11px] text-muted">{labels[index]}</span>
        </div>
      ))}
    </div>
  );
}
