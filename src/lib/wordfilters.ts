const RULES_KEY = "wordfilter/v1/rules";
const FIELD_NAMES_KEY = "wordfilter/v1/fieldNames";
const DEFAULT_FIELD_NAMES = ["content", "title", "author.displayName"];
const MAX_PASSES = 8;
const unsafePathParts = new Set(["__proto__", "constructor", "prototype"]);

type WordfilterRule = { src: string; dst: string };
type Challenge = { publicOptions?: Record<string, unknown> };

const parseStringArray = (value: unknown): string[] | undefined => {
  if (typeof value !== "string") return;
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string" || !item)) return;
    return parsed;
  } catch {
    return;
  }
};

const parseRules = (value: unknown): WordfilterRule[] | undefined => {
  if (typeof value !== "string") return;
  try {
    const parsed = JSON.parse(value);
    if (
      !Array.isArray(parsed) ||
      parsed.some(
        (rule) =>
          !rule ||
          typeof rule !== "object" ||
          Array.isArray(rule) ||
          typeof rule.src !== "string" ||
          !rule.src ||
          typeof rule.dst !== "string",
      )
    ) {
      return;
    }
    return parsed;
  } catch {
    return;
  }
};

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const applyRules = (value: string, rules: WordfilterRule[]) => {
  let current = value;
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    let next = current;
    for (const { src, dst } of rules) {
      next = next.replace(new RegExp(escapeRegExp(src), "gi"), () => dst);
    }
    if (next === current) return current;
    current = next;
  }
  throw new Error("wordfilter rules did not stabilise");
};

const getOwnStringAtPath = (value: Record<string, any>, path: string) => {
  const parts = path.split(".");
  if (!parts.length || parts.some((part) => !part || unsafePathParts.has(part))) return;
  let current: any = value;
  for (const part of parts) {
    if (
      !current ||
      typeof current !== "object" ||
      !Object.prototype.hasOwnProperty.call(current, part)
    ) {
      return;
    }
    current = current[part];
  }
  return typeof current === "string" ? current : undefined;
};

const setOwnPath = (value: Record<string, any>, path: string, replacement: string) => {
  const parts = path.split(".");
  const output = { ...value };
  let source: any = value;
  let target: any = output;
  for (let index = 0; index < parts.length - 1; index++) {
    const part = parts[index];
    source = source[part];
    target[part] = Array.isArray(source) ? [...source] : { ...source };
    target = target[part];
  }
  target[parts[parts.length - 1]] = replacement;
  return output;
};

export const applyCommunityWordfilters = <T extends Record<string, any>>(
  publication: T,
  challenges?: Challenge[],
): T => {
  const rulesByField = new Map<string, WordfilterRule[]>();
  for (const challenge of challenges || []) {
    const rules = parseRules(challenge?.publicOptions?.[RULES_KEY]);
    if (!rules) continue;
    const configuredFieldNames = challenge.publicOptions?.[FIELD_NAMES_KEY];
    const fieldNames =
      configuredFieldNames === undefined
        ? DEFAULT_FIELD_NAMES
        : parseStringArray(configuredFieldNames);
    if (!fieldNames) continue;
    for (const fieldName of fieldNames) {
      rulesByField.set(fieldName, [...(rulesByField.get(fieldName) || []), ...rules]);
    }
  }

  let output: Record<string, any> = publication;
  for (const [fieldName, rules] of rulesByField) {
    const value = getOwnStringAtPath(output, fieldName);
    if (value === undefined) continue;
    const replacement = applyRules(value, rules);
    if (replacement !== value) output = setOwnPath(output, fieldName, replacement);
  }
  return output as T;
};
