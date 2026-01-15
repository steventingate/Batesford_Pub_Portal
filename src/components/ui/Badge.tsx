import clsx from 'clsx';

type BadgeProps = {
  tone?: 'accent' | 'soft' | 'dark';
  children: React.ReactNode;
};

export function Badge({ tone = 'soft', children }: BadgeProps) {
  const toneClass =
    tone === 'accent'
      ? 'bg-[rgba(244,197,66,0.2)] text-[#8b6914]'
      : tone === 'dark'
      ? 'bg-[rgba(26,71,42,0.15)] text-brand'
      : 'bg-[rgba(45,90,61,0.12)] text-brand-dark';

  return <span className={clsx('badge', toneClass)}>{children}</span>;
}
