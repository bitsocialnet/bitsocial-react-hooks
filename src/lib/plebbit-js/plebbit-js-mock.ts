import EventEmitter from "events";

const loadingTime = 10;
export const simulateLoadingTime = () => new Promise((r) => setTimeout(r, loadingTime));

// keep a list of created and edited owner communities
// to reinitialize them with plebbit.createCommunity()
let createdOwnerCommunities: any = {};
let editedOwnerCommunities: any = {};

// reset the plebbit-js global state in between tests
export const resetPlebbitJsMock = () => {
  createdOwnerCommunities = {};
  editedOwnerCommunities = {};
};
export const debugPlebbitJsMock = () => {
  console.log({ createdOwnerCommunities, editedOwnerCommunities });
};

export class Plebbit extends EventEmitter {
  async resolveAuthorAddress(options: { address: string }) {
    return "resolved author address";
  }

  async createSigner() {
    return {
      privateKey: "private key",
      address: "address",
    };
  }

  async createCommunity(createCommunityOptions: any) {
    if (!createCommunityOptions) {
      createCommunityOptions = {};
    }

    // no address provided so probably a user creating an owner community
    if (
      !createCommunityOptions.address &&
      !createdOwnerCommunities[createCommunityOptions.address]
    ) {
      createCommunityOptions = {
        ...createCommunityOptions,
        address: "created community address",
      };
      // createdCommunityAddresses.push('created community address')
      createdOwnerCommunities[createCommunityOptions.address] = { ...createCommunityOptions };
    }
    // only address provided, so could be a previously created owner community
    // add props from previously created sub
    else if (
      createdOwnerCommunities[createCommunityOptions.address] &&
      JSON.stringify(Object.keys(createCommunityOptions)) === '["address"]'
    ) {
      for (const prop in createdOwnerCommunities[createCommunityOptions.address]) {
        if (createdOwnerCommunities[createCommunityOptions.address][prop]) {
          createCommunityOptions[prop] =
            createdOwnerCommunities[createCommunityOptions.address][prop];
        }
      }
    }

    // add edited props if owner community was edited in the past
    if (editedOwnerCommunities[createCommunityOptions.address]) {
      for (const prop in editedOwnerCommunities[createCommunityOptions.address]) {
        if (editedOwnerCommunities[createCommunityOptions.address][prop]) {
          createCommunityOptions[prop] =
            editedOwnerCommunities[createCommunityOptions.address][prop];
        }
      }
    }

    return new Community(createCommunityOptions);
  }

  async getCommunity(options: { address: string }) {
    const address = options?.address;
    await simulateLoadingTime();
    const createCommunityOptions = { address };
    const community: any = new Community(createCommunityOptions);
    community.title = community.address + " title";
    const hotPageCid = community.address + " page cid hot";
    community.posts.pages.hot = community.posts.pageToGet(hotPageCid);
    community.posts.pageCids = {
      hot: hotPageCid,
      topAll: community.address + " page cid topAll",
      new: community.address + " page cid new",
      active: community.address + " page cid active",
    };
    community.modQueue.pageCids = {
      pendingApproval: community.address + " page cid pendingApproval",
    };
    return community;
  }

  // TODO: implement event communitieschange
  get communities() {
    return [
      ...new Set([
        "list community address 1",
        "list community address 2",
        ...Object.keys(createdOwnerCommunities),
      ]),
    ];
  }

  async createComment(createCommentOptions: any) {
    return new Comment(createCommentOptions);
  }

  async getComment(options: { cid: string }) {
    const cid = options?.cid;
    await simulateLoadingTime();
    const createCommentOptions = {
      cid,
      // useComment() requires timestamp or will use account comment instead of comment from store
      timestamp: 1670000000,
      ...this.commentToGet(cid),
    };
    return new Comment(createCommentOptions);
  }

