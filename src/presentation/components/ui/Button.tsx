import React from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg' | 'icon';
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center rounded-xl text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400 disabled:opacity-50 disabled:pointer-events-none ring-offset-white",
          {
            'bg-stone-800 text-stone-50 hover:bg-stone-900 shadow-sm': variant === 'primary',
            'bg-stone-100 text-stone-900 hover:bg-stone-200': variant === 'secondary',
            'border border-stone-200 hover:bg-stone-50 hover:text-stone-900': variant === 'outline',
            'hover:bg-stone-100 hover:text-stone-900': variant === 'ghost',
            'h-9 px-4': size === 'sm',
            'h-11 py-2 px-6': size === 'md',
            'h-12 px-8': size === 'lg',
            'h-11 w-11': size === 'icon',
          },
          className
        )}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";
