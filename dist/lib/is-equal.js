const getTag = (value) => Object.prototype.toString.call(value);
const sameValueZero = (a, b) => a === b || (a !== a && b !== b);
const equal = (a, b, comparing) => {
    if (sameValueZero(a, b)) {
        return true;
    }
    if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) {
        return false;
    }
    const tag = getTag(a);
    if (tag !== getTag(b)) {
        return false;
    }
    // Circular references: a pair already being compared is equal only if each is compared with the
    // other, as in lodash.
    const aComparedWith = comparing.get(a);
    const bComparedWith = comparing.get(b);
    if (aComparedWith && bComparedWith) {
        return aComparedWith === b && bComparedWith === a;
    }
    comparing.set(a, b);
    comparing.set(b, a);
    try {
        return equalObjects(a, b, tag, comparing);
    }
    finally {
        comparing.delete(a);
        comparing.delete(b);
    }
};
const equalObjects = (a, b, tag, comparing) => {
    switch (tag) {
        case "[object Date]":
        case "[object Number]":
        case "[object Boolean]":
            return sameValueZero(+a, +b);
        case "[object RegExp]":
        case "[object String]":
            return String(a) === String(b);
        case "[object Error]":
            return a.name === b.name && a.message === b.message;
        case "[object Map]":
        case "[object Set]":
            // Map entries (as [key, value] pairs) and Set members are compared deeply, in any order.
            return a.size === b.size && equalUnordered([...a], [...b], comparing);
        case "[object ArrayBuffer]":
            return equalBytes(new Uint8Array(a), new Uint8Array(b));
    }
    if (ArrayBuffer.isView(a)) {
        const bView = b;
        return equalBytes(new Uint8Array(a.buffer, a.byteOffset, a.byteLength), new Uint8Array(bView.buffer, bView.byteOffset, bView.byteLength));
    }
    if (Array.isArray(a) || tag === "[object Arguments]") {
        if (a.length !== b.length) {
            return false;
        }
        // By index, so a hole compares as undefined.
        for (let i = 0; i < a.length; i++) {
            if (!equal(a[i], b[i], comparing)) {
                return false;
            }
        }
        return true;
    }
    const keys = Object.keys(a);
    if (keys.length !== Object.keys(b).length) {
        return false;
    }
    if (!keys.every((key) => Object.prototype.hasOwnProperty.call(b, key) && equal(a[key], b[key], comparing))) {
        return false;
    }
    // Objects built by different constructors differ, as in lodash.
    const aConstructor = a.constructor;
    const bConstructor = b.constructor;
    return !(aConstructor !== bConstructor &&
        "constructor" in a &&
        "constructor" in b &&
        !(typeof aConstructor === "function" &&
            aConstructor instanceof aConstructor &&
            typeof bConstructor === "function" &&
            bConstructor instanceof bConstructor));
};
// Each member of `a` needs its own deeply equal member of `b`, as lodash matches collections.
const equalUnordered = (a, b, comparing) => {
    const matched = new Set();
    return a.every((value) => {
        const index = b.findIndex((other, i) => !matched.has(i) && equal(value, other, comparing));
        matched.add(index);
        return index !== -1;
    });
};
const equalBytes = (a, b) => a.length === b.length && a.every((byte, i) => byte === b[i]);
/**
 * Deep equality following lodash's isEqual for the data these hooks compare (account edits and
 * stored comments), without bundling lodash.isequal into the apps that use them.
 */
export default function isEqual(a, b) {
    return equal(a, b, new Map());
}
//# sourceMappingURL=is-equal.js.map