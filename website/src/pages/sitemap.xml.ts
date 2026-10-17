import type { APIRoute } from "astro";
import { getDocs } from "../lib/docs";
export const GET: APIRoute = async ({ site }) => {
  const routes = ["/", ...(await getDocs()).map((entry) => `/docs/${entry.id}/`)];
  const urls = site
    ? routes.map((route) => `<url><loc>${new URL(route, site).href}</loc></url>`).join("")
    : "";
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`,
    { headers: { "Content-Type": "application/xml" } },
  );
};