  // mock this method to get a comment with different content, timestamp, address, etc
  commentToGet(commentCid?: string) {
    return {
      // content: 'mock some content'
      // author: {address: 'mock some address'},
      // timestamp: 1234
    };
  }

  async createVote() {
    return new Vote();
  }

  async createCommentEdit(createCommentEditOptions: any) {
    return new CommentEdit(createCommentEditOptions);
  }

  async createCommentModeration(createCommentModerationOptions: any) {
    return new CommentModeration(createCommentModerationOptions);
  }

  async createCommunityEdit(createCommunityEditOptions: any) {
    return new CommunityEdit(createCommunityEditOptions);
  }

  async fetchCid(options: { cid: string }) {
    const cid = options?.cid;
    if (cid?.startsWith("statscid")) {
      return JSON.stringify({ hourActiveUserCount: 1 });
    }
    throw Error(`plebbit.fetchCid not implemented in plebbit-js mock for cid '${cid}'`);
  }

  async pubsubSubscribe(communityAddress: string) {}
  async pubsubUnsubscribe(communityAddress: string) {}

  clients = {
    plebbitRpcClients: {
      "http://localhost:9138": new PlebbitRpcClient(),
    },
  };

  async validateComment(comment: any, validateCommentOptions: any) {}
}

class PlebbitRpcClient extends EventEmitter {
  state = "connecting";
  settings: any = undefined;
  constructor() {
    super();
    // simulate connecting to the rpc
    setTimeout(() => {
      this.state = "connected";
      this.settings = { challenges: {} };
      this.emit("statechange", this.state);
      this.emit("settingschange", this.settings);
    }, 10);
  }

  async setSettings(settings: any) {
    this.settings = settings;
    this.emit("settingschange", this.settings);
  }
}

export class Pages {
  pageCids: any = {};
  pages: any = {};
  community: any;
  comment: any;

  constructor(pagesOptions?: any) {
    Object.defineProperty(this, "community", {
      value: pagesOptions?.community,
      enumerable: false,
    });
    Object.defineProperty(this, "comment", { value: pagesOptions?.comment, enumerable: false });
  }

  async getPage(options: { cid: string }) {
    const cid = options?.cid;
    // need to wait twice otherwise react renders too fast and fetches too many pages in advance
    await simulateLoadingTime();
    return this.pageToGet(cid);
  }

  async validatePage(page: any) {}

  // mock this method to get pages with different content, or use to getPage without simulated loading time
  pageToGet(pageCid: string) {
    const communityAddress = this.community?.address || this.comment?.communityAddress;
    const isPendingApprovalPage = pageCid.includes("pendingApproval");
    const page: any = {
      nextCid: communityAddress + " " + pageCid + " - next page cid",
      comments: [],
    };
    const postCount = 100;
    let index = 0;
    while (index++ < postCount) {
      const comment: any = {
        timestamp: index,
        cid: pageCid + " comment cid " + index,
        communityAddress,
        upvoteCount: index,
        downvoteCount: 10,
        author: {
          address: pageCid + " author address " + index,
        },
        updatedAt: index,
      };
      if (isPendingApprovalPage) {
        comment.pendingApproval = true;
      }
      page.comments.push(comment);
    }
    return page;
  }
}

export class Community extends EventEmitter {
  updateCalledTimes = 0;
  updating = false;
  firstUpdate = true;
  address: string | undefined;
  title: string | undefined;
  description: string | undefined;
  posts: Pages;
  modQueue: Pages;
  updatedAt: number | undefined;
  statsCid: string | undefined;
  state: string;
  updatingState: string;

