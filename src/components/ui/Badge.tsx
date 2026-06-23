import clsx from 'clsx';

type BadgeProps = {
  tone?: 'accent' | 'soft' | 'dark';
  children: React.ReactNode;
};

export function Badge({ tone = 'soft', children }: BadgeProps) {
  const toneClass =
    tone === 'accent'
      ? 'bg-emerald-400/15 text-emerald-100 border border-emerald-300/15'
      : tone === 'dark'
      ? 'bg-white/[0.04] text-brand border border-white/10'
      : 'bg-white/[0.04] text-muted border border-white/10';

  return <span className={clsx('badge', toneClass)}>{children}</span>;
}
