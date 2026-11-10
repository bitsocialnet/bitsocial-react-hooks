import utils from "./utils";

describe("utils", () => {
  test("communityPostsCacheExpired returns false when fetchedAt is missing", () => {
    expect(utils.communityPostsCacheExpired(undefined)).toBe(false);
    expect(utils.communityPostsCacheExpired({})).toBe(false);
  });

  describe("repliesAreValid", () => {
    test("accepts reply pages when comment and reply community addresses are .eth/.bso aliases", async () => {
      const comment = {
        cid: "comment-1",
        depth: 0,
        communityAddress: "music-posting.bso",
        replies: {
          pages: {
            new: {
              comments: [
                {
                  cid: "reply-1",
                  depth: 1,
                  parentCid: "comment-1",
                  communityAddress: "music-posting.eth",
                },
              ],
            },
          },
        },
      };
      const pkc = {
        validateComment: async () => true,
      };

      await expect(utils.repliesAreValid(comment as any, {}, pkc)).resolves.toBe(true);
    });

    test("accepts legacy reply pages that still use communityAddress", async () => {
      const validateComment = vi.fn(async () => true);
      const comment = {
        cid: "comment-legacy",
        depth: 0,
        communityAddress: "music-posting.eth",
        replies: {
          pages: {
            new: {
              comments: [
                {
                  cid: "reply-legacy",
                  depth: 1,
                  parentCid: "comment-legacy",
                  communityAddress: "music-posting.eth",
                },
              ],
            },
          },
        },
      };
      const pkc = { validateComment };

      await expect(utils.repliesAreValid(comment as any, {}, pkc)).resolves.toBe(true);
      expect(validateComment).toHaveBeenCalledWith(
        expect.objectContaining({
          cid: "reply-legacy",
          communityAddress: "music-posting.eth",
        }),
        expect.objectContaining({ validateReplies: false }),
      );
    });

    const getCommentWithReply = (communityAddress: string) => ({
      cid: `${communityAddress} comment`,
      depth: 0,
      communityAddress,
      replies: {
        pages: {
          new: {
            comments: [
              {
                cid: `${communityAddress} reply`,
                depth: 1,
                parentCid: `${communityAddress} comment`,
                communityAddress,
              },
            ],
          },
        },
      },
    });
    const invalidSignaturePkc = {
      validateComment: async () => {
        throw Error("invalid reply signature");
      },
    };

    test("rejects replies whose signature is invalid", async () => {
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      try {
        const comment = getCommentWithReply("invalid-reply-signature.bso");
        await expect(utils.repliesAreValid(comment as any, {}, invalidSignaturePkc)).resolves.toBe(
          false,
        );
      } finally {
        logSpy.mockRestore();
      }
    });

    test("doesn't block the community of an invalid reply when blockCommunity is false", async () => {
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      try {
        const comment = getCommentWithReply("invalid-reply-not-blocked.bso");
        await expect(
          utils.repliesAreValid(comment as any, { blockCommunity: false }, invalidSignaturePkc),
        ).resolves.toBe(false);
        const validPkc = { validateComment: async () => {} };
        await expect(utils.repliesAreValid(comment as any, {}, validPkc)).resolves.toBe(true);
      } finally {
        logSpy.mockRestore();
      }
    });
  });

  describe("commentIsValid", () => {
    const validPkc = { validateComment: async () => {} };

    test("doesn't block the community when there is no pkc client to validate with", async () => {
      const comment = { cid: "no-pkc-comment", communityAddress: "no-pkc-community.bso" };
      await expect(utils.commentIsValid(comment as any, {}, undefined)).resolves.toBe(false);
      await expect(utils.commentIsValid(comment as any, {}, validPkc)).resolves.toBe(true);
    });

    test("an invalid comment without a community address doesn't block other comments", async () => {
      const pkc = {
        validateComment: async (comment: any) => {
          if (comment.cid === "invalid-comment-without-community") {
            throw Error("invalid comment");
          }
        },
      };
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      try {
        await expect(
          utils.commentIsValid({ cid: "invalid-comment-without-community" } as any, {}, pkc),
        ).resolves.toBe(false);
        await expect(
          utils.commentIsValid({ cid: "valid-comment-without-community" } as any, {}, pkc),
        ).resolves.toBe(true);
      } finally {
        logSpy.mockRestore();
      }
    });
  });

  test("flattenCommentsPages", async () => {
    const page = {
      comments: [
        {
          cid: "1",
          replies: {
            pages: {
              new: {
                comments: [
                  { cid: "4" },
                  {
                    cid: "5",
                    replies: {
                      pages: {
                        topAll: {
                          comments: [{ cid: "6" }, { cid: "7" }],
                        },
                        new: {
                          comments: [{ cid: "7" }],
                        },
                      },
                    },
                  },
                ],
              },
            },
          },
        },
        { cid: "2" },
        { cid: "3" },
      ],
    };

    const flattedReplies = utils.flattenCommentsPages(page);
    expect(flattedReplies.length).toBe(7);
    expect(flattedReplies[0].cid).toBe("1");
    expect(flattedReplies[1].cid).toBe("2");
    expect(flattedReplies[2].cid).toBe("3");
    expect(flattedReplies[3].cid).toBe("4");
    expect(flattedReplies[4].cid).toBe("5");
    expect(flattedReplies[5].cid).toBe("6");
    expect(flattedReplies[6].cid).toBe("7");

    const pagesInstance = {
      pages: { new: page },
    };
    const flattedReplies2 = utils.flattenCommentsPages(pagesInstance);
    expect(flattedReplies2).toEqual(flattedReplies);

    const pagesdotpagesInstance = { new: page };
    const flattedReplies3 = utils.flattenCommentsPages(pagesdotpagesInstance);
    expect(flattedReplies3).toEqual(flattedReplies);
  });

  describe("memo", () => {
    test("can cache multiple args", async () => {
      let calledTimes = 0;
      const functionToMemo = (...args: any) => ++calledTimes;
      const memoedFunction = utils.memo(functionToMemo, { maxSize: 100 });
      expect(await memoedFunction("1", 2, undefined, null)).toBe(1);
      expect(await memoedFunction("1", 2, undefined, null)).toBe(1);
      expect(await memoedFunction("2", 2, undefined, null)).toBe(2);
    });

    test("can lru", async () => {
      let calledTimes = 0;
      const functionToMemo = (...args: any) => ++calledTimes;
      const memoedFunction = utils.memo(functionToMemo, { maxSize: 1 });
      expect(await memoedFunction("1", 2, undefined, null)).toBe(1);
      expect(await memoedFunction("1", 2, undefined, null)).toBe(1);
      expect(await memoedFunction("2", 2, undefined, null)).toBe(2);
      expect(await memoedFunction("1", 2, undefined, null)).toBe(3);
    });

    test("can cache pending", async () => {
      let delay = 1;
      let calledTimes = 0;
      const functionToMemo = async (arg: any) => {
        await new Promise((r) => setTimeout(r, delay++ * 10));
        return ++calledTimes;
      };
      const memoedFunction = utils.memo(functionToMemo, { maxSize: 100 });
      const arg1 = {};
      const arg2 = {};
      const results = await Promise.all([
        memoedFunction(arg1),
        memoedFunction(arg1),
        memoedFunction(arg1),
        memoedFunction(arg2),
      ]);
      expect(results).toEqual([1, 1, 1, 2]);
    });

    test("can throw pending", async () => {
      let delay = 1;
      let calledTimes = 0;
      const functionToMemo = async (arg: any) => {
        await new Promise((r) => setTimeout(r, delay++ * 10));
        if (calledTimes !== 0) {
          throw "failed";
        }
        return ++calledTimes;
      };
      const memoedFunction = utils.memo(functionToMemo, { maxSize: 100 });
      const arg1 = {};
      const arg2 = {};
      expect(await memoedFunction(arg1)).toBe(1);
      expect(await memoedFunction(arg1)).toBe(1);
      expect(await memoedFunction(arg1)).toBe(1);
      await expect(memoedFunction(arg2)).rejects.toThrow(`failed`);
    });

    test("wrong args", async () => {
      let calledTimes = 0;
      const functionToMemo = async (arg: any) => {
        return ++calledTimes;
      };
      const memoedFunction = utils.memo(functionToMemo, { maxSize: 100 });
      const arg1 = {};
      const arg2 = {};
      await expect(memoedFunction(arg1, arg2)).rejects.toThrow();
      await expect(memoedFunction(arg1, "arg2")).rejects.toThrow();
      await expect(memoedFunction(arg1, undefined)).rejects.toThrow();
    });
  });

  describe("memoSync", () => {
    test("can cache multiple args", async () => {
      let calledTimes = 0;
      const functionToMemo = (...args: any) => ++calledTimes;
      const memoedFunction = utils.memoSync(functionToMemo, { maxSize: 100 });
      expect(memoedFunction("1", 2, undefined, null)).toBe(1);
      expect(memoedFunction("1", 2, undefined, null)).toBe(1);
      expect(memoedFunction("2", 2, undefined, null)).toBe(2);
    });

    test("can lru", async () => {
      let calledTimes = 0;
      const functionToMemo = (...args: any) => ++calledTimes;
      const memoedFunction = utils.memoSync(functionToMemo, { maxSize: 1 });
      expect(memoedFunction("1", 2, undefined, null)).toBe(1);
      expect(memoedFunction("1", 2, undefined, null)).toBe(1);
      expect(memoedFunction("2", 2, undefined, null)).toBe(2);
      expect(memoedFunction("1", 2, undefined, null)).toBe(3);
    });

    test("can throw", async () => {
      let delay = 1;
      let calledTimes = 0;
      const functionToMemo = (arg: any) => {
        if (calledTimes !== 0) {
          throw "failed";
        }
        return ++calledTimes;
      };
      const memoedFunction = utils.memoSync(functionToMemo, { maxSize: 100 });
      const arg1 = {};
      const arg2 = {};
      expect(memoedFunction(arg1)).toBe(1);
      expect(memoedFunction(arg1)).toBe(1);
      expect(memoedFunction(arg1)).toBe(1);
      expect(() => memoedFunction(arg2)).toThrow(`failed`);
    });

    test("wrong args", async () => {
      let calledTimes = 0;
      const functionToMemo = (arg: any) => {
        return ++calledTimes;
      };
      const memoedFunction = utils.memoSync(functionToMemo, { maxSize: 100 });
      const arg1 = {};
      const arg2 = {};
      expect(() => memoedFunction(arg1, arg2)).toThrow();
      expect(() => memoedFunction(arg1, "arg2")).toThrow();
      expect(() => memoedFunction(arg1, undefined)).toThrow();
    });

    test("wrong async", async () => {
      let calledTimes = 0;
      const functionToMemo = async (arg: any) => {
        return ++calledTimes;
      };
      const memoedFunction = utils.memoSync(functionToMemo, { maxSize: 100 });
      const arg1 = {};
      expect(() => memoedFunction(arg1)).toThrow();
      expect(() => memoedFunction("arg2")).toThrow();
    });
  });
});
