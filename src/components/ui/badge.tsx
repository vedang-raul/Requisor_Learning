import { cn } from "@/lib/utils";

const tones = {
  default: "bg-zinc-100 text-zinc-700 border-zinc-200",
  primary: "bg-primary/15 text-primary border-primary/30",
  accent: "bg-accent/15 text-cyan-700 border-accent/30",
  success: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30",
  warning: "bg-amber-500/15 text-amber-700 border-amber-500/30",
} as const;

export function Tag({
  tone = "default",
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: keyof typeof tones }) {
  return (
    <span
      className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium", tones[tone], className)}
      {...props}
    />
  );
}
