import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";
import "../landing/index.css";
import { Providers } from "@/components/providers";
import { StoreProvider } from "@/lib/store";

export const metadata: Metadata = {
  title: "Requisor Learning",
  description: "Internal employee learning platform for Requisor — curated learning paths for new interns and employees.",
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
      </body>
    </html>
  );
}