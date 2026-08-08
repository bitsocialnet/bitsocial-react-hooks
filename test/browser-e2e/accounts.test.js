import { assertTestServerDidntCrash } from "../test-server/monitor-test-server";
import { act } from "@testing-library/react";
import { renderHook } from "../test-utils";
import {
  useAccount,
  useAccountVotes,
  useAccountComments,
  useNotifications,
  useComment,
  useReplies,
  useAccountCommunities,
  useCommunity,
  useFeed,
  usePublishCommentModeration,
} from "../../dist";
import debugUtils from "../../dist/lib/debug-utils";

import * as accountsActions from "../../dist/stores/accounts/accounts-actions";
import communitiesStore from "../../dist/stores/communities";
import testUtils from "../../dist/lib/test-utils";
import { offlineIpfs, pubsubIpfs, pkcRpc } from "../test-server/config";
import signers from "../fixtures/signers";
const communityAddress = signers[0].address;
const adminRoleSigner = signers[1];

const isBase64 = (testString) =>
  /^([0-9a-zA-Z+/]{4})*(([0-9a-zA-Z+/]{2}==)|([0-9a-zA-Z+/]{3}))?$/gm.test(testString);
const toCommunity = (name) => (name ? { name } : undefined);
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
  describe(`accounts (${pkcOptionsType})`, () => {
    beforeAll(async () => {
      console.log(`before accounts tests (${pkcOptionsType})`);
      testUtils.silenceReactWarnings();
      // reset before or init accounts sometimes fails
      await testUtils.resetDatabasesAndStores();
    });
    afterAll(async () => {
      testUtils.restoreAll();
      await testUtils.resetDatabasesAndStores();
    });

    beforeEach(async () => {
      await assertTestServerDidntCrash();
    });
    afterEach(async () => {
      await assertTestServerDidntCrash();
    });

    describe(`no accounts in database (${pkcOptionsType})`, () => {
      it(`generate default account on load (${pkcOptionsType})`, async () => {
        console.log(`starting accounts tests (${pkcOptionsType})`);

        const rendered = renderHook(() => useAccount());
        const waitFor = testUtils.createWaitFor(rendered, { timeout });

        await waitFor(
          () => rendered.result.current?.name && rendered.result.current?.author?.shortAddress,
        );

        const account = rendered.result.current;
        expect(account.name).to.equal(`Account ${account.author.shortAddress}`);
        expect(account.author.displayName).to.equal(undefined);
        expect(isBase64(account.signer.privateKey)).to.be.true;
        expect(account.signer.address).to.equal(account.author.address);
        expect(typeof account.author.address).to.equal("string");
        expect(Array.isArray(account.subscriptions)).to.equal(true);
        expect(account.blockedAddresses && typeof account.blockedAddresses === "object").to.equal(
          true,
        );
        expect(account.pkc && typeof account.pkc === "object").to.equal(true);
        expect(account.pkcOptions && typeof account.pkcOptions === "object").to.equal(true);
        expect(account.pkcOptions.libp2pJsClientsOptions).to.deep.equal([{ key: "libp2pjs" }]);
        expect(account.pkcOptions.ipfsGatewayUrls).to.equal(undefined);
        expect(account.pkcOptions.pubsubKuboRpcClientsOptions).to.equal(undefined);
        expect(account.pkcOptions.ipfsHttpClientOptions).to.equal(undefined);

        // wait for short address
        await waitFor(() => rendered.result.current?.author?.shortAddress);
        expect(typeof rendered.result.current?.author?.shortAddress).to.equal("string");
      });
    });

    if (pkcOptionsType !== "pkc rpc client") {
      console.log(`${pkcOptionsType} can't create community, skipping`);
    } else {
      describe(`create community (${pkcOptionsType})`, () => {
        let rendered, waitFor;

        beforeAll(async () => {
          rendered = renderHook((communityAddress) => {
            const account = useAccount();
            const { accountCommunities } = useAccountCommunities();
            const community = useCommunity({ community: toCommunity(communityAddress) });
            const communities = toCommunities(communityAddress ? [communityAddress] : undefined);
            const modQueue = useFeed({ communities, modQueue: ["pendingApproval"] });
            const feed = useFeed({ communities });
            return { account, accountCommunities, community, modQueue, feed, ...accountsActions };
          });
          rendered.detach();
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

        it("create and edit a community", async () => {
          console.log("before create community");
          const createdCommunityTitle = "my title";
          let community;
          await act(async () => {
            community = await rendered.result.current.createCommunity({
              title: createdCommunityTitle,
            });
          });
          console.log("after create community", community.address);
          const createdCommunityAddress = community?.address;
          expect(typeof createdCommunityAddress).to.equal("string");
          expect(community.title).to.equal(createdCommunityTitle);

          console.log("before used community");
          // can useCommunity
          rendered.rerender(createdCommunityAddress);
          await waitFor(() => rendered.result.current.community.title === createdCommunityTitle);
          expect(rendered.result.current.community.address).to.equal(createdCommunityAddress);
          expect(rendered.result.current.community.title).to.equal(createdCommunityTitle);
          console.log("after used community");

          // wait for community to be added to account communities
          console.log("before community added to account communities");
          await waitFor(
            () =>
              rendered.result.current.accountCommunities[createdCommunityAddress].role.role ===
              "owner",
          );
          expect(
            rendered.result.current.accountCommunities[createdCommunityAddress].role.role,
          ).to.equal("owner");
          console.log("after community added to account communities");

          console.log("before edit community address");
          // publishCommunityEdit address
          const editedCommunityAddress = "my-sub.eth";
          let onChallenge = () => {};
          const onChallengeVerificationCalls = [];
          let onChallengeVerification = (...args) => onChallengeVerificationCalls.push([...args]);

          await act(async () => {
            await rendered.result.current.publishCommunityEdit(createdCommunityAddress, {
              address: editedCommunityAddress,
              onChallenge,
              onChallengeVerification,
            });
          });
          console.log("after edit community address");

          console.log("before use community");
          // change useCommunity address
          rendered.rerender(editedCommunityAddress);
          await waitFor(() => rendered.result.current.community.address === editedCommunityAddress);
          expect(rendered.result.current.community.address).to.equal(editedCommunityAddress);
          expect(rendered.result.current.community.title).to.equal(createdCommunityTitle);
          console.log("after use community");

          console.log("before onChallengeVerification");
          // onChallengeVerification should be called with success even if the sub is edited locally
          await waitFor(() => onChallengeVerificationCalls.length >= 1);
          expect(onChallengeVerificationCalls.length).to.equal(1);
          expect(onChallengeVerificationCalls[0][0].challengeSuccess).to.equal(true);
          console.log("after onChallengeVerification");

          console.log("before edit community title");
          // publishCommunityEdit title and description
          const editedCommunityTitle = "edited title";
          const editedCommunityDescription = "edited description";
          await act(async () => {
            await rendered.result.current.publishCommunityEdit(editedCommunityAddress, {
              title: editedCommunityTitle,
              description: editedCommunityDescription,
              onChallenge,
              onChallengeVerification,
            });
          });
          console.log("after edit community title");

          console.log("before community change");
          // wait for change
          await waitFor(() => rendered.result.current.community.address === editedCommunityAddress);
          expect(rendered.result.current.community.address).to.equal(editedCommunityAddress);
          console.log("after community change");

          console.log("before onChallengeVerification");
          // onChallengeVerification should be called with success even if the sub is edited locally
          await waitFor(() => onChallengeVerificationCalls.length >= 2);
          expect(onChallengeVerificationCalls.length).to.equal(2);
          expect(onChallengeVerificationCalls[1][0].challengeSuccess).to.equal(true);
          console.log("after onChallengeVerification");

          // delete community
          console.log("before deleteCommunity");
          await act(async () => {
            await rendered.result.current.deleteCommunity(editedCommunityAddress);
          });
          await waitFor(() => rendered.result.current.community?.updatedAt === undefined);
          expect(rendered.result.current.community?.updatedAt).to.equal(undefined);
          await waitFor(
            () =>
              rendered.result.current.accountCommunities[editedCommunityAddress]?.updatedAt ===
              undefined,
          );
          console.log("after deleteCommunity");
        });

        it("create pending approval community, publish and approve", async () => {
          const title = "pending approval community";
          console.log("before create community");
          let community;
          await act(async () => {
            community = await rendered.result.current.createCommunity({
              title,
              settings: {
                challenges: [
                  {
                    name: "text-math",
                    pendingApproval: true,
                    exclude: [{ role: ["moderator"] }],
                  },
                ],
              },
            });
            await community.start();

            // flaky if not waiting after community.start()
            await new Promise((r) => setTimeout(r, 1000));
          });
          console.log("after create community", community.address);
          expect(typeof community.address).to.equal("string");
          expect(community.title).to.equal(title);
          expect(community.challenges[0].description.includes("math")).to.equal(true);
          expect(community.challenges[0].pendingApproval).to.equal(true);

          console.log("before used community");
          // can useCommunity
          rendered.rerender(community.address);
          await waitFor(() => rendered.result.current.community.title === title);
          expect(rendered.result.current.community.title).to.equal(title);
          expect(
            rendered.result.current.community.challenges[0].description.includes("math"),
          ).to.equal(true);
          expect(rendered.result.current.community.challenges[0].pendingApproval).to.equal(true);
          console.log("after used community");

          let challenge, comment, challengeVerification;
          const logChallenge = (str, obj) => {
            obj = { ...obj };
            delete obj.encrypted;
            delete obj.signature;
            delete obj.challengeRequestId;
            console.log(str, obj);
          };
          const onChallenge = (_challenge, _comment) => {
            logChallenge("onChallenge", _challenge);
            challenge = _challenge;
            comment = _comment;
          };
          const onChallengeVerification = (_challengeVerification) => {
            logChallenge("onChallengeVerification", _challengeVerification);
            challengeVerification = _challengeVerification;
          };

          // publish wrong challenge answer, verification should be success false
          let publishCommentOptions = {
            communityAddress: community.address,
            title: "some title",
            content: "some content",
            onChallenge,
            onChallengeVerification,
          };
          await act(async () => {
            console.log("before publishComment wrong challenge answer");
            await rendered.result.current.publishComment(publishCommentOptions);
            console.log("after publishComment wrong challenge answer");
          });
          // wait for challenge
          await waitFor(() => !!challenge);
          expect(challenge.type).to.equal("CHALLENGE");
          comment.publishChallengeAnswers([""]); // publish wrong challenge answer
          // wait for challenge verification
          await waitFor(() => !!challengeVerification);
          expect(challengeVerification.type).to.equal("CHALLENGEVERIFICATION");
          // verification should be success false
          expect(challengeVerification.challengeSuccess).to.equal(false);
          expect(challengeVerification.commentUpdate?.pendingApproval).to.equal(undefined);
          expect(rendered.result.current.modQueue.feed.length).to.equal(0);
          console.log("after onChallengeVerification wrong challenge answer");

          // reset
          let challenge2, comment2, challengeVerification2;
          publishCommentOptions = { ...publishCommentOptions };
          publishCommentOptions.onChallenge = (_challenge, _comment) => {
            logChallenge("onChallenge", _challenge);
            challenge2 = _challenge;
            comment2 = _comment;
          };
          publishCommentOptions.onChallengeVerification = (_challengeVerification) => {
            logChallenge("onChallengeVerification", _challengeVerification);
            challengeVerification2 = _challengeVerification;
          };
          publishCommentOptions.content += " 2";

          // publish correct challenge answer, verification should be success true, but pending approval
          await act(async () => {
            console.log("before publishComment");
            await rendered.result.current.publishComment(publishCommentOptions);
            console.log("after publishComment");
          });
          // wait for challenge
          await waitFor(() => !!challenge2);
          expect(challenge2.type).to.equal("CHALLENGE");
          let challengeAnswer = String(eval(challenge2.challenges[0].challenge));
          // challengeAnswer = 'wrong answer'
          comment2.publishChallengeAnswers([challengeAnswer]); // publish correct challenge answer
          // wait for challenge verification
          await waitFor(() => !!challengeVerification2);
          expect(challengeVerification2.type).to.equal("CHALLENGEVERIFICATION");
          expect(challengeVerification2.challengeSuccess).to.equal(true);
          expect(challengeVerification2.commentUpdate.pendingApproval).to.equal(true);
          const pendingApprovalCommentCid = challengeVerification2.commentUpdate.cid;
          expect(typeof pendingApprovalCommentCid).to.equal("string");
          console.log("after onChallengeVerification");

          // wait for pending approval in modQueue
          console.log(`before useFeed({modQueue: ['pendingApproval']})`);
          await waitFor(() => rendered.result.current.modQueue.feed.length > 0);
          console.log(rendered.result.current.modQueue.feed);
          expect(rendered.result.current.modQueue.feed.length).to.equal(1);
          expect(rendered.result.current.modQueue.feed[0].pendingApproval).to.equal(true);
          expect(rendered.result.current.modQueue.feed[0].content).to.equal(
            publishCommentOptions.content,
          );
          console.log(`after useFeed({modQueue: ['pendingApproval']})`);

          // approve pending approval comment
          expect(rendered.result.current.feed.feed.length).to.equal(0);
          expect(typeof rendered.result.current.account.author.address).to.equal("string");
          await community.edit({
            roles: { [rendered.result.current.account.author.address]: { role: "moderator" } },
          });
          expect(community.roles[rendered.result.current.account.author.address].role).to.equal(
            "moderator",
          );

          await act(async () => {
            console.log("before publishCommentModeration");
            await rendered.result.current.publishCommentModeration({
              communityAddress: community.address,
              commentCid: pendingApprovalCommentCid,
              commentModeration: { approved: true },
              onChallenge,
              onChallengeVerification,
            });
            console.log("after publishCommentModeration");
          });

          // wait for approved comment to appear in feed
          console.log(`before useFeed()`);
          await waitFor(() => rendered.result.current.feed.feed.length > 0);
          expect(rendered.result.current.feed.feed.length).to.equal(1);
          expect(rendered.result.current.feed.feed[0].content).to.equal(
            publishCommentOptions.content,
          );
          console.log(`after useFeed()`);
        });

        it("generic comment moderation updates even if the moderation hook unmounts immediately", async () => {
          const title = "generic moderation community";
          const pkcOptions = { ...pkcOptionsTypes[pkcOptionsType] };
          let community;

          await act(async () => {
            community = await rendered.result.current.createCommunity({
              title,
              settings: {
                challenges: [{ name: "text-math" }],
              },
            });
            await community.start();
            await new Promise((r) => setTimeout(r, 1000));
          });
          expect(typeof community.address).to.equal("string");

          rendered.rerender(community.address);
          await waitFor(() => rendered.result.current.community.address === community.address);
          const defaultAccountName = rendered.result.current.account.name;

          await act(async () => {
            await rendered.result.current.createAccount("Poster");
            await rendered.result.current.setActiveAccount("Poster");
          });
          await waitFor(() => rendered.result.current.account.name === "Poster");

          await act(async () => {
            await rendered.result.current.setAccount({
              ...rendered.result.current.account,
              pkcOptions,
            });
          });

          let publishChallenge;
          let publishCommentInstance;
          let publishVerification;
          await act(async () => {
            await rendered.result.current.publishComment({
              communityAddress: community.address,
              title: "generic moderation title",
              content: "generic moderation content",
              onChallenge: (_challenge, _comment) => {
                publishChallenge = _challenge;
                publishCommentInstance = _comment;
              },
              onChallengeVerification: (_challengeVerification) => {
                publishVerification = _challengeVerification;
              },
            });
          });

          await waitFor(() => !!publishChallenge);
          expect(publishChallenge.type).to.equal("CHALLENGE");
          const publishChallengeAnswer = String(eval(publishChallenge.challenges[0].challenge));
          publishCommentInstance.publishChallengeAnswers([publishChallengeAnswer]);
          await waitFor(() => publishVerification?.challengeSuccess === true);

          await waitFor(() => rendered.result.current.feed.feed.length > 0);
          const commentCid = rendered.result.current.feed.feed[0].cid;
          expect(typeof commentCid).to.equal("string");

          await act(async () => {
            await rendered.result.current.setActiveAccount(defaultAccountName);
          });
          await waitFor(() => rendered.result.current.account.name === defaultAccountName);
          await act(async () => {
            await community.edit({
              roles: {
                [rendered.result.current.account.author.address]: { role: "moderator" },
              },
            });
          });

          const observedComment = renderHook((observedCommentCid) =>
            useComment({ commentCid: observedCommentCid }),
          );
          const waitForObservedComment = testUtils.createWaitFor(observedComment, { timeout });
          observedComment.rerender(commentCid);
          await waitForObservedComment(() => observedComment.result.current?.cid === commentCid);

          const moderationEvents = [];
          const moderationErrors = [];
          let unmountedModerationChallenge;
          let unmountedModerationInstance;
          let mountedModerationChallenge;
          let mountedModerationInstance;
          let mountedModerationVerification;

          const mountedModerationRendered = renderHook((options) =>
            usePublishCommentModeration(options),
          );
          const waitForMountedModeration = testUtils.createWaitFor(mountedModerationRendered, {
            timeout,
          });
          mountedModerationRendered.rerender({
            communityAddress: community.address,
            commentCid,
            commentModeration: { removed: true },
            onChallenge: (challenge, commentModeration) => {
              mountedModerationChallenge = challenge;
              mountedModerationInstance = commentModeration;
            },
            onChallengeVerification: (challengeVerification) => {
              mountedModerationVerification = challengeVerification;
            },
            onError: (error) => {
              moderationErrors.push(`mounted:${error.message}`);
            },
          });
          await waitForMountedModeration(
            () => mountedModerationRendered.result.current.state === "ready",
          );

          await act(async () => {
            await mountedModerationRendered.result.current.publishCommentModeration();
          });

          await waitForMountedModeration(
            () => mountedModerationChallenge || mountedModerationVerification,
          );
          if (mountedModerationChallenge) {
            const moderationChallengeAnswer = String(
              eval(mountedModerationChallenge.challenges[0].challenge),
            );
            mountedModerationInstance.publishChallengeAnswers([moderationChallengeAnswer]);
          }
          await waitForMountedModeration(() => !!mountedModerationVerification);
          expect(mountedModerationVerification.challengeSuccess).to.equal(true);

          await waitForObservedComment(
            () => observedComment.result.current?.commentModeration?.removed === true,
          );
          expect(observedComment.result.current?.removed).to.equal(true);

          mountedModerationRendered.unmount();

          const refreshedComment = renderHook((observedCommentCid) =>
            useComment({ commentCid: observedCommentCid }),
          );
          const waitForRefreshedComment = testUtils.createWaitFor(refreshedComment, { timeout });
          refreshedComment.rerender(commentCid);
          await waitForRefreshedComment(() => refreshedComment.result.current?.cid === commentCid);
          await waitForRefreshedComment(() => refreshedComment.result.current?.removed === true);
          refreshedComment.unmount();

          const moderationRendered = renderHook((options) => usePublishCommentModeration(options));
          const waitForModeration = testUtils.createWaitFor(moderationRendered, { timeout });
          moderationRendered.rerender({
            communityAddress: community.address,
            commentCid,
            commentModeration: { removed: false },
            onChallenge: (challenge, commentModeration) => {
              unmountedModerationChallenge = challenge;
              unmountedModerationInstance = commentModeration;
              moderationEvents.push(["challenge", challenge?.type]);
            },
            onChallengeVerification: (challengeVerification) => {
              moderationEvents.push([
                "challengeverification",
                challengeVerification?.challengeSuccess,
                challengeVerification?.reason,
                challengeVerification?.challengeErrors,
              ]);
            },
            onError: (error) => {
              moderationErrors.push(error.message);
            },
          });
          await waitForModeration(() => moderationRendered.result.current.state === "ready");

          await act(async () => {
            await moderationRendered.result.current.publishCommentModeration();
          });
          moderationRendered.unmount();

          await waitFor(() => !!unmountedModerationChallenge);
          const unmountedModerationChallengeAnswer = String(
            eval(unmountedModerationChallenge.challenges[0].challenge),
          );
          await act(async () => {
            await unmountedModerationInstance.publishChallengeAnswers([
              unmountedModerationChallengeAnswer,
            ]);
          });

          await waitForObservedComment(
            () => observedComment.result.current?.commentModeration?.removed === false,
          );
          expect(observedComment.result.current?.removed).to.equal(false);
          expect(observedComment.result.current?.commentModeration?.removed).to.equal(false);
          await waitFor(() =>
            moderationEvents.some(
              ([eventName, challengeSuccess]) =>
                eventName === "challengeverification" && challengeSuccess === true,
            ),
          );
          expect(moderationErrors).to.deep.equal([]);

          observedComment.unmount();

          await act(async () => {
            await rendered.result.current.deleteCommunity(community.address);
            await rendered.result.current.deleteAccount("Poster");
          });
        });
      });
    }

    describe(`publish community edit (${pkcOptionsType})`, () => {
      let rendered, waitFor;

      beforeAll(async () => {
        rendered = renderHook((communityAddress) => {
          const account = useAccount();
          const community = useCommunity({ community: toCommunity(communityAddress) });
          return { account, community, ...accountsActions };
        });
        rendered.detach();
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
          const account = {
            ...rendered.result.current.account,
            pkcOptions,
            // the 'admin' role signer of communityAddress
            signer: {
              type: "ed25519",
              privateKey: adminRoleSigner.privateKey,
              address: adminRoleSigner.address,
            },
            author: {
              ...rendered.result.current.account.author,
              address: adminRoleSigner.address,
            },
          };
          await rendered.result.current.setAccount(account);
        });
        expect(rendered.result.current.account.pkcOptions).to.deep.equal(pkcOptions);
        console.log("after set account");
      });

      it("publish community edit", async () => {
        console.log("before used community");
        rendered.rerender(communityAddress);
        await waitFor(() => rendered.result.current.community.address === communityAddress);
        await waitFor(
          () => rendered.result.current.community.roles[adminRoleSigner.address].role === "admin",
        );
        expect(rendered.result.current.community.address).to.equal(communityAddress);
        expect(rendered.result.current.community.roles[adminRoleSigner.address].role).to.equal(
          "admin",
        );
        console.log("after used community");

        // publish community edit
        const onChallenge = (challenge, communityEdit) =>
          communityEdit.publishChallengeAnswers(["2"]);
        const onChallengeVerificationCalls = [];
        const onChallengeVerification = (...args) => onChallengeVerificationCalls.push([...args]);
        const editedTitle = `edited title ${Math.random()}`;
        console.log("before pkc.publishCommunityEdit()");
        await act(async () => {
          await rendered.result.current.publishCommunityEdit(communityAddress, {
            title: editedTitle,
            onChallenge,
            onChallengeVerification,
          });
        });
        console.log("after pkc.publishCommunityEdit()");

        console.log("before onChallengeVerification");
        await waitFor(() => onChallengeVerificationCalls.length >= 1);
        expect(onChallengeVerificationCalls.length).to.equal(1);
        expect(onChallengeVerificationCalls[0][0].challengeSuccess).to.equal(true);
        console.log(onChallengeVerificationCalls[0][0]);
        console.log("after onChallengeVerification");

        await waitFor(() => rendered.result.current.community.title === editedTitle);
        expect(rendered.result.current.community.title).to.equal(editedTitle);
        console.log(rendered.result.current.community.title);
      });
    });

    describe(`publish (${pkcOptionsType})`, { retry: 2 }, () => {
      let rendered, waitFor, publishedCid;

      beforeAll(async () => {
        rendered = renderHook((commentCid) => {
          const account = useAccount();
          const { accountVotes } = useAccountVotes();
          const { accountComments } = useAccountComments();
          const notifications = useNotifications();
          const comment = useComment({ commentCid });
          const replies = useReplies({ comment });
          return {
            account,
            accountVotes,
            accountComments,
            notifications,
            comment,
            replies,

            ...accountsActions,
          };
        });
        rendered.detach();
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

      describe(`create comment (${pkcOptionsType})`, () => {
        let onChallengeCalled = 0;
        let challenge, comment;
        const onChallenge = (_challenge, _comment) => {
          console.log("onChallenge");
          console.log(_challenge);
          challenge = _challenge;
          comment = _comment;
          onChallengeCalled++;
        };
        let onChallengeVerificationCalled = 0;
        let challengeVerification, commentVerified;
        const onChallengeVerification = (_challengeVerification, _commentVerified) => {
          console.log("onChallengeVerification");
          console.log(_challengeVerification);
          challengeVerification = _challengeVerification;
          commentVerified = _commentVerified;
          onChallengeVerificationCalled++;
        };

        it(`publish comment (${pkcOptionsType})`, async () => {
          const publishCommentOptions = {
            communityAddress,
            title: "some title",
            content: "some content",
            onChallenge,
            onChallengeVerification,
          };
          await act(async () => {
            console.log("before publishComment");
            await rendered.result.current.publishComment(publishCommentOptions);
            console.log("after publishComment");
          });
        });

        it(`onChallenge gets called (${pkcOptionsType})`, async () => {
          await waitFor(() => onChallengeCalled > 0);
          expect(onChallengeCalled).to.equal(1);

          expect(challenge.type).to.equal("CHALLENGE");
          expect(typeof comment.publishChallengeAnswers).to.equal("function");
        });

        it(`onChallengeVerification gets called (${pkcOptionsType})`, async () => {
          // publish challenge answer and wait for verification
          comment.publishChallengeAnswers(["2"]);
          await waitFor(() => onChallengeVerificationCalled > 0);
          expect(onChallengeVerificationCalled).to.equal(1);
          expect(challengeVerification.type).to.equal("CHALLENGEVERIFICATION");
          expect(typeof challengeVerification.commentUpdate.cid).to.equal("string");
          expect(commentVerified.constructor.name).to.match(/Comment|Post/);
          console.log("after onChallengeVerification");

          publishedCid = challengeVerification.commentUpdate.cid;
        });

        it(`published comment is in account comments (${pkcOptionsType})`, async () => {
          console.log("before comment in accountComments");
          await waitFor(() => rendered.result.current.accountComments.length > 0);
          expect(rendered.result.current.accountComments.length).to.be.greaterThan(0);
          console.log("after comment in accountComments");
          console.log(rendered.result.current.accountComments);
          console.log("before cid");
          // for unknown reason 'setAccountsComments' in accountsActions.publishComment comment.once('challengeverification')
          // never gets triggered, so we can't test if the cid gets added to accounts comments
          // it could be because of a race condition between the 2 setAccountsComments calls
          console.log(`TODO: figure out why cid doesn't get added to accountComments`);
          // await waitFor(() => typeof rendered.result.current.accountComments[0].cid === 'string')
          // console.log(rendered.result.current.accountComments)
          // expect(typeof rendered.result.current.accountComments[0].cid).to.equal('string')
          // publishedCid = rendered.result.current.accountComments[0].cid
          // console.log('after cid', publishedCid)
        });

        it(`publish reply (${pkcOptionsType})`, { retry: 2 }, async () => {
          // make sure there's no notifications
          expect(rendered.result.current.notifications.notifications.length).to.equal(0);

          const onChallenge = (challenge, comment) => {
            console.log("onChallenge");
            console.log(challenge);
            comment.publishChallengeAnswers(["2"]);
          };
          let replyChallengeVerification;
          const onChallengeVerification = (challengeVerification, comment) => {
            console.log("onChallengeVerification");
            console.log(challengeVerification);
            if (!challengeVerification.challengeSuccess) {
              console.error(
                `DIAGNOSTIC: reply challengeVerification FAILED: reason=${challengeVerification.reason}, challengeErrors=${JSON.stringify(challengeVerification.challengeErrors)}`,
              );
            }
            replyChallengeVerification = challengeVerification;
          };
          // wait for the parent comment to be indexed by the community before publishing a reply
          console.log(`publish reply: publishedCid=${publishedCid}, typeof=${typeof publishedCid}`);
          rendered.rerender(publishedCid);
          await waitFor(() => typeof rendered.result.current.comment?.updatedAt === "number");
          const parentComment = rendered.result.current.comment;
          console.log(
            `publish reply: after waitFor updatedAt=${parentComment?.updatedAt}, cid=${parentComment?.cid}, timestamp=${parentComment?.timestamp}`,
          );
          if (typeof parentComment?.updatedAt !== "number") {
            console.error(
              "DIAGNOSTIC: waitFor(updatedAt) resolved without updatedAt being a number! Parent may not be indexed.",
            );
            console.error(
              `DIAGNOSTIC: comment state: ${JSON.stringify({ cid: parentComment?.cid, updatedAt: parentComment?.updatedAt, timestamp: parentComment?.timestamp, depth: parentComment?.depth })}`,
            );
          }
          console.log("parent comment indexed, publishing reply");

          const publishCommentOptions = {
            communityAddress,
            parentCid: publishedCid,
            postCid: publishedCid,
            content: "some content",
            onChallenge,
            onChallengeVerification,
          };
          await act(async () => {
            console.log("before publishComment");
            await rendered.result.current.publishComment(publishCommentOptions);
            console.log("after publishComment");
          });

          // wait for reply challenge verification
          await waitFor(() => replyChallengeVerification);
          expect(replyChallengeVerification.challengeSuccess).to.equal(
            true,
            "Not expected this challengeVerification: " +
              JSON.stringify(replyChallengeVerification),
          );
          console.log("after onChallengeVerification");

          // wait for useReplies
          expect(typeof publishedCid).to.equal("string");
          await waitFor(() => rendered.result.current.replies.replies.length > 0);
          expect(rendered.result.current.replies.replies.length).to.equal(1);
          console.log("after useReplies");

          // wait for useNotifications
          await waitFor(() => rendered.result.current.notifications.notifications.length > 0);
          expect(rendered.result.current.notifications.notifications.length).to.equal(1);
          console.log("after useNotifications");
        });
      });
    });
  });
}