  constructor(createCommunityOptions?: any) {
    super();
    this.address = createCommunityOptions?.address;
    this.title = createCommunityOptions?.title;
    this.description = createCommunityOptions?.description;
    this.statsCid = "statscid";
    this.state = "stopped";
    this.updatingState = "stopped";
    this.updatedAt = createCommunityOptions?.updatedAt;

    this.posts = new Pages({ community: this });
    // add community.posts from createCommunityOptions
    if (createCommunityOptions?.posts?.pages) {
      this.posts.pages = createCommunityOptions?.posts?.pages;
    }
    if (createCommunityOptions?.posts?.pageCids) {
      this.posts.pageCids = createCommunityOptions?.posts?.pageCids;
    }

    this.modQueue = new Pages({ community: this });
    // add community.modQueue from createCommunityOptions
    if (createCommunityOptions?.modQueue?.pageCids) {
      this.modQueue.pageCids = createCommunityOptions?.modQueue?.pageCids;
    }

    if (createCommunityOptions) {
      for (const prop in createCommunityOptions) {
        if (createCommunityOptions[prop] !== undefined) {
          const descriptor =
            Object.getOwnPropertyDescriptor(this, prop) ||
            Object.getOwnPropertyDescriptor(Object.getPrototypeOf(this), prop);
          if (descriptor && !descriptor.writable && !descriptor.set) {
            continue;
          }
          // @ts-ignore
          this[prop] = createCommunityOptions[prop];
        }
      }
    }

    // only trigger a first update if argument is only ({address})
    if (!createCommunityOptions?.address || Object.keys(createCommunityOptions).length !== 1) {
      this.firstUpdate = false;
    }
  }

  async update() {
    this.updateCalledTimes++;
    if (this.updateCalledTimes > 1) {
      throw Error(
        "with the current hooks, community.update() should be called maximum 1 times, this number might change if the hooks change and is only there to catch bugs, the real comment.update() can be called infinite times",
      );
    }
    if (!this.address) {
      throw Error(`can't update without community.address`);
    }
    // don't update twice
    if (this.updating) {
      return;
    }
    this.updating = true;

    this.state = "updating";
    this.updatingState = "fetching-ipns";
    this.emit("statechange", "updating");
    this.emit("updatingstatechange", "fetching-ipns");

    simulateLoadingTime().then(() => {
      this.simulateUpdateEvent();
    });
  }

  async delete() {
    if (this.address) {
      delete createdOwnerCommunities[this.address];
      delete editedOwnerCommunities[this.address];
    }
  }

  simulateUpdateEvent() {
    if (this.firstUpdate) {
      this.simulateFirstUpdateEvent();
      return;
    }

    this.description = this.address + " description updated";
    // @ts-ignore
    this.updatedAt = this.updatedAt + 1;

    this.updatingState = "succeeded";
    this.emit("update", this);
    this.emit("updatingstatechange", "succeeded");
  }

  // the first update event adds all the field from getCommunity
  async simulateFirstUpdateEvent() {
    this.firstUpdate = false;
    this.updatedAt = Math.floor(Date.now() / 1000);

    this.title = this.address + " title";
    const hotPageCid = this.address + " page cid hot";
    this.posts.pages.hot = this.posts.pageToGet(hotPageCid);
    this.posts.pageCids = {
      hot: hotPageCid,
      topAll: this.address + " page cid topAll",
      new: this.address + " page cid new",
      active: this.address + " page cid active",
    };
    this.modQueue.pageCids = {
      pendingApproval: this.address + " page cid pendingApproval",
    };

    // simulate the ipns update
    this.updatingState = "succeeded";
    this.emit("update", this);
    this.emit("updatingstatechange", "succeeded");

    // simulate the next update
    this.updatingState = "fetching-ipns";
    this.emit("updatingstatechange", "fetching-ipns");
    simulateLoadingTime().then(() => {
      this.simulateUpdateEvent();
    });
  }

  // use getting to easily mock it
  get roles() {
    return this.rolesToGet();
  }

  // mock this method to get different roles
  rolesToGet() {
    return {};
  }

