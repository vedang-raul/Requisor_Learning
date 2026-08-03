import { Bot, BarChart3, Package, Shield, LucideIcon } from "lucide-react";
import { CategoryKey } from "@/lib/types";

export const categoryMeta: Record<CategoryKey, { label: string; icon: LucideIcon; tint: string }> = {
  product: { label: "Product Management", icon: Package, tint: "text-emerald-400" },
  data: { label: "Data Analytics", icon: BarChart3, tint: "text-emerald-400" },
  ai: { label: "Agentic AI", icon: Bot, tint: "text-emerald-400" },
  security: { label: "Cyber Security", icon: Shield, tint: "text-emerald-400" },
};
