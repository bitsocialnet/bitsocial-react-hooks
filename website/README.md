# Bitsocial React Hooks website

The public developer site for `@bitsocial/bitsocial-react-hooks`. An Astro static site with interactive examples, searchable API pages, light/dark themes, and AI-readable documentation. No hooks runtime or protocol connections are loaded by the preview: example data is explicitly simulated.

## Local development

From the repository root, using Node 22.12+ and Corepack-managed Yarn 4:

```sh
cd website
corepack yarn install --immutable
corepack yarn dev
```

Open the URL printed by Astro (normally http://localhost:4321). For a production build:

```sh
corepack yarn check
corepack yarn build
corepack yarn test
corepack yarn preview
```

`website/` is its own private Yarn project with its own lockfile. Its dependencies and generated output are not part of the npm library. The root package's existing `files` allowlist continues to publish only its distribution, changelog, and npm's standard metadata files.

## Maintaining content

- `content/`: short, hand-written onboarding guides with frontmatter (`title`, `description`, `group`, `order`).
- `../docs/reference.md`: the complete API and recipe reference, divided into pages at each `####` heading. Keep headings stable to preserve URLs.
- `../docs/{algorithms,clients,mock-content,schema}.md`: advanced guides.
- `scripts/prepare-docs.mjs`: generates ignored `.generated/docs/` before development, checking, or building. Restart the dev command after editing source Markdown outside this website; do not edit generated files.
- `/llms.txt`, `/llms-full.txt`, and `/docs/<slug>.md`: generated from exactly the same content collection as the human-facing pages. Search uses the same collection.

After changing public docs, also run `corepack yarn llms:generate` from the repository root to update the repository's AI files. Those include contributor guidance; the website's corpus focuses on building applications.

## Vercel CLI deployment (after local review)

No Vercel project or domain is provisioned by local development. `hooks.bitsocial.net` is a proposed domain, not a configured one.

Deploy from the **repository root**, keeping the sibling package manifest and Markdown in the upload. Create/select a dedicated Vercel project and set its Root Directory to `website`, with “Include source files outside of the Root Directory in the Build Step” enabled. Do not run `vercel deploy website` in isolation: the build intentionally reads the repository docs and version.

```sh
vercel link
vercel project inspect --non-interactive
vercel pull --environment=preview
vercel build
vercel deploy --prebuilt
```

Verify the linked team/project before building or deploying. Once the preview is approved, use `vercel build --prod` followed by `vercel deploy --prebuilt --prod`. Do not set a Git integration or production alias until publication is intended.

Set `SITE_URL` to the final production origin (for example `https://hooks.bitsocial.net`) in the production build environment to generate canonical URLs and the sitemap. Leave it unset for local/preview builds; those emit `robots.txt` with `Disallow: /` and omit canonicals. Website `vercel.json` supplies the static build/install settings; no server adapter is needed.

## Assets and license

The Bitsocial logo, favicon, and Exo font are reused from [bitsocial-web](https://github.com/bitsocialnet/bitsocial-web). The Exo SIL Open Font License is included in `public/fonts/OFL-Exo.txt`. Website source follows the repository's GPL-3.0-or-later license.
