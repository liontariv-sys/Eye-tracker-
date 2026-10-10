import type { MetadataRoute } from "next";

const siteUrl = "https://lpnec-oculab.oculablpnec.workers.dev";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: siteUrl,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
  ];
}
