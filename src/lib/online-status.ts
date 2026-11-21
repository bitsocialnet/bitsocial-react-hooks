import assert from "./assert";

// Whether the device has network access. Feeds read it to decide whether an expired community cache
// may still be shown (offline) or should wait for the next community update (online).
let onlineStatus: boolean | undefined;

// The feeds store listens here: a feed computed while online has no other event to recompute it
// when the device turns out to be offline (an app that starts offline gets no community update).
const onlineStatusListeners = new Set<() => void>();

/**
 * Set the device's online status, for runtimes without `navigator.onLine` such as React Native
 * (e.g. from NetInfo). `undefined` goes back to `navigator.onLine`. A change recomputes feeds.
 */
export const setOnlineStatus = (online: boolean | undefined) => {
  assert(
    online === undefined || typeof online === "boolean",
    `setOnlineStatus invalid online argument '${online}' not a boolean or undefined`,
  );
  const wasOnline = isOnline();
  onlineStatus = online;
  if (isOnline() !== wasOnline) {
    onlineStatusListeners.forEach((listener) => listener());
  }
};

// Without a signal (React Native has no navigator.onLine), assume online: reading "unknown" as
// offline would build feeds from expired caches on every device that is in fact online.
export const isOnline = (): boolean => {
  if (onlineStatus !== undefined) {
    return onlineStatus;
  }
  const navigatorOnLine = globalThis.navigator?.onLine;
  return typeof navigatorOnLine === "boolean" ? navigatorOnLine : true;
};

// Call `listener` whenever setOnlineStatus changes isOnline(). Returns the unsubscribe function.
export const subscribeToOnlineStatus = (listener: () => void) => {
  onlineStatusListeners.add(listener);
  return () => {
    onlineStatusListeners.delete(listener);
  };
};
