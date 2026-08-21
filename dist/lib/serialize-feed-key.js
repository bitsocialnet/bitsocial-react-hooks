export const serializeFeedKey = (parts) => JSON.stringify(parts.map((part) => [
    typeof part,
    typeof part === "number" && !Number.isFinite(part) ? String(part) : part,
]));
//# sourceMappingURL=serialize-feed-key.js.map