import type { Metadata } from "next";
import { headers } from "next/headers";
import LandingApp from "@/components/landing/App.jsx";
import { HOME_METADATA, SITE_STRUCTURED_DATA, serializeStructuredData } from "@/lib/courses/seo";

export const metadata: Metadata = HOME_METADATA;

export default async function Home() {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <>
      <script
        type="application/ld+json"
        nonce={nonce}
        dangerouslySetInnerHTML={{ __html: serializeStructuredData(SITE_STRUCTURED_DATA) }}
      />
      <LandingApp />
    </>
  );
}
