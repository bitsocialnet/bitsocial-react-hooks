import { vi } from "vitest";
import { act } from "@testing-library/react";
import EventEmitter from "events";
import testUtils, { renderHook } from "../../lib/test-utils";
import useAuthorsCommentsStore, {
  resetAuthorsCommentsDatabaseAndStore,
  commentsPerPage,
  commentBufferSize,
} from "./authors-comments-store";
import accountsStore from "../accounts";
import commentsStore from "../comments";
import { getUpdatedBufferedComments } from "./utils";
import { CommentsFilter, Comment, Account } from "../../types";
import { setPkcJs } from "../..";
import PkcJsMock, { PKC, Comment as MockComment } from "../../lib/pkc-js/pkc-js-mock";

const authorAddress = "author.eth";

describe("authors comments store", () => {
  // tests take longer than default jest 5 seconds because it takes a while to fetch all comments
  const timeout = 20000;

  beforeAll(async () => {
    // set pkc-js mock and reset dbs
    setPkcJs(PkcJsMock);
    await testUtils.resetDatabasesAndStores();

    testUtils.silenceReactWarnings();
  });
  afterAll(async () => {
    testUtils.restoreAll();
  });

  let rendered: any, waitFor: any, account: Account;
  beforeEach(async () => {
    rendered = renderHook<any, any>(() => useAuthorsCommentsStore());
    // large timeout because it takes a while to fetch all comments
    waitFor = testUtils.createWaitFor(rendered, { timeout: 5000 });

    await waitFor(() => Object.values(accountsStore.getState().accounts).length > 0);
    account = Object.values(accountsStore.getState().accounts)[0];
  });

  afterEach(async () => {
    await testUtils.resetDatabasesAndStores();
  });

  test("initial store", { timeout }, async () => {
    expect(rendered.result.current.options).toEqual({});
    expect(rendered.result.current.loadedComments).toEqual({});
    expect(rendered.result.current.hasMoreBufferedComments).toEqual({});
    expect(rendered.result.current.bufferedCommentCids).toEqual({});
    expect(rendered.result.current.nextCommentCidsToFetch).toEqual({});
    expect(rendered.result.current.shouldFetchNextComment).toEqual({});
    expect(rendered.result.current.lastCommentCids).toEqual({});
    expect(typeof rendered.result.current.addAuthorCommentsToStore).toBe("function");
    expect(typeof rendered.result.current.incrementPageNumber).toBe("function");
    expect(typeof rendered.result.current.setNextCommentCidsToFetch).toBe("function");
    expect(typeof rendered.result.current.addBufferedCommentCid).toBe("function");
    expect(typeof rendered.result.current.updateLoadedComments).toBe("function");
    expect(typeof rendered.result.current.setLastCommentCid).toBe("function");
  });

  test("get multiple pages", { timeout }, async () => {
    // mock pkc.getComment() result
    const commentToGet = PKC.prototype.commentToGet;
    const totalAuthorCommentCount = 110;
    let currentAuthorCommentCount = 0;
    PKC.prototype.commentToGet = (commentCid: string) => {
      currentAuthorCommentCount++;
      const authorCommentIndex = totalAuthorCommentCount - currentAuthorCommentCount;
      return {
        cid: commentCid,
        timestamp: 1000 + authorCommentIndex,
        author: {
          address: authorAddress,
          // no previous cid if no more comments
          previousCommentCid:
            authorCommentIndex > 0 ? `previous comment cid ${authorCommentIndex}` : undefined,
        },
      };
    };

    const commentCid = "comment cid";
    const authorCommentsName = authorAddress + "-comments-name";
    act(() => {
      rendered.result.current.addAuthorCommentsToStore(
        authorCommentsName,
        authorAddress,
        commentCid,
        undefined,
        account,
      );
    });

    // wait for 1st page
    await waitFor(
      () => rendered.result.current.loadedComments[authorCommentsName].length === commentsPerPage,
    );
    expect(rendered.result.current.loadedComments[authorCommentsName].length).toBe(commentsPerPage);
    expect(hasDuplicateComments(rendered.result.current.loadedComments[authorCommentsName])).toBe(
      false,
    );
    expect(rendered.result.current.shouldFetchNextComment[authorAddress]).toBe(true);

    // wait for buffered comments to stop loading
    await waitFor(() => rendered.result.current.shouldFetchNextComment[authorAddress] === false);
    expect(rendered.result.current.shouldFetchNextComment[authorAddress]).toBe(false);
    expect(rendered.result.current.bufferedCommentCids[authorAddress].size).toBeGreaterThanOrEqual(
      commentsPerPage + commentBufferSize,
    );
    expect(rendered.result.current.nextCommentCidsToFetch[authorAddress]).not.toBe(undefined);
    expect(rendered.result.current.hasMoreBufferedComments[authorCommentsName]).toBe(true);

    // wait for 2nd page
    act(() => {
      rendered.result.current.incrementPageNumber(authorCommentsName);
    });
    await waitFor(
      () =>
        rendered.result.current.loadedComments[authorCommentsName].length === 2 * commentsPerPage,
    );
    expect(rendered.result.current.loadedComments[authorCommentsName].length).toBe(
      2 * commentsPerPage,
    );
    expect(hasDuplicateComments(rendered.result.current.loadedComments[authorCommentsName])).toBe(
      false,
    );
    // wait for buffered comments to stop loading
    await waitFor(
      () =>
        rendered.result.current.bufferedCommentCids[authorAddress].size >=
        2 * commentsPerPage + commentBufferSize,
    );
    expect(rendered.result.current.bufferedCommentCids[authorAddress].size).toBeGreaterThanOrEqual(
      2 * commentsPerPage + commentBufferSize,
    );
    expect(rendered.result.current.shouldFetchNextComment[authorAddress]).toBe(false);
    expect(rendered.result.current.nextCommentCidsToFetch[authorAddress]).not.toBe(undefined);
    expect(rendered.result.current.hasMoreBufferedComments[authorCommentsName]).toBe(true);

    // wait for 3rd page, fetched all author comments, reach max buffered comments
    act(() => {
      rendered.result.current.incrementPageNumber(authorCommentsName);
    });
    await waitFor(
      () =>
        rendered.result.current.loadedComments[authorCommentsName].length === 3 * commentsPerPage,
    );
    expect(rendered.result.current.loadedComments[authorCommentsName].length).toBe(
      3 * commentsPerPage,
    );
    expect(hasDuplicateComments(rendered.result.current.loadedComments[authorCommentsName])).toBe(
      false,
    );
    // wait for buffered comments to stop loading
    await waitFor(
      () =>
        rendered.result.current.bufferedCommentCids[authorAddress].size === totalAuthorCommentCount,
    );
    expect(rendered.result.current.bufferedCommentCids[authorAddress].size).toBe(
      totalAuthorCommentCount,
    );
    // should fetch comment because buffer is not full, but author has no more comments
    expect(rendered.result.current.shouldFetchNextComment[authorAddress]).toBe(true);
    // fetched all author comments, no next comment to fetch
    expect(rendered.result.current.nextCommentCidsToFetch[authorAddress]).toBe(undefined);
    expect(rendered.result.current.hasMoreBufferedComments[authorCommentsName]).toBe(true);

    // wait for 4th page, fetched all author comments, reach max buffered comments
    act(() => {
      rendered.result.current.incrementPageNumber(authorCommentsName);
    });
    await waitFor(
      () =>
        rendered.result.current.loadedComments[authorCommentsName].length === 4 * commentsPerPage,
    );
    expect(rendered.result.current.loadedComments[authorCommentsName].length).toBe(
      4 * commentsPerPage,
    );
    expect(hasDuplicateComments(rendered.result.current.loadedComments[authorCommentsName])).toBe(
      false,
    );
    // wait for buffered comments to stop loading
    await waitFor(
      () =>
        rendered.result.current.bufferedCommentCids[authorAddress].size === totalAuthorCommentCount,
    );
    expect(rendered.result.current.bufferedCommentCids[authorAddress].size).toBe(
      totalAuthorCommentCount,
    );
    // should fetch comment because buffer is not full, but author has no more comments
    expect(rendered.result.current.shouldFetchNextComment[authorAddress]).toBe(true);
    // fetched all author comments, no next comment to fetch
    expect(rendered.result.current.nextCommentCidsToFetch[authorAddress]).toBe(undefined);
    expect(rendered.result.current.hasMoreBufferedComments[authorCommentsName]).toBe(true);

    // wait for 5th page, fetched all author comments, reach max loaded and buffered comments
    act(() => {
      rendered.result.current.incrementPageNumber(authorCommentsName);
    });
    await waitFor(
      () =>
        rendered.result.current.loadedComments[authorCommentsName].length ===
        totalAuthorCommentCount,
    );
    expect(rendered.result.current.loadedComments[authorCommentsName].length).toBe(
      totalAuthorCommentCount,
    );
    expect(hasDuplicateComments(rendered.result.current.loadedComments[authorCommentsName])).toBe(
      false,
    );
    // wait for buffered comments to stop loading
    await waitFor(
      () =>
        rendered.result.current.bufferedCommentCids[authorAddress].size === totalAuthorCommentCount,
    );
    expect(rendered.result.current.bufferedCommentCids[authorAddress].size).toBe(
      totalAuthorCommentCount,
    );
    // should fetch comment because buffer is not full, but author has no more comments
    expect(rendered.result.current.shouldFetchNextComment[authorAddress]).toBe(true);
    // fetched all author comments, no next comment to fetch
    expect(rendered.result.current.nextCommentCidsToFetch[authorAddress]).toBe(undefined);
    expect(rendered.result.current.hasMoreBufferedComments[authorCommentsName]).toBe(false);

    // restore mock
    PKC.prototype.commentToGet = commentToGet;
  });

  test("discover new lastCommentCid while scrolling", { timeout }, async () => {
    // mock pkc.getComment() result
    const commentToGet = PKC.prototype.commentToGet;
    const firstTimestamp = 1000;
    const totalAuthorCommentCount = 105;
    const totalAuthorCommentCountFromLastCommentCid = 40;
    const totalAuthorCommentCountFromLastCommentCid2 = 10;
    PKC.prototype.commentToGet = (commentCid: string) => {
      let authorCommentIndex = Number(commentCid.match(/\d+$/)?.[0]);
      if (commentCid === "comment cid") {
        authorCommentIndex = totalAuthorCommentCount;
      }
      if (commentCid === "community last comment cid") {
        authorCommentIndex = totalAuthorCommentCountFromLastCommentCid;
      }
      if (commentCid === "community last comment cid 2") {
        authorCommentIndex = totalAuthorCommentCountFromLastCommentCid2;
      }

      // if is previous from 'comment cid'
      let comment: any = {
        cid: commentCid,
        timestamp: firstTimestamp + authorCommentIndex,
        author: {
          address: authorAddress,
          // no previous cid if no more comments
          previousCommentCid:
            authorCommentIndex > 1 ? `previous comment cid ${authorCommentIndex - 1}` : undefined,
        },
      };

      // add a last comment cid to comments after the 80th comment
      if (totalAuthorCommentCount - authorCommentIndex > 80) {
        comment.author.community = { lastCommentCid: "community last comment cid" };
        comment.communityAddress = "community address";
      }

      // add parent cid to some of the comments for filters
      if (totalAuthorCommentCount - authorCommentIndex > 95) {
        comment.parentCid = "parent cid";
      }

      // if comment is 'community last comment cid'
      if (commentCid === "community last comment cid") {
        // timestamp of last comment cid must be newer than all
        comment.timestamp =
          firstTimestamp + totalAuthorCommentCount + totalAuthorCommentCountFromLastCommentCid;
        // start a new linked list from the last comment cid
        comment.author.previousCommentCid = `previous from last comment cid ${authorCommentIndex - 1}`;
      }

      // if comment is previous from 'community last comment cid'
      if (commentCid.includes("previous from last comment cid")) {
        comment.timestamp = firstTimestamp + totalAuthorCommentCount + authorCommentIndex;
        comment.author.previousCommentCid = `previous from last comment cid ${authorCommentIndex - 1}`;

        // no more comments from last comment cid, go back to first 'comment cid'
        if (authorCommentIndex === 1) {
          comment.author.previousCommentCid = "comment cid";
        }
      }

      // if comment is 'community last comment cid 2'
      if (commentCid === "community last comment cid 2") {
        // timestamp of last comment cid must be newer than all
        comment.timestamp =
          firstTimestamp +
          totalAuthorCommentCount +
          totalAuthorCommentCountFromLastCommentCid +
          totalAuthorCommentCountFromLastCommentCid2;
        // start a new linked list from the last comment cid
        comment.author.previousCommentCid = `previous 2 from last comment cid ${authorCommentIndex - 1}`;
      }

      // if comment is previous from 'community last comment cid 2'
      if (commentCid.includes("previous 2 from last comment cid")) {
        comment.timestamp = firstTimestamp + totalAuthorCommentCount + authorCommentIndex;
        comment.author.previousCommentCid = `previous 2 from last comment cid ${authorCommentIndex - 1}`;

        // no more comments from last comment cid, go back to first 'community last comment cid'
        if (authorCommentIndex === 1) {
          comment.author.previousCommentCid = "community last comment cid";
        }
      }

      // test different author
      if (commentCid.includes("different author")) {
        return {
          cid: commentCid,
          timestamp: firstTimestamp + authorCommentIndex,
          author: {
            address: "different-" + authorAddress,
            // no previous cid if no more comments
            previousCommentCid:
              authorCommentIndex > 1
                ? `different author comment cid ${authorCommentIndex - 1}`
                : undefined,
          },
        };
      }

      return comment;
    };

    const commentCid = "comment cid";
    const authorCommentsName = authorAddress + "-no-filter";
    act(() => {
      rendered.result.current.addAuthorCommentsToStore(
        authorCommentsName,
        authorAddress,
        commentCid,
        undefined,
        account,
      );
    });

    // wait for 1st page
    await waitFor(
      () => rendered.result.current.loadedComments[authorCommentsName].length === commentsPerPage,
    );
    expect(rendered.result.current.loadedComments[authorCommentsName].length).toBe(commentsPerPage);
    expect(hasDuplicateComments(rendered.result.current.loadedComments[authorCommentsName])).toBe(
      false,
    );
    expect(rendered.result.current.shouldFetchNextComment[authorAddress]).toBe(true);
    // wait for buffered comments to stop loading
    await waitFor(() => rendered.result.current.shouldFetchNextComment[authorAddress] === false);
    expect(rendered.result.current.shouldFetchNextComment[authorAddress]).toBe(false);
    expect(rendered.result.current.bufferedCommentCids[authorAddress].size).toBeGreaterThanOrEqual(
      commentsPerPage + commentBufferSize,
    );
    expect(rendered.result.current.nextCommentCidsToFetch[authorAddress]).not.toBe(undefined);

    // last comment cid should be undefined because it's on the 80th posts and there's only 75 loaded
    expect(rendered.result.current.lastCommentCids[authorAddress]).toBe(undefined);

    // wait for 2nd page
    act(() => {
      rendered.result.current.incrementPageNumber(authorCommentsName);
    });
    await waitFor(
      () =>
        rendered.result.current.loadedComments[authorCommentsName].length === 2 * commentsPerPage,
    );
    expect(rendered.result.current.loadedComments[authorCommentsName].length).toBe(
      2 * commentsPerPage,
    );
    expect(hasDuplicateComments(rendered.result.current.loadedComments[authorCommentsName])).toBe(
      false,
    );
    // wait for buffered comments to stop loading
    await waitFor(
      () =>
        rendered.result.current.bufferedCommentCids[authorAddress].size >=
        2 * commentsPerPage + commentBufferSize,
    );
    expect(rendered.result.current.bufferedCommentCids[authorAddress].size).toBeGreaterThanOrEqual(
      2 * commentsPerPage + commentBufferSize,
    );
    expect(rendered.result.current.shouldFetchNextComment[authorAddress]).toBe(false);
    expect(rendered.result.current.nextCommentCidsToFetch[authorAddress]).not.toBe(undefined);

    // wait for last comment cid
    await waitFor(
      () => rendered.result.current.lastCommentCids[authorAddress] === "community last comment cid",
    );
    expect(rendered.result.current.lastCommentCids[authorAddress]).toBe(
      "community last comment cid",
    );

    // last comment of loaded comments is from 'comment cid' previous comments because already loaded feeds can't change
    let bufferedComments = getBufferedComments(rendered, authorCommentsName, authorAddress);
    expect(bufferedComments[2 * commentsPerPage - 1].cid).toBe("previous comment cid 56");
    expect(
      rendered.result.current.loadedComments[authorCommentsName][2 * commentsPerPage - 1].cid,
    ).toBe("previous comment cid 56");

    // first comment of next page is from last cid because buffered comments get reordered by most recent as they are fetched
    expect(bufferedComments[2 * commentsPerPage].cid).toBe("community last comment cid");
    expect(bufferedComments[2 * commentsPerPage + 1].cid).toBe("previous from last comment cid 39");

    // discover older lastCommentCid, should do nothing because not new
    commentsStore.setState((state: any) => {
      const commentCid = "previous comment cid 100";
      const comment = { ...state.comments[commentCid] };
      comment.author.community = { lastCommentCid: "previous comment cid 3" };
      return { comments: { ...state.comments, [commentCid]: comment } };
    });

    // wait for 3rd page, still has more comments to buffer because of new comments from lastCommentCid
    act(() => {
      rendered.result.current.incrementPageNumber(authorCommentsName);
    });
    await waitFor(
      () =>
        rendered.result.current.loadedComments[authorCommentsName].length === 3 * commentsPerPage,
    );
    expect(rendered.result.current.loadedComments[authorCommentsName].length).toBe(
      3 * commentsPerPage,
    );
    expect(hasDuplicateComments(rendered.result.current.loadedComments[authorCommentsName])).toBe(
      false,
    );
    // wait for buffered comments to stop loading
    await waitFor(
      () =>
        rendered.result.current.bufferedCommentCids[authorAddress].size >=
        3 * commentsPerPage + commentBufferSize,
    );
    expect(rendered.result.current.bufferedCommentCids[authorAddress].size).toBeGreaterThanOrEqual(
      3 * commentsPerPage + commentBufferSize,
    );
    // buffer is full because of new comments from lastCommentCid
    expect(rendered.result.current.shouldFetchNextComment[authorAddress]).toBe(false);
    // not yet fetched all author comments because of new comments from lastCommentCid
    expect(typeof rendered.result.current.nextCommentCidsToFetch[authorAddress]).toBe("string");

    // last comment of loaded comments is from 'comment cid' previous comments because not all comments from lastCommentCid have loaded yet
    // (React 19 batching may produce off-by-one; accept 47 or 48)
    bufferedComments = getBufferedComments(rendered, authorCommentsName, authorAddress);
    expect(["previous comment cid 47", "previous comment cid 48"]).toContain(
      bufferedComments[3 * commentsPerPage - 1].cid,
    );
    expect(["previous comment cid 47", "previous comment cid 48"]).toContain(
      rendered.result.current.loadedComments[authorCommentsName][3 * commentsPerPage - 1].cid,
    );

    // first comments of next page are from last cid because buffered comments get reordered by most recent as they are fetched
    // (React 19 batching may produce off-by-one; accept adjacent values)
    expect(["previous from last comment cid 23", "previous from last comment cid 24"]).toContain(
      bufferedComments[3 * commentsPerPage].cid,
    );
    expect(["previous from last comment cid 22", "previous from last comment cid 23"]).toContain(
      bufferedComments[3 * commentsPerPage + 1].cid,
    );

    // wait for 4th page, fetched all author comments, reach max buffered comments
    act(() => {
      rendered.result.current.incrementPageNumber(authorCommentsName);
    });
    await waitFor(
      () =>
        rendered.result.current.loadedComments[authorCommentsName].length === 4 * commentsPerPage,
    );
    expect(rendered.result.current.loadedComments[authorCommentsName].length).toBe(
      4 * commentsPerPage,
    );
    expect(hasDuplicateComments(rendered.result.current.loadedComments[authorCommentsName])).toBe(
      false,
    );
    // wait for buffered comments to stop loading
    await waitFor(
      () =>
        rendered.result.current.bufferedCommentCids[authorAddress].size ===
        totalAuthorCommentCount + totalAuthorCommentCountFromLastCommentCid,
    );
    expect(rendered.result.current.bufferedCommentCids[authorAddress].size).toBe(
      totalAuthorCommentCount + totalAuthorCommentCountFromLastCommentCid,
    );
    // should fetch comment because buffer is not full, but author has no more comments
    expect(rendered.result.current.shouldFetchNextComment[authorAddress]).toBe(true);
    // fetched all author comments, no next comment to fetch
    expect(rendered.result.current.nextCommentCidsToFetch[authorAddress]).toBe(undefined);

    // no more comments from 'community last comment cid'
    bufferedComments = getBufferedComments(rendered, authorCommentsName, authorAddress);
    expect(bufferedComments[4 * commentsPerPage - 1].cid).toBe("previous comment cid 46");
    expect(
      rendered.result.current.loadedComments[authorCommentsName][4 * commentsPerPage - 1].cid,
    ).toBe("previous comment cid 46");
    expect(bufferedComments[4 * commentsPerPage].cid).toBe("previous comment cid 45");
    expect(bufferedComments[4 * commentsPerPage + 1].cid).toBe("previous comment cid 44");

    // discover a second lastCommentCid
    commentsStore.setState((state: any) => {
      const commentCid = "comment cid";
      const comment = { ...state.comments[commentCid] };
      comment.author.community = { lastCommentCid: "community last comment cid 2" };
      return { comments: { ...state.comments, [commentCid]: comment } };
    });

    // wait for last comment cid and next comment cid to fetch
    await waitFor(
      () =>
        rendered.result.current.lastCommentCids[authorAddress] === "community last comment cid 2",
    );
    expect(rendered.result.current.lastCommentCids[authorAddress]).toBe(
      "community last comment cid 2",
    );
    // React 19 batching may produce off-by-one; accept 8 or 9
    expect(["previous 2 from last comment cid 8", "previous 2 from last comment cid 9"]).toContain(
      rendered.result.current.nextCommentCidsToFetch[authorAddress],
    );

    // wait for 5th page, fetched all author comments, reach max buffered comments
    act(() => {
      rendered.result.current.incrementPageNumber(authorCommentsName);
    });
    await waitFor(
      () =>
        rendered.result.current.loadedComments[authorCommentsName].length === 5 * commentsPerPage,
    );
    expect(rendered.result.current.loadedComments[authorCommentsName].length).toBe(
      5 * commentsPerPage,
    );
    expect(hasDuplicateComments(rendered.result.current.loadedComments[authorCommentsName])).toBe(
      false,
    );
    // wait for buffered comments to stop loading
    await waitFor(
      () =>
        rendered.result.current.bufferedCommentCids[authorAddress].size ===
        totalAuthorCommentCount +
          totalAuthorCommentCountFromLastCommentCid +
          totalAuthorCommentCountFromLastCommentCid2,
    );
    expect(rendered.result.current.bufferedCommentCids[authorAddress].size).toBe(
      totalAuthorCommentCount +
        totalAuthorCommentCountFromLastCommentCid +
        totalAuthorCommentCountFromLastCommentCid2,
    );
    // should fetch comment because buffer is not full, but author has no more comments
    expect(rendered.result.current.shouldFetchNextComment[authorAddress]).toBe(true);
    // fetched all author comments, no next comment to fetch
    expect(rendered.result.current.nextCommentCidsToFetch[authorAddress]).toBe(undefined);

    // last comment of loaded comments is from 'comment cid' previous comments because not all comments from lastCommentCid have loaded yet
    // (React 19 batching may produce off-by-one; accept 22 or 23)
    bufferedComments = getBufferedComments(rendered, authorCommentsName, authorAddress);
    expect(["previous comment cid 22", "previous comment cid 23"]).toContain(
      bufferedComments[5 * commentsPerPage - 1].cid,
    );
    expect(["previous comment cid 22", "previous comment cid 23"]).toContain(
      rendered.result.current.loadedComments[authorCommentsName][5 * commentsPerPage - 1].cid,
    );

    // first comments of next page are from last cid because buffered comments get reordered by most recent as they are fetched
    expect(["previous 2 from last comment cid 8", "previous 2 from last comment cid 9"]).toContain(
      bufferedComments[5 * commentsPerPage].cid,
    );
    expect(["previous 2 from last comment cid 7", "previous 2 from last comment cid 8"]).toContain(
      bufferedComments[5 * commentsPerPage + 1].cid,
    );

    // add another author comments with post filter
    const postFilterName = authorAddress + "-post-filter";
    const postFilter = {
      filter: (comment: Comment) => !comment.parentCid,
      key: "post-filter",
    };
    act(() => {
      rendered.result.current.addAuthorCommentsToStore(
        postFilterName,
        authorAddress,
        commentCid,
        postFilter,
        account,
      );
    });
    await waitFor(
      () => rendered.result.current.loadedComments[postFilterName].length === commentsPerPage,
    );

    // scroll all pages
    const postCount = 128;
    await scrollPagesToComment(rendered, postFilterName, postCount, waitFor);

    // the filter actually filtered
    expect(rendered.result.current.loadedComments[postFilterName].length).not.toBe(
      rendered.result.current.loadedComments[authorCommentsName].length,
    );
    expect(rendered.result.current.loadedComments[postFilterName].length).toBe(postCount);
    for (const comment of rendered.result.current.loadedComments[postFilterName]) {
      expect(comment.parentCid).toBe(undefined);
    }

    // add another author comments with reply filter
    const replyFilterName = authorAddress + "-reply-filter";
    const replyFilter = {
      filter: (comment: Comment) => !!comment.parentCid,
      key: "reply-filter",
    };
    act(() => {
      rendered.result.current.addAuthorCommentsToStore(
        replyFilterName,
        authorAddress,
        commentCid,
        replyFilter,
        account,
      );
    });
    await waitFor(
      () => rendered.result.current.loadedComments[replyFilterName].length === commentsPerPage,
    );

    // scroll all pages
    const replyCount = 27;
    await scrollPagesToComment(rendered, replyFilterName, replyCount, waitFor);

    // the filter actually filtered
    expect(rendered.result.current.loadedComments[replyFilterName].length).not.toBe(
      rendered.result.current.loadedComments[authorCommentsName].length,
    );
    expect(rendered.result.current.loadedComments[replyFilterName].length).toBe(replyCount);
    for (const comment of rendered.result.current.loadedComments[replyFilterName]) {
      expect(comment.parentCid).toBe("parent cid");
    }
    expect(
      rendered.result.current.loadedComments[replyFilterName].length +
        rendered.result.current.loadedComments[postFilterName].length,
    ).toBe(
      totalAuthorCommentCount +
        totalAuthorCommentCountFromLastCommentCid +
        totalAuthorCommentCountFromLastCommentCid2,
    );

    // add another author comments with empty filter
    const emptyFilterName = authorAddress + "-empty-filter";
    const emptyFilter = {
      filter: () => true,
      key: "empty-filter",
    };
    act(() => {
      rendered.result.current.addAuthorCommentsToStore(
        emptyFilterName,
        authorAddress,
        commentCid,
        emptyFilter,
        account,
      );
    });
    await waitFor(
      () => rendered.result.current.loadedComments[emptyFilterName].length === commentsPerPage,
    );
    expect(rendered.result.current.loadedComments[emptyFilterName].length).toBe(commentsPerPage);
    // scroll all pages
    const emptyFilterCommentCount =
      totalAuthorCommentCount +
      totalAuthorCommentCountFromLastCommentCid +
      totalAuthorCommentCountFromLastCommentCid2;
    await scrollPagesToComment(rendered, emptyFilterName, emptyFilterCommentCount, waitFor);
    expect(rendered.result.current.loadedComments[emptyFilterName].length).toBe(
      emptyFilterCommentCount,
    );

    // add another author comments with community filter (0 matching)
    const communityFilterName = authorAddress + "-community-filter";
    const communityFilter = {
      filter: (comment: Comment) => comment.communityAddress === `doesn't exist`,
      key: "community-filter",
    };
    act(() => {
      rendered.result.current.addAuthorCommentsToStore(
        communityFilterName,
        authorAddress,
        commentCid,
        communityFilter,
        account,
      );
    });
    // give some time to load comments
    await new Promise((r) => setTimeout(r, 100));
    expect(rendered.result.current.loadedComments[communityFilterName].length).toBe(0);

    // add another author comments with different address
    const differentAuthorAddress = "different-" + authorAddress;
    const differentAuthorAddressName = differentAuthorAddress + "-name";
    const differentAuthorTotalCommentCount = 30;
    const differentAuthorTotalCommentCountFromLastCid = 60;
    const differentCommentCid = "different author comment cid " + differentAuthorTotalCommentCount;
    act(() => {
      rendered.result.current.addAuthorCommentsToStore(
        differentAuthorAddressName,
        differentAuthorAddress,
        differentCommentCid,
        undefined,
        account,
      );
    });
    await waitFor(
      () =>
        rendered.result.current.loadedComments[differentAuthorAddressName].length ===
        commentsPerPage,
    );
    expect(rendered.result.current.loadedComments[differentAuthorAddressName].length).toBe(
      commentsPerPage,
    );

    // discover a lastCommentCid
    commentsStore.setState((state: any) => {
      const commentCid = "different author comment cid 20";
      const comment = { ...state.comments[commentCid] };
      comment.author.community = {
        lastCommentCid:
          "different author comment cid " + differentAuthorTotalCommentCountFromLastCid,
      };
      return { comments: { ...state.comments, [commentCid]: comment } };
    });

    // wait for 2nd page
    act(() => {
      rendered.result.current.incrementPageNumber(differentAuthorAddressName);
    });
    await waitFor(
      () =>
        rendered.result.current.loadedComments[differentAuthorAddressName].length ===
        2 * commentsPerPage,
    );
    expect(rendered.result.current.loadedComments[differentAuthorAddressName].length).toBe(
      2 * commentsPerPage,
    );
    expect(
      hasDuplicateComments(rendered.result.current.loadedComments[differentAuthorAddressName]),
    ).toBe(false);
    // wait for buffered comments to stop loading
    await waitFor(
      () =>
        rendered.result.current.bufferedCommentCids[differentAuthorAddress].size ===
        differentAuthorTotalCommentCountFromLastCid,
    );
    expect(rendered.result.current.bufferedCommentCids[differentAuthorAddress].size).toBe(
      differentAuthorTotalCommentCountFromLastCid,
    );
    expect(rendered.result.current.shouldFetchNextComment[differentAuthorAddress]).toBe(true);
    expect(rendered.result.current.nextCommentCidsToFetch[differentAuthorAddress]).toBe(undefined);

    // restore mock
    PKC.prototype.commentToGet = commentToGet;
  });

  test("multiple filters and authors at the same time", { timeout }, async () => {
    // because this is a concurrency test, must use overlapping act()
    testUtils.silenceOverlappingActWarning();

    // mock pkc.getComment() result
    const commentToGet = PKC.prototype.commentToGet;
    const getAccountCommentCid = (startCommentCid: string, authorCommentIndex: number) =>
      `${startCommentCid.replace(/\d+$/, "")}${authorCommentIndex}`;
    const getAccountCommentIndex = (commentCid: string) => Number(commentCid.match(/\d+$/)?.[0]);
    PKC.prototype.commentToGet = (commentCid: string) => {
      const authorAddress = commentCid.split(" ")[0];
      const authorCommentIndex = getAccountCommentIndex(commentCid);
      const comment = {
        cid: commentCid,
        timestamp: 1000 + authorCommentIndex,
        author: {
          address: authorAddress,
          // no previous cid if no more comments
          previousCommentCid:
            authorCommentIndex > 1
              ? getAccountCommentCid(commentCid, authorCommentIndex - 1)
              : undefined,
        },
        // 1/3 of comments are replies
        parentCid: authorCommentIndex % 3 === 0 ? "parent cid" : undefined,
        // split comments between 2 subs
        communityAddress: authorCommentIndex % 2 === 0 ? "community1.eth" : "community2.eth",
      };
      return comment;
    };

    const author1 = "author1.eth";
    const author2 = "author2.eth";
    const author3 = "author3.eth";
    const replyFilter = {
      filter: (comment: Comment) => !!comment.parentCid,
      key: "reply-filter",
    };
    const postAndCommunityFilter = {
      filter: (comment: any) => !comment.parentCid && comment.communityAddress === "community2.eth",
      key: "post-community2.eth-filter",
    };
    const author1Name = `${author1}-name`;
    const author2Name = `${author2}-name`;
    const author3Name = `${author3}-name`;
    const author1ReplyFilterName = `${author1}-reply-filter-name`;
    const author1PostAndCommunityFilterName = `${author1}-post-and-community-filter-name`;
    const author1TotalCommentCount = 100;
    const author2TotalCommentCount = 70;
    const author3TotalCommentCount = 50;
    const author1TotalCommentCountFromLastCommentCid = 50;
    const author2TotalCommentCountFromLastCommentCid = 35;
    const author3TotalCommentCountFromLastCommentCid = 20;
    const author1StartCid = "author1.eth cid " + author1TotalCommentCount;
    const author2StartCid = "author2.eth cid " + author2TotalCommentCount;
    const author3StartCid = "author3.eth cid " + author3TotalCommentCount;

    const test = async (
      authorCommentsName: string,
      authorAddress: string,
      startCid: string,
      filter: CommentsFilter | undefined,
      totalAuthorCommentCount: number,
      totalAuthorCommentCountFromLastCommentCid: number,
    ) => {
      // wait for 1st page
      act(() => {
        rendered.result.current.addAuthorCommentsToStore(
          authorCommentsName,
          authorAddress,
          startCid,
          filter,
          account,
        );
      });
      await waitFor(
        () => rendered.result.current.loadedComments[authorCommentsName].length === commentsPerPage,
      );
      expect(rendered.result.current.loadedComments[authorCommentsName].length).toBe(
        commentsPerPage,
      );

      // discover a lastCommentCid on a random comment (or first comment)
      const randomCommentIndexWithLastCommentCid = Math.floor(
        Math.random() * totalAuthorCommentCount + 1,
      );
      const commentCidWithLastCommentCid = getAccountCommentCid(
        startCid,
        randomCommentIndexWithLastCommentCid,
      );
      commentsStore.setState((state: any) => {
        // use startCid as fallback in case the random comment hasn't been fetched yet. A comment
        // still being fetched is in the store without a timestamp, and its first update would
        // replace the lastCommentCid set here, so it can't be used either
        const randomComment = state.comments[commentCidWithLastCommentCid];
        const baseComment = (randomComment?.timestamp && randomComment) ||
          state.comments[startCid] || {
            cid: startCid,
            author: { address: authorAddress },
          };
        const comment = {
          ...baseComment,
          author: {
            ...(baseComment.author || { address: authorAddress }),
            community: {
              ...(baseComment.author?.community || {}),
              lastCommentCid: getAccountCommentCid(
                startCid,
                totalAuthorCommentCount + totalAuthorCommentCountFromLastCommentCid,
              ),
            },
          },
        };
        return { comments: { ...state.comments, [comment.cid || startCid]: comment } };
      });

      // scroll all pages
      let commentCount = totalAuthorCommentCount + totalAuthorCommentCountFromLastCommentCid;
      // 1/3 of comments are replies
      if (filter === replyFilter) {
        commentCount = Math.ceil(commentCount / 3);
      }
      if (filter === postAndCommunityFilter) {
        // 2/3 of comments are posts
        commentCount = Math.ceil((commentCount / 3) * 2);
        // 1/2 of communities are filtered
        commentCount = Math.ceil(commentCount / 2);
      }
      await scrollPagesToComment(rendered, authorCommentsName, commentCount, waitFor);
    };

    // run all tests concurrently to test concurrency
    await Promise.all([
      test(
        author1Name,
        author1,
        author1StartCid,
        undefined,
        author1TotalCommentCount,
        author1TotalCommentCountFromLastCommentCid,
      ),
      test(
        author2Name,
        author2,
        author2StartCid,
        undefined,
        author2TotalCommentCount,
        author2TotalCommentCountFromLastCommentCid,
      ),
      test(
        author3Name,
        author3,
        author3StartCid,
        undefined,
        author3TotalCommentCount,
        author3TotalCommentCountFromLastCommentCid,
      ),
      test(
        author1ReplyFilterName,
        author1,
        author1StartCid,
        replyFilter,
        author1TotalCommentCount,
        author1TotalCommentCountFromLastCommentCid,
      ),
      test(
        author1PostAndCommunityFilterName,
        author1,
        author1StartCid,
        postAndCommunityFilter,
        author1TotalCommentCount,
        author1TotalCommentCountFromLastCommentCid,
      ),
    ]);

    expect(rendered.result.current.loadedComments[author1Name].length).toBe(
      author1TotalCommentCount + author1TotalCommentCountFromLastCommentCid,
    );
    expect(rendered.result.current.loadedComments[author2Name].length).toBe(
      author2TotalCommentCount + author2TotalCommentCountFromLastCommentCid,
    );
    expect(rendered.result.current.loadedComments[author3Name].length).toBe(
      author3TotalCommentCount + author3TotalCommentCountFromLastCommentCid,
    );
    expect(rendered.result.current.loadedComments[author1ReplyFilterName].length).toBe(
      Math.ceil((author1TotalCommentCount + author1TotalCommentCountFromLastCommentCid) / 3),
    );
    expect(rendered.result.current.loadedComments[author1PostAndCommunityFilterName].length).toBe(
      (((author1TotalCommentCount + author1TotalCommentCountFromLastCommentCid) / 3) * 2) / 2,
    );

    // restore mock
    PKC.prototype.commentToGet = commentToGet;
  });

  test("store error paths", { timeout }, async () => {
    const commentToGet = PKC.prototype.commentToGet;
    const totalCount = 110;
    PKC.prototype.commentToGet = (cid: string) => {
      const idx = cid === "comment cid" ? totalCount : Number(cid.match(/\d+$/)?.[0]) || 0;
      return {
        cid,
        timestamp: 1000 + idx,
        author: {
          address: authorAddress,
          previousCommentCid: idx > 0 ? `previous comment cid ${idx - 1}` : undefined,
        },
      };
    };

    const authorCommentsName = authorAddress + "-error-paths";
    const commentCid = "comment cid";
    const store = useAuthorsCommentsStore.getState();

    act(() => {
      store.addAuthorCommentsToStore(
        authorCommentsName,
        authorAddress,
        commentCid,
        undefined,
        account,
      );
    });

    expect(() => store.incrementPageNumber(authorCommentsName)).toThrow(
      "cannot increment page number before current page has loaded",
    );

    await waitFor(
      () =>
        useAuthorsCommentsStore.getState().loadedComments[authorCommentsName]?.length ===
        commentsPerPage,
    );

    expect(() =>
      store.setNextCommentCidsToFetch("unknown-author", {
        timestamp: 1,
        author: { address: authorAddress, previousCommentCid: "prev" },
      } as Comment),
    ).toThrow("not in store");

    const unfetchedCid = "same-value-unfetched-cid";
    const commentPointingToUnfetched = {
      cid: "same-value-pointer-cid",
      timestamp: 1,
      author: { address: authorAddress, previousCommentCid: unfetchedCid },
    } as Comment;
    commentsStore.setState((s) => ({
      comments: { ...s.comments, [commentPointingToUnfetched.cid]: commentPointingToUnfetched },
    }));
    useAuthorsCommentsStore.setState((s) => ({
      nextCommentCidsToFetch: { ...s.nextCommentCidsToFetch, [authorAddress]: unfetchedCid },
      shouldFetchNextComment: { ...s.shouldFetchNextComment, [authorAddress]: true },
    }));
    expect(() =>
      store.setNextCommentCidsToFetch(authorAddress, commentPointingToUnfetched),
    ).toThrow("same value");

    expect(() => store.incrementPageNumber("nonexistent-name")).toThrow("not in store");

    expect(() => store.addBufferedCommentCid("unknown-author", "some-cid")).toThrow("not in store");

    await waitFor(
      () => useAuthorsCommentsStore.getState().bufferedCommentCids[authorAddress]?.size > 0,
    );
    const existingCid = Array.from(
      useAuthorsCommentsStore.getState().bufferedCommentCids[authorAddress],
    )[0] as string;
    expect(() => store.addBufferedCommentCid(authorAddress, existingCid)).toThrow("already added");

    expect(() => store.setLastCommentCid("unknown-author", "some-cid")).toThrow("not in store");

    useAuthorsCommentsStore.setState((s) => ({
      lastCommentCids: { ...s.lastCommentCids, [authorAddress]: "existing-last-cid" },
    }));
    expect(() => store.setLastCommentCid(authorAddress, "existing-last-cid")).toThrow("same value");

    PKC.prototype.commentToGet = commentToGet;
  });

  test("addCommentToStore rejection is caught and logged", { timeout }, async () => {
    const commentToGet = PKC.prototype.commentToGet;
    const createComment = PKC.prototype.createComment;
    PKC.prototype.commentToGet = () => ({ author: { address: authorAddress } });
    PKC.prototype.createComment = function (opts: any) {
      if (opts?.cid === "comment cid") {
        return Promise.reject(new Error("fetch failed"));
      }
      return createComment.call(this, opts);
    };

    const authorCommentsName = authorAddress + "-error-fetch";
    const store = useAuthorsCommentsStore.getState();
    act(() => {
      store.addAuthorCommentsToStore(
        authorCommentsName,
        authorAddress,
        "comment cid",
        undefined,
        account,
      );
    });

    await waitFor(
      () =>
        useAuthorsCommentsStore.getState().nextCommentCidsToFetch[authorAddress] === "comment cid",
    );
    await new Promise((r) => setTimeout(r, 100));

    PKC.prototype.commentToGet = commentToGet;
    PKC.prototype.createComment = createComment;
  });

  test(
    "updateCommentsOnCommentsChange addCommentToStore rejection is caught",
    {
      timeout,
    },
    async () => {
      const createComment = PKC.prototype.createComment;
      const failingLastCid = "community-last-fail";
      PKC.prototype.createComment = async function (opts: any) {
        if (opts?.cid === failingLastCid) {
          throw new Error("sub last comment fetch failed");
        }
        const comment = new MockComment(opts);
        if (opts?.cid === "comment cid") {
          (comment as any).author = {
            address: authorAddress,
            previousCommentCid: "prev 1",
            community: { lastCommentCid: failingLastCid },
          };
          (comment as any).timestamp = 1000;
        }
        return comment;
      };

      const authorCommentsName = authorAddress + "-sub-fail";
      act(() => {
        useAuthorsCommentsStore
          .getState()
          .addAuthorCommentsToStore(
            authorCommentsName,
            authorAddress,
            "comment cid",
            undefined,
            account,
          );
      });

      await waitFor(
        () => useAuthorsCommentsStore.getState().loadedComments[authorCommentsName]?.length >= 1,
      );
      await new Promise((r) => setTimeout(r, 500));

      PKC.prototype.createComment = createComment;
    },
  );

  test.each(["after", "before"])(
    "a frozen useComment that opens %s this store does not end the failing update of an author comment",
    async (hookOrder) => {
      const commentCid = `author comment with failing update ${hookOrder}`;
      const hookWaiterId = "frozen-use-comment";
      // Mirrors a pkc-js comment whose community is unreachable: every update cycle ends with a
      // retriable error, then "waiting-retry".
      const liveComment: any = new EventEmitter();
      Object.assign(liveComment, {
        cid: commentCid,
        timestamp: 1000,
        author: { address: authorAddress },
        clients: {},
      });
      liveComment.stop = vi.fn().mockResolvedValue(undefined);
      liveComment.update = vi.fn().mockResolvedValue(undefined);
      const failUpdateCycle = () =>
        act(() => {
          liveComment.emit("error", new Error("gateway timeout"));
          liveComment.updatingState = "waiting-retry";
          liveComment.emit("updatingstatechange", "waiting-retry");
        });
      const createComment = PKC.prototype.createComment;
      PKC.prototype.createComment = async function (opts: any) {
        if (opts?.cid === commentCid) {
          return liveComment;
        }
        return createComment.call(this, opts);
      };
      // a frozen useComment of the same comment waits for the update requested on open
      const openFrozenHook = async () => {
        commentsStore.getState().addOpeningUpdateWaiter(commentCid, hookWaiterId);
        await act(async () => {
          await commentsStore.getState().addCommentToStore(commentCid, account);
        });
      };

      try {
        if (hookOrder === "before") {
          await openFrozenHook();
        }
        act(() => {
          useAuthorsCommentsStore
            .getState()
            .addAuthorCommentsToStore(
              authorAddress + "-failing-update",
              authorAddress,
              commentCid,
              undefined,
              account,
            );
        });
        await waitFor(() => liveComment.update.mock.calls.length === 1);
        failUpdateCycle();
        if (hookOrder === "after") {
          await openFrozenHook();
        }

        // the hook unmounts while the update keeps failing
        commentsStore.getState().removeOpeningUpdateWaiter(commentCid, hookWaiterId);
        failUpdateCycle();
        failUpdateCycle();
        expect(liveComment.stop).not.toHaveBeenCalled();
        expect(commentsStore.getState().openingUpdatesPending[commentCid]).toBe(true);

        act(() => {
          liveComment.updatedAt = 300;
          liveComment.emit("update", liveComment);
          liveComment.updatingState = "succeeded";
          liveComment.emit("updatingstatechange", "succeeded");
        });
        await waitFor(() => commentsStore.getState().comments[commentCid]?.updatedAt === 300);
        expect(commentsStore.getState().comments[commentCid]?.updatedAt).toBe(300);
      } finally {
        commentsStore.getState().removeOpeningUpdateWaiter(commentCid, hookWaiterId);
        PKC.prototype.createComment = createComment;
      }
    },
    timeout,
  );

  test("resetAuthorsCommentsDatabaseAndStore is callable", { timeout }, async () => {
    await resetAuthorsCommentsDatabaseAndStore();
    const state = useAuthorsCommentsStore.getState();
    expect(state.options).toEqual({});
  });

  test("addAuthorCommentsToStore when already in store returns early (line 88)", () => {
    const authorCommentsName = authorAddress + "-already-in-store-88";
    const store = useAuthorsCommentsStore.getState();
    act(() => {
      store.addAuthorCommentsToStore(
        authorCommentsName,
        authorAddress,
        "no-fetch-cid",
        undefined,
        account,
      );
    });
    act(() => {
      store.addAuthorCommentsToStore(
        authorCommentsName,
        authorAddress,
        "no-fetch-cid",
        undefined,
        account,
      );
    });
    expect(useAuthorsCommentsStore.getState().options[authorCommentsName]).toBeDefined();
  });

  test(
    "setLastCommentCidOnCommentsChange returns early when not a last cid candidate",
    {
      timeout,
    },
    async () => {
      const createComment = PKC.prototype.createComment;
      const orphanCid = "orphan-last-cid";
      PKC.prototype.createComment = async function (opts: any) {
        const comment = new MockComment(opts);
        if (opts?.cid === "comment cid") {
          (comment as any).author = {
            address: authorAddress,
            previousCommentCid: "prev 1",
            community: { lastCommentCid: orphanCid },
          };
          (comment as any).timestamp = 1000;
        }
        return comment;
      };

      const authorCommentsName = authorAddress + "-orphan-test";
      act(() => {
        useAuthorsCommentsStore
          .getState()
          .addAuthorCommentsToStore(
            authorCommentsName,
            authorAddress,
            "comment cid",
            undefined,
            account,
          );
      });

      await waitFor(
        () => useAuthorsCommentsStore.getState().loadedComments[authorCommentsName]?.length >= 1,
      );
      await resetAuthorsCommentsDatabaseAndStore();
      commentsStore.setState((s: any) => ({
        comments: {
          ...s.comments,
          [orphanCid]: {
            cid: orphanCid,
            timestamp: 1000,
            author: { address: authorAddress },
          },
        },
      }));
      await new Promise((r) => setTimeout(r, 50));

      PKC.prototype.createComment = createComment;
    },
  );

  test(
    "setLastCommentCidOnCommentsChange returns when comment older than buffered",
    {
      timeout,
    },
    async () => {
      const createComment = PKC.prototype.createComment;
      const newerBufferedCid = "newer-buffered-cid";
      const midTsLastCid = "mid-ts-last-cid";
      const lowTsCid = "low-ts-cid";
      PKC.prototype.createComment = async function (opts: any) {
        const comment = new MockComment(opts);
        if (opts?.cid === "comment cid") {
          (comment as any).author = {
            address: authorAddress,
            previousCommentCid: "prev 1",
            community: { lastCommentCid: lowTsCid },
          };
          (comment as any).timestamp = 1000;
        }
        if (opts?.cid === lowTsCid) {
          (comment as any).author = {
            address: authorAddress,
            previousCommentCid: undefined,
            community: { lastCommentCid: midTsLastCid },
          };
          (comment as any).timestamp = 100;
        }
        if (opts?.cid === midTsLastCid) {
          (comment as any).author = { address: authorAddress };
          (comment as any).timestamp = 500;
        }
        return comment;
      };

      const authorCommentsName = authorAddress + "-older-buffered";
      act(() => {
        useAuthorsCommentsStore
          .getState()
          .addAuthorCommentsToStore(
            authorCommentsName,
            authorAddress,
            "comment cid",
            undefined,
            account,
          );
      });

      const longWaitFor = testUtils.createWaitFor(rendered, { timeout: 15000 });
      await longWaitFor(
        () => useAuthorsCommentsStore.getState().lastCommentCids[authorAddress] === lowTsCid,
      );
      const { bufferedCommentCids: bc } = useAuthorsCommentsStore.getState();
      const orphanCid = "orphan-buffered-cid"; // not in comments store -> bufferedComment undefined
      const nullTsCid = "null-ts-buffered-cid"; // bufferedComment exists, timestamp null (branch 479)
      useAuthorsCommentsStore.setState((s: any) => ({
        bufferedCommentCids: {
          ...s.bufferedCommentCids,
          [authorAddress]: new Set([
            ...(bc[authorAddress] || []),
            orphanCid,
            nullTsCid,
            newerBufferedCid,
          ]),
        },
      }));
      commentsStore.setState((s: any) => ({
        comments: {
          ...s.comments,
          [newerBufferedCid]: {
            cid: newerBufferedCid,
            timestamp: 2000,
            author: { address: authorAddress },
          },
          [midTsLastCid]: {
            cid: midTsLastCid,
            timestamp: 500,
            author: { address: authorAddress },
          },
          [nullTsCid]: {
            cid: nullTsCid,
            timestamp: null as any,
            author: { address: authorAddress },
          },
        },
      }));
      await new Promise((r) => setTimeout(r, 150));

      PKC.prototype.createComment = createComment;
    },
  );

  test(
    "setLastCommentCidOnCommentsChange returns when comment has wrong author",
    {
      timeout,
    },
    async () => {
      const createComment = PKC.prototype.createComment;
      const wrongAuthorCid = "wrong-author-last-cid";
      PKC.prototype.createComment = async function (opts: any) {
        const comment = new MockComment(opts);
        if (opts?.cid === "comment cid") {
          (comment as any).author = {
            address: authorAddress,
            previousCommentCid: "prev 1",
            community: { lastCommentCid: wrongAuthorCid },
          };
          (comment as any).timestamp = 1000;
        }
        if (opts?.cid === wrongAuthorCid) {
          (comment as any).author = { address: "wrong-author.eth" };
          (comment as any).timestamp = 500;
        }
        return comment;
      };

      const authorCommentsName = authorAddress + "-wrong-author";
      act(() => {
        useAuthorsCommentsStore
          .getState()
          .addAuthorCommentsToStore(
            authorCommentsName,
            authorAddress,
            "comment cid",
            undefined,
            account,
          );
      });

      await waitFor(
        () => useAuthorsCommentsStore.getState().loadedComments[authorCommentsName]?.length >= 1,
      );
      await new Promise((r) => setTimeout(r, 200));

      PKC.prototype.createComment = createComment;
    },
  );

  test(
    "setLastCommentCidOnCommentsChange sets lastCommentCid when no previousCommentCid",
    {
      timeout,
    },
    async () => {
      const createComment = PKC.prototype.createComment;
      const leafLastCid = "leaf-last-cid";
      PKC.prototype.createComment = async function (opts: any) {
        const comment = new MockComment(opts);
        if (opts?.cid === "comment cid") {
          (comment as any).author = {
            address: authorAddress,
            previousCommentCid: "prev 1",
            community: { lastCommentCid: leafLastCid },
          };
          (comment as any).timestamp = 1000;
        }
        if (opts?.cid === leafLastCid) {
          (comment as any).author = { address: authorAddress };
          (comment as any).timestamp = 2000;
        }
        if (opts?.cid === "prev 1") {
          (comment as any).author = { address: authorAddress };
          (comment as any).timestamp = 500;
        }
        return comment;
      };

      const authorCommentsName = authorAddress + "-leaf-last";
      act(() => {
        useAuthorsCommentsStore
          .getState()
          .addAuthorCommentsToStore(
            authorCommentsName,
            authorAddress,
            "comment cid",
            undefined,
            account,
          );
      });

      await waitFor(
        () => useAuthorsCommentsStore.getState().lastCommentCids[authorAddress] === leafLastCid,
      );
      // the leaf has no previousCommentCid, so the chain from the start comment keeps going
      await waitFor(
        () => useAuthorsCommentsStore.getState().loadedComments[authorCommentsName]?.length === 3,
      );
      expect(
        useAuthorsCommentsStore
          .getState()
          .loadedComments[authorCommentsName].map((comment: Comment) => comment.cid)
          .sort(),
      ).toEqual(["comment cid", leafLastCid, "prev 1"].sort());

      PKC.prototype.createComment = createComment;
    },
  );

  test(
    "the comment the chain starts from can also be its community lastCommentCid",
    { timeout },
    async () => {
      const createComment = PKC.prototype.createComment;
      const startCid = "start-is-last-cid";
      const previousCid = "start-is-last-previous-cid";
      PKC.prototype.createComment = async function (opts: any) {
        const comment = new MockComment(opts);
        if (opts?.cid === startCid) {
          (comment as any).author = {
            address: authorAddress,
            previousCommentCid: previousCid,
            community: { lastCommentCid: startCid },
          };
          (comment as any).timestamp = 2000;
        }
        if (opts?.cid === previousCid) {
          (comment as any).author = { address: authorAddress };
          (comment as any).timestamp = 1000;
        }
        return comment;
      };

      try {
        const authorCommentsName = authorAddress + "-start-is-last";
        act(() => {
          useAuthorsCommentsStore
            .getState()
            .addAuthorCommentsToStore(
              authorCommentsName,
              authorAddress,
              startCid,
              undefined,
              account,
            );
        });

        await waitFor(
          () => useAuthorsCommentsStore.getState().loadedComments[authorCommentsName]?.length === 2,
        );
        expect(useAuthorsCommentsStore.getState().lastCommentCids[authorAddress]).toBe(startCid);
        expect(
          useAuthorsCommentsStore
            .getState()
            .loadedComments[authorCommentsName].map((comment: Comment) => comment.cid),
        ).toEqual([startCid, previousCid]);
        // the chain listeners must not throw out of the comments store update
        expect(commentsStore.getState().errors[startCid]).toBe(undefined);
      } finally {
        PKC.prototype.createComment = createComment;
      }
    },
  );

  test("a chain comment by another author ends the chain", { timeout }, async () => {
    const createComment = PKC.prototype.createComment;
    const startCid = "other-author-chain-start-cid";
    const otherAuthorCid = "other-author-chain-previous-cid";
    PKC.prototype.createComment = async function (opts: any) {
      const comment = new MockComment(opts);
      if (opts?.cid === startCid) {
        (comment as any).author = { address: authorAddress, previousCommentCid: otherAuthorCid };
        (comment as any).timestamp = 2000;
      }
      if (opts?.cid === otherAuthorCid) {
        (comment as any).author = {
          address: "other-author.eth",
          previousCommentCid: "other-author-older-cid",
        };
        (comment as any).timestamp = 1000;
      }
      return comment;
    };

    try {
      const authorCommentsName = authorAddress + "-other-author-chain";
      act(() => {
        useAuthorsCommentsStore
          .getState()
          .addAuthorCommentsToStore(
            authorCommentsName,
            authorAddress,
            startCid,
            undefined,
            account,
          );
      });

      await waitFor(() => Boolean(commentsStore.getState().comments[otherAuthorCid]?.timestamp));
      // nothing is left to fetch, so useAuthorComments reports hasMore false
      await waitFor(
        () =>
          useAuthorsCommentsStore.getState().nextCommentCidsToFetch[authorAddress] === undefined,
      );
      expect(useAuthorsCommentsStore.getState().nextCommentCidsToFetch[authorAddress]).toBe(
        undefined,
      );
      expect(useAuthorsCommentsStore.getState().hasMoreBufferedComments[authorCommentsName]).toBe(
        false,
      );
      expect(
        useAuthorsCommentsStore
          .getState()
          .loadedComments[authorCommentsName].map((comment: Comment) => comment.cid),
      ).toEqual([startCid]);
    } finally {
      PKC.prototype.createComment = createComment;
    }
  });

  describe("two author chains that reach the same comment", () => {
    const ownerAddress = "shared-chain-owner.eth";
    const sharedCid = "shared-chain-owner-comment-cid";
    const ownerOlderCid = "shared-chain-owner-older-cid";
    const otherStartCid = "shared-chain-other-author-start-cid";
    const ownerCommentsName = ownerAddress + "-shared-chain";
    const otherCommentsName = authorAddress + "-shared-chain";

    let createComment: any, releaseSharedComment: Function;
    beforeEach(() => {
      createComment = PKC.prototype.createComment;
      const sharedCommentReleased = new Promise((resolve) => (releaseSharedComment = resolve));
      PKC.prototype.createComment = async function (opts: any) {
        const comment = new MockComment(opts);
        if (opts?.cid === sharedCid) {
          // the shared comment stays in flight until the test releases it
          await sharedCommentReleased;
          (comment as any).author = { address: ownerAddress, previousCommentCid: ownerOlderCid };
          (comment as any).timestamp = 2000;
        }
        if (opts?.cid === ownerOlderCid) {
          (comment as any).author = { address: ownerAddress };
          (comment as any).timestamp = 1000;
        }
        if (opts?.cid === otherStartCid) {
          // another author's comment links to the owner's comment as its previous comment
          (comment as any).author = { address: authorAddress, previousCommentCid: sharedCid };
          (comment as any).timestamp = 3000;
        }
        return comment;
      };
    });
    afterEach(() => {
      releaseSharedComment();
      PKC.prototype.createComment = createComment;
    });

    const addAuthorComments = (authorCommentsName: string, address: string, commentCid: string) =>
      act(() => {
        useAuthorsCommentsStore
          .getState()
          .addAuthorCommentsToStore(authorCommentsName, address, commentCid, undefined, account);
      });
    const getNextCid = (address: string) =>
      useAuthorsCommentsStore.getState().nextCommentCidsToFetch[address];
    const getLoadedCids = (authorCommentsName: string) =>
      useAuthorsCommentsStore
        .getState()
        .loadedComments[authorCommentsName].map((comment: Comment) => comment.cid);

    test(
      "the other author's chain ends when the owner's chain is fetching the comment",
      { timeout },
      async () => {
        addAuthorComments(ownerCommentsName, ownerAddress, sharedCid);
        addAuthorComments(otherCommentsName, authorAddress, otherStartCid);
        await waitFor(() => getNextCid(authorAddress) === sharedCid);
        releaseSharedComment();

        await waitFor(() => getNextCid(authorAddress) === undefined);
        expect(getNextCid(authorAddress)).toBe(undefined);
        expect(getLoadedCids(otherCommentsName)).toEqual([otherStartCid]);

        await waitFor(() => getLoadedCids(ownerCommentsName).length === 2);
        expect(getLoadedCids(ownerCommentsName)).toEqual([sharedCid, ownerOlderCid]);
        expect(getNextCid(ownerAddress)).toBe(undefined);
      },
    );

    test(
      "the owner's chain continues when the other author's chain is fetching the comment",
      { timeout },
      async () => {
        addAuthorComments(otherCommentsName, authorAddress, otherStartCid);
        await waitFor(() => getNextCid(authorAddress) === sharedCid);
        addAuthorComments(ownerCommentsName, ownerAddress, sharedCid);
        releaseSharedComment();

        await waitFor(() => getLoadedCids(ownerCommentsName).length === 2);
        expect(getLoadedCids(ownerCommentsName)).toEqual([sharedCid, ownerOlderCid]);
        expect(getNextCid(ownerAddress)).toBe(undefined);

        await waitFor(() => getNextCid(authorAddress) === undefined);
        expect(getNextCid(authorAddress)).toBe(undefined);
        expect(getLoadedCids(otherCommentsName)).toEqual([otherStartCid]);
      },
    );
  });
});

