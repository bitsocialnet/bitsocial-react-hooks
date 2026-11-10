import { useState, useMemo, useEffect, useRef } from "react";
import { useAccount } from "./accounts";
import assert from "../lib/assert";
import { UsePkcRpcSettingsOptions, UsePkcRpcSettingsResult, PkcRpcSettings } from "../types";
import { getProtocolClient, getRpcClients } from "../lib/pkc-compat";

const getFirstRpcClient = (protocolClient: any) =>
  Object.values(getRpcClients(protocolClient) || {})[0] as any;

/**
 * @param acountName - The nickname of the account, e.g. 'Account KoXpxTwfnjA5'. If no accountName is provided, use
 * the active account.
 */
export function usePkcRpcSettings(options?: UsePkcRpcSettingsOptions): UsePkcRpcSettingsResult {
  assert(
    !options || typeof options === "object",
    `usePkcRpcSettings options argument '${options}' not an object`,
  );
  const { accountName } = options ?? {};
  const account = useAccount({ accountName });
  const protocolClient = getProtocolClient(account);
  const rpcClient = getFirstRpcClient(protocolClient);
  const [pkcRpcSettingsState, setPkcRpcSettingsState] = useState<PkcRpcSettings>();
  const [rpcState, setRpcState] = useState<string>("initializing");
  // the result of the last setPkcRpcSettings call, shown instead of the rpc state for a while
  const [saveResult, setSaveResult] = useState<string>();
  const saveResultTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [errors, setErrors] = useState<Error[]>([]);

  const showSaveResult = (result?: string) => {
    clearTimeout(saveResultTimeout.current);
    setSaveResult(result);
    if (result) {
      saveResultTimeout.current = setTimeout(() => setSaveResult(undefined), 10000);
    }
  };
  useEffect(() => () => clearTimeout(saveResultTimeout.current), []);

  useEffect(() => {
    // the settings, state and save result of a previous rpc client don't apply to this one
    showSaveResult(undefined);
    setPkcRpcSettingsState(rpcClient?.settings ?? undefined);
    setRpcState(rpcClient?.state || "initializing");
    if (!account || !protocolClient) return;
    if (!rpcClient) return;

    const onRpcSettingsChange = (pkcRpcSettings: PkcRpcSettings) => {
      setPkcRpcSettingsState(pkcRpcSettings);
    };
    const onRpcStateChange = (rpcState: string) => {
      // a newer rpc state replaces the save result
      showSaveResult(undefined);
      setRpcState(rpcState);
    };
    const onRpcError = (e: any) => {
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
  }, [account?.id, rpcClient, protocolClient]);

  const updatePkcRpcSettings = async (pkcRpcSettings: PkcRpcSettings) => {
    assert(account, `can't use usePkcRpcSettings.setPkcRpcSettings before initialized`);
    assert(
      pkcRpcSettings && typeof pkcRpcSettings === "object",
      `usePkcRpcSettings.setPkcRpcSettings pkcRpcSettings argument '${pkcRpcSettings}' not an object`,
    );
    const currentRpcClient = getFirstRpcClient(getProtocolClient(account));
    assert(
      currentRpcClient,
      `can't use usePkcRpcSettings.setPkcRpcSettings no account.pkc.clients.pkcRpcClients`,
    );

    try {
      await currentRpcClient.setSettings(pkcRpcSettings);
      showSaveResult("succeeded");
    } catch (e: any) {
      setErrors((prevErrors) => [...prevErrors, e]);
      showSaveResult("failed");
    }
  };

  const state = saveResult || rpcState;

  return useMemo(
    () => ({
      pkcRpcSettings: pkcRpcSettingsState,
      setPkcRpcSettings: updatePkcRpcSettings,
      state,
      error: errors?.[errors.length - 1],
      errors,
    }),
    [pkcRpcSettingsState, account?.id, state, errors],
  );
}
