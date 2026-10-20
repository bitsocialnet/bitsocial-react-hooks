import { useMemo } from "react";
import { getPkcAddressFromPublicKey } from "../../lib/pkc-address.js";
export const useAuthorCommentsName = (accountId, authorAddress, filter) => {
    return useMemo(() => accountId + "-" + authorAddress + "-" + (filter === null || filter === void 0 ? void 0 : filter.key), [accountId, authorAddress, filter === null || filter === void 0 ? void 0 : filter.key]);
};
export const usePkcAddress = (publicKeyBase64) => {
    return useMemo(() => (publicKeyBase64 ? getPkcAddressFromPublicKey(publicKeyBase64) : undefined), [publicKeyBase64]);
};
//# sourceMappingURL=utils.js.map