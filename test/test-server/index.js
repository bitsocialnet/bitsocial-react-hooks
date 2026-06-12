// script to start IPFS and pkc-js for testing

import { offlineIpfs, pubsubIpfs, pkcRpc } from "./config.js";
import startIpfs from "./start-ipfs.js";
import startPkcRpc from "./start-pkc-rpc.js";
import signers from "../fixtures/signers.js";
import { directory as getTmpFolderPath } from "tempy";
import http from "http";
const pkcDataPath = getTmpFolderPath();

// set up a community for testing
(async () => {
  // always use the same private key and community address when testing
  const privateKey = signers[0].privateKey;
  const adminRoleAddress = signers[1].address;

  await startIpfs(offlineIpfs);
  await startIpfs(pubsubIpfs);
  await startPkcRpc({
    port: pkcRpc.port,
    ipfsApiPort: offlineIpfs.apiPort,
    pubsubApiPort: pubsubIpfs.apiPort,
  });

  const pkcOptions = {
    kuboRpcClientsOptions: [`http://127.0.0.1:${offlineIpfs.apiPort}/api/v0`],
    pubsubKuboRpcClientsOptions: [`http://127.0.0.1:${pubsubIpfs.apiPort}/api/v0`],
    httpRoutersOptions: [],
    // pubsubKuboRpcClientsOptions: [`https://pubsubprovider.xyz/api/v0`],
    dataPath: pkcDataPath,
    publishInterval: 1000,
    updateInterval: 1000,
  };

  const { default: PKC } = await import("@pkcprotocol/pkc-js");
  const pkc = await PKC(pkcOptions);
  // TODO: dataPath: getTmpFolderPath() should not be needed, pkc-js bug
  const pkc2 = await PKC({
    ...pkcOptions,
    dataPath: getTmpFolderPath(),
  });
  const signer = await pkc.createSigner({ privateKey, type: "ed25519" });

  console.log(`creating community with address '${signer.address}'...`);
  const community = await pkc.createCommunity({
    signer: signer,
  });
  community.on("challengerequest", console.log);
  community.on("challengeanswer", console.log);
  await community.edit({
    settings: {
      challenges: [{ name: "question", options: { question: "1+1=?", answer: "2" } }],
    },
    roles: { [adminRoleAddress]: { role: "admin" } },
  });
  console.log("community created");

  // tests can cause community errors, e.g. changing name to wrong .eth
  community.on("error", console.log);

  console.log("starting community...");
  await community.start();
  community.once("update", async () => {
    console.log(`community started with address ${signer.address}`);

    console.log("publish test comment");
    const comment = await pkc2.createComment({
      title: "comment title",
      content: "comment content",
      communityAddress: signer.address,
      signer,
      author: { address: signer.address },
    });
    comment.once("challenge", () => comment.publishChallengeAnswers({ challengeAnswers: ["2"] }));
    await comment.publish();
    console.log("test comment published");
    console.log("test server ready");

    // create a test server to be able to use npm module 'wait-on'
    // to know when the test server is finished getting ready
    // and able to start the automated tests
    http
      .createServer((req, res) => {
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.end("test server ready");
      })
      .listen(59281);
  });
})();
