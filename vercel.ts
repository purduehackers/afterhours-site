import type { VercelConfig } from "@vercel/config/v1";

export const config = {
  framework: null,
  installCommand: "",
  buildCommand: "",
  outputDirectory: "public",
  cleanUrls: false,
  trailingSlash: false,
  redirects: [{ source: "/index.html", destination: "/", permanent: true }],
  headers: [
    {
      source: "/(.*)",
      headers: [{ key: "Cache-Control", value: "public, max-age=120, must-revalidate" }],
    },
  ],
} satisfies VercelConfig;
