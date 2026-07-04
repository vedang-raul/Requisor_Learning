import { Bot, BarChart3, Package, Shield, LucideIcon } from "lucide-react";
import { CategoryKey } from "@/lib/types";

export const categoryMeta: Record<CategoryKey, { label: string; icon: LucideIcon; tint: string }> = {
  product: { label: "Product Management", icon: Package, tint: "text-fuchsia-400" },
  data: { label: "Data Analytics", icon: BarChart3, tint: "text-cyan-400" },
  ai: { label: "Agentic AI", icon: Bot, tint: "text-violet-600" },
  security: { label: "Cyber Security", icon: Shield, tint: "text-emerald-600" },
};
