import type { Metadata } from "next";
import { BRAND_FULL_NAME } from "@/lib/brand";

// Verified public primary domain. Never use the workspace preview URL for SEO.
export const SITE_URL = "https://alma.requisor.io";
export const SITE_NAME = BRAND_FULL_NAME;
export const SEO_TITLE = `AI-Powered Student LMS | ${BRAND_FULL_NAME}`;
export const SEO_DESCRIPTION =
  "Alma 41 is an AI-powered student LMS for guided courses, progress tracking, notes and multilingual learning support. Tutors create and manage lessons.";
export const SOCIAL_IMAGE = {
  url: `${SITE_URL}/social-image/`,
  width: 1200,
  height: 630,
  alt: `${BRAND_FULL_NAME} — AI-powered student LMS and learning platform`,
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

export const STUDENT_LMS_FAQS = [
  {
    question: "What is a student learning LMS?",
    answer: "A student learning management system brings courses, lessons, learning resources and progress tracking into one place. It helps students organize their study and gives tutors a way to create and manage teaching material.",
  },
  {
    question: "How does Alma 41 support student learning?",
    answer: "Alma 41 combines structured courses with an AI learning assistant, progress tracking, notes and bookmarks. Students can ask questions about their learning and use multilingual reply narration. Available lesson resources and assessments depend on the course.",
  },
  {
    question: "Can students use multilingual voice support?",
    answer: "Students can select an available ElevenLabs voice for spoken assistant replies, including English, Marathi and Hindi. Narration follows the selected voice language while written replies stay unchanged. Voice features require microphone or playback permissions where applicable.",
  },
  {
    question: "Does an AI-powered LMS replace a teacher?",
    answer: "No. An AI assistant supports explanations and study, while tutors remain responsible for course material and teaching decisions. AI replies can be incorrect, so students should check important answers against their lessons and ask their tutor when unsure.",
  },
] as const;

const STUDENT_LMS_TITLE = "Student Learning LMS: Features & Benefits | Alma 41";
const STUDENT_LMS_DESCRIPTION = "Explore how Alma 41 supports student learning with structured courses, AI study help, progress tracking, notes, bookmarks and multilingual voice narration.";

export const STUDENT_LMS_METADATA: Metadata = {
  ...HOME_METADATA,
  title: { absolute: STUDENT_LMS_TITLE },
  description: STUDENT_LMS_DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/student-lms/` },
  openGraph: {
    ...HOME_METADATA.openGraph,
    title: STUDENT_LMS_TITLE,
    description: STUDENT_LMS_DESCRIPTION,
    url: `${SITE_URL}/student-lms/`,
  },
  twitter: {
    ...HOME_METADATA.twitter,
    title: STUDENT_LMS_TITLE,
    description: STUDENT_LMS_DESCRIPTION,
  },
};

export const STUDENT_LMS_STRUCTURED_DATA = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebPage",
      "@id": `${SITE_URL}/student-lms/#webpage`,
      url: `${SITE_URL}/student-lms/`,
      name: STUDENT_LMS_TITLE,
      description: STUDENT_LMS_DESCRIPTION,
      inLanguage: "en",
      isPartOf: { "@id": `${SITE_URL}/#website` },
      about: { "@id": `${SITE_URL}/#application` },
    },
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_URL}/` },
        { "@type": "ListItem", position: 2, name: "Student LMS", item: `${SITE_URL}/student-lms/` },
      ],
    },
    {
      "@type": "FAQPage",
      mainEntity: STUDENT_LMS_FAQS.map(({ question, answer }) => ({
        "@type": "Question",
        name: question,
        acceptedAnswer: { "@type": "Answer", text: answer },
      })),
    },
  ],
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
