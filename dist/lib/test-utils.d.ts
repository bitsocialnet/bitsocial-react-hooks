type RenderHookOptions<Props> = {
    initialProps?: Props;
    trackHistory?: boolean;
};
declare function renderHook<Result, Props>(callback: (props: Props) => Result, options?: RenderHookOptions<Props>): {
    result: {
        current: Result | null;
        all: Result[];
    };
    rerender: (rerenderCallbackProps: Props) => void;
    unmount: () => void;
};
type WaitForOptions = {
    timeout?: number;
    interval?: number;
};
export { renderHook };
declare const testUtils: {
    silenceTestWasNotWrappedInActWarning: () => () => void;
    silenceUpdateUnmountedComponentWarning: () => () => void;
    silenceOverlappingActWarning: () => () => void;
    silenceReactWarnings: () => void;
    restoreAll: () => void;
    resetStores: () => Promise<void>;
    resetDatabasesAndStores: () => Promise<void>;
    createWaitFor: (rendered: any, waitForOptions?: WaitForOptions) => (waitForFunction: Function) => Promise<void>;
    renderHookWithHistory: <Result, Props>(callback: (props: Props) => Result, options?: RenderHookOptions<Props>) => {
        result: {
            current: Result | null;
            all: Result[];
        };
        rerender: (rerenderCallbackProps: Props) => void;
        unmount: () => void;
    };
    silenceWaitForWarning: boolean;
};
export default testUtils;
//# sourceMappingURL=test-utils.d.ts.map