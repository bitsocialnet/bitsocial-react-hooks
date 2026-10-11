export {};
const themeButton = document.querySelector<HTMLButtonElement>("#theme-toggle");
function updateThemeLabel() {
  themeButton?.setAttribute(
    "aria-label",
    `Switch to ${document.documentElement.dataset.theme === "dark" ? "light" : "dark"} theme`,
  );
}
updateThemeLabel();
themeButton?.addEventListener("click", () => {
  const theme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem("hooks-theme", theme);
  } catch {
    /* Theme still works without persistence. */
  }
  updateThemeLabel();
});

// Add controls only when JavaScript is available; the examples themselves are static HTML.
for (const block of document.querySelectorAll<HTMLPreElement>("pre:not([data-no-copy])")) {
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

type SearchEntry = { title: string; group: string; url: string; text: string };
const dialog = document.querySelector<HTMLDialogElement>("#search-dialog")!;
const input = document.querySelector<HTMLInputElement>("#docs-search")!;
const searchStatus = document.querySelector<HTMLElement>("#search-status")!;
const results = document.querySelector<HTMLElement>("#search-results")!;
let index: SearchEntry[] | undefined;
let loading: Promise<void> | undefined;
function renderResults() {
  const query = input.value.trim().toLowerCase();
  results.replaceChildren();
  if (!index) return;
  const terms = query.split(/\s+/).filter(Boolean);
  const matches = index
    .filter((entry) =>
      terms.every((term) => `${entry.title} ${entry.text}`.toLowerCase().includes(term)),
    )
    .sort(
      (a, b) =>
        Number(b.title.toLowerCase().includes(query)) -
        Number(a.title.toLowerCase().includes(query)),
    )
    .slice(0, 12);
  searchStatus.textContent = query
    ? matches.length
      ? `${matches.length === 12 ? "Top 12" : matches.length} results for “${input.value.trim()}”`
      : "No results. Try “feed”, “account”, or “publishing”."
    : "Start here, or search for a hook.";
  for (const entry of matches) {
    const link = document.createElement("a");
    link.href = entry.url;
    link.className = "search-result";
    const group = document.createElement("small");
    group.textContent = entry.group;
    const title = document.createElement("strong");
    title.textContent = entry.title;
    const summary = document.createElement("span");
    const position = query ? entry.text.toLowerCase().indexOf(terms[0]) : 0;
    const start = Math.max(0, position - 45);
    summary.textContent = `${start ? "…" : ""}${entry.text.slice(start, start + 150)}…`;
    link.append(group, title, summary);
    results.append(link);
  }
}
function openSearch() {
  if (dialog.open) return;
  dialog.showModal();
  input.focus();
  if (index) {
    renderResults();
    return;
  }
  searchStatus.textContent = "Loading documentation…";
  loading ??= fetch("/search.json")
    .then(async (response) => {
      if (!response.ok) throw new Error("Search unavailable");
      index = await response.json();
      renderResults();
    })
    .catch(() => {
      searchStatus.textContent =
        "Search could not load. Close and reopen to retry, or browse the docs.";
    })
    .finally(() => {
      loading = undefined;
    });
}
for (const button of document.querySelectorAll("[data-search-open]"))
  button.addEventListener("click", openSearch);
document.querySelector("[data-search-close]")?.addEventListener("click", () => dialog.close());
dialog.addEventListener("click", (event) => {
  if (event.target === dialog) dialog.close();
});
input.addEventListener("input", renderResults);
document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    openSearch();
  }
});
