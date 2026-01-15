type SpinnerProps = {
  label?: string;
};

export function Spinner({ label }: SpinnerProps) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand/30 border-t-brand" />
      {label && <span className="text-sm text-muted">{label}</span>}
    </div>
  );
}
