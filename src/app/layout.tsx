import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";
import "../components/landing/index.css";
import { Providers } from "@/components/layout/providers";
import { StoreProvider } from "@/lib/store";
import { SITE_URL, SITE_NAME, SEO_TITLE, SEO_DESCRIPTION } from "@/lib/courses/seo";
import { DesignGrid } from "@/components/layout/design-grid";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: SEO_TITLE, template: `%s | ${SITE_NAME}` },
  description: SEO_DESCRIPTION,
  applicationName: SITE_NAME,
  // Public marketing pages explicitly opt into indexing; account pages do not.
  robots: { index: false, follow: false },
  icons: { icon: "/requisor.png" },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Opt every page into per-request rendering so nonce-based CSP remains valid.
  // The middleware-generated nonce is intentionally read here even though no
  // explicit Script component currently needs it.
  const headersList = await headers();
  headersList.get("x-nonce");

  return (
    <html lang="en">
      <body className="min-h-screen bg-background font-sans text-[#111827]">
        <Providers>
          <StoreProvider>{children}</StoreProvider>
        </Providers>
        {/* Spacing and alignment overlay for whoever is working on the UI (Alt+G). */}
        <DesignGrid />
      </body>
    </html>
  );
}