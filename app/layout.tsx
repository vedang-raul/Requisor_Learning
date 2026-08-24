import type { Metadata } from "next";
import "./globals.css";
import { StoreProvider } from "@/lib/store";
import { Providers } from "@/components/providers";
import { headers } from "next/headers";

export const metadata: Metadata = {
  title: "Requisor Learning",
  description: "Internal employee learning platform for Requisor — curated learning paths for new interns and employees.",
  icons: { icon: "/requisor.png" },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Calling headers() here opts the entire app into dynamic (per-request)
  // rendering.  This is required for nonce-based CSP: the nonce changes on
  // every request, so the HTML must be generated fresh each time — it cannot
  // be pre-rendered at build time.
  //
  // The nonce is set on the request by middleware.ts and is available here for
  // any explicit <Script nonce={nonce}> elements that may be added in future.
  const headersList = await headers();
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const nonce = headersList.get("x-nonce") ?? "";

  return (
    <html lang="en">
      <body className="min-h-screen bg-background font-sans text-[#111827]">
        <Providers>
          <StoreProvider>{children}</StoreProvider>
        </Providers>
      </body>
    </html>
  );
}
