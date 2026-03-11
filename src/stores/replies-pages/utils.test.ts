import { addChildrenRepliesFeedsToAddToStore } from "./utils";
import repliesStore from "../replies";
import repliesCommentsStore from "../replies/replies-comments-store";

describe("replies-pages utils", () => {
  let addFeedsToStoreSpy: ReturnType<typeof vi.fn>;
  let addCommentsSpy: ReturnType<typeof vi.fn>;
  let repliesGetState: typeof repliesStore.getState;
  let commentsGetState: typeof repliesCommentsStore.getState;

  beforeEach(() => {
    addFeedsToStoreSpy = vi.fn();
    addCommentsSpy = vi.fn();
    repliesGetState = repliesStore.getState;
    commentsGetState = repliesCommentsStore.getState;
    (repliesStore as any).getState = () => ({
      ...repliesGetState(),
      feedsOptions: {
        "feed-1": {
          commentCid: "parent-cid",
          commentDepth: 0,
          flat: false,
          accountId: "acc1",
          sortType: "best",
        },
      },
      addFeedsToStore: addFeedsToStoreSpy,
    });
    (repliesCommentsStore as any).getState = () => ({
      ...commentsGetState(),
      addCommentsToStoreOrUpdateComments: addCommentsSpy,
    });
  });

  afterEach(() => {
    (repliesStore as any).getState = repliesGetState;
    (repliesCommentsStore as any).getState = commentsGetState;
  });

  test("addChildrenRepliesFeedsToAddToStore adds feeds for page comments with nested replies", () => {
    const page = {
      comments: [
        {
          cid: "reply-1",
          depth: 1,
          communityAddress: "sub1",
          replies: {
            pages: {
              best: { comments: [{ cid: "nested-1", depth: 2 }] },
            },
          },
        },
      ],
    };
    const comment = { cid: "parent-cid", depth: 0 };

    addChildrenRepliesFeedsToAddToStore(page as any, comment as any);

    expect(addFeedsToStoreSpy).toHaveBeenCalled();
    expect(addCommentsSpy).toHaveBeenCalled();
  });

  test("addChildrenRepliesFeedsToAddToStore uses getSortTypeFromPage fallback when no nested comments", () => {
    const page = {
      comments: [{ cid: "reply-1", depth: 1, communityAddress: "sub1" }],
    };
    const comment = { cid: "parent-cid", depth: 0 };

    addChildrenRepliesFeedsToAddToStore(page as any, comment as any);

    expect(addFeedsToStoreSpy).toHaveBeenCalled();
  });

  test("getSortTypeFromPage fallback when page has no comments", () => {
    const page = { comments: undefined };
    const comment = { cid: "parent-cid", depth: 0 };

    addChildrenRepliesFeedsToAddToStore(page as any, comment as any);

    expect(addFeedsToStoreSpy).toHaveBeenCalled();
  });

  test("getSortTypeFromPage fallback when replies.pages have no comments with length", () => {
    const page = {
      comments: [
        {
          cid: "reply-1",
          depth: 1,
          replies: { pages: { best: { comments: [] }, new: { comments: [] } } },
        },
      ],
    };
    const comment = { cid: "parent-cid", depth: 0 };

    addChildrenRepliesFeedsToAddToStore(page as any, comment as any);

    expect(addFeedsToStoreSpy).toHaveBeenCalled();
  });
});
