import { getDocs, packageVersion } from "../lib/docs";
export async function GET() {
  const docs = await getDocs();
  const body = [
    `# Bitsocial React Hooks v${packageVersion} — full developer documentation`,
    "",
    "Generated from the same maintained Markdown as the website. Code, types, and tests remain authoritative.",
    "",
    ...docs.flatMap((entry) => [
      `# ${entry.data.title}`,
      "",
      `Documentation: /docs/${entry.id}/`,
      "",
      entry.body || "",
      "",
      "---",
      "",
    ]),
  ].join("\n");
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
