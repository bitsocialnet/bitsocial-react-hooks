import { useEffect, useState, useMemo } from "react";
import { Comment, CommentsFilter } from "../../types";
import { useComments } from "../comments";
import utils from "../../lib/utils";
import PeerId from "peer-id";
import assert from "../../lib/assert";
import { getPkcAddressFromPublicKey } from "../../lib/pkc-address";

export const useAuthorCommentsName = (
  accountId?: string,
  authorAddress?: string,
  filter?: CommentsFilter | undefined,
) => {
  return useMemo(
    () => accountId + "-" + authorAddress + "-" + filter?.key,
    [accountId, authorAddress, filter?.key],
  );
};

export const usePkcAddress = (publicKeyBase64?: string) => {
  return useMemo(
    () => (publicKeyBase64 ? getPkcAddressFromPublicKey(publicKeyBase64) : undefined),
    [publicKeyBase64],
  );
};
