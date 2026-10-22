import { HOME_METADATA, SEO_DESCRIPTION, SEO_TITLE, SITE_STRUCTURED_DATA, SITE_URL, STUDENT_LMS_METADATA, STUDENT_LMS_STRUCTURED_DATA, STUDENT_LMS_FAQS, serializeStructuredData } from "@/lib/courses/seo";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";

describe("public SEO and private route indexing boundaries", () => {
  it("uses the canonical production domain and feature-focused homepage metadata", () => {
    expect(HOME_METADATA.alternates?.canonical).toBe(`${SITE_URL}/`);
    expect(HOME_METADATA.openGraph).toMatchObject({ url: `${SITE_URL}/`, type: "website" });
    expect(HOME_METADATA.openGraph).toMatchObject({
      images: [{ url: `${SITE_URL}/social-image/`, width: 1200, height: 630 }],
    });
    expect(HOME_METADATA.twitter).toMatchObject({ card: "summary_large_image" });
    expect(HOME_METADATA.robots).toMatchObject({ index: true, follow: true });
    expect(SEO_DESCRIPTION.length).toBeGreaterThanOrEqual(140);
    expect(SEO_DESCRIPTION.length).toBeLessThanOrEqual(165);
    expect(SEO_TITLE).toMatch(/Student LMS/);
    expect(SEO_TITLE.length).toBeLessThanOrEqual(65);
    expect(SEO_DESCRIPTION).toMatch(/student LMS/);
    expect(SEO_DESCRIPTION).toMatch(/progress tracking/);
    expect(SEO_DESCRIPTION).toMatch(/Tutors/);
    expect(SITE_URL).not.toContain("replit.dev");
  });

  it("lists only indexable public pages and excludes account and API paths", () => {
    expect(sitemap()).toEqual([
      { url: `${SITE_URL}/`, changeFrequency: "weekly", priority: 1 },
      { url: `${SITE_URL}/student-lms/`, changeFrequency: "monthly", priority: 0.8 },
    ]);
    expect(robots()).toMatchObject({
      rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/app/", "/login/", "/reset-password/"] },
      sitemap: `${SITE_URL}/sitemap.xml`,
    });
  });

  it("gives the student guide its own canonical metadata and matching FAQ schema", () => {
    expect(STUDENT_LMS_METADATA.alternates?.canonical).toBe(`${SITE_URL}/student-lms/`);
    expect(STUDENT_LMS_METADATA.robots).toMatchObject({ index: true, follow: true });
    expect(STUDENT_LMS_METADATA.openGraph).toMatchObject({ url: `${SITE_URL}/student-lms/` });
    const faq = STUDENT_LMS_STRUCTURED_DATA["@graph"].find(item => item["@type"] === "FAQPage")!;
    expect(faq.mainEntity).toHaveLength(STUDENT_LMS_FAQS.length);
    expect(faq.mainEntity).toEqual(STUDENT_LMS_FAQS.map(item => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })));
    for (const item of sitemap()) {
      expect(item.url).not.toMatch(/\/(?:app|api|login|reset-password)\//);
    }
  });

  it("describes implemented features without invented ratings, offers or course records", () => {
    const graph = SITE_STRUCTURED_DATA["@graph"];
    expect(graph.map(entity => entity["@type"])).toEqual(["Organization", "WebSite", "SoftwareApplication"]);
    const app = graph.find(entity => entity["@type"] === "SoftwareApplication")!;
    expect(app).toMatchObject({ applicationCategory: "EducationalApplication", operatingSystem: "Web" });
    expect(app).not.toHaveProperty("aggregateRating");
    expect(app).not.toHaveProperty("offers");
    expect(JSON.stringify(app)).toMatch(/transcripts are provided/);
    expect(JSON.stringify(app)).toMatch(/with confirmation/);
  });

  it("escapes structured-data strings without changing JSON content", () => {
    const value = { text: "</script><script>alert(1)</script>&\u2028\u2029" };
    const result = serializeStructuredData(value);
    expect(result).not.toContain("</script>");
    expect(result).not.toContain("<");
    expect(JSON.parse(result)).toEqual(value);
  });
});
