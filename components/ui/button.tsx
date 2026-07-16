"use client";

import { cn } from "@/lib/utils";
import { forwardRef } from "react";

type Variant = "primary" | "secondary" | "ghost" | "outline" | "danger";
type Size = "sm" | "md" | "lg" | "icon";

const variants: Record<Variant, string> = {
  primary:
    "bg-primary text-white shadow-glow-sm hover:bg-secondary active:scale-[0.98]",
  secondary: "bg-zinc-100 text-zinc-800 hover:bg-zinc-200 border border-zinc-200",
  ghost: "text-zinc-700 hover:text-zinc-900 hover:bg-zinc-100",
  outline: "border border-border text-zinc-800 hover:border-primary/60 hover:text-zinc-900 hover:bg-primary/10",
  danger: "bg-red-500/15 text-red-600 border border-red-500/30 hover:bg-red-500/25",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-6 text-base",
  icon: "h-9 w-9",
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        "focus-ring inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-all duration-200 disabled:pointer-events-none disabled:opacity-50",
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    />
  )
);
Button.displayName = "Button";
