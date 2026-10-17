import { getDocs } from "../lib/docs";
export async function GET() {
  const docs = await getDocs();
  return new Response(
    JSON.stringify(
      docs.map((entry) => ({
        title: entry.data.title,
        group: entry.data.group,
        url: `/docs/${entry.id}/`,
        text: (entry.body || "")
          .replace(/[#*`|\[\]]/g, "")
          .replace(/\s+/g, " ")
          .trim(),
      })),
    ),
    { headers: { "Content-Type": "application/json" } },
  );
}
