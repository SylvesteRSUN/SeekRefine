import { clsx } from 'clsx';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info';
  className?: string;
}

export function Badge({ children, variant = 'default', className }: BadgeProps) {
  return (
    <span
      className={clsx(
        'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
        {
          'bg-gray-100 text-gray-700': variant === 'default',
          'bg-green-100 text-green-700': variant === 'success',
          'bg-yellow-100 text-yellow-700': variant === 'warning',
          'bg-red-100 text-red-700': variant === 'danger',
          'bg-blue-100 text-blue-700': variant === 'info',
        },
        className
      )}
    >
      {children}
    </span>
  );
}

export function MatchScoreBadge({ score }: { score: number | null }) {
  if (score === null) return <Badge>Not analyzed</Badge>;

  const variant = score >= 80 ? 'success' : score >= 60 ? 'warning' : score >= 40 ? 'info' : 'danger';
  return <Badge variant={variant}>{score}%</Badge>;
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { variant: BadgeProps['variant']; label: string }> = {
    new: { variant: 'info', label: 'New' },
    interested: { variant: 'warning', label: 'Interested' },
    applied: { variant: 'success', label: 'Applied' },
    ignored: { variant: 'default', label: 'Ignored' },
    rejected: { variant: 'danger', label: 'Rejected' },
  };
  const { variant, label } = map[status] || { variant: 'default' as const, label: status };
  return <Badge variant={variant}>{label}</Badge>;
}
