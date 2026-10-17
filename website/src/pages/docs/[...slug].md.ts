import type { APIRoute } from "astro";
import { getDocs } from "../../lib/docs";
export async function getStaticPaths() {
  return (await getDocs()).map((entry) => ({ params: { slug: entry.id }, props: { entry } }));
}
export const GET: APIRoute = ({ props }) =>
  new Response(`# ${props.entry.data.title}\n\n${props.entry.body}\n`, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
