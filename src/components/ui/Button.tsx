import clsx from 'clsx';

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'outline' | 'ghost';
};

export function Button({ variant = 'primary', className, ...props }: ButtonProps) {
  const variantClass =
    variant === 'primary'
      ? 'btn btn-primary'
      : variant === 'outline'
      ? 'btn btn-outline'
      : 'btn btn-ghost';

  return <button className={clsx(variantClass, className)} {...props} />;
}