  async edit(editCommunityOptions: any) {
    if (!this.address || typeof this.address !== "string") {
      throw Error(`can't community.edit with no community.address`);
    }
    const previousAddress = this.address;

    // do community.edit
    for (const prop in editCommunityOptions) {
      if (editCommunityOptions[prop] !== undefined) {
        const descriptor =
          Object.getOwnPropertyDescriptor(this, prop) ||
          Object.getOwnPropertyDescriptor(Object.getPrototypeOf(this), prop);
        if (descriptor && !descriptor.writable && !descriptor.set) {
          continue;
        }
        // @ts-ignore
        this[prop] = editCommunityOptions[prop];
      }
    }

    // keep a list of edited communities to reinitialize
    // them with plebbit.createCommunity()
    editedOwnerCommunities[this.address] = {
      address: this.address,
      title: this.title,
      description: this.description,
    };

    // handle change of community.address
    if (editCommunityOptions.address) {
      // apply address change to editedOwnerCommunities
      editedOwnerCommunities[previousAddress] = {
        address: this.address,
        title: this.title,
        description: this.description,
      };
      delete editedOwnerCommunities[previousAddress];

      // apply address change to createdOwnerCommunities
      createdOwnerCommunities[this.address] = {
        ...createdOwnerCommunities[previousAddress],
        address: this.address,
      };
      delete createdOwnerCommunities[previousAddress];
    }
  }
}
// make roles enumarable so it acts like a regular prop
Object.defineProperty(Community.prototype, "roles", { enumerable: true });

let challengeRequestCount = 0;
let challengeAnswerCount = 0;

class Publication extends EventEmitter {
  timestamp: number | undefined;
  content: string | undefined;
  cid: string | undefined;
  challengeRequestId = `r${++challengeRequestCount}`;
  challengeAnswerId = `a${++challengeAnswerCount}`;
  state: string | undefined;
  publishingState: string | undefined;

  async publish() {
    this.state = "publishing";
    this.publishingState = "publishing-challenge-request";
    this.emit("statechange", "publishing");
    this.emit("publishingstatechange", "publishing-challenge-request");

    await simulateLoadingTime();
    this.simulateChallengeEvent();
  }

  simulateChallengeEvent() {
    this.publishingState = "waiting-challenge-answers";
    this.emit("publishingstatechange", "waiting-challenge-answers");

    const challenge = { type: "text", challenge: "2+2=?" };
    const challengeMessage = {
      type: "CHALLENGE",
      challengeRequestId: this.challengeRequestId,
      challenges: [challenge],
    };
    this.emit("challenge", challengeMessage, this);
  }

  async publishChallengeAnswers(challengeAnswers: string[]) {
    this.publishingState = "publishing-challenge-answer";
    this.emit("publishingstatechange", "publishing-challenge-answer");

    await simulateLoadingTime();
    this.publishingState = "waiting-challenge-verification";
    this.emit("publishingstatechange", "waiting-challenge-verification");

    await simulateLoadingTime();
    this.simulateChallengeVerificationEvent();
  }

  simulateChallengeVerificationEvent() {
    // if publication has content, create cid for this content and add it to comment and challengeVerificationMessage
    this.cid = this.content && `${this.content} cid`;
    const commentUpdate = this.cid && { cid: this.cid };

    const challengeVerificationMessage = {
      type: "CHALLENGEVERIFICATION",
      challengeRequestId: this.challengeRequestId,
      challengeAnswerId: this.challengeAnswerId,
      challengeSuccess: true,
      commentUpdate,
    };
    this.emit("challengeverification", challengeVerificationMessage, this);

    this.publishingState = "succeeded";
    this.emit("publishingstatechange", "succeeded");
  }

  stop() {
    if (this.state === "publishing" || this.publishingState !== "stopped") {
      this.state = "stopped";
      this.publishingState = "stopped";
      this.emit("statechange", "stopped");
      this.emit("publishingstatechange", "stopped");
    }
  }
}

export class Comment extends Publication {
  updateCalledTimes = 0;
  updating = false;
  author: any;
  upvoteCount: number | undefined;
  downvoteCount: number | undefined;
  content: string | undefined;
  parentCid: string | undefined;
  replies: any;
  updatedAt: number | undefined;
  communityAddress: string | undefined;
  state: string;
  updatingState: string;
  publishingState: string;

