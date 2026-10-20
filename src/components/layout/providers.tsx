"use client";

import { SessionProvider } from "next-auth/react";
import { AccessibilityProvider } from "@/components/layout/accessibility-provider";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      {/* Honours the device's "reduce motion" setting and the person's own accessibility choices (see also globals.css). */}
      <AccessibilityProvider>{children}</AccessibilityProvider>
    </SessionProvider>
  );
}
