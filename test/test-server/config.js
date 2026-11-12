const getEnvValue = (envNames) => {
  for (const envName of envNames) {
    const nodeValue = typeof process !== "undefined" ? process.env?.[envName] : undefined;
    if (nodeValue) {
      return nodeValue;
    }

    const browserValue = import.meta.env?.[envName];
    if (browserValue) {
      return browserValue;
    }
  }

  return undefined;
};

const getPort = (envNames, fallback) => {
  const value = getEnvValue(envNames);
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw Error(`${envName} '${value}' not a valid port`);
  }
  return parsed;
};

export const offlineIpfs = {
  apiPort: 14325,
  gatewayPort: 14326,
  swarmPort: 14327,
  args: "--offline",
};

export const pubsubIpfs = {
  apiPort: 14328,
  gatewayPort: 14329,
  swarmPort: 14330,
  args: "--enable-pubsub-experiment",
};

export const pkcRpc = {
  port: getPort(["TEST_PKC_RPC_PORT", "VITE_TEST_PKC_RPC_PORT"], 48392),
};

// served on port 59281 once the test server is ready; it names the pkc rpc port so
// tests can tell their own test server from one started with another config
export const testServerReadyText = `test server ready, pkc rpc port ${pkcRpc.port}`;
