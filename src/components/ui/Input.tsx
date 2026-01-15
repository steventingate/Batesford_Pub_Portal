import clsx from 'clsx';

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  helperText?: string;
};

export function Input({ label, helperText, className, ...props }: InputProps) {
  return (
    <label className="block">
      {label && <span className="block text-sm font-semibold text-muted mb-2">{label}</span>}
      <input className={clsx('input', className)} {...props} />
      {helperText && <span className="block text-xs text-muted mt-1">{helperText}</span>}
    </label>
  );
}
