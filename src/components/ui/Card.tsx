import clsx from 'clsx';

type CardProps = React.HTMLAttributes<HTMLDivElement> & {
  tone?: 'default' | 'muted';
};

export function Card({ tone = 'default', className, ...props }: CardProps) {
  return (
    <div
      className={clsx(
        'card p-6',
        tone === 'muted' && 'bg-white/80 border border-white/70',
        className
      )}
      {...props}
    />
  );
}
