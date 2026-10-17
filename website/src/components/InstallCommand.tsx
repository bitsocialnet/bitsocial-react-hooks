import { Check, Copy } from "lucide-react";
import { useRef } from "react";
import { useCopy } from "./useCopy";

const command = "npm install @bitsocial/bitsocial-react-hooks";

export default function InstallCommand() {
  const [state, copy] = useCopy(command);
  const code = useRef<HTMLElement>(null);

  return (
    <>
      <button
        type="button"
        id="copy-install"
        className="install-line"
        aria-label={`Copy install command: ${command}`}
        title="Copy to clipboard"
        data-state={state}
        onClick={async () => {
          // Without clipboard access, select the command so the keyboard shortcut still works.
          if (!(await copy()) && code.current) getSelection()?.selectAllChildren(code.current);
        }}
      >
        <span aria-hidden="true">$</span>
        <code ref={code}>{command}</code>
        {state === "copied" ? <Check size={16} /> : <Copy size={16} />}
      </button>
      <span id="install-status" className="sr-only" role="status">
        {state === "copied"
          ? "Install command copied"
          : state === "failed"
            ? "Install command selected, copy it with your keyboard"
            : ""}
      </span>
    </>
  );
}
