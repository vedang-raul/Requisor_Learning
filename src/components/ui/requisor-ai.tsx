import { cn } from "@/lib/utils";

/**
 * The maker's name, "Requisor.AI", with the "AI" set apart: bolder and in the
 * brand gradient, so it reads first. Use it wherever the name is shown on screen;
 * plain-text places (page titles, emails) use BRAND_MAKER from src/lib/brand.ts.
 */
export function RequisorAI({ className }: { className?: string }) {
  return (
    <span className={cn("whitespace-nowrap", className)}>
      Requisor.<span className="text-gradient font-extrabold tracking-wide">AI</span>
    </span>
  );
}
