import feedSorter from "./feed-sorter";

const timestamp = 1600000000000;
const approximateDay = 100000;
const day = (day: number) => timestamp + approximateDay * day;

const feed: any[] = [
  { timestamp: day(0), upvoteCount: 100, downvoteCount: 10, communityAddress: "sub1" },
  { timestamp: day(0), upvoteCount: 1000, downvoteCount: 1, communityAddress: "sub1" },
  { timestamp: day(0), upvoteCount: 10001, downvoteCount: 1000, communityAddress: "sub1" },
  { timestamp: day(0), upvoteCount: 100, downvoteCount: 10, communityAddress: "sub1" },
  { timestamp: day(3), upvoteCount: 100, downvoteCount: 10, communityAddress: "sub1" },
  { timestamp: day(2), upvoteCount: 100, downvoteCount: 10, communityAddress: "sub1" },
  { timestamp: day(1), upvoteCount: 100, downvoteCount: 10, communityAddress: "sub1" },
  { timestamp: day(0), upvoteCount: 100, downvoteCount: 100, communityAddress: "sub1" },
  { timestamp: day(0), upvoteCount: 100, downvoteCount: 10, communityAddress: "sub2" },
  { timestamp: day(0), upvoteCount: 1000, downvoteCount: 1, communityAddress: "sub2" },
  { timestamp: day(0), upvoteCount: 10000, downvoteCount: 1000, communityAddress: "sub2" },
  { timestamp: day(0), upvoteCount: 100, downvoteCount: 10, communityAddress: "sub2" },
  { timestamp: day(3), upvoteCount: 100, downvoteCount: 10, communityAddress: "sub2" },
  { timestamp: day(2), upvoteCount: 100, downvoteCount: 10, communityAddress: "sub3" },
  {
    timestamp: day(1),
    lastReplyTimestamp: day(4) + 1,
    upvoteCount: 100,
    downvoteCount: 10,
    communityAddress: "sub3",
  },
  {
    timestamp: day(0),
    lastReplyTimestamp: day(4) + 2,
    upvoteCount: 100,
    downvoteCount: 100,
    communityAddress: "sub3",
  },
  // pinned posts should be on top
  {
    timestamp: day(1),
    upvoteCount: 100,
    downvoteCount: 10,
    communityAddress: "sub1",
    pinned: true,
  },
  {
    timestamp: day(0),
    upvoteCount: 1000,
    downvoteCount: 1,
    communityAddress: "sub1",
    pinned: true,
  },
];
for (const i in feed) {
  feed[i].cid = i;
}

