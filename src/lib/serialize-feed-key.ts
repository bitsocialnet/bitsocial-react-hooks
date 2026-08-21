export const serializeFeedKey = (parts: readonly unknown[]) =>
  JSON.stringify(
    parts.map((part) => [
      typeof part,
      typeof part === "number" && !Number.isFinite(part) ? String(part) : part,
    ]),
  );
