// SPDX-License-Identifier: AGPL-3.0-only
// Adapted from bitsocialnet/bitsocial-web, about/src/lib/webgl-context-recovery.ts (efec9611).
// Modified 2026-10-11 for the Hooks docs: Astro theme, layout, and motion preferences.
// Modified 2026-11-11: back off rapid rebuild retries.
// Upstream license and attribution: website/LICENSES/bitsocial-web-AGPL-3.0.txt.
import { useCallback, useEffect, useRef, useState } from "react";

// Safari drops the GPU contexts of tabs that sit in the background (iPadOS does
// it within a day), so a tab the user returns to can fire `webglcontextlost` on
// a page that is otherwise still alive and hydrated. That loss is recoverable:
// rebuild the scene on a fresh canvas instead of degrading the hero to the
// static fallback until the next manual reload.
const RAPID_LOSS_WINDOW_MS = 10_000;
const MAX_RAPID_LOSSES = 3;
// A rebuild that fails right away (e.g. the renderer constructor throws while the
// GPU process is still restarting) would otherwise retry in the next commit and
// spend the whole budget within a few frames. Waiting 2 s, then 4 s, gives the
// GPU seconds to return. The wait is excluded from the rapid-loss gap, so a
// context that keeps dying within RAPID_LOSS_WINDOW_MS of each rebuild still
// reaches the fallback.
const RAPID_RETRY_DELAY_MS = 2_000;

type WebGLContextLike = Pick<WebGLRenderingContext, "isContextLost">;

/**
 * Tracks WebGL context loss for a canvas-backed scene and asks the caller to
 * rebuild instead of treating the loss as a permanent init failure.
 *
 * Bump `contextGeneration` into the scene effect's deps and use it as the
 * canvas `key`: a brand new canvas element is guaranteed a fresh context,
 * whereas a canvas whose context was purged only gets one back if the browser
 * chooses to fire `webglcontextrestored`.
 *
 * Every returned callback is stable for the component's lifetime, so callers can
 * hold them in a scene effect without that effect ever rebuilding on a render.
 */
export function useWebGLContextRecovery(onUnrecoverable?: () => void) {
  const [contextGeneration, setContextGeneration] = useState(0);
  const [isRecoveryPending, setIsRecoveryPending] = useState(false);
  const recoveryPendingRef = useRef(false);
  const stoppedRecoveringRef = useRef(false);
  const rapidLossCountRef = useRef(0);
  const lastLossAtRef = useRef(0);
  const retryDelayRef = useRef(0);
  const contextRef = useRef<WebGLContextLike | null>(null);
  const onUnrecoverableRef = useRef(onUnrecoverable);

  useEffect(() => {
    onUnrecoverableRef.current = onUnrecoverable;
  }, [onUnrecoverable]);

  const requestContextRecovery = useCallback(() => {
    if (recoveryPendingRef.current || stoppedRecoveringRef.current) return;

    const now = performance.now();
    const isRapidLoss = now - lastLossAtRef.current < RAPID_LOSS_WINDOW_MS;
    lastLossAtRef.current = now;
    rapidLossCountRef.current = isRapidLoss ? rapidLossCountRef.current + 1 : 1;

    // A context that keeps dying seconds after each rebuild belongs to a device
    // that cannot hold the scene; only then is the static fallback the right
    // answer. A tab resumed days apart never trips this.
    if (rapidLossCountRef.current > MAX_RAPID_LOSSES) {
      stoppedRecoveringRef.current = true;
      onUnrecoverableRef.current?.();
      return;
    }

    // The first rebuild after a loss is immediate; rapid retries after it back off.
    retryDelayRef.current = (rapidLossCountRef.current - 1) * RAPID_RETRY_DELAY_MS;
    // Measure the next loss from the delayed rebuild, so the wait never counts as
    // time the rebuilt context survived.
    lastLossAtRef.current += retryDelayRef.current;
    recoveryPendingRef.current = true;
    setIsRecoveryPending(true);
  }, []);

  const handleContextLost = useCallback(
    (event: Event) => {
      // Without preventDefault the browser never offers this canvas a context again.
      event.preventDefault();
      requestContextRecovery();
    },
    [requestContextRecovery],
  );

  const registerContext = useCallback((context: WebGLContextLike | null) => {
    contextRef.current = context;
  }, []);

  useEffect(() => {
    // A tab can also come back with a silently dead context and no loss event,
    // so re-check health whenever the page is shown again.
    const checkContextHealth = () => {
      if (document.visibilityState !== "visible") return;
      if (!contextRef.current?.isContextLost()) return;
      requestContextRecovery();
    };

    document.addEventListener("visibilitychange", checkContextHealth);
    window.addEventListener("pageshow", checkContextHealth);

    return () => {
      document.removeEventListener("visibilitychange", checkContextHealth);
      window.removeEventListener("pageshow", checkContextHealth);
    };
  }, [requestContextRecovery]);

  useEffect(() => {
    if (!isRecoveryPending) return;

    const rebuild = () => {
      recoveryPendingRef.current = false;
      setIsRecoveryPending(false);
      setContextGeneration((generation) => generation + 1);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      rebuild();
    };

    const rebuildWhenVisible = () => {
      // Contexts created for a hidden tab are refused or dropped again on iOS, so
      // wait until the page is actually on screen before rebuilding.
      if (document.visibilityState === "visible") {
        rebuild();
        return;
      }
      document.addEventListener("visibilitychange", handleVisibilityChange);
    };

    const retryDelay = retryDelayRef.current;
    let retryTimeoutId: ReturnType<typeof setTimeout> | undefined;
    if (retryDelay > 0) {
      retryTimeoutId = setTimeout(rebuildWhenVisible, retryDelay);
    } else {
      rebuildWhenVisible();
    }

    return () => {
      clearTimeout(retryTimeoutId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [isRecoveryPending]);

  return { contextGeneration, handleContextLost, registerContext, requestContextRecovery };
}
