import type { Config } from "@netlify/functions";
import { createClerkClient } from "@clerk/backend";
import { getDatabase } from "@netlify/database";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { serveNetlify, appOrigins } from "../../server/netlify-app.mjs";
import { postgresDatabase } from "../../server/postgres.mjs";

export default async (request: Request) => {
  try {
    const publishableKey = Netlify.env.get("CLERK_PUBLISHABLE_KEY");
    const secretKey = Netlify.env.get("CLERK_SECRET_KEY");
    if (!publishableKey || !secretKey) throw Error("Clerk is not configured.");
    const origins = appOrigins(Netlify.env.get("APP_ORIGINS"));
    const clerk = createClerkClient({ publishableKey, secretKey });
    return await serveNetlify(request, {
      publishableKey, origins,
      gmail: {clientId: Netlify.env.get("GOOGLE_GMAIL_CLIENT_ID"), testUsers: Netlify.env.get("GMAIL_TEST_USERS"), publicEnabled: Netlify.env.get("GMAIL_PUBLIC_ENABLED") === "true"},
      authenticate: (incoming, options) => clerk.authenticateRequest(incoming, options),
      database: () => postgresDatabase(getDatabase().pool),
      readPage: filename => readFile(path.join(process.cwd(), "dist/netlify-pages", filename), "utf8"),
    });
  } catch {
    return new Response("Spool Studio is being prepared. Sign-in is not configured yet.", { status: 503, headers: { "Cache-Control": "private, no-store", "Netlify-CDN-Cache-Control": "no-store" } });
  }
};

export const config: Config = { path: ["/", "/index.html", "/nfc.html", "/import.html", "/app.html", "/reels.html", "/welcome.html", "/printer.html", "/api/*", "/sign-in", "/sign-out"] };
