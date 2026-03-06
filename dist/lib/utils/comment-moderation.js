const moderationPropertyNames = [
    "spoiler",
    "nsfw",
    "pinned",
    "locked",
    "archived",
    "approved",
    "removed",
    "purged",
    "reason",
];
export function addCommentModeration(comment) {
    if (!comment) {
        return comment;
    }
    let nextCommentModeration = comment.commentModeration && typeof comment.commentModeration === "object"
        ? comment.commentModeration
        : undefined;
    let changed = false;
    for (const propertyName of moderationPropertyNames) {
        const propertyValue = comment[propertyName];
        if (propertyValue === undefined) {
            continue;
        }
        if (!nextCommentModeration) {
            nextCommentModeration = {};
            changed = true;
        }
        if (nextCommentModeration[propertyName] !== propertyValue) {
            if (nextCommentModeration === comment.commentModeration) {
                nextCommentModeration = Object.assign({}, comment.commentModeration);
            }
            nextCommentModeration[propertyName] = propertyValue;
            changed = true;
        }
    }
    if (!changed) {
        return comment;
    }
    return Object.assign(Object.assign({}, comment), { commentModeration: nextCommentModeration });
}
export function addCommentModerationToComments(comments) {
    if (!comments) {
        return [];
    }
    let changed = false;
    const normalizedComments = comments.map((comment) => {
        const normalizedComment = addCommentModeration(comment);
        if (normalizedComment !== comment) {
            changed = true;
        }
        return normalizedComment;
    });
    return changed ? normalizedComments : comments;
}