  constructor(createCommentOptions?: any) {
    super();
    this.cid = createCommentOptions?.cid;
    this.upvoteCount = createCommentOptions?.upvoteCount;
    this.downvoteCount = createCommentOptions?.downvoteCount;
    this.content = createCommentOptions?.content;
    this.author = createCommentOptions?.author;
    this.timestamp = createCommentOptions?.timestamp;
    this.parentCid = createCommentOptions?.parentCid;
    this.communityAddress = createCommentOptions?.communityAddress;
    this.state = "stopped";
    this.updatingState = "stopped";
    this.publishingState = "stopped";

    if (createCommentOptions?.author?.address) {
      this.author.shortAddress = `short ${createCommentOptions.author.address}`;
    }

    this.replies = new Pages({ comment: this });

    // add comment.replies from createCommentOptions
    if (createCommentOptions?.replies?.pages) {
      this.replies.pages = createCommentOptions?.replies?.pages;
    }
    if (createCommentOptions?.replies?.pageCids) {
      this.replies.pageCids = createCommentOptions?.replies?.pageCids;
    }
  }

  async update() {
    this.updateCalledTimes++;
    if (this.updateCalledTimes > 2) {
      throw Error(
        "with the current hooks, comment.update() should be called maximum 2 times, this number might change if the hooks change and is only there to catch bugs, the real comment.update() can be called infinite times",
      );
    }
    // don't update twice
    if (this.updating) {
      return;
    }
    this.updating = true;

    this.state = "updating";
    this.updatingState = "fetching-ipfs";
    this.emit("statechange", "updating");
    this.emit("updatingstatechange", "fetching-ipfs");

    simulateLoadingTime().then(() => {
      this.simulateUpdateEvent();
    });
  }

  simulateUpdateEvent() {
    // if timestamp isn't defined, simulate fetching the comment ipfs
    if (!this.timestamp) {
      this.simulateFetchCommentIpfsUpdateEvent();
      return;
    }

    // simulate finding vote counts on an IPNS record
    this.upvoteCount = typeof this.upvoteCount === "number" ? this.upvoteCount + 2 : 3;
    this.downvoteCount = typeof this.downvoteCount === "number" ? this.downvoteCount + 1 : 1;
    this.updatedAt = Math.floor(Date.now() / 1000);

    this.updatingState = "succeeded";
    this.emit("update", this);
    this.emit("updatingstatechange", "succeeded");
  }

  async simulateFetchCommentIpfsUpdateEvent() {
    // use plebbit.getComment() so mocking Plebbit.prototype.getComment works
    const commentIpfs = await new Plebbit().getComment({ cid: this.cid || "" });
    this.content = commentIpfs.content;
    this.author = commentIpfs.author;
    this.timestamp = commentIpfs.timestamp;
    this.parentCid = commentIpfs.parentCid;
    this.communityAddress = commentIpfs.communityAddress;

    // simulate the ipns update
    this.updatingState = "fetching-update-ipns";
    this.emit("update", this);
    this.emit("updatingstatechange", "fetching-update-ipns");
    simulateLoadingTime().then(() => {
      this.simulateUpdateEvent();
    });
  }
}

export class Vote extends Publication {}

export class CommentEdit extends Publication {}

export class CommentModeration extends Publication {}

export class CommunityEdit extends Publication {}

const createPlebbit: any = async (...args: any) => {
  return new Plebbit(...args);
};

createPlebbit.getShortAddress = (options: { address: string }) => {
  const address = options?.address;
  if (address.includes(".")) {
    return address;
  }
  return address.substring(2, 14);
};

createPlebbit.getShortCid = (options: { cid: string }) => {
  const cid = options?.cid;
  return cid.substring(2, 14);
};

export default createPlebbit;
