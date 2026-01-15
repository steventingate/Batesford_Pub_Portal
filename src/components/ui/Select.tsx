import clsx from 'clsx';

type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & {
  label?: string;
};

export function Select({ label, className, children, ...props }: SelectProps) {
  return (
    <label className="block">
      {label && <span className="block text-sm font-semibold text-muted mb-2">{label}</span>}
      <select className={clsx('input bg-white', className)} {...props}>
        {children}
      </select>
    </label>
  );
}
