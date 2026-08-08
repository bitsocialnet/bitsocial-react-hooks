import { useState, useMemo, useEffect } from "react";
import { useAccount } from "./accounts";
import assert from "assert";
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
  const [state, setState] = useState<string>("initializing");
  const [errors, setErrors] = useState<Error[]>([]);

  useEffect(() => {
    if (!account || !protocolClient) return;
    if (!rpcClient) return;

    if (rpcClient.settings != null) setPkcRpcSettingsState(rpcClient.settings);
    const rpcState = rpcClient.state;
    if (rpcState != null && rpcState !== "") setState(rpcState);

    const onRpcSettingsChange = (pkcRpcSettings: PkcRpcSettings) => {
      setPkcRpcSettingsState(pkcRpcSettings);
    };
    const onRpcStateChange = (rpcState: string) => {
      setState(rpcState);
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
      setState("succeeded");
    } catch (e: any) {
      setErrors((prevErrors) => [...prevErrors, e]);
      setState("failed");
    }

    const rpcStateAfter = currentRpcClient.state;
    setTimeout(() => {
      setState((prevState) => {
        if (prevState !== rpcStateAfter && rpcStateAfter != null && rpcStateAfter !== "") {
          return rpcStateAfter;
        }
        return prevState;
      });
    }, 10000);
  };

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
