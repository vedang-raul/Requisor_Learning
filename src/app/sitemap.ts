import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/courses/seo";

export default function sitemap(): MetadataRoute.Sitemap {
  // Only public marketing pages are indexable. Never list accounts, API URLs,
  // private course records, or unsupported standalone feature pages.
  return [
    { url: `${SITE_URL}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/student-lms/`, changeFrequency: "monthly", priority: 0.8 },
  ];
}
