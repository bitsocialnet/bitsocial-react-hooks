import { useEffect, useState, useMemo } from "react";
import { useAccount } from "../accounts";
import Logger from "@pkcprotocol/pkc-logger";
const log = Logger("bitsocial-react-hooks:authors:hooks");
import assert from "../../lib/assert";
import { Nft, ChainProviders, Author } from "../../types";
import { getNftMetadataUrl, getNftImageUrl, getNftOwner } from "../../lib/chain";
import { getChainProviders } from "../../lib/pkc-compat";
import createStore from "zustand";

const noMediaIpfsGatewayUrl = "http://no-media-ipfs-gateway-url";

// a result is stored with the inputs it was computed for, and only applies to those inputs. Until the
// effect has run for new inputs, the stored result belongs to the previous ones.
type Result<T> = { inputs: any[]; value?: T; error?: Error };
const getCurrentResult = <T>(result: Result<T> | undefined, inputs: any[]) =>
  result?.inputs.length === inputs.length &&
  result.inputs.every((input, index) => input === inputs[index])
    ? result
    : undefined;

/**
 * @param nft - The NFT object to resolve the URL of.
 * @param acountName - The nickname of the account, e.g. 'Account KoXpxTwfnjA5'. If no accountName is provided, use
 * the active account.
 */
