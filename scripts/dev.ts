import { realpath } from "node:fs/promises";
import { resolve, sep } from "node:path";

import { Result } from "better-result";

import contributionStatus from "../api/contribution-status.ts";
import contributions from "../api/contributions.ts";
import stripeWebhook from "../api/stripe-webhook.ts";

const root = resolve(import.meta.dir, "../public");
const server = Result.try(() =>
  Bun.serve({
    hostname: "127.0.0.1",
    port: 3000,
    async fetch(request) {
      const result = await Result.tryPromise(async () => {
        const url = new URL(request.url);
        if (url.pathname === "/api/contributions") return contributions.fetch(request);
        if (url.pathname === "/api/contribution-status") return contributionStatus.fetch(request);
        if (url.pathname === "/api/stripe-webhook") return stripeWebhook.fetch(request);
        if (request.method !== "GET" && request.method !== "HEAD") {
          return new Response(null, { status: 405, headers: { Allow: "GET, HEAD" } });
        }
        if (url.pathname === "/index.html") return Response.redirect(`/${url.search}`, 308);
        const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
        const path = await realpath(resolve(root, `.${decodeURIComponent(pathname)}`));
        if (!path.startsWith(`${root}${sep}`)) return new Response(null, { status: 404 });
        const file = Bun.file(path);
        return new Response(await file.arrayBuffer(), {
          headers: { "Content-Type": file.type, "Cache-Control": "no-store" },
        });
      });
      return result.isOk() ? result.value : new Response("Not found", { status: 404 });
    },
  }),
);

if (server.isErr()) {
  console.error(server.error);
  process.exit(1);
}
console.log(`Serving public at ${server.value.url.href}`);
