import type { VercelConfig } from "@vercel/config/v1";

export const config = {
  framework: null,
  installCommand: "bun install --frozen-lockfile",
  buildCommand: "bun run build",
  outputDirectory: "public",
  cleanUrls: false,
  trailingSlash: false,
  redirects: [{ source: "/index.html", destination: "/", permanent: true }],
  headers: [
    {
      source: "/(.*)",
      headers: [{ key: "Cache-Control", value: "public, max-age=120, must-revalidate" }],
    },
    {
      source: "/api/(.*)",
      headers: [{ key: "Cache-Control", value: "no-store" }],
    },
    {
      source: "/contribute.html",
      headers: [
        {
          key: "Content-Security-Policy",
          value:
            "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self' https://checkout.stripe.com https://donate.stripe.com",
        },
        { key: "Referrer-Policy", value: "same-origin" },
        { key: "X-Content-Type-Options", value: "nosniff" },
      ],
    },
  ],
} satisfies VercelConfig;
