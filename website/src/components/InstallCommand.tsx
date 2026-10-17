import { useState } from "react";

const command = "npm install @bitsocial/bitsocial-react-hooks";

export default function InstallCommand() {
  const [status, setStatus] = useState("");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setStatus("Install command copied");
    } catch {
      setStatus("Select the install command to copy it");
    }
  };

  return (
    <div className="install-line">
      <span aria-hidden="true">$</span>
      <code>{command}</code>
      <button
        type="button"
        id="copy-install"
        className="icon-button"
        aria-label="Copy install command"
        data-copied={status === "Install command copied" || undefined}
        onClick={() => void copy()}
        onBlur={() => setStatus("")}
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
          <rect x="8" y="8" width="12" height="12" rx="2" />
          <path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" />
        </svg>
      </button>
      <span id="install-status" className="sr-only" role="status">
        {status}
      </span>
    </div>
  );
}
