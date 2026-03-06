var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { useState, useMemo, useEffect } from "react";
import { useAccount } from "./accounts";
import assert from "assert";
/**
 * @param acountName - The nickname of the account, e.g. 'Account 1'. If no accountName is provided, use
 * the active account.
 */
export function usePlebbitRpcSettings(options) {
    assert(!options || typeof options === "object", `usePlebbitRpcSettings options argument '${options}' not an object`);
    const { accountName } = options !== null && options !== void 0 ? options : {};
    const account = useAccount({ accountName });
    const [plebbitRpcSettingsState, setPlebbitRpcSettingsState] = useState();
    const [state, setState] = useState("initializing");
    const [errors, setErrors] = useState([]);
    useEffect(() => {
        var _a, _b;
        if (!account)
            return;
        const rpcClient = Object.values(((_b = (_a = account.plebbit) === null || _a === void 0 ? void 0 : _a.clients) === null || _b === void 0 ? void 0 : _b.plebbitRpcClients) || {})[0];
        if (!rpcClient)
            return;
        if (rpcClient.settings != null)
            setPlebbitRpcSettingsState(rpcClient.settings);
        const rpcState = rpcClient.state;
        if (rpcState != null && rpcState !== "")
            setState(rpcState);
        const onRpcSettingsChange = (plebbitRpcSettings) => {
            setPlebbitRpcSettingsState(plebbitRpcSettings);
        };
        const onRpcStateChange = (rpcState) => {
            setState(rpcState);
        };
        const onRpcError = (e) => {
            setErrors((prevErrors) => [...prevErrors, e]);
        };
        rpcClient.on("settingschange", onRpcSettingsChange);
        rpcClient.on("statechange", onRpcStateChange);
        rpcClient.on("error", onRpcError);
        // clean up
        return () => {
            rpcClient.removeListener("settingschange", onRpcSettingsChange);
            rpcClient.removeListener("statechange", onRpcStateChange);
            rpcClient.removeListener("error", onRpcError);
        };
    }, [account === null || account === void 0 ? void 0 : account.id]);
    const setPlebbitRpcSettings = (plebbitRpcSettings) => __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        assert(account, `can't use usePlebbitRpcSettings.setPlebbitRpcSettings before initialized`);
        assert(plebbitRpcSettings && typeof plebbitRpcSettings === "object", `usePlebbitRpcSettings.setPlebbitRpcSettings plebbitRpcSettings argument '${plebbitRpcSettings}' not an object`);
        const rpcClient = Object.values(((_b = (_a = account.plebbit) === null || _a === void 0 ? void 0 : _a.clients) === null || _b === void 0 ? void 0 : _b.plebbitRpcClients) || {})[0];
        assert(rpcClient, `can't use usePlebbitRpcSettings.setPlebbitRpcSettings no account.plebbit.clients.plebbitRpcClients`);
        try {
            yield rpcClient.setSettings(plebbitRpcSettings);
            setState("succeeded");
        }
        catch (e) {
            setErrors((prevErrors) => [...prevErrors, e]);
            setState("failed");
        }
        const rpcStateAfter = rpcClient.state;
        setTimeout(() => {
            setState((prevState) => {
                if (prevState !== rpcStateAfter && rpcStateAfter != null && rpcStateAfter !== "") {
                    return rpcStateAfter;
                }
                return prevState;
            });
        }, 10000);
    });
    return useMemo(() => ({
        plebbitRpcSettings: plebbitRpcSettingsState,
        setPlebbitRpcSettings,
        state,
        error: errors === null || errors === void 0 ? void 0 : errors[errors.length - 1],
        errors,
    }), [plebbitRpcSettingsState, account === null || account === void 0 ? void 0 : account.id, state, errors]);
}
