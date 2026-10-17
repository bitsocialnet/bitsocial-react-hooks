import { defineConfig } from "astro/config";
import react from "@astrojs/react";

export default defineConfig({
  site: process.env.SITE_URL || undefined,
  output: "static",
  integrations: [react()],
  trailingSlash: "always",
  devToolbar: { enabled: false },
  markdown: {
    shikiConfig: { themes: { light: "github-light", dark: "github-dark" }, defaultColor: false },
  },
});