const hasDuplicateComments = (comments: any) => {
  const cids = new Set();
  for (const comment of comments) {
    if (cids.has(comment.cid)) {
      return true;
    }
    cids.add(comment.cid);
  }
  return false;
};

const getBufferedComments = (
  rendered: any,
  authorCommentsName: string,
  authorAddress: string,
  filter?: CommentsFilter,
) => {
  const { comments } = commentsStore.getState();
  const loadedComments = rendered.result.current.loadedComments[authorCommentsName];
  const allBufferedComments: any = [
    ...rendered.result.current.bufferedCommentCids[authorAddress],
  ].map((commentCid: string) => comments[commentCid]);
  const filteredAndOrderedBufferedComments: Comment[] = getUpdatedBufferedComments(
    loadedComments,
    allBufferedComments,
    filter,
    comments,
  );
  return filteredAndOrderedBufferedComments;
};

// scroll pages until find commentIndexToScrollTo, comment index should not be higher than total author comments, must start from page 1
const scrollPagesToComment = async (
  rendered: any,
  authorCommentsName: string,
  commentIndexToScrollTo: number,
  waitFor: (fn: () => void) => Promise<void>,
) => {
  const totalPagesToScroll = Math.ceil(commentIndexToScrollTo / commentsPerPage);
  let pageIndex = 1;
  while (pageIndex++ < totalPagesToScroll) {
    // console.log({authorCommentsName, commentIndexToScrollTo, totalPagesToScroll, nextPageIndex: pageIndex, loadedComments: rendered.result.current.loadedComments[authorCommentsName].length, nextLoadedComments: pageIndex * commentsPerPage, })
    try {
      act(() => {
        rendered.result.current.incrementPageNumber(authorCommentsName);
      });
      let currentCommentIndex = pageIndex * commentsPerPage;
      if (currentCommentIndex > commentIndexToScrollTo) {
        currentCommentIndex = commentIndexToScrollTo;
      }
      await waitFor(
        () =>
          rendered.result.current.loadedComments[authorCommentsName].length === currentCommentIndex,
      );
    } catch (e: any) {
      e.message = `failed scrollPagesToComment '${authorCommentsName}' '${commentIndexToScrollTo}' waitFor: ${e.message}`;
      console.warn(e);
    }
  }
};

// debug util
const logBufferedComments = (rendered: any, authorCommentsName: string, authorAddress: string) => {
  const bufferedComments = getBufferedComments(rendered, authorCommentsName, authorAddress);
  for (const [i, comment] of bufferedComments
    .sort((a: any, b: any) => a.timestamp - b.timestamp)
    .entries()) {
    // console.log(i + 1, {timestamp: comment.timestamp, cid: comment.cid, previousCommentCid: comment.author.previousCommentCid})
    // console.log(i + 1, comment.timestamp, comment.cid)
  }
  console.log(
    "from last comment cid",
    bufferedComments.filter((comment: any) => comment.cid.includes("last comment cid")).length,
  );
  console.log(
    "from comment cid",
    bufferedComments.filter((comment: any) => !comment.cid.includes("last comment cid")).length,
  );
  console.log(
    "shouldFetchNextComment",
    rendered.result.current.shouldFetchNextComment[authorAddress],
  );
  console.log(
    "nextCommentCidsToFetch",
    rendered.result.current.nextCommentCidsToFetch[authorAddress],
  );
};
