import clsx from 'clsx';

type CardProps = React.HTMLAttributes<HTMLDivElement> & {
  tone?: 'default' | 'muted';
};

export function Card({ tone = 'default', className, ...props }: CardProps) {
  return (
    <div
      className={clsx(
        'card p-6',
        tone === 'muted' && 'bg-white/[0.03] border border-white/10',
        className
      )}
      {...props}
    />
  );
}
