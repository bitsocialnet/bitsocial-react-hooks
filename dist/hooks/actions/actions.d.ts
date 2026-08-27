import type { Dispatch, SetStateAction } from "react";
/** Wraps a callback to no-op when guard returns false. Exported for coverage. */
export declare function withGuardActive<T extends (...args: any[]) => void>(guardActive: () => boolean, fn: T): T;
/** For usePublishComment: when abandoned, catch should no-op. Exported for coverage. */
export declare function handlePublishErrorWhenAbandoned(activeRequestIdRef: {
    current: number | undefined;
}, requestId: number, error: Error, setErrors: Dispatch<SetStateAction<Error[]>>, onError?: (e: Error) => void): void;
/** For usePublishVote catch. Exported for coverage. */
export declare function handlePublishVoteError(error: Error, setErrors: Dispatch<SetStateAction<Error[]>>, onError?: (e: Error) => void): void;
import type { UseSubscribeOptions, UseSubscribeResult, UsePublishCommentOptions, UsePublishCommentResult, UseBlockOptions, UseBlockResult, UseSaveCommentOptions, UseSaveCommentResult, UseCreateCommunityOptions, UseCreateCommunityResult, UseExportCommunityOptions, UseExportCommunityResult, UsePublishVoteOptions, UsePublishVoteResult, UsePublishCommentEditOptions, UsePublishCommentEditResult, UsePublishCommentModerationOptions, UsePublishCommentModerationResult, UsePublishCommunityEditOptions, UsePublishCommunityEditResult } from "../../types.js";
export declare function useSubscribe(options?: UseSubscribeOptions): UseSubscribeResult;
export declare function useBlock(options?: UseBlockOptions): UseBlockResult;
export declare function useSaveComment(options?: UseSaveCommentOptions): UseSaveCommentResult;
export declare function usePublishComment(options?: UsePublishCommentOptions): UsePublishCommentResult;
export declare function usePublishVote(options?: UsePublishVoteOptions): UsePublishVoteResult;
export declare function usePublishCommentEdit(options?: UsePublishCommentEditOptions): UsePublishCommentEditResult;
export declare function usePublishCommentModeration(options?: UsePublishCommentModerationOptions): UsePublishCommentModerationResult;
export declare function usePublishCommunityEdit(options?: UsePublishCommunityEditOptions): UsePublishCommunityEditResult;
export declare function useCreateCommunity(options?: UseCreateCommunityOptions): UseCreateCommunityResult;
export declare function useExportCommunity(options?: UseExportCommunityOptions): UseExportCommunityResult;
//# sourceMappingURL=actions.d.ts.map