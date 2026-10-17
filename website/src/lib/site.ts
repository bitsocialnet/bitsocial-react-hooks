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
// The layout renders the Lucide icons into a template, so these buttons match the React ones.
const copyIcons = document.querySelector<HTMLTemplateElement>("#copy-icons")?.content;
const copyLabel = (icon: "copy" | "check", text: string) => [
  copyIcons?.querySelector(`[data-icon="${icon}"]`)?.cloneNode(true) ?? "",
  text,
];
for (const block of document.querySelectorAll<HTMLPreElement>("pre:not([data-no-copy])")) {
  if (block.closest("#playground")) continue;
  const button = document.createElement("button");
  let reset: ReturnType<typeof setTimeout> | undefined;
  button.type = "button";
  button.className = "copy-code";
  button.replaceChildren(...copyLabel("copy", "Copy"));
  button.setAttribute("aria-label", "Copy code");
  button.addEventListener("click", async () => {
    clearTimeout(reset);
    try {
      await navigator.clipboard.writeText(block.querySelector("code")?.textContent || "");
      button.dataset.state = "copied";
      button.replaceChildren(...copyLabel("check", "Copied"));
    } catch {
      button.dataset.state = "failed";
      button.replaceChildren(...copyLabel("copy", "Select code to copy"));
    }
    reset = setTimeout(() => {
      delete button.dataset.state;
      button.replaceChildren(...copyLabel("copy", "Copy"));
    }, 2000);
  });
  const frame = document.createElement("div");
  frame.className = "code-frame";
  block.before(frame);
  frame.append(block, button);
}
