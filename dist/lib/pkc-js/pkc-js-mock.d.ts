import EventEmitter from "events";
import type { PkcResolveAuthorNameOptions, PkcResolveAuthorNameResult } from "../pkc-types.js";
export declare const simulateLoadingTime: () => Promise<unknown>;
export declare const resetPkcJsMock: () => void;
export declare const debugPkcJsMock: () => void;
declare class NameResolverClient extends EventEmitter {
    state: string;
}
export declare class PKC extends EventEmitter {
    nameResolvers: any[];
    _clientsManager: {
        clients: {
            nameResolvers: {
                [resolverKey: string]: NameResolverClient;
            };
        };
    };
    constructor(options?: any);
    resolveAuthorAddress(options: {
        address: string;
    }): Promise<string>;
    resolveAuthorName(options: PkcResolveAuthorNameOptions): Promise<PkcResolveAuthorNameResult>;
    createSigner(): Promise<{
        privateKey: string;
        address: string;
    }>;
    createCommunity(createCommunityOptions: any): Promise<Community>;
    getCommunity(options: {
        address: string;
    }): Promise<any>;
    get communities(): string[];
    createComment(createCommentOptions: any): Promise<Comment>;
    getComment(options: {
        cid: string;
    }): Promise<Comment>;
    commentToGet(commentCid?: string): {};
    createVote(): Promise<Vote>;
    createCommentEdit(createCommentEditOptions: any): Promise<CommentEdit>;
    createCommentModeration(createCommentModerationOptions: any): Promise<CommentModeration>;
    createCommunityEdit(createCommunityEditOptions: any): Promise<CommunityEdit>;
    fetchCid(options: {
        cid: string;
    }): Promise<string>;
    pubsubSubscribe(communityAddress: string): Promise<void>;
    pubsubUnsubscribe(communityAddress: string): Promise<void>;
    clients: {
        pkcRpcClients: {
            "http://localhost:9138": PkcRpcClient;
        };
    };
    validateComment(comment: any, validateCommentOptions: any): Promise<void>;
}
declare class PkcRpcClient extends EventEmitter {
    state: string;
    settings: any;
    constructor();
    setSettings(settings: any): Promise<void>;
}
export declare class Pages {
    pageCids: any;
    pages: any;
    community: any;
    comment: any;
    constructor(pagesOptions?: any);
    getPage(options: {
        cid: string;
    }): Promise<any>;
    validatePage(page: any): Promise<void>;
    pageToGet(pageCid: string): any;
}
export declare class Community extends EventEmitter {
    updateCalledTimes: number;
    updating: boolean;
    firstUpdate: boolean;
    address: string | undefined;
    publicKey: string | undefined;
    title: string | undefined;
    description: string | undefined;
    posts: Pages;
    modQueue: Pages;
    exportRecords: any[];
    updatedAt: number | undefined;
    statsCid: string | undefined;
    state: string;
    updatingState: string;
    constructor(createCommunityOptions?: any);
    update(): Promise<void>;
    delete(): Promise<void>;
    get exports(): any[];
    export(exportCommunityOptions?: any): Promise<{
        exportId: string;
    }>;
    simulateUpdateEvent(): void;
    simulateFirstUpdateEvent(): Promise<void>;
    get roles(): {};
    rolesToGet(): {};
    edit(editCommunityOptions: any): Promise<void>;
}
declare class Publication extends EventEmitter {
    timestamp: number | undefined;
    content: string | undefined;
    cid: string | undefined;
    challengeRequestId: string;
    challengeAnswerId: string;
    state: string | undefined;
    publishingState: string | undefined;
    publish(): Promise<void>;
    simulateChallengeEvent(): void;
    publishChallengeAnswers(challengeAnswers: string[]): Promise<void>;
    simulateChallengeVerificationEvent(): void;
    stop(): void;
}
export declare class Comment extends Publication {
    updateCalledTimes: number;
    updating: boolean;
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
    constructor(createCommentOptions?: any);
    update(): Promise<void>;
    simulateUpdateEvent(): void;
    simulateFetchCommentIpfsUpdateEvent(): Promise<void>;
}
export declare class Vote extends Publication {
}
export declare class CommentEdit extends Publication {
}
export declare class CommentModeration extends Publication {
}
export declare class CommunityEdit extends Publication {
}
declare const createPkc: any;
export default createPkc;
//# sourceMappingURL=pkc-js-mock.d.ts.map