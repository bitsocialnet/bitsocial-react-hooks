import { defineConfig } from "astro/config";

export default defineConfig({
  site: process.env.SITE_URL || undefined,
  output: "static",
  trailingSlash: "always",
  devToolbar: { enabled: false },
  markdown: {
    shikiConfig: { themes: { light: "github-light", dark: "github-dark" }, defaultColor: false },
  },
});
