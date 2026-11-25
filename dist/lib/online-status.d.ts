/**
 * Set the device's online status, for runtimes without `navigator.onLine` such as React Native
 * (e.g. from NetInfo). `undefined` goes back to `navigator.onLine`. A change recomputes feeds.
 */
export declare const setOnlineStatus: (online: boolean | undefined) => void;
export declare const isOnline: () => boolean;
export declare const subscribeToOnlineStatus: (listener: () => void) => () => void;
//# sourceMappingURL=online-status.d.ts.map