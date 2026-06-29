import clsx from 'clsx';

type SeriesPoint = {
  label: string;
  value: number;
};

type MultiSeriesPoint = {
  label: string;
  values: number[];
};

const getMax = (values: number[]) => Math.max(...values, 1);

export function TimelineChart({
  points,
  colorClassName = 'stroke-emerald-200',
  fillClassName = 'fill-emerald-400/10'
}: {
  points: SeriesPoint[];
  colorClassName?: string;
  fillClassName?: string;
}) {
  const safe = points.length ? points : [{ label: 'No data', value: 0 }];
  const max = getMax(safe.map((point) => point.value));
  const line = safe
    .map((point, index) => {
      const x = safe.length === 1 ? 50 : (index / (safe.length - 1)) * 100;
      const y = 92 - (point.value / max) * 72;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <div className="space-y-4">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-48 w-full">
        <path d="M0 92 H100" stroke="var(--dashboard-card-border)" strokeWidth="1" fill="none" />
        <path d={`M0 100 L${line} L100 100 Z`} className={fillClassName} />
        <polyline
          points={line}
          className={colorClassName}
          strokeWidth="2.8"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <div className="grid grid-cols-7 gap-2 text-[11px] text-muted md:grid-cols-10">
        {safe.map((point) => (
          <div key={point.label} className="truncate">
            {point.label}
          </div>
        ))}
      </div>
    </div>
  );
}

export function StackedBarChart({
  points,
  legends,
  colors
}: {
  points: MultiSeriesPoint[];
  legends: string[];
  colors: string[];
}) {
  const safe = points.length ? points : [{ label: 'No data', values: [0, 0] }];
  const max = Math.max(
    ...safe.map((point) => point.values.reduce((sum, value) => sum + value, 0)),
    1
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap">
        {legends.map((legend, index) => (
          <div key={legend} className="flex items-center gap-2 text-xs text-muted">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: colors[index] }} />
            <span>{legend}</span>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-2 md:grid-cols-10">
        {safe.map((point) => {
          const total = point.values.reduce((sum, value) => sum + value, 0);
          return (
            <div key={point.label} className="flex flex-col items-center gap-2">
              <div className="flex h-40 w-full flex-col justify-end overflow-hidden rounded-2xl border p-1" style={{ borderColor: 'var(--dashboard-card-border)', background: 'var(--dashboard-surface)' }}>
                {point.values.map((value, index) => (
                  <div
                    key={`${point.label}-${legends[index]}`}
                    className={clsx(index === 0 ? 'rounded-t-xl' : '', index === point.values.length - 1 ? 'rounded-b-xl' : '')}
                    style={{
                      height: `${(value / max) * 100}%`,
                      background: colors[index] || colors[colors.length - 1]
                    }}
                  />
                ))}
                {!total ? <div className="h-1 rounded-xl bg-white/10" /> : null}
              </div>
              <div className="text-center text-[11px] text-muted">{point.label}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function HeatStrip({ items }: { items: SeriesPoint[] }) {
  const max = getMax(items.map((item) => item.value));

  return (
    <div className="grid grid-cols-6 gap-2 md:grid-cols-12">
      {items.map((item) => (
        <div key={item.label} className="space-y-2">
          <div
            className="h-16 rounded-2xl border"
            style={{
              borderColor: 'var(--dashboard-card-border)',
              background: `linear-gradient(180deg, color-mix(in srgb, var(--dashboard-surface-strong) 72%, transparent), color-mix(in srgb, var(--dashboard-surface) 92%, transparent)), rgba(110,240,193,${0.12 + item.value / max * 0.55})`
            }}
          />
          <div className="text-center text-[11px] text-muted">{item.label}</div>
        </div>
      ))}
    </div>
  );
}
