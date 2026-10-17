import * as React from "react";
import { useEffect, useRef, useState, type ComponentProps } from "react";
import { LiveEditor, LiveError, LivePreview, LiveProvider } from "react-live";
import * as simulatedHooks from "./playground-hooks";

const examples = [
  { id: "feed", label: "A feed", filename: "YourFeed.jsx", hook: "useFeed", slug: "feeds-hooks" },
  {
    id: "community",
    label: "A community",
    filename: "YourCommunity.jsx",
    hook: "useCommunity",
    slug: "communities-hooks",
  },
  {
    id: "thread",
    label: "A conversation",
    filename: "YourThread.jsx",
    hook: "useReplies",
    slug: "comments-hooks",
  },
] as const;

type Example = (typeof examples)[number]["id"];
type Props = { sources: Record<Example, string> };

// Hooks the examples don't simulate fail with a clear message instead of "is not a function".
const hooksModule = new Proxy<Record<string, unknown>>(
  { ...simulatedHooks },
  {
    get(target, key) {
      if (typeof key !== "string" || key in target || !key.startsWith("use")) return target[key as string];
      return () => {
        throw new Error(`${key} isn't simulated here. The preview supports ${Object.keys(target).join(", ")}.`);
      };
    },
  },
);
const modules: Record<string, unknown> = { react: React, "@bitsocial/bitsocial-react-hooks": hooksModule };

// react-live compiles `import` statements to require() calls, so the examples keep their real imports.
const scope = {
  exports: {},
  require(name: string) {
    if (name in modules) return modules[name];
    throw new Error(`The preview can import react and @bitsocial/bitsocial-react-hooks, not ${name}.`);
  },
  __exampleProps: { communityName: "builders.bso", commentCid: "QmSamplePost1" },
};

// Render the first component the code defines, with the props the examples expect.
function addRender(code: string) {
  if (/\brender\s*\(/.test(code)) return code;
  const name = /(?:function|const|let|class)\s+([A-Z][\w$]*)/.exec(code)?.[1];
  if (!name) throw new Error("Define a component, such as function YourFeed() { … }, to preview it.");
  return `${code}\nrender(<${name} {...__exampleProps} />);`;
}

// Token colors come from CSS variables, so the editor follows the site's theme switch.
const theme: ComponentProps<typeof LiveProvider>["theme"] = {
  plain: { color: "var(--code-text)", backgroundColor: "transparent" },
  styles: [
    { types: ["comment", "prolog", "doctype", "cdata"], style: { color: "var(--code-comment)", fontStyle: "italic" } },
    { types: ["keyword", "module", "control-flow"], style: { color: "var(--code-keyword)" } },
    { types: ["string", "attr-value", "template-string", "char"], style: { color: "var(--code-string)" } },
    { types: ["function", "class-name", "maybe-class-name"], style: { color: "var(--code-function)" } },
    { types: ["tag", "selector"], style: { color: "var(--code-tag)" } },
    { types: ["attr-name", "number", "boolean", "constant", "property"], style: { color: "var(--code-constant)" } },
  ],
};

function CopyButton({ source }: { source: string }) {
  const [status, setStatus] = useState("Copy");

  async function copy() {
    try {
      await navigator.clipboard.writeText(source);
      setStatus("Copied");
    } catch {
      setStatus("Select code to copy");
    }
  }

  return (
    <button
      type="button"
      className="copy-code"
      aria-label="Copy code"
      onClick={() => void copy()}
      onBlur={() => setStatus("Copy")}
    >
      <span aria-live="polite">{status}</span>
    </button>
  );
}

export default function Playground({ sources }: Props) {
  const [example, setExample] = useState<Example>("feed");
  // Editable drafts of the static build-time sources, which stay the Reset baseline.
  const [codes, setCodes] = useState(sources);
  const activeExample = examples.find(({ id }) => id === example)!;
  const code = codes[example];
  const edited = code !== sources[example];
  const editorFrame = useRef<HTMLDivElement>(null);

  // react-live renders the contentEditable <pre> without a way to pass ARIA props to it.
  useEffect(() => {
    const editor = editorFrame.current?.querySelector("pre");
    editor?.setAttribute("role", "textbox");
    editor?.setAttribute("aria-multiline", "true");
    editor?.setAttribute("aria-label", `${activeExample.filename} source, editable`);
  }, [activeExample.filename]);

  return (
    <section id="playground" className="playground" aria-label="Interactive hook examples">
      <div className="playground-toolbar">
        <div className="example-tabs" role="group" aria-label="Choose an example">
          {examples.map(({ id, label }) => (
            <button
              type="button"
              key={id}
              data-example={id}
              aria-pressed={id === example}
              onClick={() => setExample(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="sample-badge">
          <span /> Editable
        </span>
      </div>
      <LiveProvider code={code} scope={scope} transformCode={addRender} theme={theme} language="jsx" noInline>
        <div className="playground-body">
          <div className="example-code">
            <div className="pane-label">
              <span id="example-filename">{activeExample.filename}</span>
              {edited ? (
                <button type="button" className="reset-code" onClick={() => setCodes({ ...codes, [example]: sources[example] })}>
                  Reset
                </button>
              ) : (
                <span>React</span>
              )}
            </div>
            <div className="code-frame" ref={editorFrame}>
              <LiveEditor
                className="live-editor"
                tabMode="focus"
                onChange={(next) => setCodes((current) => ({ ...current, [example]: next }))}
              />
              <CopyButton key={example} source={code} />
            </div>
          </div>
          <div className="example-preview">
            <div className="pane-label">
              <span>Your app, your design</span>
              <span>Live preview</span>
            </div>
            <LivePreview className="live-preview" aria-live="polite" />
            <LiveError className="live-error" role="alert" />
          </div>
        </div>
      </LiveProvider>
      <div className="playground-footnote">
        <span>Real hook APIs. Simulated content. Nothing is published.</span>
        <a id="example-doc-link" href={`/docs/api/${activeExample.slug}/`}>
          Explore {activeExample.hook} <span aria-hidden="true">↗</span>
        </a>
      </div>
    </section>
  );
}