describe("feedSorter", () => {
  test("sort by top", async () => {
    const sorted = feedSorter.sort("top", feed);
    expect(sorted).toEqual([
      {
        timestamp: day(1),
        upvoteCount: 100,
        downvoteCount: 10,
        communityAddress: "sub1",
        pinned: true,
        cid: "16",
      },
      {
        timestamp: day(0),
        upvoteCount: 1000,
        downvoteCount: 1,
        communityAddress: "sub1",
        pinned: true,
        cid: "17",
      },
      {
        timestamp: day(0),
        upvoteCount: 10001,
        downvoteCount: 1000,
        communityAddress: "sub1",
        cid: "2",
      },
      {
        timestamp: day(0),
        upvoteCount: 10000,
        downvoteCount: 1000,
        communityAddress: "sub2",
        cid: "10",
      },
      {
        timestamp: day(0),
        upvoteCount: 1000,
        downvoteCount: 1,
        communityAddress: "sub1",
        cid: "1",
      },
      {
        timestamp: day(0),
        upvoteCount: 1000,
        downvoteCount: 1,
        communityAddress: "sub2",
        cid: "9",
      },
      {
        timestamp: day(3),
        upvoteCount: 100,
        downvoteCount: 10,
        communityAddress: "sub1",
        cid: "4",
      },
      {
        timestamp: day(3),
        upvoteCount: 100,
        downvoteCount: 10,
        communityAddress: "sub2",
        cid: "12",
      },
      {
        timestamp: day(2),
        upvoteCount: 100,
        downvoteCount: 10,
        communityAddress: "sub1",
        cid: "5",
      },
      {
        timestamp: day(2),
        upvoteCount: 100,
        downvoteCount: 10,
        communityAddress: "sub3",
        cid: "13",
      },
      {
        timestamp: day(1),
        upvoteCount: 100,
        downvoteCount: 10,
        communityAddress: "sub1",
        cid: "6",
      },
      {
        timestamp: day(1),
        lastReplyTimestamp: day(4) + 1,
        upvoteCount: 100,
        downvoteCount: 10,
        communityAddress: "sub3",
        cid: "14",
      },
      {
        timestamp: day(0),
        upvoteCount: 100,
        downvoteCount: 10,
        communityAddress: "sub1",
        cid: "0",
      },
      {
        timestamp: day(0),
        upvoteCount: 100,
        downvoteCount: 10,
        communityAddress: "sub1",
        cid: "3",
      },
      {
        timestamp: day(0),
        upvoteCount: 100,
        downvoteCount: 10,
        communityAddress: "sub2",
        cid: "8",
      },
      {
        timestamp: day(0),
        upvoteCount: 100,
        downvoteCount: 10,
        communityAddress: "sub2",
        cid: "11",
      },
      {
        timestamp: day(0),
        upvoteCount: 100,
        downvoteCount: 100,
        communityAddress: "sub1",
        cid: "7",
      },
      {
        timestamp: day(0),
        lastReplyTimestamp: day(4) + 2,
        upvoteCount: 100,
        downvoteCount: 100,
        communityAddress: "sub3",
        cid: "15",
      },
    ]);
  });

  test("sort by controversial", async () => {
    const sorted = feedSorter.sort("controversial", feed);
    expect(sorted).toEqual([
      {
        timestamp: day(1),
        upvoteCount: 100,
        downvoteCount: 10,
        communityAddress: "sub1",
        pinned: true,
        cid: "16",
      },
      {
        timestamp: day(0),
        upvoteCount: 1000,
        downvoteCount: 1,
        communityAddress: "sub1",
        pinned: true,
        cid: "17",
      },
      {
        timestamp: day(0),
        upvoteCount: 100,
        downvoteCount: 100,
        communityAddress: "sub1",
        cid: "7",
      },
      {
        timestamp: day(0),
        lastReplyTimestamp: day(4) + 2,
        upvoteCount: 100,
        downvoteCount: 100,
        communityAddress: "sub3",
        cid: "15",
      },
      {
        timestamp: day(0),
        upvoteCount: 10000,
        downvoteCount: 1000,
        communityAddress: "sub2",
        cid: "10",
      },
      {
        timestamp: day(0),
        upvoteCount: 10001,
        downvoteCount: 1000,
        communityAddress: "sub1",
        cid: "2",
      },
      {
        timestamp: day(3),
        upvoteCount: 100,
        downvoteCount: 10,
        communityAddress: "sub1",
        cid: "4",
      },
      {
        timestamp: day(3),
        upvoteCount: 100,
        downvoteCount: 10,
        communityAddress: "sub2",
        cid: "12",
      },
      {
        timestamp: day(2),
        upvoteCount: 100,
        downvoteCount: 10,
        communityAddress: "sub1",
        cid: "5",
      },
      {
        timestamp: day(2),
        upvoteCount: 100,
        downvoteCount: 10,
        communityAddress: "sub3",
        cid: "13",
      },
      {
        timestamp: day(1),
        upvoteCount: 100,
        downvoteCount: 10,
        communityAddress: "sub1",
        cid: "6",
      },
      {
        timestamp: day(1),
        lastReplyTimestamp: day(4) + 1,
        upvoteCount: 100,
        downvoteCount: 10,
        communityAddress: "sub3",
        cid: "14",
      },
      {
        timestamp: day(0),
        upvoteCount: 100,
        downvoteCount: 10,
        communityAddress: "sub1",
        cid: "0",
      },
      {
        timestamp: day(0),
        upvoteCount: 100,
        downvoteCount: 10,
        communityAddress: "sub1",
        cid: "3",
      },
      {
        timestamp: day(0),
        upvoteCount: 100,
        downvoteCount: 10,
        communityAddress: "sub2",
        cid: "8",
      },
      {
        timestamp: day(0),
        upvoteCount: 100,
        downvoteCount: 10,
        communityAddress: "sub2",
        cid: "11",
      },
      {
        timestamp: day(0),
        upvoteCount: 1000,
        downvoteCount: 1,
        communityAddress: "sub1",
        cid: "1",
      },
      {
        timestamp: day(0),
        upvoteCount: 1000,
        downvoteCount: 1,
        communityAddress: "sub2",
        cid: "9",
      },
    ]);
  });

  test("sort by hot", async () => {
    const sorted = feedSorter.sort("hot", feed);
    expect(sorted).toEqual([
      {
        timestamp: day(1),
        upvoteCount: 100,
        downvoteCount: 10,
        communityAddress: "sub1",
        pinned: true,
        cid: "16",
      },
      {
        timestamp: day(0),
        upvoteCount: 1000,
        downvoteCount: 1,
        communityAddress: "sub1",
        pinned: true,
        cid: "17",
      },
      {
        timestamp: day(3),
        upvoteCount: 100,
        downvoteCount: 10,
        communityAddress: "sub1",
        cid: "4",
      },
      {
        timestamp: day(3),
        upvoteCount: 100,
        downvoteCount: 10,
        communityAddress: "sub2",
        cid: "12",
      },
      {
        timestamp: day(2),
        upvoteCount: 100,
        downvoteCount: 10,
        communityAddress: "sub1",
        cid: "5",
      },
      {
        timestamp: day(2),
        upvoteCount: 100,
        downvoteCount: 10,
        communityAddress: "sub3",
        cid: "13",
      },
      {
        timestamp: day(1),
        upvoteCount: 100,
        downvoteCount: 10,
        communityAddress: "sub1",
        cid: "6",
      },
      {
        timestamp: day(1),
        lastReplyTimestamp: day(4) + 1,
        upvoteCount: 100,
        downvoteCount: 10,
        communityAddress: "sub3",
        cid: "14",
      },
      {
        timestamp: day(0),
        upvoteCount: 10001,
        downvoteCount: 1000,
        communityAddress: "sub1",
        cid: "2",
      },
      {
        timestamp: day(0),
        upvoteCount: 10000,
        downvoteCount: 1000,
        communityAddress: "sub2",
        cid: "10",
      },
      {
        timestamp: day(0),
        upvoteCount: 1000,
        downvoteCount: 1,
        communityAddress: "sub1",
        cid: "1",
      },
      {
        timestamp: day(0),
        upvoteCount: 1000,
        downvoteCount: 1,
        communityAddress: "sub2",
        cid: "9",
      },
      {
        timestamp: day(0),
        upvoteCount: 100,
        downvoteCount: 10,
        communityAddress: "sub1",
        cid: "0",
      },
      {
        timestamp: day(0),
        upvoteCount: 100,
        downvoteCount: 10,
        communityAddress: "sub1",
        cid: "3",
      },
      {
        timestamp: day(0),
        upvoteCount: 100,
        downvoteCount: 10,
        communityAddress: "sub2",
        cid: "8",
      },
      {
        timestamp: day(0),
        upvoteCount: 100,
        downvoteCount: 10,
        communityAddress: "sub2",
        cid: "11",
      },
      {
        timestamp: day(0),
        upvoteCount: 100,
        downvoteCount: 100,
        communityAddress: "sub1",
        cid: "7",
      },
      {
        timestamp: day(0),
        lastReplyTimestamp: day(4) + 2,
        upvoteCount: 100,
        downvoteCount: 100,
        communityAddress: "sub3",
        cid: "15",
      },
    ]);
  });

  test("sort by new", async () => {
    const sorted = feedSorter.sort("new", feed);
    expect(sorted).toEqual([
      {
        timestamp: day(1),
        upvoteCount: 100,
        downvoteCount: 10,
        communityAddress: "sub1",
        pinned: true,
        cid: "16",
      },
      {
        timestamp: day(0),
        upvoteCount: 1000,
        downvoteCount: 1,
        communityAddress: "sub1",
        pinned: true,
        cid: "17",
      },
      {
        timestamp: day(3),
        upvoteCount: 100,
        downvoteCount: 10,
        communityAddress: "sub1",
        cid: "4",
      },
      {
        timestamp: day(3),
        upvoteCount: 100,
        downvoteCount: 10,
        communityAddress: "sub2",
        cid: "12",
      },
      {
        timestamp: day(2),
        upvoteCount: 100,
        downvoteCount: 10,
        communityAddress: "sub1",
        cid: "5",
      },
      {
        timestamp: day(2),
        upvoteCount: 100,
        downvoteCount: 10,
        communityAddress: "sub3",
        cid: "13",
      },
      {
        timestamp: day(1),
        upvoteCount: 100,
        downvoteCount: 10,
        communityAddress: "sub1",
        cid: "6",
      },
      {
        timestamp: day(1),
        lastReplyTimestamp: day(4) + 1,
        upvoteCount: 100,
        downvoteCount: 10,
        communityAddress: "sub3",
        cid: "14",
      },
      {
        timestamp: day(0),
        upvoteCount: 10001,
        downvoteCount: 1000,
        communityAddress: "sub1",
        cid: "2",
      },
      {
        timestamp: day(0),
        upvoteCount: 10000,
        downvoteCount: 1000,
        communityAddress: "sub2",
        cid: "10",
      },
      {
        timestamp: day(0),
        upvoteCount: 1000,
        downvoteCount: 1,
        communityAddress: "sub1",
        cid: "1",
      },
      {
        timestamp: day(0),
        upvoteCount: 1000,
        downvoteCount: 1,
        communityAddress: "sub2",
        cid: "9",
      },
      {
        timestamp: day(0),
        upvoteCount: 100,
        downvoteCount: 10,
        communityAddress: "sub1",
        cid: "0",
      },
      {
        timestamp: day(0),
        upvoteCount: 100,
        downvoteCount: 10,
        communityAddress: "sub1",
        cid: "3",
      },
      {
        timestamp: day(0),
        upvoteCount: 100,
        downvoteCount: 100,
        communityAddress: "sub1",
        cid: "7",
      },
      {
        timestamp: day(0),
        upvoteCount: 100,
        downvoteCount: 10,
        communityAddress: "sub2",
        cid: "8",
      },
      {
        timestamp: day(0),
        upvoteCount: 100,
        downvoteCount: 10,
        communityAddress: "sub2",
        cid: "11",
      },
      {
        timestamp: day(0),
        lastReplyTimestamp: day(4) + 2,
        upvoteCount: 100,
        downvoteCount: 100,
        communityAddress: "sub3",
        cid: "15",
      },
    ]);
  });

  test("sort by newFlat", async () => {
    const sorted = feedSorter.sort("newFlat", feed);
    expect(sorted).toEqual([
      {
        timestamp: day(1),
        upvoteCount: 100,
        downvoteCount: 10,
        communityAddress: "sub1",
        pinned: true,
        cid: "16",
      },
      {
        timestamp: day(0),
        upvoteCount: 1000,
        downvoteCount: 1,
        communityAddress: "sub1",
        pinned: true,
        cid: "17",
      },
      {
        timestamp: day(3),
        upvoteCount: 100,
        downvoteCount: 10,
        communityAddress: "sub1",
        cid: "4",
      },
      {
        timestamp: day(3),
        upvoteCount: 100,
        downvoteCount: 10,
        communityAddress: "sub2",
        cid: "12",
      },
      {
        timestamp: day(2),
        upvoteCount: 100,
        downvoteCount: 10,
        communityAddress: "sub1",
        cid: "5",
      },
      {
        timestamp: day(2),
        upvoteCount: 100,
        downvoteCount: 10,
        communityAddress: "sub3",
        cid: "13",
      },
      {
        timestamp: day(1),
        upvoteCount: 100,
        downvoteCount: 10,
        communityAddress: "sub1",
        cid: "6",
      },
      {
        timestamp: day(1),
        lastReplyTimestamp: day(4) + 1,
        upvoteCount: 100,
        downvoteCount: 10,
        communityAddress: "sub3",
        cid: "14",
      },
      {
        timestamp: day(0),
        upvoteCount: 10001,
        downvoteCount: 1000,
        communityAddress: "sub1",
        cid: "2",
      },
      {
        timestamp: day(0),
        upvoteCount: 10000,
        downvoteCount: 1000,
        communityAddress: "sub2",
        cid: "10",
      },
      {
        timestamp: day(0),
        upvoteCount: 1000,
        downvoteCount: 1,
        communityAddress: "sub1",
        cid: "1",
      },
      {
        timestamp: day(0),
        upvoteCount: 1000,
        downvoteCount: 1,
        communityAddress: "sub2",
        cid: "9",
      },
      {
        timestamp: day(0),
        upvoteCount: 100,
        downvoteCount: 10,
        communityAddress: "sub1",
        cid: "0",
      },
      {
        timestamp: day(0),
        upvoteCount: 100,
        downvoteCount: 10,
        communityAddress: "sub1",
        cid: "3",
      },
      {
        timestamp: day(0),
        upvoteCount: 100,
        downvoteCount: 100,
        communityAddress: "sub1",
        cid: "7",
      },
      {
        timestamp: day(0),
        upvoteCount: 100,
        downvoteCount: 10,
        communityAddress: "sub2",
        cid: "8",
      },
      {
        timestamp: day(0),
        upvoteCount: 100,
        downvoteCount: 10,
        communityAddress: "sub2",
        cid: "11",
      },
      {
        timestamp: day(0),
        lastReplyTimestamp: day(4) + 2,
        upvoteCount: 100,
        downvoteCount: 100,
        communityAddress: "sub3",
        cid: "15",
      },
    ]);
  });

  test("sort by active", async () => {
    const sorted = feedSorter.sort("active", feed);
    expect(sorted).toEqual([
      {
        timestamp: day(1),
        upvoteCount: 100,
        downvoteCount: 10,
        communityAddress: "sub1",
        pinned: true,
        cid: "16",
      },
      {
        timestamp: day(0),
        upvoteCount: 1000,
        downvoteCount: 1,
        communityAddress: "sub1",
        pinned: true,
        cid: "17",
      },
      {
        timestamp: day(0),
        lastReplyTimestamp: day(4) + 2,
        upvoteCount: 100,
        downvoteCount: 100,
        communityAddress: "sub3",
        cid: "15",
      },
      {
        timestamp: day(1),
        lastReplyTimestamp: day(4) + 1,
        upvoteCount: 100,
        downvoteCount: 10,
        communityAddress: "sub3",
        cid: "14",
      },
      {
        timestamp: day(3),
        upvoteCount: 100,
        downvoteCount: 10,
        communityAddress: "sub1",
        cid: "4",
      },
      {
        timestamp: day(3),
        upvoteCount: 100,
        downvoteCount: 10,
        communityAddress: "sub2",
        cid: "12",
      },
      {
        timestamp: day(2),
        upvoteCount: 100,
        downvoteCount: 10,
        communityAddress: "sub1",
        cid: "5",
      },
      {
        timestamp: day(2),
        upvoteCount: 100,
        downvoteCount: 10,
        communityAddress: "sub3",
        cid: "13",
      },
      {
        timestamp: day(1),
        upvoteCount: 100,
        downvoteCount: 10,
        communityAddress: "sub1",
        cid: "6",
      },
      {
        timestamp: day(0),
        upvoteCount: 10001,
        downvoteCount: 1000,
        communityAddress: "sub1",
        cid: "2",
      },
      {
        timestamp: day(0),
        upvoteCount: 10000,
        downvoteCount: 1000,
        communityAddress: "sub2",
        cid: "10",
      },
      {
        timestamp: day(0),
        upvoteCount: 1000,
        downvoteCount: 1,
        communityAddress: "sub1",
        cid: "1",
      },
      {
        timestamp: day(0),
        upvoteCount: 1000,
        downvoteCount: 1,
        communityAddress: "sub2",
        cid: "9",
      },
      {
        timestamp: day(0),
        upvoteCount: 100,
        downvoteCount: 10,
        communityAddress: "sub1",
        cid: "0",
      },
      {
        timestamp: day(0),
        upvoteCount: 100,
        downvoteCount: 10,
        communityAddress: "sub1",
        cid: "3",
      },
      {
        timestamp: day(0),
        upvoteCount: 100,
        downvoteCount: 100,
        communityAddress: "sub1",
        cid: "7",
      },
      {
        timestamp: day(0),
        upvoteCount: 100,
        downvoteCount: 10,
        communityAddress: "sub2",
        cid: "8",
      },
      {
        timestamp: day(0),
        upvoteCount: 100,
        downvoteCount: 10,
        communityAddress: "sub2",
        cid: "11",
      },
    ]);
  });

  test("sort by old", async () => {
    const sorted = feedSorter.sort("old", feed);
    expect(sorted).toEqual([
      {
        timestamp: day(1),
        upvoteCount: 100,
        downvoteCount: 10,
        communityAddress: "sub1",
        pinned: true,
        cid: "16",
      },
      {
        timestamp: day(0),
        upvoteCount: 1000,
        downvoteCount: 1,
        communityAddress: "sub1",
        pinned: true,
        cid: "17",
      },
      {
        timestamp: day(0),
        upvoteCount: 10001,
        downvoteCount: 1000,
        communityAddress: "sub1",
        cid: "2",
      },
      {
        timestamp: day(0),
        upvoteCount: 10000,
        downvoteCount: 1000,
        communityAddress: "sub2",
        cid: "10",
      },
      {
        timestamp: day(0),
        upvoteCount: 1000,
        downvoteCount: 1,
        communityAddress: "sub1",
        cid: "1",
      },
      {
        timestamp: day(0),
        upvoteCount: 1000,
        downvoteCount: 1,
        communityAddress: "sub2",
        cid: "9",
      },
      {
        timestamp: day(0),
        upvoteCount: 100,
        downvoteCount: 10,
        communityAddress: "sub1",
        cid: "0",
      },
      {
        timestamp: day(0),
        upvoteCount: 100,
        downvoteCount: 10,
        communityAddress: "sub1",
        cid: "3",
      },
      {
        timestamp: day(0),
        upvoteCount: 100,
        downvoteCount: 100,
        communityAddress: "sub1",
        cid: "7",
      },
      {
        timestamp: day(0),
        upvoteCount: 100,
        downvoteCount: 10,
        communityAddress: "sub2",
        cid: "8",
      },
      {
        timestamp: day(0),
        upvoteCount: 100,
        downvoteCount: 10,
        communityAddress: "sub2",
        cid: "11",
      },
      {
        timestamp: day(0),
        lastReplyTimestamp: day(4) + 2,
        upvoteCount: 100,
        downvoteCount: 100,
        communityAddress: "sub3",
        cid: "15",
      },
      {
        timestamp: day(1),
        upvoteCount: 100,
        downvoteCount: 10,
        communityAddress: "sub1",
        cid: "6",
      },
      {
        timestamp: day(1),
        lastReplyTimestamp: day(4) + 1,
        upvoteCount: 100,
        downvoteCount: 10,
        communityAddress: "sub3",
        cid: "14",
      },
      {
        timestamp: day(2),
        upvoteCount: 100,
        downvoteCount: 10,
        communityAddress: "sub1",
        cid: "5",
      },
      {
        timestamp: day(2),
        upvoteCount: 100,
        downvoteCount: 10,
        communityAddress: "sub3",
        cid: "13",
      },
      {
        timestamp: day(3),
        upvoteCount: 100,
        downvoteCount: 10,
        communityAddress: "sub1",
        cid: "4",
      },
      {
        timestamp: day(3),
        upvoteCount: 100,
        downvoteCount: 10,
        communityAddress: "sub2",
        cid: "12",
      },
    ]);
  });

  test("sort by oldFlat", async () => {
    const sorted = feedSorter.sort("oldFlat", feed);
    expect(sorted).toEqual([
      {
        timestamp: day(1),
        upvoteCount: 100,
        downvoteCount: 10,
        communityAddress: "sub1",
        pinned: true,
        cid: "16",
      },
      {
        timestamp: day(0),
        upvoteCount: 1000,
        downvoteCount: 1,
        communityAddress: "sub1",
        pinned: true,
        cid: "17",
      },
      {
        timestamp: day(0),
        upvoteCount: 10001,
        downvoteCount: 1000,
        communityAddress: "sub1",
        cid: "2",
      },
      {
        timestamp: day(0),
        upvoteCount: 10000,
        downvoteCount: 1000,
        communityAddress: "sub2",
        cid: "10",
      },
      {
        timestamp: day(0),
        upvoteCount: 1000,
        downvoteCount: 1,
        communityAddress: "sub1",
        cid: "1",
      },
      {
        timestamp: day(0),
        upvoteCount: 1000,
        downvoteCount: 1,
        communityAddress: "sub2",
        cid: "9",
      },
      {
        timestamp: day(0),
        upvoteCount: 100,
        downvoteCount: 10,
        communityAddress: "sub1",
        cid: "0",
      },
      {
        timestamp: day(0),
        upvoteCount: 100,
        downvoteCount: 10,
        communityAddress: "sub1",
        cid: "3",
      },
      {
        timestamp: day(0),
        upvoteCount: 100,
        downvoteCount: 100,
        communityAddress: "sub1",
        cid: "7",
      },
      {
        timestamp: day(0),
        upvoteCount: 100,
        downvoteCount: 10,
        communityAddress: "sub2",
        cid: "8",
      },
      {
        timestamp: day(0),
        upvoteCount: 100,
        downvoteCount: 10,
        communityAddress: "sub2",
        cid: "11",
      },
      {
        timestamp: day(0),
        lastReplyTimestamp: day(4) + 2,
        upvoteCount: 100,
        downvoteCount: 100,
        communityAddress: "sub3",
        cid: "15",
      },
      {
        timestamp: day(1),
        upvoteCount: 100,
        downvoteCount: 10,
        communityAddress: "sub1",
        cid: "6",
      },
      {
        timestamp: day(1),
        lastReplyTimestamp: day(4) + 1,
        upvoteCount: 100,
        downvoteCount: 10,
        communityAddress: "sub3",
        cid: "14",
      },
      {
        timestamp: day(2),
        upvoteCount: 100,
        downvoteCount: 10,
        communityAddress: "sub1",
        cid: "5",
      },
      {
        timestamp: day(2),
        upvoteCount: 100,
        downvoteCount: 10,
        communityAddress: "sub3",
        cid: "13",
      },
      {
        timestamp: day(3),
        upvoteCount: 100,
        downvoteCount: 10,
        communityAddress: "sub1",
        cid: "4",
      },
      {
        timestamp: day(3),
        upvoteCount: 100,
        downvoteCount: 10,
        communityAddress: "sub2",
        cid: "12",
      },
    ]);
  });

  test("throws on unknown sort type", () => {
    expect(() => feedSorter.sort("unknown", feed)).toThrow(
      "feedsStore feedSorter sort type 'unknown' doesn't exist",
    );
  });

  test("n() fallback: NaN and non-number use 0", () => {
    const badValues = [
      { cid: "nan-ts", timestamp: Number.NaN, upvoteCount: 1 },
      { cid: "str-ts", timestamp: "not-a-number" as any, upvoteCount: 1 },
    ];
    expect(feedSorter.sort("new", badValues)).toHaveLength(2);
  });

  test("sort by best with n===0 (no votes) assigns score 0", () => {
    // upvoteCount -1 + 1 = 0, downvoteCount 0 => n = 0
    const zeroVotesFeed = [{ cid: "z0", timestamp: 1, upvoteCount: -1, downvoteCount: 0 }];
    const sorted = feedSorter.sort("best", zeroVotesFeed);
    expect(sorted).toEqual([{ cid: "z0", timestamp: 1, upvoteCount: -1, downvoteCount: 0 }]);
  });

  test("sort by top/controversial/hot use fallback || 0 for missing vote counts", () => {
    const noVotes = [{ cid: "n0", timestamp: 1 }];
    expect(feedSorter.sort("top", noVotes)).toEqual([{ cid: "n0", timestamp: 1 }]);
    expect(feedSorter.sort("controversial", noVotes)).toEqual([{ cid: "n0", timestamp: 1 }]);
    expect(feedSorter.sort("hot", noVotes)).toEqual([{ cid: "n0", timestamp: 1 }]);
  });

  test("sortByTop: post.upvoteCount - post.downvoteCount yields 0 triggers || 0", () => {
    const tied = [
      { cid: "t1", timestamp: 2, upvoteCount: 5, downvoteCount: 5 },
      { cid: "t2", timestamp: 1, upvoteCount: 5, downvoteCount: 5 },
    ];
    const sorted = feedSorter.sort("top", tied);
    expect(sorted[0].cid).toBe("t1");
    expect(sorted[1].cid).toBe("t2");
  });

  test("sortByControversial: downvoteCount > upvoteCount branch", () => {
    const downHeavy = [
      { cid: "d1", timestamp: 1, upvoteCount: 2, downvoteCount: 10 },
      { cid: "d2", timestamp: 2, upvoteCount: 1, downvoteCount: 5 },
    ];
    const sorted = feedSorter.sort("controversial", downHeavy);
    expect(sorted.length).toBe(2);
  });

  test("sortByControversial: downvoteCount 0 triggers (downvoteCount || 1) branch", () => {
    const zeroDown = [{ cid: "z1", timestamp: 1, upvoteCount: -2, downvoteCount: 0 }];
    expect(feedSorter.sort("controversial", zeroDown)).toHaveLength(1);
  });

  test("sortByHot: score 0 triggers sign branch", () => {
    const zeroScore = [
      { cid: "h1", timestamp: 1134028003 + 1000, upvoteCount: 5, downvoteCount: 6 },
    ];
    const sorted = feedSorter.sort("hot", zeroScore);
    expect(sorted).toHaveLength(1);
  });

  test("sortByNew/sortByOld: undefined upvoteCount and timestamp use || 0", () => {
    const minimal = [{ cid: "m1" }, { cid: "m2", timestamp: 1 }, { cid: "m3", upvoteCount: 1 }];
    expect(feedSorter.sort("new", minimal)).toHaveLength(3);
    expect(feedSorter.sort("old", minimal)).toHaveLength(3);
  });

  test("sortByActive: undefined lastReplyTimestamp falls back to timestamp", () => {
    const noLastReply = [{ cid: "a1", timestamp: 100 }];
    expect(feedSorter.sort("active", noLastReply)).toEqual([{ cid: "a1", timestamp: 100 }]);
  });

  test("sortByBest: postScores fallback for cid in sort", () => {
    const mixed = [
      { cid: "b1", timestamp: 2, upvoteCount: 0, downvoteCount: 0 },
      { cid: "b2", timestamp: 1, upvoteCount: 10, downvoteCount: 2 },
    ];
    const sorted = feedSorter.sort("best", mixed);
    expect(sorted[0].cid).toBe("b2");
    expect(sorted[1].cid).toBe("b1");
  });

  test("sortByHot: positive score triggers sign > 0 branch", () => {
    const posScore = [
      { cid: "hp1", timestamp: 1134028003 + 1000, upvoteCount: 10, downvoteCount: 5 },
      { cid: "hp2", timestamp: 1134028003 + 2000, upvoteCount: 8, downvoteCount: 3 },
    ];
    const sorted = feedSorter.sort("hot", posScore);
    expect(sorted).toHaveLength(2);
    expect(sorted[0].cid).toBe("hp2");
  });

  test("sortByControversial: upvoteCount > downvoteCount branch", () => {
    const upHeavy = [
      { cid: "u1", timestamp: 1, upvoteCount: 10, downvoteCount: 2 },
      { cid: "u2", timestamp: 2, upvoteCount: 5, downvoteCount: 1 },
    ];
    const sorted = feedSorter.sort("controversial", upHeavy);
    expect(sorted).toHaveLength(2);
  });

  test("sortByActive: uses lastReplyTimestamp when present", () => {
    const withLastReply = [
      { cid: "lr1", timestamp: 100, lastReplyTimestamp: 200, upvoteCount: 1 },
      { cid: "lr2", timestamp: 100, lastReplyTimestamp: 150, upvoteCount: 1 },
    ];
    const sorted = feedSorter.sort("active", withLastReply);
    expect(sorted[0].cid).toBe("lr1");
    expect(sorted[1].cid).toBe("lr2");
  });

  test("sortByTop: undefined timestamp uses || 0", () => {
    const noTs = [{ cid: "nt1" }, { cid: "nt2", timestamp: 1 }];
    const sorted = feedSorter.sort("top", noTs);
    expect(sorted).toHaveLength(2);
  });

  test("sortByBest: mixed n===0 and n>0 in same feed hits both branches", () => {
    const mixed = [
      { cid: "n0", timestamp: 2, upvoteCount: -1, downvoteCount: 0 },
      { cid: "n1", timestamp: 1, upvoteCount: 5, downvoteCount: 2 },
    ];
    const sorted = feedSorter.sort("best", mixed);
    expect(sorted).toHaveLength(2);
    expect(sorted[0].cid).toBe("n1");
    expect(sorted[1].cid).toBe("n0");
  });

  test("sortByBest: n===0 branch assigns 0 and skips Wilson score", () => {
    const onlyZeroVotes = [
      { cid: "z1", timestamp: 2, upvoteCount: -1, downvoteCount: 0 },
      { cid: "z2", timestamp: 1, upvoteCount: -1, downvoteCount: 0 },
    ];
    const sorted = feedSorter.sort("best", onlyZeroVotes);
    expect(sorted).toHaveLength(2);
    expect(sorted[0].cid).toBe("z2");
    expect(sorted[1].cid).toBe("z1");
  });

  test("sortByHot: negative score triggers sign < 0 branch", () => {
    const negScore = [
      { cid: "hn1", timestamp: 1134028003 + 2000, upvoteCount: 3, downvoteCount: 8 },
      { cid: "hn2", timestamp: 1134028003 + 1000, upvoteCount: 2, downvoteCount: 6 },
    ];
    const sorted = feedSorter.sort("hot", negScore);
    expect(sorted).toHaveLength(2);
    expect(sorted[0].cid).toBe("hn2");
  });

  test("sortByActive: one item with lastReplyTimestamp, one without (fallback to timestamp)", () => {
    const mixed = [
      { cid: "ma1", timestamp: 200, lastReplyTimestamp: 300, upvoteCount: 1 },
      { cid: "ma2", timestamp: 100, upvoteCount: 1 },
    ];
    const sorted = feedSorter.sort("active", mixed);
    expect(sorted[0].cid).toBe("ma1");
    expect(sorted[1].cid).toBe("ma2");
  });

  test("sort by best", async () => {
    const sorted = feedSorter.sort("best", feed);
    expect(sorted).toEqual([
      {
        timestamp: day(1),
        upvoteCount: 100,
        downvoteCount: 10,
        communityAddress: "sub1",
        pinned: true,
        cid: "16",
      },
      {
        timestamp: day(0),
        upvoteCount: 1000,
        downvoteCount: 1,
        communityAddress: "sub1",
        pinned: true,
        cid: "17",
      },
      {
        timestamp: day(0),
        upvoteCount: 1000,
        downvoteCount: 1,
        communityAddress: "sub1",
        cid: "1",
      },
      {
        timestamp: day(0),
        upvoteCount: 1000,
        downvoteCount: 1,
        communityAddress: "sub2",
        cid: "9",
      },
      {
        timestamp: day(0),
        upvoteCount: 10001,
        downvoteCount: 1000,
        communityAddress: "sub1",
        cid: "2",
      },
      {
        timestamp: day(0),
        upvoteCount: 10000,
        downvoteCount: 1000,
        communityAddress: "sub2",
        cid: "10",
      },
      {
        timestamp: day(0),
        upvoteCount: 100,
        downvoteCount: 10,
        communityAddress: "sub1",
        cid: "0",
      },
      {
        timestamp: day(0),
        upvoteCount: 100,
        downvoteCount: 10,
        communityAddress: "sub1",
        cid: "3",
      },
      {
        timestamp: day(0),
        upvoteCount: 100,
        downvoteCount: 10,
        communityAddress: "sub2",
        cid: "8",
      },
      {
        timestamp: day(0),
        upvoteCount: 100,
        downvoteCount: 10,
        communityAddress: "sub2",
        cid: "11",
      },
      {
        timestamp: day(1),
        upvoteCount: 100,
        downvoteCount: 10,
        communityAddress: "sub1",
        cid: "6",
      },
      {
        timestamp: day(1),
        lastReplyTimestamp: day(4) + 1,
        upvoteCount: 100,
        downvoteCount: 10,
        communityAddress: "sub3",
        cid: "14",
      },
      {
        timestamp: day(2),
        upvoteCount: 100,
        downvoteCount: 10,
        communityAddress: "sub1",
        cid: "5",
      },
      {
        timestamp: day(2),
        upvoteCount: 100,
        downvoteCount: 10,
        communityAddress: "sub3",
        cid: "13",
      },
      {
        timestamp: day(3),
        upvoteCount: 100,
        downvoteCount: 10,
        communityAddress: "sub1",
        cid: "4",
      },
      {
        timestamp: day(3),
        upvoteCount: 100,
        downvoteCount: 10,
        communityAddress: "sub2",
        cid: "12",
      },
      {
        timestamp: day(0),
        upvoteCount: 100,
        downvoteCount: 100,
        communityAddress: "sub1",
        cid: "7",
      },
      {
        timestamp: day(0),
        lastReplyTimestamp: day(4) + 2,
        upvoteCount: 100,
        downvoteCount: 100,
        communityAddress: "sub3",
        cid: "15",
      },
    ]);
  });
});
