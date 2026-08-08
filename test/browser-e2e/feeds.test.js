import { assertTestServerDidntCrash } from "../test-server/monitor-test-server";
import { act } from "@testing-library/react";
import { renderHook } from "../test-utils";
import {
  useFeed,
  useBufferedFeeds,
  useAccount,
  useAccountVotes,
  useAccountComments,
} from "../../dist";
import debugUtils from "../../dist/lib/debug-utils";
import * as accountsActions from "../../dist/stores/accounts/accounts-actions";
import testUtils from "../../dist/lib/test-utils";
import { offlineIpfs, pubsubIpfs, pkcRpc } from "../test-server/config";
import signers from "../fixtures/signers";
const communityAddress = signers[0].address;
const isBase64 = (testString) =>
  /^([0-9a-zA-Z+/]{4})*(([0-9a-zA-Z+/]{2}==)|([0-9a-zA-Z+/]{3}))?$/gm.test(testString);
const toCommunities = (names) => names?.map((name) => ({ name }));

// large value for manual debugging
const timeout = 600000;

// run tests using pkc options gateway and httpClient
const localGatewayUrl = `http://localhost:${offlineIpfs.gatewayPort}`;
const localIpfsProviderUrl = `http://localhost:${offlineIpfs.apiPort}`;
const localPubsubProviderUrl = `http://localhost:${pubsubIpfs.apiPort}/api/v0`;
const localPkcRpcUrl = `ws://127.0.0.1:${pkcRpc.port}`;
const pkcOptionsTypes = {
  "kubo rpc client": {
    kuboRpcClientsOptions: [localIpfsProviderUrl],
    // define pubsubKuboRpcClientsOptions with localPubsubProviderUrl because
    // localIpfsProviderUrl is offline node with no pubsub
    pubsubKuboRpcClientsOptions: [localPubsubProviderUrl],
    resolveAuthorNames: false,
    resolveAuthorAddresses: false,
    validatePages: false,
  },
  "gateway and pubsub provider": {
    ipfsGatewayUrls: [localGatewayUrl],
    pubsubKuboRpcClientsOptions: [localPubsubProviderUrl],
    resolveAuthorNames: false,
    resolveAuthorAddresses: false,
    validatePages: false,
  },
  "pkc rpc client": {
    pkcRpcClientsOptions: [localPkcRpcUrl],
    resolveAuthorNames: false,
    resolveAuthorAddresses: false,
    validatePages: false,
  },
};

for (const pkcOptionsType in pkcOptionsTypes) {
  describe(`feeds (${pkcOptionsType})`, () => {
    beforeAll(async () => {
      console.log(`before feeds tests (${pkcOptionsType})`);
      testUtils.silenceReactWarnings();
      // reset before or init accounts sometimes fails
      await testUtils.resetDatabasesAndStores();
    });
    afterAll(async () => {
      testUtils.restoreAll();
      await testUtils.resetDatabasesAndStores();
    });

    let rendered, waitFor;

    beforeEach(async () => {
      await assertTestServerDidntCrash();

      rendered = renderHook((props) => {
        const account = useAccount();
        const feed = useFeed(props);
        return { account, ...accountsActions, ...feed };
      });
      waitFor = testUtils.createWaitFor(rendered, { timeout });

      await waitFor(
        () =>
          rendered.result.current.account.name &&
          rendered.result.current.account.author.shortAddress,
      );
      expect(isBase64(rendered.result.current.account.signer.privateKey)).to.be.true;
      expect(rendered.result.current.account.signer.address).to.equal(
        rendered.result.current.account.author.address,
      );
      expect(rendered.result.current.account.name).to.equal(
        `Account ${rendered.result.current.account.author.shortAddress}`,
      );
      expect(typeof rendered.result.current.publishComment).to.equal("function");
      expect(typeof rendered.result.current.publishVote).to.equal("function");

      const pkcOptions = { ...pkcOptionsTypes[pkcOptionsType] };

      console.log("before set account");
      await act(async () => {
        const account = { ...rendered.result.current.account, pkcOptions };
        await rendered.result.current.setAccount(account);
      });
      expect(rendered.result.current.account.pkcOptions).to.deep.equal(pkcOptions);
      console.log("after set account");
    });

    afterEach(async () => {
      await assertTestServerDidntCrash();

      await testUtils.resetDatabasesAndStores();
    });

    it("get feed with no arguments", async () => {
      expect(rendered.result.current.feed).to.deep.equal([]);
      expect(typeof rendered.result.current.hasMore).to.equal("boolean");
      expect(typeof rendered.result.current.loadMore).to.equal("function");
    });

    it("change sort type", async () => {
      console.log(`starting feeds tests (${pkcOptionsType})`);

      rendered.rerender({ communities: toCommunities([communityAddress]), sortType: "hot" });
      await waitFor(() => !!rendered.result.current.feed[0].cid);
      expect(rendered.result.current.feed[0].communityAddress).to.equal(communityAddress);
      console.log("after first render");

      // reset
      rendered.rerender({ communities: [] });
      await waitFor(() => rendered.result.current.feed.length === 0);
      expect(rendered.result.current.feed.length).to.equal(0);
      console.log("after second render");

      // change sort type
      rendered.rerender({ communities: toCommunities([communityAddress]), sortType: "new" });
      await waitFor(() => !!rendered.result.current.feed[0].cid);
      expect(rendered.result.current.feed[0].communityAddress).to.equal(communityAddress);
    });

    it("validate comments", async () => {
      console.log(`starting validate comments tests (${pkcOptionsType})`);

      // useValidateComment relies on useEffect + async promises whose state
      // updates land outside act() in Vitest browser mode, making the hook
      // untestable with renderHook polling. Test the underlying commentIsValid
      // utility directly instead — the hook is a thin wrapper around it.
      const { commentIsValid } = await import("../../dist/lib/utils/utils");

      rendered.rerender({ communities: toCommunities([communityAddress]), sortType: "hot" });
      await waitFor(() => !!rendered.result.current.feed[0]?.cid);
      expect(rendered.result.current.feed[0].communityAddress).to.equal(communityAddress);
      const comment = rendered.result.current.feed[0];
      const pkc = rendered.result.current.account.pkc;
      console.log("after first render");

      // validate invalid comment (corrupted signature)
      const invalidComment = JSON.parse(JSON.stringify(comment));
      invalidComment.author.address = "malicious.eth";
      invalidComment.raw.comment.author.address = "malicious.eth";
      invalidComment.signature.signature = "corrupted";
      invalidComment.raw.comment.signature.signature = "corrupted";
      const invalidResult = await commentIsValid(
        invalidComment,
        { validateReplies: true, blockCommunity: false },
        pkc,
      );
      expect(invalidResult).to.equal(false);
      console.log("after validate invalid comment");

      // validate valid comment
      const validResult = await commentIsValid(
        comment,
        { validateReplies: true, blockCommunity: false },
        pkc,
      );
      expect(validResult).to.equal(true);
      console.log("after validate comment");

      // validate valid comment without replies
      const validWithoutRepliesResult = await commentIsValid(
        comment,
        { validateReplies: false, blockCommunity: false },
        pkc,
      );
      expect(validWithoutRepliesResult).to.equal(true);
      console.log("after validate comment without replies");
    });
  });
}
