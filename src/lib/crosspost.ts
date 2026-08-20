import assert from "assert";
import type { Comment, Crosspost } from "../types";
import utils from "./utils";

/** Build the immutable wire payload required by pkc-js when publishing a crosspost. */
export const createCrosspost = (comment: Comment): Crosspost => {
  assert(
    typeof comment?.cid === "string" && comment.cid.length > 0,
    "createCrosspost comment.cid not a string",
  );
  assert(
    comment?.raw?.comment && typeof comment.raw.comment === "object",
    "createCrosspost comment.raw.comment not an object",
  );

  return {
    cid: comment.cid,
    comment: utils.clone(comment.raw.comment),
  };
};
