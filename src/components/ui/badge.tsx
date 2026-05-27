import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full px-3 py-1 text-[11.5px] font-semibold tracking-wide transition-colors',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground shadow-sm',
        secondary: 'bg-secondary text-secondary-foreground shadow-sm',
        outline: 'border border-clay text-foreground bg-card',
        terra: 'bg-terra/10 text-terra border border-terra/20',
        ochre: 'bg-ochre/10 text-ink border border-ochre/30',
        emerald: 'bg-emerald/10 text-emerald border border-emerald/20',
        status: 'bg-card text-ink border border-clay shadow-sm backdrop-blur',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
