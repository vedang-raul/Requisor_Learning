import type { Metadata } from "next";

// Verified public primary domain. Never use the workspace preview URL for SEO.
export const SITE_URL = "https://alma.requisor.io";
export const SITE_NAME = "Alma by Requisor";
export const SEO_TITLE = "AI Learning & Tutor Course Tools | Alma by Requisor";
export const SEO_DESCRIPTION =
  "Learn with an AI assistant, multilingual ElevenLabs narration and lesson transcript support. Tutors can create courses and edit lessons with AI. Explore Alma.";
export const SOCIAL_IMAGE = {
  url: `${SITE_URL}/social-image/`,
  width: 1200,
  height: 630,
  alt: "Alma by Requisor — AI learning, multilingual voices and tutor course tools",
};

export const HOME_METADATA: Metadata = {
  title: { absolute: SEO_TITLE },
  description: SEO_DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/` },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large" },
  },
  openGraph: {
    type: "website",
    title: SEO_TITLE,
    description: SEO_DESCRIPTION,
    url: `${SITE_URL}/`,
    siteName: SITE_NAME,
    locale: "en_US",
    images: [SOCIAL_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: SEO_TITLE,
    description: SEO_DESCRIPTION,
    images: [SOCIAL_IMAGE],
  },
};

export const SITE_STRUCTURED_DATA = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: "Requisor",
      url: `${SITE_URL}/`,
      logo: `${SITE_URL}/requisor.png`,
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      name: SITE_NAME,
      url: `${SITE_URL}/`,
      inLanguage: "en",
      publisher: { "@id": `${SITE_URL}/#organization` },
    },
    {
      "@type": "SoftwareApplication",
      "@id": `${SITE_URL}/#application`,
      name: SITE_NAME,
      url: `${SITE_URL}/`,
      description: SEO_DESCRIPTION,
      applicationCategory: "EducationalApplication",
      operatingSystem: "Web",
      publisher: { "@id": `${SITE_URL}/#organization` },
      featureList: [
        "AI learning assistant for course questions and learning recommendations",
        "ElevenLabs narration with selectable male and female voices",
        "Spoken replies in English, Marathi, Hindi, Spanish, Arabic, Chinese, Portuguese and Afrikaans",
        "Lesson transcript context when transcripts are provided",
        "Tutor AI tools to create courses and edit courses and lessons with confirmation",
        "Learning progress, notes and bookmarks",
      ],
    },
  ],
};

/** Safe even if future structured data includes externally supplied text. */
export function serializeStructuredData(data: Record<string, unknown>): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
