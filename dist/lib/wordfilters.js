const RULES_KEY = "wordfilter/v1/rules";
const FIELD_NAMES_KEY = "wordfilter/v1/fieldNames";
const DEFAULT_FIELD_NAMES = ["content", "title", "author.displayName"];
const SUPPORTED_FIELD_NAMES = new Set(DEFAULT_FIELD_NAMES);
const MAX_PASSES = 8;
const unsafePathParts = new Set(["__proto__", "constructor", "prototype"]);
const parseStringArray = (value) => {
    if (typeof value !== "string")
        return;
    try {
        const parsed = JSON.parse(value);
        if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string" || !item))
            return;
        return parsed;
    }
    catch (_a) {
        return;
    }
};
const parseRules = (value) => {
    if (typeof value !== "string")
        return;
    try {
        const parsed = JSON.parse(value);
        if (!Array.isArray(parsed) ||
            parsed.some((rule) => !rule ||
                typeof rule !== "object" ||
                Array.isArray(rule) ||
                typeof rule.src !== "string" ||
                !rule.src ||
                typeof rule.dst !== "string")) {
            return;
        }
        return parsed;
    }
    catch (_a) {
        return;
    }
};
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const applyRules = (value, rules) => {
    let current = value;
    for (let pass = 0; pass < MAX_PASSES; pass++) {
        let next = current;
        for (const { src, dst } of rules) {
            next = next.replace(new RegExp(escapeRegExp(src), "gi"), () => dst);
        }
        if (next === current)
            return current;
        current = next;
    }
    throw new Error("wordfilter rules did not stabilise");
};
const getOwnStringAtPath = (value, path) => {
    const parts = path.split(".");
    if (!parts.length || parts.some((part) => !part || unsafePathParts.has(part)))
        return;
    let current = value;
    for (const part of parts) {
        if (!current ||
            typeof current !== "object" ||
            !Object.prototype.hasOwnProperty.call(current, part)) {
            return;
        }
        current = current[part];
    }
    return typeof current === "string" ? current : undefined;
};
const setOwnPath = (value, path, replacement) => {
    const parts = path.split(".");
    const output = Object.assign({}, value);
    let source = value;
    let target = output;
    for (let index = 0; index < parts.length - 1; index++) {
        const part = parts[index];
        source = source[part];
        target[part] = Array.isArray(source) ? [...source] : Object.assign({}, source);
        target = target[part];
    }
    target[parts[parts.length - 1]] = replacement;
    return output;
};
export const applyCommunityWordfilters = (publication, challenges) => {
    var _a, _b;
    const rulesByField = new Map();
    for (const challenge of challenges || []) {
        const rules = parseRules((_a = challenge === null || challenge === void 0 ? void 0 : challenge.publicOptions) === null || _a === void 0 ? void 0 : _a[RULES_KEY]);
        if (!rules)
            continue;
        const configuredFieldNames = (_b = challenge.publicOptions) === null || _b === void 0 ? void 0 : _b[FIELD_NAMES_KEY];
        const fieldNames = configuredFieldNames === undefined
            ? DEFAULT_FIELD_NAMES
            : parseStringArray(configuredFieldNames);
        if (!fieldNames)
            continue;
        for (const fieldName of fieldNames) {
            if (!SUPPORTED_FIELD_NAMES.has(fieldName))
                continue;
            rulesByField.set(fieldName, [...(rulesByField.get(fieldName) || []), ...rules]);
        }
    }
    let output = publication;
    for (const [fieldName, rules] of rulesByField) {
        const value = getOwnStringAtPath(output, fieldName);
        if (value === undefined)
            continue;
        const replacement = applyRules(value, rules);
        if (replacement !== value)
            output = setOwnPath(output, fieldName, replacement);
    }
    return output;
};
//# sourceMappingURL=wordfilters.js.map