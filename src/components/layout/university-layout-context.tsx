"use client";

import { createContext, useContext } from "react";
import { DEFAULT_LAYOUT, type UniversityLayout } from "@/lib/theme/university-layout";

/** The member's university layout (sidebar, menu, top bar), or Requisor's. Set by src/app/app/layout.tsx. */
const LayoutContext = createContext<UniversityLayout>(DEFAULT_LAYOUT);

export function UniversityLayoutProvider({ layout, children }: { layout: UniversityLayout | null; children: React.ReactNode }) {
  return <LayoutContext.Provider value={layout ?? DEFAULT_LAYOUT}>{children}</LayoutContext.Provider>;
}

export const useUniversityLayout = () => useContext(LayoutContext);
