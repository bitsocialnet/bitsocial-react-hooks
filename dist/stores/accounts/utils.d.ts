import { Account, Communities, AccountComment, AccountsComments, AccountsCommentsIndexes, AccountCommentsIndex, CommentCidsToAccountsComments, Comment, AccountEdit, AccountEditsSummary } from "../../types.js";
export declare const getAccountCommunities: (account: Account, communities: Communities) => any;
export declare const getCommentCidsToAccountsComments: (accountsComments: AccountsComments) => CommentCidsToAccountsComments;
export declare const sanitizeAccountCommentForState: (comment: Comment) => any;
export declare const sanitizeStoredAccountComment: (comment: Comment) => any;
export declare const getAccountCommentsIndex: (accountComments: AccountComment[] | undefined) => AccountCommentsIndex;
export declare const getAccountsCommentsIndexes: (accountsComments: AccountsComments) => AccountsCommentsIndexes;
export declare const COMMENT_MODERATION_AUTHOR_SUMMARY_KEY = "commentModeration.author";
export declare const getAccountEditPropertySummary: (accountEdits: AccountEdit[] | undefined) => {
    [propertyName: string]: import("../../types.js").AccountEditPropertySummary;
};
export declare const getAccountsEditsSummary: (accountEdits: {
    [commentCidOrCommunityAddress: string]: AccountEdit[];
}) => AccountEditsSummary;
interface CommentLinkDimensions {
    linkWidth?: number;
    linkHeight?: number;
    linkHtmlTagName?: "img" | "video" | "audio";
}
export declare const fetchCommentLinkDimensions: (link: string) => Promise<CommentLinkDimensions>;
export declare const getInitAccountCommentsToUpdate: (accountsComments: AccountsComments) => {
    accountComment: AccountComment;
    accountId: string;
}[];
export declare const getAccountCommentDepth: (comment: Comment) => number | undefined;
export declare const addShortAddressesToAccountComment: (comment: Comment) => Comment;
declare const utils: {
    getAccountCommunities: (account: Account, communities: Communities) => any;
    getCommentCidsToAccountsComments: (accountsComments: AccountsComments) => CommentCidsToAccountsComments;
    getAccountCommentsIndex: (accountComments: AccountComment[] | undefined) => AccountCommentsIndex;
    getAccountsCommentsIndexes: (accountsComments: AccountsComments) => AccountsCommentsIndexes;
    sanitizeAccountCommentForState: (comment: Comment) => any;
    sanitizeStoredAccountComment: (comment: Comment) => any;
    getAccountEditPropertySummary: (accountEdits: AccountEdit[] | undefined) => {
        [propertyName: string]: import("../../types.js").AccountEditPropertySummary;
    };
    getAccountsEditsSummary: (accountEdits: {
        [commentCidOrCommunityAddress: string]: AccountEdit[];
    }) => AccountEditsSummary;
    fetchCommentLinkDimensions: (link: string) => Promise<CommentLinkDimensions>;
    getInitAccountCommentsToUpdate: (accountsComments: AccountsComments) => {
        accountComment: AccountComment;
        accountId: string;
    }[];
    getAccountCommentDepth: (comment: Comment) => number | undefined;
    addShortAddressesToAccountComment: (comment: Comment) => Comment;
    promiseAny: <T>(promises: Promise<T>[]) => Promise<T>;
};
export default utils;
//# sourceMappingURL=utils.d.ts.map