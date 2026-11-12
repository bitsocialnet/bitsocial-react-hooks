var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { useState, useMemo, useEffect, useRef } from "react";
import { useAccount } from "./accounts/index.js";
import assert from "../lib/assert.js";
import { getProtocolClient, getRpcClients } from "../lib/pkc-compat.js";
const getFirstRpcClient = (protocolClient) => Object.values(getRpcClients(protocolClient) || {})[0];
/**
 * @param acountName - The nickname of the account, e.g. 'Account KoXpxTwfnjA5'. If no accountName is provided, use
 * the active account.
 */
export function usePkcRpcSettings(options) {
    assert(!options || typeof options === "object", `usePkcRpcSettings options argument '${options}' not an object`);
    const { accountName } = options !== null && options !== void 0 ? options : {};
    const account = useAccount({ accountName });
    const protocolClient = getProtocolClient(account);
    const rpcClient = getFirstRpcClient(protocolClient);
    const [pkcRpcSettingsState, setPkcRpcSettingsState] = useState();
    const [rpcState, setRpcState] = useState("initializing");
    // the result of the last setPkcRpcSettings call, shown instead of the rpc state for a while
    const [saveResult, setSaveResult] = useState();
    const saveResultTimeout = useRef(undefined);
    const [errors, setErrors] = useState([]);
    // the rpc client whose settings and state the hook shows
    const shownRpcClient = useRef(rpcClient);
    const showSaveResult = (result) => {
        clearTimeout(saveResultTimeout.current);
        setSaveResult(result);
        if (result) {
            saveResultTimeout.current = setTimeout(() => setSaveResult(undefined), 10000);
        }
    };
    useEffect(() => () => clearTimeout(saveResultTimeout.current), []);
    useEffect(() => {
        var _a;
        // the settings, state and save result of a previous rpc client don't apply to this one
        shownRpcClient.current = rpcClient;
        showSaveResult(undefined);
        setPkcRpcSettingsState((_a = rpcClient === null || rpcClient === void 0 ? void 0 : rpcClient.settings) !== null && _a !== void 0 ? _a : undefined);
        setRpcState((rpcClient === null || rpcClient === void 0 ? void 0 : rpcClient.state) || "initializing");
        if (!account || !protocolClient)
            return;
        if (!rpcClient)
            return;
        const onRpcSettingsChange = (pkcRpcSettings) => {
            setPkcRpcSettingsState(pkcRpcSettings);
        };
        const onRpcStateChange = (rpcState) => {
            // a newer rpc state replaces the save result
            showSaveResult(undefined);
            setRpcState(rpcState);
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
    }, [account === null || account === void 0 ? void 0 : account.id, rpcClient, protocolClient]);
    const updatePkcRpcSettings = (pkcRpcSettings) => __awaiter(this, void 0, void 0, function* () {
        assert(account, `can't use usePkcRpcSettings.setPkcRpcSettings before initialized`);
        assert(pkcRpcSettings && typeof pkcRpcSettings === "object", `usePkcRpcSettings.setPkcRpcSettings pkcRpcSettings argument '${pkcRpcSettings}' not an object`);
        const currentRpcClient = getFirstRpcClient(getProtocolClient(account));
        assert(currentRpcClient, `can't use usePkcRpcSettings.setPkcRpcSettings no account.pkc.clients.pkcRpcClients`);
        // a save that finishes after the hook switched to another rpc client doesn't apply to it
        try {
            yield currentRpcClient.setSettings(pkcRpcSettings);
            if (currentRpcClient === shownRpcClient.current) {
                showSaveResult("succeeded");
            }
        }
        catch (e) {
            if (currentRpcClient === shownRpcClient.current) {
                setErrors((prevErrors) => [...prevErrors, e]);
                showSaveResult("failed");
            }
        }
    });
    const state = saveResult || rpcState;
    return useMemo(() => ({
        pkcRpcSettings: pkcRpcSettingsState,
        setPkcRpcSettings: updatePkcRpcSettings,
        state,
        error: errors === null || errors === void 0 ? void 0 : errors[errors.length - 1],
        errors,
    }), [pkcRpcSettingsState, account === null || account === void 0 ? void 0 : account.id, state, errors]);
}
//# sourceMappingURL=pkc-rpc.js.map