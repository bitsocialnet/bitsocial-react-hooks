# Bitsocial React Hooks website

The public developer site for `@bitsocial/bitsocial-react-hooks`. Astro generates the documentation and highlighted examples as static HTML; React/TypeScript islands handle the playground, search, theme switch, install copy control, and Bitsocial polygon mesh. No hooks runtime or protocol connections are loaded by the preview: example data is explicitly simulated.

## Local development

From the repository root, using Corepack-managed Yarn 4 and the website's Node 22 pin (`website/.nvmrc`; React Doctor requires 22.13+):

```sh
cd website
corepack yarn install --immutable
corepack yarn start
```

`yarn start` serves the site through [Portless](https://github.com/vercel-labs/portless) at https://hooks.bitsocial.localhost and opens it in your browser. On a feature branch, or when that name is taken, the branch becomes a subdomain (for example https://codex-feature-website.hooks.bitsocial.localhost), so worktrees can run side by side. Set `BROWSER=none` to skip opening the browser, or `PORTLESS=0` to use plain `astro dev` on http://127.0.0.1:4321. `yarn dev` still runs plain Astro.

For a production build:

```sh
corepack yarn check
corepack yarn doctor
corepack yarn build
corepack yarn test
corepack yarn preview
```

`website/` is its own private Yarn project with its own lockfile. Its dependencies and generated output are not part of the npm library. The root package's existing `files` allowlist continues to publish only its distribution, changelog, and npm's standard metadata files.

Agentation appears in the bottom-right corner during `yarn start` and `yarn dev`. Activate it to annotate the page and copy feedback for your coding agent. It runs locally without an MCP endpoint and is excluded from production builds and `yarn preview`. Its optional asynchronous loading cannot block the website; HMR disposes its React root.

`yarn doctor`, `yarn doctor:score`, and `yarn doctor:verbose` run the pinned React Doctor against this website (including Astro and TSX source), with telemetry disabled. Findings are advisory; inspect their context before changing behavior.

The mesh loads on the homepage when visible. It follows the site's theme, renders a still frame for reduced-motion preferences, pauses offscreen or in hidden tabs, and falls back to a static mesh when WebGL is unavailable. The docs routes do not load Three.js, and their syntax highlighting stays out of the browser bundle. Only the homepage playground ships a highlighter, for its editor.

## Maintaining content

- `content/`: short, hand-written onboarding guides with frontmatter (`title`, `description`, `group`, `order`).
- `../docs/reference.md`: the complete API and recipe reference, divided into pages at each `####` heading. Keep headings stable to preserve URLs.
- `../docs/{algorithms,clients,mock-content,schema}.md`: advanced guides.
- `scripts/prepare-docs.mjs`: generates ignored `.generated/docs/` before development, checking, or building. Restart the dev command after editing source Markdown outside this website; do not edit generated files.
- `/llms.txt`, `/llms-full.txt`, and `/docs/<slug>.md`: generated from exactly the same content collection as the human-facing pages. Search uses the same collection.
- `src/components/Playground.astro`: the playground's editable example sources. [react-live](https://github.com/FormidableLabs/react-live) compiles and renders edits in the page; `src/components/playground-hooks.ts` simulates the hooks the examples import. Keep its option and return shapes in line with `../src/types.ts`.
- The hero badge and footer render the build's package version, then show the latest npm release once the registry responds.

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

The Bitsocial logo, favicon, and Exo font are reused from [bitsocial-web](https://github.com/bitsocialnet/bitsocial-web). The Exo SIL Open Font License is included in `public/fonts/OFL-Exo.txt`.

The polygon mesh and its performance/context-recovery helpers are adapted from `bitsocial-web/about` (upstream commit `efec9611`), preserving the upstream AGPL-3.0 license in [LICENSES/bitsocial-web-AGPL-3.0.txt](LICENSES/bitsocial-web-AGPL-3.0.txt) and source attribution in those files. Other source retains the repository's GPL-3.0-or-later license. Keep these notices with redistributions; the website's source is linked in its header and footer.
