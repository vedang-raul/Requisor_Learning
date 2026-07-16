"use client";

import { cn } from "@/lib/utils";
import { forwardRef } from "react";

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "focus-ring h-10 w-full rounded-xl border border-border bg-white px-3.5 text-sm text-zinc-900 placeholder:text-zinc-500 transition-colors hover:border-zinc-300",
        className
      )}
      {...props}
    />
  )
);
Input.displayName = "Input";

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "focus-ring min-h-[90px] w-full rounded-xl border border-border bg-white p-3.5 text-sm text-zinc-900 placeholder:text-zinc-500 transition-colors hover:border-zinc-300",
        className
      )}
      {...props}
    />
  )
);
Textarea.displayName = "Textarea";
