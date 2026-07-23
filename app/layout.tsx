import type { Metadata } from "next";
import "./globals.css";
import { StoreProvider } from "@/lib/store";
import { Providers } from "@/components/providers";

export const metadata: Metadata = {
  title: "Requisor Learning",
  description: "Internal employee learning platform for Requisor — curated learning paths for new interns and employees.",
  icons: { icon: "/requisor.png" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
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
