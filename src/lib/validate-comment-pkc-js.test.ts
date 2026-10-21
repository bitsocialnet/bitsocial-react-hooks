// @vitest-environment node
// jsdom's TextEncoder returns a Uint8Array from another realm, which the IPFS hashing library rejects.
import { vi } from "vitest";
// pkc-js is aliased to an empty module in unit tests, so the real one is imported by path to check
// that the offline instance validates exactly like an instance with network clients.
import PKC from "../../node_modules/@pkcprotocol/pkc-js/dist/node/index.js";
import { restorePkcJs, setPkcJs } from "./pkc-js";
import { calculateCommentCid, getOfflinePkc, validateCommentWithPkc } from "./validate-comment";
import fixture from "../../test/fixtures/validate-comment/page-comments.json";

const clone = (value: any) => JSON.parse(JSON.stringify(value));
const [commentA, commentB] = fixture.comments;
const community = {
  address: fixture.communityPublicKey,
  publicKey: fixture.communityPublicKey,
  signature: { publicKey: fixture.communitySignerPublicKey },
};

describe("validateComment offline pkc instance", () => {
  let networkPkc: any;
  let offlinePkc: any;

  beforeAll(async () => {
    setPkcJs(PKC);
    // pkc-js's default gateway, pubsub provider and http router clients, created but unused, like
    // the network clients of an account's instance
    networkPkc = await PKC({ noData: true });
    offlinePkc = await getOfflinePkc();
  });
  afterAll(async () => {
    await Promise.all([networkPkc?.destroy(), offlinePkc?.destroy()]);
    restorePkcJs();
  });

  test("is created once, without network clients", async () => {
    expect(await getOfflinePkc()).toBe(offlinePkc);
    expect(Object.keys(offlinePkc.clients).sort()).toEqual(Object.keys(networkPkc.clients).sort());
    for (const clients of Object.values(offlinePkc.clients)) {
      expect(clients).toEqual({});
    }
    expect(offlinePkc.nameResolvers).toBe(undefined);
    expect(offlinePkc.dataPath).toBe(undefined);
    expect(Object.keys(networkPkc.clients.ipfsGateways).length).toBeGreaterThan(0);
  });

  test("gives the same results as an instance with network clients", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    // rehashed so that only the author's signature fails
    const forgedComment = clone(commentA);
    forgedComment.raw.comment.content = "forged content";
    forgedComment.cid = await calculateCommentCid(forgedComment.raw.comment);
    const forgedUpdate = clone(commentA);
    forgedUpdate.raw.commentUpdate.upvoteCount += 1000;
    const wrongCid = {
      cid: commentB.cid,
      raw: { comment: commentA.raw.comment, commentUpdate: commentB.raw.commentUpdate },
    };
    const otherCommunity = { ...community, publicKey: "12D3KooWOtherCommunity" };

    const cases: [string, any, any, boolean][] = [
      ["valid comment", commentA, {}, true],
      ["valid comment without replies", commentA, { validateReplies: false }, true],
      ["valid comment with its community", commentA, { community }, true],
      ["valid legacy comment", fixture.legacyComment, {}, true],
      ["forged comment signature", forgedComment, {}, false],
      ["forged commentUpdate signature", forgedUpdate, {}, false],
      ["wrong cid", wrongCid, {}, false],
      ["wrong community", commentA, { community: otherCommunity }, false],
    ];
    for (const [name, comment, options, valid] of cases) {
      const networkResult = await validateCommentWithPkc(clone(comment), options, networkPkc);
      const offlineResult = await validateCommentWithPkc(clone(comment), options, offlinePkc);
      expect({ name, ...offlineResult }).toEqual({ name, ...networkResult });
      expect({ name, valid: offlineResult.valid }).toEqual({ name, valid });
    }
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
