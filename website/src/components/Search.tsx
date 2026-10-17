import { useCallback, useEffect, useRef, useState } from "react";

type SearchEntry = { title: string; group: string; url: string; text: string };

export default function Search() {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const request = useRef<AbortController | null>(null);
  const [index, setIndex] = useState<SearchEntry[] | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");

  const openSearch = useCallback(async () => {
    if (!dialog.current || dialog.current.open) return;
    dialog.current.showModal();
    input.current?.focus();
    if (index || request.current) return;

    const controller = new AbortController();
    request.current = controller;
    setStatus("loading");
    try {
      const response = await fetch("/search.json", { signal: controller.signal });
      if (!response.ok) throw new Error("Search unavailable");
      const entries: SearchEntry[] = await response.json();
      if (!controller.signal.aborted) {
        setIndex(entries);
        setStatus("ready");
      }
    } catch {
      if (!controller.signal.aborted) setStatus("error");
    } finally {
      if (request.current === controller) request.current = null;
    }
  }, [index]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        void openSearch();
      }
    };
    document.addEventListener("keydown", handleShortcut);
    return () => document.removeEventListener("keydown", handleShortcut);
  }, [openSearch]);

  useEffect(() => () => request.current?.abort(), []);

  const normalizedQuery = query.trim().toLowerCase();
  const terms = normalizedQuery.split(/\s+/).filter(Boolean);
  const matches = (index ?? [])
    .filter((entry) =>
      terms.every((term) => `${entry.title} ${entry.text}`.toLowerCase().includes(term)),
    )
    .sort(
      (a, b) =>
        Number(b.title.toLowerCase().includes(normalizedQuery)) -
        Number(a.title.toLowerCase().includes(normalizedQuery)),
    )
    .slice(0, 12);
  const message =
    status === "loading"
      ? "Loading documentation…"
      : status === "error"
        ? "Search could not load. Close and reopen to retry, or browse the docs."
        : status === "idle"
          ? "Type to find a hook or a guide."
          : !normalizedQuery
            ? "Start here, or search for a hook."
            : matches.length
              ? `${matches.length === 12 ? "Top 12" : matches.length} results for “${query.trim()}”`
              : "No results. Try “feed”, “account”, or “publishing”.";

  return (
    <>
      <button
        type="button"
        className="search-trigger"
        onClick={() => void openSearch()}
        aria-label="Search documentation"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          aria-hidden="true"
        >
          <circle cx="10.5" cy="10.5" r="6.5" />
          <path d="m16 16 4 4" />
        </svg>
        <span>Search docs</span>
        <kbd>⌘ K</kbd>
      </button>
      <dialog
        ref={dialog}
        id="search-dialog"
        aria-labelledby="search-title"
        onKeyDown={(event) => {
          // Search inputs consume Escape to clear text before the dialog can close.
          if (event.key === "Escape") {
            event.preventDefault();
            dialog.current?.close();
          }
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) dialog.current?.close();
        }}
      >
        <div className="search-top">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            aria-hidden="true"
          >
            <circle cx="10.5" cy="10.5" r="6.5" />
            <path d="m16 16 4 4" />
          </svg>
          <label id="search-title" className="sr-only" htmlFor="docs-search">
            Search documentation
          </label>
          <input
            ref={input}
            id="docs-search"
            type="search"
            placeholder="Search hooks, guides, and recipes…"
            autoComplete="off"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <button
            type="button"
            className="icon-button"
            onClick={() => dialog.current?.close()}
            aria-label="Close search"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              aria-hidden="true"
            >
              <path d="m6 6 12 12M6 18 18 6" />
            </svg>
          </button>
        </div>
        <p id="search-status" className="search-status" role="status">
          {message}
        </p>
        <div id="search-results">
          {matches.map((entry) => {
            const position = normalizedQuery ? entry.text.toLowerCase().indexOf(terms[0]) : 0;
            const start = Math.max(0, position - 45);
            return (
              <a key={entry.url} href={entry.url} className="search-result">
                <small>{entry.group}</small>
                <strong>{entry.title}</strong>
                <span>
                  {start ? "…" : ""}
                  {entry.text.slice(start, start + 150)}…
                </span>
              </a>
            );
          })}
        </div>
        <div className="search-hint">
          <span>
            <kbd>Tab</kbd> to browse results
          </span>
          <span>
            <kbd>Esc</kbd> to close
          </span>
        </div>
      </dialog>
    </>
  );
}
