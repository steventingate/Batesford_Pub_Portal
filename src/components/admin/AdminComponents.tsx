import clsx from 'clsx';
import { Card } from '../ui/Card';

type SparklineProps = {
  values: number[];
  className?: string;
};

export function Sparkline({ values, className }: SparklineProps) {
  const safeValues = values.length ? values : [0];
  const max = Math.max(...safeValues, 1);
  const points = safeValues.map((value, index) => {
    const x = safeValues.length === 1 ? 50 : (index / (safeValues.length - 1)) * 100;
    const y = 40 - (value / max) * 32;
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg viewBox="0 0 100 42" className={clsx('h-10 w-full', className)} preserveAspectRatio="none">
      <defs>
        <linearGradient id="sparkline-fill" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="rgba(30,196,125,0.12)" />
          <stop offset="100%" stopColor="rgba(110,240,193,0.38)" />
        </linearGradient>
      </defs>
      <polyline fill="none" stroke="rgba(110,240,193,0.95)" strokeWidth="3" points={points} strokeLinecap="round" strokeLinejoin="round" />
      <polyline fill="url(#sparkline-fill)" stroke="none" points={`0,42 ${points} 100,42`} />
    </svg>
  );
}

type StatCardProps = {
  label: string;
  value: string | number;
  delta: string;
  icon: JSX.Element;
  values: number[];
};

export function StatCard({ label, value, delta, icon, values }: StatCardProps) {
  return (
    <Card className="h-full">
      <div className="flex items-start justify-between gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-emerald-300/15 bg-emerald-300/10 text-emerald-100">
          {icon}
        </div>
        <div className="status-pill">{delta}</div>
      </div>
      <p className="mt-6 text-sm text-muted">{label}</p>
      <p className="mt-2 font-display text-4xl text-[var(--dashboard-text)]">{value}</p>
      <div className="mt-4 rounded-2xl border px-2 py-1" style={{ borderColor: 'var(--dashboard-card-border)', background: 'var(--dashboard-surface)' }}>
        <Sparkline values={values} />
      </div>
    </Card>
  );
}

type ChartCardProps = {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
};

export function ChartCard({ title, subtitle, action, children, className }: ChartCardProps) {
  return (
    <Card className={clsx('h-full', className)}>
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-[var(--dashboard-text)]">{title}</h3>
          {subtitle ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </Card>
  );
}

type FilterPanelProps = {
  children: React.ReactNode;
  className?: string;
};

export function FilterPanel({ children, className }: FilterPanelProps) {
  return (
    <Card className={clsx('p-5', className)}>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">{children}</div>
    </Card>
  );
}

type DataTableProps = {
  children: React.ReactNode;
  className?: string;
};

export function DataTable({ children, className }: DataTableProps) {
  return (
    <div className={clsx('admin-scroll', className)}>
      <table className="admin-table text-sm">{children}</table>
    </div>
  );
}

type ContactCardProps = {
  name: string;
  email?: string | null;
  mobile?: string | null;
  postcode?: string | null;
  segment?: string | null;
  visits: number;
  lastSeen?: string | null;
  action?: React.ReactNode;
  onClick?: () => void;
};

export function ContactCard({ name, email, mobile, postcode, segment, visits, lastSeen, action, onClick }: ContactCardProps) {
  return (
    <button
      type="button"
      className="card w-full p-5 text-left transition hover:-translate-y-[1px] hover:border-emerald-300/20"
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-lg font-semibold text-[var(--dashboard-text)]">{name}</p>
          <p className="mt-1 text-sm text-muted">{email || mobile || 'No contact details'}</p>
        </div>
        <div className="status-pill">{visits} visits</div>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Info label="Mobile" value={mobile || '-'} />
        <Info label="Postcode" value={postcode || '-'} />
        <Info label="Segment" value={segment || 'Unknown'} />
        <Info label="Last seen" value={lastSeen || '-'} />
      </div>
      {action ? <div className="mt-4" onClick={(event) => event.stopPropagation()}>{action}</div> : null}
    </button>
  );
}

type SegmentCardProps = {
  title: string;
  count: number;
  description: string;
  action?: React.ReactNode;
};

export function SegmentCard({ title, count, description, action }: SegmentCardProps) {
  return (
    <Card className="h-full">
      <div className="muted-kicker">Audience Segment</div>
      <div className="mt-3 flex items-end justify-between gap-4">
        <h3 className="text-xl font-semibold text-[var(--dashboard-text)]">{title}</h3>
        <span className="font-display text-3xl text-emerald-100">{count}</span>
      </div>
      <p className="mt-3 text-sm text-muted">{description}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </Card>
  );
}

type CampaignCardProps = {
  title: string;
  audience: string;
  recipients: number;
  openRate: string;
  lastSent: string;
  children?: React.ReactNode;
};

export function CampaignCard({ title, audience, recipients, openRate, lastSent, children }: CampaignCardProps) {
  return (
    <Card className="h-full">
      <div className="muted-kicker">Campaign</div>
      <h3 className="mt-3 text-xl font-semibold text-[var(--dashboard-text)]">{title}</h3>
      <p className="mt-2 text-sm text-muted">{audience}</p>
      <div className="mt-5 grid grid-cols-3 gap-3">
        <Info label="Recipients" value={String(recipients)} />
        <Info label="Open Rate" value={openRate} />
        <Info label="Last Sent" value={lastSent} />
      </div>
      {children ? <div className="mt-5">{children}</div> : null}
    </Card>
  );
}

type HorizontalBarsProps = {
  items: { label: string; value: number }[];
  activeLabel?: string | null;
  onSelect?: (label: string) => void;
};

export function HorizontalBars({ items, activeLabel, onSelect }: HorizontalBarsProps) {
  const max = Math.max(...items.map((item) => item.value), 1);

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          className="w-full text-left"
          onClick={() => onSelect?.(item.label)}
        >
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className={clsx('font-medium', activeLabel === item.label ? 'text-emerald-100' : 'text-[var(--dashboard-text)]')}>{item.label}</span>
            <span className="text-muted">{item.value}</span>
          </div>
          <div className="h-2 rounded-full" style={{ background: 'var(--dashboard-surface)' }}>
            <div
              className={clsx('h-2 rounded-full bg-gradient-to-r from-emerald-400 to-teal-200', activeLabel === item.label && 'shadow-glow')}
              style={{ width: `${(item.value / max) * 100}%` }}
            />
          </div>
        </button>
      ))}
    </div>
  );
}

