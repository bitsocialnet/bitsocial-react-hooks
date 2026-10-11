import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const website = fileURLToPath(new URL("../", import.meta.url));
const root = path.resolve(website, "..");
const output = path.join(website, ".generated/docs");
const repo = "https://github.com/bitsocialnet/bitsocial-react-hooks/blob/master/";
export const slugify = (value) =>
  value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-");

// Only headings outside fenced examples divide the maintained reference.
export function splitReference(markdown) {
  const entries = [];
  let section;
  let fence;
  let current;
  for (const line of markdown.split("\n")) {
    const delimiter = line.match(/^\s*(`{3,}|~{3,})/);
    if (delimiter) {
      if (!fence) fence = delimiter[1];
      else if (delimiter[1][0] === fence[0] && delimiter[1].length >= fence.length)
        fence = undefined;
    }
    if (!fence && /^## (API Reference|Recipes)/.test(line)) {
      section = line.includes("Recipes") ? "recipes" : "api";
      current = undefined;
    } else if (!fence && section && line.startsWith("#### ")) {
      const title = line.slice(5).trim();
      current = {
        title,
        slug: `${section}/${slugify(title)}`,
        group: section === "api" ? "API reference" : "Recipes",
        body: [],
      };
      entries.push(current);
    } else if (current) {
      current.body.push(line);
    }
  }
  return entries.map(({ body, ...entry }) => ({ ...entry, body: body.join("\n").trim() }));
}

const sourceRoutes = new Map([
  ...["quickstart", "concepts", "ai"].map((name) => [`website/content/${name}.md`, name]),
  ...["algorithms", "clients", "mock-content", "schema"].map((name) => [
    `docs/${name}.md`,
    `advanced/${name}`,
  ]),
]);

export function rewriteLinks(markdown, source, anchors = new Map()) {
  return markdown.replace(/(!?\[[^\]\n]*\]\()([^\s)]+)(\))/g, (match, start, href, end) => {
    if (/^(https?:|mailto:|\/)/.test(href)) return match;
    if (href.startsWith("#"))
      return anchors.has(href.slice(1))
        ? `${start}/docs/${anchors.get(href.slice(1))}/${end}`
        : match;
    const url = new URL(href, `https://source.local/${source}`);
    const resolved = decodeURIComponent(url.pathname.slice(1));
    if (resolved === "llms.txt" || resolved === "llms-full.txt")
      return `${start}/${resolved}${end}`;
    if (resolved === "docs/reference.md" && anchors.has(url.hash.slice(1)))
      return `${start}/docs/${anchors.get(url.hash.slice(1))}/${end}`;
    if (sourceRoutes.has(resolved)) {
      const suffix = url.searchParams.get("raw") === "1" ? ".md" : "/";
      return `${start}/docs/${sourceRoutes.get(resolved)}${suffix}${url.hash}${end}`;
    }
    const base = start.startsWith("!")
      ? "https://raw.githubusercontent.com/bitsocialnet/bitsocial-react-hooks/master/"
      : repo;
    return `${start}${base}${resolved}${url.search}${url.hash}${end}`;
  });
}

export async function prepareDocs() {
  const reference = await readFile(path.join(root, "docs/reference.md"), "utf8");
  const entries = splitReference(reference);
  if (entries.length < 40)
    throw new Error("Reference extraction unexpectedly lost API or recipe sections.");
  const anchors = new Map(entries.map((entry) => [slugify(entry.title), entry.slug]));
  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });
  const writeDoc = async (slug, data, body) => {
    const target = path.join(output, `${slug}.md`);
    await mkdir(path.dirname(target), { recursive: true });
    const frontmatter = Object.entries(data)
      .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
      .join("\n");
    await writeFile(target, `---\n${frontmatter}\n---\n\n${body}\n`);
  };
  for (const [order, entry] of entries.entries()) {
    await writeDoc(
      entry.slug,
      {
        title: entry.title,
        description: `${entry.title} in Bitsocial React Hooks. Usage, options, and examples.`,
        group: entry.group,
        order: order + 10,
        source: `docs/reference.md#${slugify(entry.title)}`,
      },
      rewriteLinks(entry.body, "docs/reference.md", anchors),
    );
  }
  for (const filename of await readdir(path.join(website, "content"))) {
    if (!filename.endsWith(".md")) continue;
    const raw = await readFile(path.join(website, "content", filename), "utf8");
    // Hand-authored guide frontmatter is validated by the content collection.
    const document = raw.replace(
      /^(---\r?\n)/,
      `$1source: ${JSON.stringify(`website/content/${filename}`)}\n`,
    );
    await writeFile(
      path.join(output, filename),
      rewriteLinks(document, `website/content/${filename}`, anchors),
    );
  }
  for (const [order, name] of ["algorithms", "clients", "mock-content", "schema"].entries()) {
    const source = `docs/${name}.md`;
    const body = await readFile(path.join(root, source), "utf8");
    const title = body.match(/^# (.+)$/m)?.[1] || name;
    await writeDoc(
      `advanced/${name}`,
      {
        title,
        description: `${title}: implementation guidance for Bitsocial apps.`,
        group: "Advanced",
        order: 100 + order,
        source,
      },
      rewriteLinks(body.replace(/^# .+\r?\n/m, ""), source),
    );
  }
  console.log(
    `Prepared ${entries.length} reference sections and developer guides from maintained Markdown.`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  await prepareDocs();
