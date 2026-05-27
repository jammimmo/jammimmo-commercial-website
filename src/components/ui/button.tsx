import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-secondary text-secondary-foreground shadow-[0_10px_30px_-10px_hsl(var(--secondary)/.5)] hover:translate-y-[-1px] hover:shadow-[0_16px_36px_-10px_hsl(var(--secondary)/.6)]',
        primary: 'bg-primary text-primary-foreground shadow-[0_10px_30px_-10px_hsl(var(--primary)/.5)] hover:translate-y-[-1px]',
        terra: 'bg-terra text-terra-foreground hover:translate-y-[-1px]',
        outline: 'border-2 border-primary bg-transparent text-primary hover:bg-primary hover:text-primary-foreground',
        ghost: 'bg-white/8 text-current border border-white/30 hover:bg-white/16',
        soft: 'bg-card text-card-foreground border border-clay hover:bg-muted',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-11 px-6 text-sm',
        sm: 'h-9 px-4 text-sm',
        lg: 'h-12 px-7 text-[15px]',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return <Comp className={cn(buttonVariants({ variant, size }), className)} ref={ref} {...props} />;
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
