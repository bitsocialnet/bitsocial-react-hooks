import { getDocs, packageVersion, repoUrl, groups } from "../lib/docs";
export async function GET() {
  const docs = await getDocs();
  const body = [
    "# Bitsocial React Hooks",
    "",
    `> Developer documentation for @bitsocial/bitsocial-react-hooks v${packageVersion}. React hooks and Zustand stores for Bitsocial apps.`,
    "",
    "Browser-only imports. No provider is required. Accounts initialize asynchronously. Read the quickstart before building.",
    "",
    `- [Source repository](${repoUrl})`,
    "- [Complete documentation](/llms-full.txt)",
    "- [Bitsocial protocol documentation](https://docs.bitsocial.net/llms.txt)",
    ...groups.flatMap((group) => [
      "",
      `## ${group}`,
      "",
      ...docs
        .filter((entry) => entry.data.group === group)
        .map((entry) => `- [${entry.data.title}](/docs/${entry.id}.md): ${entry.data.description}`),
    ]),
    "",
  ].join("\n");
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
