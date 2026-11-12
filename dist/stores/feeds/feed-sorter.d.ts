type SortOptions = {
    pinnedFirst?: boolean;
};
declare const _default: {
    sort: (sortType: string | undefined, feed: any[], { pinnedFirst }?: SortOptions) => any[];
    merge: (sortType: string | undefined, feeds: {
        posts: any[];
        keepOrder: boolean;
    }[], sortOptions?: SortOptions) => any[];
};
export default _default;
//# sourceMappingURL=feed-sorter.d.ts.map