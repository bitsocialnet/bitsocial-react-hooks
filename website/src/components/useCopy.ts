import { useEffect, useRef, useState } from "react";

export type CopyState = "idle" | "copied" | "failed";

// The copied/failed state reverts after a moment, so the control reads "copy" again.
export function useCopy(text: string) {
  const [state, setState] = useState<CopyState>("idle");
  const reset = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(reset.current), []);

  async function copy() {
    clearTimeout(reset.current);
    let copied = true;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      copied = false;
    }
    setState(copied ? "copied" : "failed");
    reset.current = setTimeout(() => setState("idle"), 2000);
    return copied;
  }

  return [state, copy] as const;
}
