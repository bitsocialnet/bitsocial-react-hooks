export {};
// The build embeds the version it was generated from; show the latest npm release once the registry answers.
fetch("https://registry.npmjs.org/@bitsocial%2Fbitsocial-react-hooks/latest")
  .then((response) => (response.ok ? response.json() : null))
  .then((manifest) => {
    if (typeof manifest?.version !== "string") return;
    for (const element of document.querySelectorAll("[data-package-version]")) element.textContent = `v${manifest.version}`;
  })
  .catch(() => {});
// Add controls only when JavaScript is available; the examples themselves are static HTML.
for (const block of document.querySelectorAll<HTMLPreElement>("pre:not([data-no-copy])")) {
  if (block.closest("#playground")) continue;
  const button = document.createElement("button");
  button.className = "copy-code";
  button.textContent = "Copy";
  button.setAttribute("aria-label", "Copy code");
  button.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(block.querySelector("code")?.textContent || "");
      button.textContent = "Copied";
    } catch {
      button.textContent = "Select code to copy";
    }
    setTimeout(() => {
      button.textContent = "Copy";
    }, 2000);
  });
  const frame = document.createElement("div");
  frame.className = "code-frame";
  block.before(frame);
  frame.append(block, button);
}
