var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import EventEmitter from "events";
const loadingTime = 10;
export const simulateLoadingTime = () => new Promise((r) => setTimeout(r, loadingTime));
// keep a list of created and edited owner communities
// to reinitialize them with pkc.createCommunity()
let createdOwnerCommunities = {};
let editedOwnerCommunities = {};
// reset the pkc-js global state in between tests
export const resetPkcJsMock = () => {
    createdOwnerCommunities = {};
    editedOwnerCommunities = {};
};
export const debugPkcJsMock = () => {
    console.log({ createdOwnerCommunities, editedOwnerCommunities });
};
class NameResolverClient extends EventEmitter {
    constructor() {
        super(...arguments);
        this.state = "stopped";
    }
}
export class PKC extends EventEmitter {
    constructor(options = {}) {
        super();
        this.clients = (() => {
            const pkcRpcClients = {
                "http://localhost:9138": new PkcRpcClient(),
            };
            return {
                pkcRpcClients,
            };
        })();
        this.nameResolvers = (options === null || options === void 0 ? void 0 : options.nameResolvers) || [];
        this._clientsManager = {
            clients: {
                nameResolvers: this.nameResolvers.reduce((resolverClients, resolver) => (Object.assign(Object.assign({}, resolverClients), { [resolver.key]: new NameResolverClient() })), {}),
            },
        };
    }
    resolveAuthorAddress(options) {
        return __awaiter(this, void 0, void 0, function* () {
            const resolver = this.nameResolvers.find((nameResolver) => { var _a; return (_a = nameResolver === null || nameResolver === void 0 ? void 0 : nameResolver.canResolve) === null || _a === void 0 ? void 0 : _a.call(nameResolver, { name: options.address }); });
            const resolverClient = resolver && this._clientsManager.clients.nameResolvers[resolver.key];
            if (resolverClient) {
                resolverClient.state = "resolving-author-name";
                resolverClient.emit("statechange", resolverClient.state);
            }
            yield simulateLoadingTime();
            if (resolverClient) {
                resolverClient.state = "stopped";
                resolverClient.emit("statechange", resolverClient.state);
            }
            return "resolved author address";
        });
    }
    resolveAuthorName(options) {
        return __awaiter(this, void 0, void 0, function* () {
            const resolvedAuthorName = yield this.resolveAuthorAddress({ address: options.name });
            return { resolvedAuthorName };
        });
    }
    createSigner() {
        return __awaiter(this, void 0, void 0, function* () {
            return {
                privateKey: "private key",
                address: "address",
            };
        });
    }
    createCommunity(createCommunityOptions) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!createCommunityOptions) {
                createCommunityOptions = {};
            }
            const communityIdentifier = createCommunityOptions.address ||
                createCommunityOptions.name ||
                createCommunityOptions.publicKey;
            // no address provided so probably a user creating an owner community
            if (!communityIdentifier) {
                createCommunityOptions = Object.assign(Object.assign({}, createCommunityOptions), { address: "created community address" });
                // createdCommunityAddresses.push('created community address')
                createdOwnerCommunities[createCommunityOptions.address] = Object.assign({}, createCommunityOptions);
            }
            // only address provided, so could be a previously created owner community
            // add props from previously created sub
            else if (createdOwnerCommunities[createCommunityOptions.address] &&
                JSON.stringify(Object.keys(createCommunityOptions)) === '["address"]') {
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
        });
    }
    getCommunity(options) {
        return __awaiter(this, void 0, void 0, function* () {
            const address = options === null || options === void 0 ? void 0 : options.address;
            yield simulateLoadingTime();
            const createCommunityOptions = { address };
            const community = new Community(createCommunityOptions);
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
        });
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
    createComment(createCommentOptions) {
        return __awaiter(this, void 0, void 0, function* () {
            return new Comment(createCommentOptions);
        });
    }
    getComment(options) {
        return __awaiter(this, void 0, void 0, function* () {
            const cid = options === null || options === void 0 ? void 0 : options.cid;
            yield simulateLoadingTime();
            const createCommentOptions = Object.assign({ cid, 
                // useComment() requires timestamp or will use account comment instead of comment from store
                timestamp: 1670000000 }, this.commentToGet(cid));
            return new Comment(createCommentOptions);
        });
    }
    // mock this method to get a comment with different content, timestamp, address, etc
    commentToGet(commentCid) {
        return {
        // content: 'mock some content'
        // author: {address: 'mock some address'},
        // timestamp: 1234
        };
    }
    createVote() {
        return __awaiter(this, void 0, void 0, function* () {
            return new Vote();
        });
    }
    createCommentEdit(createCommentEditOptions) {
        return __awaiter(this, void 0, void 0, function* () {
            return new CommentEdit(createCommentEditOptions);
        });
    }
    createCommentModeration(createCommentModerationOptions) {
        return __awaiter(this, void 0, void 0, function* () {
            return new CommentModeration(createCommentModerationOptions);
        });
    }
    createCommunityEdit(createCommunityEditOptions) {
        return __awaiter(this, void 0, void 0, function* () {
            return new CommunityEdit(createCommunityEditOptions);
        });
    }
    fetchCid(options) {
        return __awaiter(this, void 0, void 0, function* () {
            const cid = options === null || options === void 0 ? void 0 : options.cid;
            if (cid === null || cid === void 0 ? void 0 : cid.startsWith("statscid")) {
                return JSON.stringify({ hourActiveUserCount: 1 });
            }
            throw Error(`pkc.fetchCid not implemented in pkc-js mock for cid '${cid}'`);
        });
    }
    pubsubSubscribe(communityAddress) {
        return __awaiter(this, void 0, void 0, function* () { });
    }
    pubsubUnsubscribe(communityAddress) {
        return __awaiter(this, void 0, void 0, function* () { });
    }
    validateComment(comment, validateCommentOptions) {
        return __awaiter(this, void 0, void 0, function* () { });
    }
}
class PkcRpcClient extends EventEmitter {
    constructor() {
        super();
        this.state = "connecting";
        this.settings = undefined;
        // simulate connecting to the rpc
        setTimeout(() => {
            this.state = "connected";
            this.settings = { challenges: {} };
            this.emit("statechange", this.state);
            this.emit("settingschange", this.settings);
        }, 10);
    }
    setSettings(settings) {
        return __awaiter(this, void 0, void 0, function* () {
            this.settings = settings;
            this.emit("settingschange", this.settings);
        });
    }
}
export class Pages {
    constructor(pagesOptions) {
        this.pageCids = {};
        this.pages = {};
        Object.defineProperty(this, "community", {
            value: pagesOptions === null || pagesOptions === void 0 ? void 0 : pagesOptions.community,
            enumerable: false,
        });
        Object.defineProperty(this, "comment", { value: pagesOptions === null || pagesOptions === void 0 ? void 0 : pagesOptions.comment, enumerable: false });
    }
    getPage(options) {
        return __awaiter(this, void 0, void 0, function* () {
            const cid = options === null || options === void 0 ? void 0 : options.cid;
            // need to wait twice otherwise react renders too fast and fetches too many pages in advance
            yield simulateLoadingTime();
            return this.pageToGet(cid);
        });
    }
    validatePage(page) {
        return __awaiter(this, void 0, void 0, function* () { });
    }
    // mock this method to get pages with different content, or use to getPage without simulated loading time
    pageToGet(pageCid) {
        var _a, _b;
        const communityAddress = ((_a = this.community) === null || _a === void 0 ? void 0 : _a.address) || ((_b = this.comment) === null || _b === void 0 ? void 0 : _b.communityAddress);
        const isPendingApprovalPage = pageCid.includes("pendingApproval");
        const page = {
            nextCid: communityAddress + " " + pageCid + " - next page cid",
            comments: [],
        };
        const postCount = 100;
        let index = 0;
        while (index++ < postCount) {
            const comment = {
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
    constructor(createCommunityOptions) {
        var _a, _b, _c, _d, _e, _f;
        super();
        this.updateCalledTimes = 0;
        this.updating = false;
        this.firstUpdate = true;
        this.address =
            (createCommunityOptions === null || createCommunityOptions === void 0 ? void 0 : createCommunityOptions.address) ||
                (createCommunityOptions === null || createCommunityOptions === void 0 ? void 0 : createCommunityOptions.name) ||
                (createCommunityOptions === null || createCommunityOptions === void 0 ? void 0 : createCommunityOptions.publicKey);
        this.title = createCommunityOptions === null || createCommunityOptions === void 0 ? void 0 : createCommunityOptions.title;
        this.description = createCommunityOptions === null || createCommunityOptions === void 0 ? void 0 : createCommunityOptions.description;
        this.statsCid = "statscid";
        this.state = "stopped";
        this.updatingState = "stopped";
        this.updatedAt = createCommunityOptions === null || createCommunityOptions === void 0 ? void 0 : createCommunityOptions.updatedAt;
        this.posts = new Pages({ community: this });
        // add community.posts from createCommunityOptions
        if ((_a = createCommunityOptions === null || createCommunityOptions === void 0 ? void 0 : createCommunityOptions.posts) === null || _a === void 0 ? void 0 : _a.pages) {
            this.posts.pages = (_b = createCommunityOptions === null || createCommunityOptions === void 0 ? void 0 : createCommunityOptions.posts) === null || _b === void 0 ? void 0 : _b.pages;
        }
        if ((_c = createCommunityOptions === null || createCommunityOptions === void 0 ? void 0 : createCommunityOptions.posts) === null || _c === void 0 ? void 0 : _c.pageCids) {
            this.posts.pageCids = (_d = createCommunityOptions === null || createCommunityOptions === void 0 ? void 0 : createCommunityOptions.posts) === null || _d === void 0 ? void 0 : _d.pageCids;
        }
        this.modQueue = new Pages({ community: this });
        // add community.modQueue from createCommunityOptions
        if ((_e = createCommunityOptions === null || createCommunityOptions === void 0 ? void 0 : createCommunityOptions.modQueue) === null || _e === void 0 ? void 0 : _e.pageCids) {
            this.modQueue.pageCids = (_f = createCommunityOptions === null || createCommunityOptions === void 0 ? void 0 : createCommunityOptions.modQueue) === null || _f === void 0 ? void 0 : _f.pageCids;
        }
        if (createCommunityOptions) {
            for (const prop in createCommunityOptions) {
                if (createCommunityOptions[prop] !== undefined) {
                    const descriptor = Object.getOwnPropertyDescriptor(this, prop) ||
                        Object.getOwnPropertyDescriptor(Object.getPrototypeOf(this), prop);
                    if (descriptor && !descriptor.writable && !descriptor.set) {
                        continue;
                    }
                    // @ts-ignore
                    this[prop] = createCommunityOptions[prop];
                }
            }
        }
        const lookupKeys = ["address", "name", "publicKey"];
        const createCommunityOptionKeys = Object.keys(createCommunityOptions || {});
        const hasLookupIdentifier = Boolean((createCommunityOptions === null || createCommunityOptions === void 0 ? void 0 : createCommunityOptions.address) ||
            (createCommunityOptions === null || createCommunityOptions === void 0 ? void 0 : createCommunityOptions.name) ||
            (createCommunityOptions === null || createCommunityOptions === void 0 ? void 0 : createCommunityOptions.publicKey));
        const lookupOnly = hasLookupIdentifier &&
            createCommunityOptionKeys.length > 0 &&
            createCommunityOptionKeys.every((key) => lookupKeys.includes(key));
        // only trigger a first update for lookup-only remote community instances
        if (!lookupOnly) {
            this.firstUpdate = false;
        }
    }
    update() {
        return __awaiter(this, void 0, void 0, function* () {
            this.updateCalledTimes++;
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
        });
    }
    delete() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.address) {
                delete createdOwnerCommunities[this.address];
                delete editedOwnerCommunities[this.address];
            }
        });
    }
    simulateUpdateEvent() {
        if (this.firstUpdate) {
            this.simulateFirstUpdateEvent();
            return;
        }
        this.description = this.address + " description updated";
        // @ts-ignore
        this.updatedAt = this.updatedAt + 1;
        this.updating = false;
        this.updatingState = "succeeded";
        this.emit("update", this);
        this.emit("updatingstatechange", "succeeded");
    }
    // the first update event adds all the field from getCommunity
    simulateFirstUpdateEvent() {
        return __awaiter(this, void 0, void 0, function* () {
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
    edit(editCommunityOptions) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.address || typeof this.address !== "string") {
                throw Error(`can't community.edit with no community.address`);
            }
            const previousAddress = this.address;
            // do community.edit
            for (const prop in editCommunityOptions) {
                if (editCommunityOptions[prop] !== undefined) {
                    const descriptor = Object.getOwnPropertyDescriptor(this, prop) ||
                        Object.getOwnPropertyDescriptor(Object.getPrototypeOf(this), prop);
                    if (descriptor && !descriptor.writable && !descriptor.set) {
                        continue;
                    }
                    // @ts-ignore
                    this[prop] = editCommunityOptions[prop];
                }
            }
            // keep a list of edited communities to reinitialize
            // them with pkc.createCommunity()
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
                createdOwnerCommunities[this.address] = Object.assign(Object.assign({}, createdOwnerCommunities[previousAddress]), { address: this.address });
                delete createdOwnerCommunities[previousAddress];
            }
        });
    }
}
// make roles enumarable so it acts like a regular prop
Object.defineProperty(Community.prototype, "roles", { enumerable: true });
let challengeRequestCount = 0;
let challengeAnswerCount = 0;
class Publication extends EventEmitter {
    constructor() {
        super(...arguments);
        this.challengeRequestId = `r${++challengeRequestCount}`;
        this.challengeAnswerId = `a${++challengeAnswerCount}`;
    }
    publish() {
        return __awaiter(this, void 0, void 0, function* () {
            this.state = "publishing";
            this.publishingState = "publishing-challenge-request";
            this.emit("statechange", "publishing");
            this.emit("publishingstatechange", "publishing-challenge-request");
            yield simulateLoadingTime();
            this.simulateChallengeEvent();
        });
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
    publishChallengeAnswers(challengeAnswers) {
        return __awaiter(this, void 0, void 0, function* () {
            this.publishingState = "publishing-challenge-answer";
            this.emit("publishingstatechange", "publishing-challenge-answer");
            yield simulateLoadingTime();
            this.publishingState = "waiting-challenge-verification";
            this.emit("publishingstatechange", "waiting-challenge-verification");
            yield simulateLoadingTime();
            this.simulateChallengeVerificationEvent();
        });
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
        if (this.updating || this.updatingState !== "stopped") {
            this.state = "stopped";
            this.updating = false;
            this.updatingState = "stopped";
            this.emit("statechange", "stopped");
            this.emit("updatingstatechange", "stopped");
        }
    }
}
export class Comment extends Publication {
    constructor(createCommentOptions) {
        var _a, _b, _c, _d, _e;
        super();
        this.updateCalledTimes = 0;
        this.updating = false;
        this.cid = createCommentOptions === null || createCommentOptions === void 0 ? void 0 : createCommentOptions.cid;
        this.upvoteCount = createCommentOptions === null || createCommentOptions === void 0 ? void 0 : createCommentOptions.upvoteCount;
        this.downvoteCount = createCommentOptions === null || createCommentOptions === void 0 ? void 0 : createCommentOptions.downvoteCount;
        this.content = createCommentOptions === null || createCommentOptions === void 0 ? void 0 : createCommentOptions.content;
        this.author = createCommentOptions === null || createCommentOptions === void 0 ? void 0 : createCommentOptions.author;
        this.timestamp = createCommentOptions === null || createCommentOptions === void 0 ? void 0 : createCommentOptions.timestamp;
        this.parentCid = createCommentOptions === null || createCommentOptions === void 0 ? void 0 : createCommentOptions.parentCid;
        this.communityAddress = createCommentOptions === null || createCommentOptions === void 0 ? void 0 : createCommentOptions.communityAddress;
        this.state = "stopped";
        this.updatingState = "stopped";
        this.publishingState = "stopped";
        if ((_a = createCommentOptions === null || createCommentOptions === void 0 ? void 0 : createCommentOptions.author) === null || _a === void 0 ? void 0 : _a.address) {
            this.author.shortAddress = `short ${createCommentOptions.author.address}`;
        }
        this.replies = new Pages({ comment: this });
        // add comment.replies from createCommentOptions
        if ((_b = createCommentOptions === null || createCommentOptions === void 0 ? void 0 : createCommentOptions.replies) === null || _b === void 0 ? void 0 : _b.pages) {
            this.replies.pages = (_c = createCommentOptions === null || createCommentOptions === void 0 ? void 0 : createCommentOptions.replies) === null || _c === void 0 ? void 0 : _c.pages;
        }
        if ((_d = createCommentOptions === null || createCommentOptions === void 0 ? void 0 : createCommentOptions.replies) === null || _d === void 0 ? void 0 : _d.pageCids) {
            this.replies.pageCids = (_e = createCommentOptions === null || createCommentOptions === void 0 ? void 0 : createCommentOptions.replies) === null || _e === void 0 ? void 0 : _e.pageCids;
        }
    }
    update() {
        return __awaiter(this, void 0, void 0, function* () {
            this.updateCalledTimes++;
            if (this.updateCalledTimes > 5) {
                throw Error("with the current hooks, comment.update() should be called maximum 5 times, this number might change if the hooks change and is only there to catch bugs, the real comment.update() can be called infinite times");
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
        });
    }
    simulateUpdateEvent() {
        if (!this.updating) {
            return;
        }
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
    simulateFetchCommentIpfsUpdateEvent() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.updating) {
                return;
            }
            // use pkc.getComment() so mocking PKC.prototype.getComment works
            const commentIpfs = yield new PKC().getComment({ cid: this.cid || "" });
            if (!this.updating) {
                return;
            }
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
        });
    }
}
export class Vote extends Publication {
}
export class CommentEdit extends Publication {
}
export class CommentModeration extends Publication {
}
export class CommunityEdit extends Publication {
}
const createPkc = (...args) => __awaiter(void 0, void 0, void 0, function* () {
    return new PKC(...args);
});
createPkc.getShortAddress = (options) => {
    const address = options === null || options === void 0 ? void 0 : options.address;
    if (address.includes(".")) {
        return address;
    }
    return address.substring(2, 14);
};
createPkc.getShortCid = (options) => {
    const cid = options === null || options === void 0 ? void 0 : options.cid;
    return cid.substring(2, 14);
};
export default createPkc;
//# sourceMappingURL=pkc-js-mock.js.map