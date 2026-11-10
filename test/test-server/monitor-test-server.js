// the test server can crash without logs, this script adds logs when this happens
// you should also import assertTestServerDidntCrash and run it beforeEach and afterEach

import { offlineIpfs, pubsubIpfs, testServerReadyText } from "./config";

// make sure only one instance is running in node
let started = false;
const startMonitoring = async () => {
  if (started) {
    return;
  }
  started = true;

  // log when test server or ipfs crashes
  setInterval(async () => {
    logTestServerCrashed();
  }, 200).unref?.();
};

// make sure only one instance is running in karma
try {
  if (!window.BITSOCIAL_MONITOR_TEST_SERVER_STARTED) {
    startMonitoring();
  }
  window.BITSOCIAL_MONITOR_TEST_SERVER_STARTED = true;
} catch (e) {}
startMonitoring();

const logTestServerCrashed = async () => {
  try {
    await assertTestServerDidntCrash();
  } catch (e) {
    console.error(e.message);
  }
};

const assertTestServerDidntCrash = async () => {
  const [testServerText, testServerError] = await fetchText("http://localhost:59281");
  if (testServerText === undefined) {
    throw Error("test server crashed http://localhost:59281: " + testServerError?.message || "");
  }
  // e.g. this run's server exited on a port conflict and another checkout's server answers
  if (testServerText !== testServerReadyText) {
    throw Error(
      `test server http://localhost:59281 is not this run's server: expected '${testServerReadyText}', got '${testServerText}'`,
    );
  }
  const [offlineIpfsText, offlineIpfsError] = await fetchText(
    `http://localhost:${offlineIpfs.gatewayPort}/ipfs/QmZULkCELmmk5XNfCgTnCyFgAVxBRBXyDHGGMVoLFLiXEN`,
  );
  if (!offlineIpfsText?.startsWith("hello")) {
    throw Error(
      `test server crashed offline ipfs daemon http://localhost:${offlineIpfs.gatewayPort}: ` +
        offlineIpfsError?.message || "",
    );
  }
  const [pubsubIpfsText, pubsubIpfsError] = await fetchText(
    `http://localhost:${pubsubIpfs.gatewayPort}/ipfs/QmZULkCELmmk5XNfCgTnCyFgAVxBRBXyDHGGMVoLFLiXEN`,
  );
  if (!pubsubIpfsText?.startsWith("hello")) {
    throw Error(
      `test server crashed pubsub ipfs daemon http://localhost:${pubsubIpfs.gatewayPort}` +
        pubsubIpfsError?.message || "",
    );
  }
};

const fetchText = async (url) => {
  let text, error;
  try {
    text = await fetch(url, { cache: "no-cache" }).then((res) => res.text());
  } catch (e) {
    error = e;
  }
  return [text, error];
};

export { assertTestServerDidntCrash };