type MiniBarsProps = {
  items: { label: string; value: number }[];
  activeLabel?: string | null;
  onSelect?: (label: string) => void;
};

export function MiniBars({ items, activeLabel, onSelect }: MiniBarsProps) {
  const max = Math.max(...items.map((item) => item.value), 1);
  return (
    <div className="grid grid-cols-7 gap-2">
      {items.map((item) => (
        <button key={item.label} type="button" className="flex flex-col items-center gap-2" onClick={() => onSelect?.(item.label)}>
          <div
            className={clsx('flex h-28 w-full items-end rounded-2xl border p-1', activeLabel === item.label && 'border-emerald-300/25 bg-emerald-300/[0.05]')}
            style={{ borderColor: 'var(--dashboard-card-border)', background: 'var(--dashboard-surface)' }}
          >
            <div
              className="w-full rounded-xl bg-gradient-to-t from-emerald-400 to-teal-200"
              style={{ height: `${(item.value / max) * 100}%` }}
            />
          </div>
          <span className={clsx('text-[11px]', activeLabel === item.label ? 'text-emerald-100' : 'text-muted')}>{item.label}</span>
        </button>
      ))}
    </div>
  );
}

type DonutChartProps = {
  items: { label: string; value: number; color: string }[];
};

export function DonutChart({ items }: DonutChartProps) {
  const total = items.reduce((sum, item) => sum + item.value, 0) || 1;
  let offset = 0;

  return (
    <div className="flex items-center gap-6">
      <svg viewBox="0 0 42 42" className="h-40 w-40 -rotate-90">
        <circle cx="21" cy="21" r="15.915" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="5" />
        {items.map((item) => {
          const dash = (item.value / total) * 100;
          const circle = (
            <circle
              key={item.label}
              cx="21"
              cy="21"
              r="15.915"
              fill="none"
              stroke={item.color}
              strokeWidth="5"
              strokeDasharray={`${dash} ${100 - dash}`}
              strokeDashoffset={-offset}
            />
          );
          offset += dash;
          return circle;
        })}
      </svg>
      <div className="space-y-3">
        {items.map((item) => (
          <div key={item.label} className="flex items-center gap-3">
            <span className="h-3 w-3 rounded-full" style={{ background: item.color }} />
            <div>
              <p className="text-sm font-medium text-[var(--dashboard-text)]">{item.label}</p>
              <p className="text-xs text-muted">{item.value} guests</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

type InfoProps = {
  label: string;
  value: string;
};

export function Info({ label, value }: InfoProps) {
  return (
    <div>
      <div className="text-xs uppercase tracking-[0.18em] text-muted">{label}</div>
      <div className="mt-2 text-sm font-medium text-[var(--dashboard-text)]">{value}</div>
    </div>
  );
}
