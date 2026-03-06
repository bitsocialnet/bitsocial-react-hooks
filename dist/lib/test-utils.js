var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
import { render, act as tlAct } from "@testing-library/react";
import React from "react";
import { resetCommentsStore, resetCommentsDatabaseAndStore } from "../stores/comments";
import { resetSubplebbitsStore, resetSubplebbitsDatabaseAndStore } from "../stores/subplebbits";
import { resetAccountsStore, resetAccountsDatabaseAndStore } from "../stores/accounts";
import { resetFeedsStore, resetFeedsDatabaseAndStore } from "../stores/feeds";
import { resetSubplebbitsPagesStore, resetSubplebbitsPagesDatabaseAndStore, } from "../stores/subplebbits-pages";
import { resetAuthorsCommentsStore, resetAuthorsCommentsDatabaseAndStore, } from "../stores/authors-comments";
import { resetRepliesStore, resetRepliesDatabaseAndStore } from "../stores/replies";
import { resetRepliesPagesStore, resetRepliesPagesDatabaseAndStore } from "../stores/replies-pages";
// Custom renderHook that sets result.current synchronously during render,
// matching @testing-library/react-hooks behavior. RTL v16's renderHook defers
// result.current via useEffect, which breaks polling-based waitFor patterns
// when Zustand store updates trigger re-renders outside act().
function renderHook(callback, options) {
    const _a = options || {}, { initialProps } = _a, renderOptions = __rest(_a, ["initialProps"]);
    const result = { current: null, all: [] };
    function TestComponent({ renderCallbackProps }) {
        const pendingResult = callback(renderCallbackProps);
        result.current = pendingResult;
        result.all.push(pendingResult);
        return null;
    }
    const { rerender: baseRerender, unmount } = render(React.createElement(TestComponent, { renderCallbackProps: initialProps }), renderOptions);
    function rerender(rerenderCallbackProps) {
        return baseRerender(React.createElement(TestComponent, { renderCallbackProps: rerenderCallbackProps }));
    }
    return { result, rerender, unmount };
}
const restorables = [];
export const silenceUpdateUnmountedComponentWarning = () => {
    const originalError = console.error;
    console.error = (...args) => {
        if (/Can't perform a React state update on an unmounted component/.test(args[0])) {
            return;
        }
        originalError.call(console, ...args);
    };
    const restore = () => {
        console.error = originalError;
    };
    restorables.push(restore);
    return restore;
};
export const silenceTestWasNotWrappedInActWarning = () => {
    const originalError = console.error;
    console.error = (...args) => {
        if (/inside a test was not wrapped in act/.test(args[0])) {
            return;
        }
        originalError.call(console, ...args);
    };
    const restore = () => {
        console.error = originalError;
    };
    restorables.push(restore);
    return restore;
};
// this warning is usually good to have, so don't include it in silenceReactWarnings
export const silenceOverlappingActWarning = () => {
    const originalError = console.error;
    console.error = (...args) => {
        if (/overlapping act\(\) calls/.test(args[0])) {
            return;
        }
        originalError.call(console, ...args);
    };
    const restore = () => {
        console.error = originalError;
    };
    restorables.push(restore);
    return restore;
};
export const silenceReactWarnings = () => {
    silenceUpdateUnmountedComponentWarning();
    silenceTestWasNotWrappedInActWarning();
};
const restoreAll = () => {
    for (const restore of restorables) {
        restore();
    }
};
const createWaitFor = (rendered, waitForOptions) => {
    if (!(rendered === null || rendered === void 0 ? void 0 : rendered.result)) {
        throw Error(`createWaitFor invalid 'rendered' argument`);
    }
    const waitFor = (waitForFunction) => __awaiter(void 0, void 0, void 0, function* () {
        const stackTraceLimit = Error.stackTraceLimit;
        Error.stackTraceLimit = 10;
        const errorWithUsefulStackTrace = new Error("waitFor");
        Error.stackTraceLimit = stackTraceLimit;
        if (typeof waitForFunction !== "function") {
            throw Error(`waitFor invalid 'waitForFunction' argument`);
        }
        // @ts-ignore
        if (typeof waitForFunction.then === "function") {
            throw Error(`waitFor 'waitForFunction' can't be async`);
        }
        const { timeout = 2000, interval = 50 } = waitForOptions || {};
        const start = Date.now();
        while (true) {
            // flush pending React/Zustand state updates before each check
            yield tlAct(() => __awaiter(void 0, void 0, void 0, function* () { }));
            try {
                if (waitForFunction())
                    return;
            }
            catch (_a) {
                // condition threw (e.g. accessing property on undefined), keep waiting
            }
            if (Date.now() - start >= timeout) {
                errorWithUsefulStackTrace.message = `Timed out in waitFor after ${timeout}ms. ${waitForFunction.toString()}`;
                if (!testUtils.silenceWaitForWarning) {
                    console.warn(errorWithUsefulStackTrace);
                }
                return;
            }
            yield new Promise((resolve) => setTimeout(resolve, interval));
        }
    });
    return waitFor;
};
// always reset the least important store first, because a store even can affect another store
export const resetStores = () => __awaiter(void 0, void 0, void 0, function* () {
    yield resetRepliesPagesStore();
    yield resetRepliesStore();
    yield resetAuthorsCommentsStore();
    yield resetSubplebbitsPagesStore();
    yield resetFeedsStore();
    yield resetSubplebbitsStore();
    yield resetCommentsStore();
    // always accounts last because it has async initialization
    yield resetAccountsStore();
});
export const resetDatabasesAndStores = () => __awaiter(void 0, void 0, void 0, function* () {
    yield resetRepliesPagesDatabaseAndStore();
    yield resetRepliesDatabaseAndStore();
    yield resetAuthorsCommentsDatabaseAndStore();
    yield resetSubplebbitsPagesDatabaseAndStore();
    yield resetFeedsDatabaseAndStore();
    yield resetSubplebbitsDatabaseAndStore();
    yield resetCommentsDatabaseAndStore();
    // always accounts last because it has async initialization
    yield resetAccountsDatabaseAndStore();
});
// renderHookWithHistory is kept for backward compatibility but our custom
// renderHook already tracks result.all, so this is just a passthrough.
const renderHookWithHistory = renderHook;
export { renderHook };
const testUtils = {
    silenceTestWasNotWrappedInActWarning,
    silenceUpdateUnmountedComponentWarning,
    silenceOverlappingActWarning,
    silenceReactWarnings,
    restoreAll,
    resetStores,
    resetDatabasesAndStores,
    createWaitFor,
    renderHookWithHistory,
    // can be useful to silence warnings in tests that use retry
    silenceWaitForWarning: false,
};
export default testUtils;
