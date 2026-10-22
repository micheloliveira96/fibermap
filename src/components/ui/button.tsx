import { Slot } from '@radix-ui/react-slot';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { ButtonHTMLAttributes } from 'react';
export function Button({ className, asChild, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean }) { const Component = asChild ? Slot : 'button'; return <Component className={twMerge(clsx('button', className))} {...props} />; }
