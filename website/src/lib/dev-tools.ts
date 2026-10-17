// This module is loaded only behind import.meta.env.DEV in Base.astro.
// Optional tooling must never block the site or appear in production output.
let disposed = false;
let cleanup: (() => void) | undefined;
import.meta.hot?.dispose(() => {
  disposed = true;
  cleanup?.();
});

Promise.all([import("react"), import("react-dom/client"), import("agentation")])
  .then(([{ createElement }, { createRoot }, { Agentation }]) => {
    if (disposed) return;
    const container = document.createElement("div");
    container.id = "agentation-dev-tools";
    document.body.appendChild(container);
    const root = createRoot(container);
    cleanup = () => {
      root.unmount();
      container.remove();
    };
    root.render(createElement(Agentation));
  })
  .catch((error: unknown) => {
    console.warn("Agentation could not load:", error);
  });
