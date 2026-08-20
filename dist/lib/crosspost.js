import assert from "assert";
import utils from "./utils/index.js";
/** Build the immutable wire payload required by pkc-js when publishing a crosspost. */
export const createCrosspost = (comment) => {
    var _a;
    assert(typeof (comment === null || comment === void 0 ? void 0 : comment.cid) === "string" && comment.cid.length > 0, "createCrosspost comment.cid not a string");
    assert(((_a = comment === null || comment === void 0 ? void 0 : comment.raw) === null || _a === void 0 ? void 0 : _a.comment) && typeof comment.raw.comment === "object", "createCrosspost comment.raw.comment not an object");
    return {
        cid: comment.cid,
        comment: utils.clone(comment.raw.comment),
    };
};
//# sourceMappingURL=crosspost.js.map