// NOTE: useNftMetadataUrl tests are skipped, if changes are made they must be tested manually
export function useNftMetadataUrl(nft?: Nft, accountName?: string) {
  const account = useAccount({ accountName });
  const ipfsGatewayUrl = account?.mediaIpfsGatewayUrl || noMediaIpfsGatewayUrl;
  const chainProviders = getChainProviders(account);
  const [result, setResult] = useState<Result<string>>();

  const getNftMetadataUrlArgs = [
    nft?.address,
    nft?.id,
    nft?.chainTicker,
    chainProviders?.[nft?.chainTicker]?.urls?.[0],
    chainProviders?.[nft?.chainTicker]?.chainId,
    ipfsGatewayUrl,
  ];

  useEffect(() => {
    // reset
    setResult(undefined);

    if (!account || !nft) {
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const url = await getNftMetadataUrl(...getNftMetadataUrlArgs);
        if (!cancelled) {
          setResult({ inputs: getNftMetadataUrlArgs, value: url });
        }
      } catch (error: any) {
        if (!cancelled) {
          setResult({ inputs: getNftMetadataUrlArgs, error });
        }
        log.error("useNftMetadataUrl getNftMetadataUrl error", {
          nft,
          ipfsGatewayUrl,
          chainProviders,
          error,
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, getNftMetadataUrlArgs);

  const { value: nftMetadataUrl, error } = getCurrentResult(result, getNftMetadataUrlArgs) || {};
  // log('useNftMetadataUrl', {nft, ipfsGatewayUrl, nftMetadataUrl, chainProviders})
  return { metadataUrl: nftMetadataUrl, error };
}

/**
 * @param nftMetadataUrl - The NFT URL to resolve the image URL of.
 * @param acountName - The nickname of the account, e.g. 'Account KoXpxTwfnjA5'. If no accountName is provided, use
 * the active account.
 */
// NOTE: useNftImageUrl tests are skipped, if changes are made they must be tested manually
export function useNftImageUrl(nftMetadataUrl?: string, accountName?: string) {
  assert(
    !nftMetadataUrl || typeof nftMetadataUrl === "string",
    `useNftImageUrl invalid argument nftMetadataUrl '${nftMetadataUrl}' not a string`,
  );
  const account = useAccount({ accountName });
  const ipfsGatewayUrl = account?.mediaIpfsGatewayUrl || noMediaIpfsGatewayUrl;
  const [result, setResult] = useState<Result<string>>();
  const inputs = [nftMetadataUrl, ipfsGatewayUrl];

  useEffect(() => {
    // reset
    setResult(undefined);

    if (!account || !nftMetadataUrl) {
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const url = await getNftImageUrl(nftMetadataUrl, ipfsGatewayUrl);
        if (!cancelled) {
          setResult({ inputs, value: url });
        }
      } catch (error: any) {
        if (!cancelled) {
          setResult({ inputs, error });
        }
        log.error("useNftImageUrl getNftImageUrl error", { nftMetadataUrl, ipfsGatewayUrl, error });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, inputs);

  const { value: imageUrl, error } = getCurrentResult(result, inputs) || {};
  // log('useNftImageUrl', {nftMetadataUrl, ipfsGatewayUrl, imageUrl})
  return { imageUrl, error };
}

// NOTE: useVerifiedAuthorAvatarSignature tests are skipped, if changes are made they must be tested manually
export function useVerifiedAuthorAvatarSignature(author?: Author, accountName?: string) {
  const account = useAccount({ accountName });
  const chainProviders = getChainProviders(account);
  const [result, setResult] = useState<Result<boolean>>();
  const inputs = [author?.avatar, author?.address, chainProviders];

  useEffect(() => {
    // reset
    setResult(undefined);

    if (!account || !author?.avatar) {
      return;
    }

    // the verification of a previous author arriving late must not verify the current one
    let cancelled = false;
    (async () => {
      try {
        const res = await verifyAuthorAvatarSignature(
          author.avatar,
          author.address,
          chainProviders,
        );
        if (!cancelled) {
          setResult({ inputs, value: res });
        }
      } catch (error: any) {
        if (!cancelled) {
          setResult({ inputs, error });
        }
        log.error("useVerifiedAuthorAvatarSignature verifyAuthorAvatarSignature error", {
          author,
          chainProviders,
          error,
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, inputs);

  // don't verify nft signature when using mock content during development
  if (process.env.REACT_APP_BITSOCIAL_REACT_HOOKS_MOCK_CONTENT) {
    return { verified: true, error: undefined };
  }

  const { value: verified, error } = getCurrentResult(result, inputs) || {};
  // log('useVerifiedAuthorAvatarSignature', {author, verified, chainProviders})
  return { verified, error };
}

const defaultWhitelistedTokenAddresses = [
  // xpleb nfts
  "0x890a2e81836e0e76e0f49995e6b51ca6ce6f39ed",
  // plebsquat
  "0x52e6cd20f5fca56da5a0e489574c92af118b8188",
];

type AuthorAvatarsWhitelistedTokenAddressesState = {
  authorAvatarsWhitelistedTokenAddresses: { [tokenAddress: string]: boolean };
  setAuthorAvatarsWhitelistedTokenAddresses: (tokenAddresses: string[]) => void;
};

const useAuthorAvatarsWhitelistedTokenAddressesStore =
  createStore<AuthorAvatarsWhitelistedTokenAddressesState>(
    (setState: Function, getState: Function) => ({
      authorAvatarsWhitelistedTokenAddresses: {},
      setAuthorAvatarsWhitelistedTokenAddresses: (tokenAddresses: string[]) => {
        const authorAvatarsWhitelistedTokenAddresses: { [tokenAddress: string]: boolean } = {};
        for (const tokenAddress of tokenAddresses) {
          authorAvatarsWhitelistedTokenAddresses[tokenAddress] = true;
          // make sure lower case version exists
          authorAvatarsWhitelistedTokenAddresses[tokenAddress.toLowerCase()] = true;
        }
        setState({ authorAvatarsWhitelistedTokenAddresses });
      },
    }),
  );
export const setAuthorAvatarsWhitelistedTokenAddresses =
  useAuthorAvatarsWhitelistedTokenAddressesStore.getState()
    .setAuthorAvatarsWhitelistedTokenAddresses;
setAuthorAvatarsWhitelistedTokenAddresses(defaultWhitelistedTokenAddresses); // init default

export function useAuthorAvatarIsWhitelisted(nft?: Nft) {
  // TODO: make a list that a dao can vote it, get the list from pkc.getDefaults()
  // TODO: make community owners able to whitelist their own nfts in their communities
  // TODO: make each user able to whitelist/blacklist any nft they want for their own client
  // TODO: make hook to list which default nfts are whitelisted to display to the user

  const authorAvatarsWhitelistedTokenAddresses = useAuthorAvatarsWhitelistedTokenAddressesStore(
    (state: AuthorAvatarsWhitelistedTokenAddressesState) =>
      state.authorAvatarsWhitelistedTokenAddresses,
  );

  const isWhitelisted =
    nft?.address && Boolean(authorAvatarsWhitelistedTokenAddresses[nft?.address?.toLowerCase()]);
  return isWhitelisted;
}

export const getNftMessageToSign = (
  authorAddress: string,
  timestamp: number,
  tokenAddress: string,
  tokenId: string,
) => {
  // use plain JSON so the user can read what he's signing
  // property names must always be in this order for signature to match so don't use JSON.stringify
  return `{"domainSeparator":"pkc-author-avatar","authorAddress":"${authorAddress}","timestamp":${timestamp},"tokenAddress":"${tokenAddress}","tokenId":"${tokenId}"}`;
};

// NOTE: verifyAuthorAvatarSignature tests are skipped, if changes are made they must be tested manually
export const verifyAuthorAvatarSignature = async (
  nft: Nft,
  authorAddress: string,
  chainProviders: ChainProviders,
) => {
  assert(
    nft && typeof nft === "object",
    `verifyAuthorAvatarSignature invalid nft argument '${nft}'`,
  );
  assert(nft?.address, `verifyAuthorAvatarSignature invalid nft.address '${nft?.address}'`);
  assert(
    nft?.id && typeof nft?.id === "string",
    `verifyAuthorAvatarSignature invalid nft.tokenAddress '${nft?.id}' not a string`,
  );
  assert(
    typeof nft?.timestamp === "number",
    `verifyAuthorAvatarSignature invalid nft.timestamp '${nft?.timestamp}' not a number`,
  );
  assert(nft?.signature, `verifyAuthorAvatarSignature invalid nft.signature '${nft?.signature}'`);
  assert(
    nft?.signature?.signature,
    `verifyAuthorAvatarSignature invalid nft.signature.signature '${nft?.signature?.signature}'`,
  );
  assert(authorAddress, `verifyAuthorAvatarSignature invalid authorAddress '${authorAddress}'`);

  // get the owner of the nft at nft.id
  const currentNftOwnerAddress = await getNftOwner(
    nft?.address,
    nft?.id,
    nft?.chainTicker,
    chainProviders?.[nft?.chainTicker]?.urls?.[0],
    chainProviders?.[nft?.chainTicker]?.chainId,
  );

  const messageThatShouldBeSigned = getNftMessageToSign(
    authorAddress,
    nft.timestamp,
    nft.address,
    nft.id,
  );
  // Loaded on demand so ethers stays out of the startup bundle (see lib/chain).
  const { ethers } = await import("ethers");
  const signatureAddress = ethers.utils.verifyMessage(
    messageThatShouldBeSigned,
    nft.signature.signature,
  );

  let verified = true;
  if (currentNftOwnerAddress !== signatureAddress) {
    verified = false;
  }
  return verified;
};
