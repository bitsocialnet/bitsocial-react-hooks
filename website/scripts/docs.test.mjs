import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { splitReference, rewriteLinks, slugify } from "./prepare-docs.mjs";
const dist = fileURLToPath(new URL("../dist/", import.meta.url));

test("reference splitting respects fences and keeps section bodies", () => {
  const source =
    "## API Reference\n#### Accounts Hooks\n```md\n#### Not a page\n```\nkeep me\n## Recipes\n#### Get feed\nexample";
  const pages = splitReference(source);
  assert.deepEqual(
    pages.map((page) => page.slug),
    ["api/accounts-hooks", "recipes/get-feed"],
  );
  assert.match(pages[0].body, /#### Not a page/);
  assert.match(pages[0].body, /keep me/);
  assert.equal(pages[1].body, "example");
});

test("moved reference links resolve to actual source or generated docs", () => {
  const anchors = new Map([["get-feed", "recipes/get-feed"]]);
  const result = rewriteLinks(
    "[Feed](#get-feed) [Types](../src/types.ts) ![Asset](assets/a.png)",
    "docs/reference.md",
    anchors,
  );
  assert.match(result, /\[Feed\]\(\/docs\/recipes\/get-feed\/\)/);
  assert.match(result, /blob\/master\/src\/types.ts/);
  assert.match(
    result,
    /raw.githubusercontent.com\/bitsocialnet\/bitsocial-react-hooks\/master\/docs\/assets\/a.png/,
  );
});

async function files(directory) {
  return (
    await Promise.all(
      (
        await readdir(directory, { withFileTypes: true })
      ).map((entry) =>
        entry.isDirectory()
          ? files(path.join(directory, entry.name))
          : path.join(directory, entry.name),
      ),
    )
  ).flat();
}

test("built HTML has no broken local links, assets, or fragments", async () => {
  const htmlFiles = (await files(dist)).filter((file) => file.endsWith(".html"));
  const search = JSON.parse(await readFile(path.join(dist, "search.json"), "utf8"));
  assert.equal(htmlFiles.length, search.length + 2, "All docs plus home and 404 must render");
  const failures = [];
  for (const file of htmlFiles) {
    const html = await readFile(file, "utf8");
    const base = new URL(
      path.relative(dist, file).replace(/index.html$/, ""),
      "https://test.local/",
    );
    for (const [, attribute, raw] of html.matchAll(/\b(href|src)="([^"\s]+)"/g)) {
      const href = raw.replaceAll("&amp;", "&");
      if (/^(https?:|data:|mailto:)/.test(href)) continue;
      const url = new URL(href, base);
      let target = path.join(dist, decodeURIComponent(url.pathname));
      if (url.pathname.endsWith("/")) target = path.join(target, "index.html");
      try {
        assert.ok((await stat(target)).isFile());
        if (attribute === "href" && url.hash && target.endsWith(".html")) {
          const destination = target === file ? html : await readFile(target, "utf8");
          assert.ok(
            destination.includes(`id="${decodeURIComponent(url.hash.slice(1))}"`),
            "Missing anchor",
          );
        }
      } catch {
        failures.push(`${path.relative(dist, file)} → ${href}`);
      }
    }
  }
  assert.deepEqual(failures, []);
});

test("AI, Markdown, and search outputs cover exactly the rendered docs", async () => {
  const search = JSON.parse(await readFile(path.join(dist, "search.json"), "utf8"));
  assert.ok(search.length >= 55);
  assert.equal(new Set(search.map((entry) => entry.url)).size, search.length);
  const index = await readFile(path.join(dist, "llms.txt"), "utf8");
  const full = await readFile(path.join(dist, "llms-full.txt"), "utf8");
  for (const entry of search) {
    const rawPath = `${entry.url.slice(0, -1)}.md`;
    const markdown = await readFile(path.join(dist, rawPath), "utf8");
    assert.ok(index.includes(rawPath), `Index missing ${rawPath}`);
    assert.ok(full.includes(`# ${entry.title}`));
    assert.ok(markdown.startsWith(`# ${entry.title}`));
    assert.ok(entry.text.length > 0);
    assert.ok(full.includes(markdown.split("\n").slice(2).join("\n").trim()));
  }
});

test("website stays outside the public module surface", async () => {
  const pkg = JSON.parse(await readFile(new URL("../../package.json", import.meta.url), "utf8"));
  const site = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(site.private, true);
  assert.deepEqual(pkg.files, ["CHANGELOG.md", "dist"]);
  assert.ok(!JSON.stringify(pkg.exports).includes("website"));
});

test("production excludes Agentation and keeps mesh code off documentation pages", async () => {
  const outputFiles = await files(dist);
  const scripts = outputFiles.filter((file) => file.endsWith(".js"));
  assert.ok(scripts.some((file) => path.basename(file).startsWith("MeshGraphic.")));
  for (const script of scripts) {
    const source = await readFile(script, "utf8");
    assert.doesNotMatch(source, /agentation-dev-tools|Agentation could not load|agentation-mcp/);
  }
  const home = await readFile(path.join(dist, "index.html"), "utf8");
  assert.match(home, /component-url="[^"]*Playground\./);
  assert.match(home, /component-url="[^"]*MeshGraphic\./);
  assert.match(home, /class="live-editor"[\s\S]*postsPerPage/, "Editable example source is server rendered");
  for (const file of outputFiles.filter(
    (file) => file.includes(`${path.sep}docs${path.sep}`) && file.endsWith(".html"),
  )) {
    const html = await readFile(file, "utf8");
    assert.doesNotMatch(html, /MeshGraphic\.|hero-mesh|agentation-dev-tools/);
  }
});

test("maintained onboarding links work on GitHub before a domain exists", async () => {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const sources = [
    "README.md",
    "website/content/quickstart.md",
    "website/content/concepts.md",
    "website/content/ai.md",
  ];
  for (const source of sources) {
    const markdown = (await readFile(path.join(root, source), "utf8")).replace(
      /```[\s\S]*?```/g,
      "",
    );
    for (const [, href] of markdown.matchAll(/!?\[[^\]\n]*\]\(([^\s)]+)\)/g)) {
      if (/^(https?:|mailto:)/.test(href)) continue;
      assert.ok(!href.startsWith("/"), `${source}: site-only link ${href}`);
      const url = new URL(href, `https://source.local/${source}`);
      const target = path.join(root, decodeURIComponent(url.pathname));
      assert.ok((await stat(target)).isFile(), `${source}: missing ${href}`);
      if (url.hash) {
        const targetMarkdown = await readFile(target, "utf8");
        const anchors = [...targetMarkdown.matchAll(/^#+ (.+)$/gm)].map((match) =>
          slugify(match[1]),
        );
        assert.ok(anchors.includes(url.hash.slice(1)), `${source}: missing anchor ${href}`);
      }
    }
  }
});

test("source guide links become HTML, raw Markdown, or API routes as appropriate", () => {
  const anchors = new Map([["feeds-hooks", "api/feeds-hooks"]]);
  const result = rewriteLinks(
    "[Concepts](concepts.md) [Raw](quickstart.md?raw=1) [API](../../docs/reference.md#feeds-hooks) [AI](../../llms.txt)",
    "website/content/ai.md",
    anchors,
  );
  assert.equal(
    result,
    "[Concepts](/docs/concepts/) [Raw](/docs/quickstart.md) [API](/docs/api/feeds-hooks/) [AI](/llms.txt)",
  );
});
