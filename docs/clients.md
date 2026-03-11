#### useStateString example

```js
import { useMemo } from "react";
import { useClientsStates } from "@bitsocialnet/bitsocial-react-hooks";

const clientHosts = {};
const getClientHost = (clientUrl) => {
  if (!clientHosts[clientUrl]) {
    try {
      clientHosts[clientUrl] = new URL(clientUrl).hostname || clientUrl;
    } catch (e) {
      clientHosts[clientUrl] = clientUrl;
    }
  }
  return clientHosts[clientUrl];
};

const useStateString = (commentOrCommunity) => {
  const { states } = useClientsStates({ comment: commentOrCommunity });
  return useMemo(() => {
    let stateString = "";
    for (const state in states) {
      const clientUrls = states[state];
      const clientHosts = clientUrls.map((clientUrl) => getClientHost(clientUrl));

      // if there are no valid hosts, skip this state
      if (clientHosts.length === 0) {
        continue;
      }

      // separate 2 different states using ' '
      if (stateString) {
        stateString += ", ";
      }

      // e.g. 'fetching IPFS from cloudflare-ipfs.com, ipfs.io'
      const formattedState = state
        .replaceAll("-", " ")
        .replace("ipfs", "IPFS")
        .replace("ipns", "IPNS");
      stateString += `${formattedState} from ${clientHosts.join(", ")}`;
    }

    // fallback to comment or community state when possible
    if (!stateString && commentOrCommunity?.state !== "succeeded") {
      if (
        commentOrCommunity?.publishingState &&
        commentOrCommunity?.publishingState !== "stopped" &&
        commentOrCommunity?.publishingState !== "succeeded"
      ) {
        stateString = commentOrCommunity.publishingState;
      } else if (
        commentOrCommunity?.updatingState !== "stopped" &&
        commentOrCommunity?.updatingState !== "succeeded"
      ) {
        stateString = commentOrCommunity.updatingState;
      }
      if (stateString) {
        stateString = stateString
          .replaceAll("-", " ")
          .replace("ipfs", "IPFS")
          .replace("ipns", "IPNS");
      }
    }

    // capitalize first letter
    if (stateString) {
      stateString = stateString.charAt(0).toUpperCase() + stateString.slice(1);
    }

    // if string is empty, return undefined instead
    return stateString === "" ? undefined : stateString;
  }, [states, commentOrCommunity]);
};

export default useStateString;
```

#### Get community with state string

```js
const community = useCommunity({ communityAddress });
const stateString = useStateString(community);
const errorString = useMemo(() => {
  if (community?.state === "failed") {
    let errorString = "Failed fetching community";
    if (community.error) {
      errorString += `: ${community.error.toString().slice(0, 300)}`;
    }
    return errorString;
  }
}, [community?.state]);

if (stateString) {
  console.log(stateString);
}
if (errorString) {
  console.log(errorString);
}
```

#### Publish comment with state string

```js
const { index } = usePublishComment(publishCommentOptions);
const accountComment = useAccountComment({ commentIndex: index });
const { publishingState, error } = accountComment;
const stateString = useStateString(accountComment);
const errorString = useMemo(() => {
  if (publishingState === "failed") {
    let errorString = "Failed publishing comment";
    if (error) {
      errorString += `: ${error.toString().slice(0, 300)}`;
    }
    return errorString;
  }
}, [publishingState]);

if (stateString) {
  console.log(stateString);
}
if (errorString) {
  console.log(errorString);
}
```

#### useFeedStateString example

```js
import { useMemo } from "react";
import { useCommunity, useCommunitiesStates } from "@bitsocialnet/bitsocial-react-hooks";

const clientHosts = {};
const getClientHost = (clientUrl) => {
  if (!clientHosts[clientUrl]) {
    try {
      clientHosts[clientUrl] = new URL(clientUrl).hostname || clientUrl;
    } catch (e) {
      clientHosts[clientUrl] = clientUrl;
    }
  }
  return clientHosts[clientUrl];
};

const useFeedStateString = (communityAddresses) => {
  // single community feed state string
  const communityAddress = communityAddresses?.length === 1 ? communityAddresses[0] : undefined;
  const community = useCommunity({ communityAddress });
  const singleCommunityFeedStateString = useStateString(community);

  // multiple community feed state string
  const { states } = useCommunitiesStates({ communityAddresses });

  const multipleCommunitiesFeedStateString = useMemo(() => {
    if (communityAddress) {
      return;
    }

    // e.g. Resolving 2 addresses from infura.io, fetching 2 IPNS, 1 IPFS from cloudflare-ipfs.com, ipfs.io
    let stateString = "";

    if (states["resolving-address"]) {
      const { communityAddresses, clientUrls } = states["resolving-address"];
      if (communityAddresses.length && clientUrls.length) {
        stateString += `resolving ${communityAddresses.length} ${communityAddresses.length === 1 ? "address" : "addresses"} from ${clientUrls
          .map(getClientHost)
          .join(", ")}`;
      }
    }

    // find all page client and sub addresses
    const pagesStatesClientHosts = new Set();
    const pagesStatesCommunityAddresses = new Set();
    for (const state in states) {
      if (state.match("page")) {
        states[state].clientUrls.forEach((clientUrl) =>
          pagesStatesClientHosts.add(getClientHost(clientUrl)),
        );
        states[state].communityAddresses.forEach((communityAddress) =>
          pagesStatesCommunityAddresses.add(communityAddress),
        );
      }
    }

    if (states["fetching-ipns"] || states["fetching-ipfs"] || pagesStatesCommunityAddresses.size) {
      // separate 2 different states using ', '
      if (stateString) {
        stateString += ", ";
      }

      // find all client urls
      const clientHosts = new Set([...pagesStatesClientHosts]);
      states["fetching-ipns"]?.clientUrls.forEach((clientUrl) =>
        clientHosts.add(getClientHost(clientUrl)),
      );
      states["fetching-ipfs"]?.clientUrls.forEach((clientUrl) =>
        clientHosts.add(getClientHost(clientUrl)),
      );

      if (clientHosts.size) {
        stateString += "fetching ";
        if (states["fetching-ipns"]) {
          stateString += `${states["fetching-ipns"].communityAddresses.length} IPNS`;
        }
        if (states["fetching-ipfs"]) {
          if (states["fetching-ipns"]) {
            stateString += ", ";
          }
          stateString += `${states["fetching-ipfs"].communityAddresses.length} IPFS`;
        }
        if (pagesStatesCommunityAddresses.size) {
          if (states["fetching-ipns"] || states["fetching-ipfs"]) {
            stateString += ", ";
          }
          stateString += `${pagesStatesCommunityAddresses.size} ${pagesStatesCommunityAddresses.size === 1 ? "page" : "pages"}`;
        }
        stateString += ` from ${[...clientHosts].join(", ")}`;
      }
    }

    // capitalize first letter
    stateString = stateString.charAt(0).toUpperCase() + stateString.slice(1);

    // if string is empty, return undefined instead
    return stateString === "" ? undefined : stateString;
  }, [states, communityAddress]);

  if (singleCommunityFeedStateString) {
    return singleCommunityFeedStateString;
  }
  return multipleCommunitiesFeedStateString;
};

export default useFeedStateString;
```

#### Get feed with single sub with state string

```js
const communityAddress = "memes.eth";
const { feed, hasMore, loadMore } = useFeed({
  communityAddresses: [communityAddress],
  sortType: "topAll",
});
const community = useCommunity({ communityAddress });
const stateString = useFeedStateString([communityAddress]);
const errorString = useMemo(() => {
  if (community?.state === "failed") {
    let errorString = "Failed fetching community";
    if (community.error) {
      errorString += `: ${community.error.toString().slice(0, 300)}`;
    }
    return errorString;
  }
}, [community?.state]);

if (stateString) {
  console.log(stateString);
}
if (errorString) {
  console.log(errorString);
}
```

#### Get feed with multiple subs with state string

```js
const communityAddresses = ["memes.eth", "12D3KooW...", "12D3KooW..."];
const { feed, hasMore, loadMore } = useFeed({ communityAddresses, sortType: "topAll" });
const { communities } = useCommunities({ communityAddresses });
const stateString = useFeedStateString(communityAddresses);

const errorString = useMemo(() => {
  // only show error string if all communities updating state are failed
  for (const community of communities) {
    if (community.updatingState !== "failed") {
      return;
    }
  }
  // only show the first error found because not possible to show all of them
  for (const community of communities) {
    if (community.error) {
      return `Failed fetching community: ${community.error.toString().slice(0, 300)}`;
    }
  }
}, [communities]);

if (stateString) {
  console.log(stateString);
}
if (errorString) {
  console.log(errorString);
}
```

#### Get a comment clients states

```js
const comment = useComment({ commentCid });

// fetching from gateways
for (const ipfsGatewayUrl in comment.clients.ipfsGateways) {
  const ipfsGateway = comment.clients.ipfsGateways[ipfsGatewayUrl];
  if (ipfsGateway.state === "fetching-ipfs") {
    console.log(`Fetching IPFS from ${ipfsGatewayUrl}`);
  }
  if (ipfsGateway.state === "fetching-ipns-update") {
    console.log(`Fetching IPNS from ${ipfsGatewayUrl}`);
  }
  if (ipfsGateway.state === "succeeded") {
    console.log(`Fetched comment from ${ipfsGatewayUrl}`);
  }
}

// fetching from ipfs clients
for (const ipfsClientUrl in comment.clients.ipfsClients) {
  const ipfsClient = comment.clients.ipfsClients[ipfsClientUrl];
  if (ipfsClient.state === "fetching-ipfs") {
    console.log(`Fetching IPFS from ${ipfsClient.peers.length} peers`);
  }
  if (ipfsClient.state === "fetching-ipns-update") {
    console.log(`Fetching IPNS from ${ipfsClient.peers.length} peers`);
  }
  if (ipfsClient.state === "succeeded") {
    console.log(`Fetched comment from ${ipfsClient.peers.length} peers`);
  }
}
```

#### Get a community clients states

```js
const community = useCommunity({ communityAddress });

// resolving community address from chain providers
for (const chainProviderUrl in community.clients.chainProviders) {
  const chainProvider = community.clients.chainProviders[chainProviderUrl];
  if (chainProvider.state === "resolving-address") {
    console.log(`Resolving community address from ${chainProviderUrl}`);
  }
}

// fetching from gateways
for (const ipfsGatewayUrl in community.clients.ipfsGateways) {
  const ipfsGateway = community.clients.ipfsGateways[ipfsGatewayUrl];
  if (ipfsGateway.state === "fetching-ipns") {
    console.log(`Fetching IPNS from ${ipfsGatewayUrl}`);
  }
  if (ipfsGateway.state === "fetching-page-ipfs") {
    console.log(`Fetching page IPFS from ${ipfsGatewayUrl}`);
  }
  if (ipfsGateway.state === "succeeded") {
    console.log(`Fetched community from ${ipfsGatewayUrl}`);
  }
}

// fetching from ipfs clients
for (const ipfsClientUrl in community.clients.ipfsClients) {
  const ipfsClient = community.clients.ipfsClients[ipfsClientUrl];
  if (ipfsClient.state === "fetching-ipns") {
    console.log(`Fetching IPNS from ${ipfsClient.peers.length} peers`);
  }
  if (ipfsClient.state === "fetching-ipfs") {
    console.log(`Fetching IPFS from ${ipfsClient.peers.length} peers`);
  }
  if (ipfsClient.state === "fetching-page-ipfs") {
    console.log(`Fetching page IPFS from ${ipfsClient.peers.length} peers`);
  }
  if (ipfsClient.state === "succeeded") {
    console.log(`Fetched community from ${ipfsClient.peers.length} peers`);
  }
}
```

#### Publish a comment with clients states

```js
const publishCommentOptions = {
  content: "hello",
  title: "hello",
  communityAddress: "12D3KooW...",
  onChallenge,
  onChallengeVerification,
  onError,
};

const { clients, publishComment } = usePublishComment(publishCommentOptions);

// start publishing
await publishComment();

// resolving community address from chain providers
for (const chainProviderUrl in clients.chainProviders) {
  const chainProvider = clients.chainProviders[chainProviderUrl];
  if (chainProvider.state === "resolving-address") {
    console.log(`Resolving community address from ${chainProviderUrl}`);
  }
}

// fetching from gateways
for (const ipfsGatewayUrl in clients.ipfsGateways) {
  const ipfsGateway = clients.ipfsGateways[ipfsGatewayUrl];
  if (ipfsGateway.state === "fetching-community-ipns") {
    console.log(`Fetching community IPNS from ${ipfsGatewayUrl}`);
  }
}

// publishing from pubsub client
for (const pubsubClientUrl in clients.pubsubClients) {
  const pubsubClient = clients.pubsubClients[pubsubClientUrl];
  if (pubsubClient.state === "publishing-challenge-request") {
    console.log(`Publishing challenge request using ${pubsubClientUrl}`);
  }
  if (pubsubClient.state === "waiting-challenge") {
    console.log(`Waiting for challenge from ${pubsubClientUrl}`);
  }
  if (pubsubClient.state === "publishing-challenge-answer") {
    console.log(`Publishing challenge answer using ${pubsubClientUrl}`);
  }
  if (pubsubClient.state === "waiting-challenge-verification") {
    console.log(`Waiting for challenge verification from ${pubsubClientUrl}`);
  }
  if (pubsubClient.state === "succeeded") {
    console.log(`Published comment using ${pubsubClientUrl}`);
  }
}

// fetching and publishing from ipfs client
for (const ipfsClientUrl in clients.ipfsClients) {
  const ipfsClient = clients.ipfsClients[ipfsClientUrl];
  if (ipfsClient.state === "fetching-community-ipns") {
    console.log(`Fetching community IPNS from ${ipfsClient.peers.length} peers`);
  }
  if (ipfsClient.state === "fetching-community-ipfs") {
    console.log(`Fetching community IPFS from ${ipfsClient.peers.length} peers`);
  }
  if (ipfsClient.state === "publishing-challenge-request") {
    console.log(`Publishing challenge request to ${ipfsClient.peers.length} peers`);
  }
  if (ipfsClient.state === "waiting-challenge") {
    console.log(`Waiting for challenge from ${ipfsClient.peers.length} peers`);
  }
  if (ipfsClient.state === "publishing-challenge-answer") {
    console.log(`Publishing challenge answer to ${ipfsClient.peers.length} peers`);
  }
  if (ipfsClient.state === "waiting-challenge-verification") {
    console.log(`Waiting for challenge verification from ${ipfsClient.peers.length} peers`);
  }
  if (ipfsClient.state === "succeeded") {
    console.log(`Published comment to ${ipfsClient.peers.length} peers`);
  }
}
```

#### Get IPFS and other clients stats

```js
const { ipfsGateways, ipfsClients, pubsubClients, chainProviders } = useClientsStats();

for (const ipfsGatewayUrl in ipfsGateways) {
  const ipfsGateway = ipfsGateways[ipfsGatewayUrl];
  console.log("IPFS gateway URL:", ipfsGatewayUrl);

  console.log("Total downloaded:", ipfsGateway.totalIn);
  console.log("Total uploaded:", ipfsGateway.totalOut);
  console.log("Session downloaded:", ipfsGateway.sessionTotalIn);
  console.log("Session uploaded:", ipfsGateway.sessionTotalOut);

  console.log("Succeeded IPFS:", ipfsGateway.succeededIpfsCount);
  console.log("Failed IPFS:", ipfsGateway.failedIpfsCount);
  console.log("Succeeded IPFS averate time:", ipfsGateway.succeededIpfsAverageTime);
  console.log("Succeeded IPFS median time:", ipfsGateway.succeededIpfsMedianTime);

  console.log("Session succeeded IPFS:", ipfsGateway.sessionSucceededIpfsCount);
  console.log("Session failed IPFS:", ipfsGateway.sessionFailedIpfsCount);
  console.log("Session succeeded IPFS averate time:", ipfsGateway.sessionSucceededIpfsAverageTime);
  console.log("Session succeeded IPFS median time:", ipfsGateway.sessionSucceededIpfsMedianTime);

  console.log("Succeeded IPNS:", ipfsGateway.succeededIpnsCount);
  console.log("Failed IPNS:", ipfsGateway.failedIpnsCount);
  console.log("Succeeded IPNS averate time:", ipfsGateway.succeededIpnsAverageTime);
  console.log("Succeeded IPNS median time:", ipfsGateway.succeededIpnsMedianTime);

  console.log("Session succeeded IPNS:", ipfsGateway.sessionSucceededIpnsCount);
  console.log("Session failed IPNS:", ipfsGateway.sessionFailedIpnsCount);
  console.log("Session succeeded IPNS averate time:", ipfsGateway.sessionSucceededIpnsAverageTime);
  console.log("Session succeeded IPNS median time:", ipfsGateway.sessionSucceededIpnsMedianTime);

  for (const communityAddress in ipfsGateway.communities) {
    const community = ipfsGateway.communities[communityAddress];
    console.log("Community:", communityAddress);

    console.log("Succeeded community updates:", community.succeededCommunityUpdateCount);
    console.log("Failed community updates:", community.failedCommunityUpdateCount);
    console.log(
      "Succeeded community updates average time:",
      community.succeededCommunityUpdateAverageTime,
    );
    console.log(
      "Succeeded community updates median time:",
      community.succeededCommunityUpdateMedianTime,
    );

    console.log(
      "Session succeeded community updates:",
      community.sessionSucceededCommunityUpdateCount,
    );
    console.log("Session failed community updates:", community.sessionFailedCommunityUpdateCount);
    console.log(
      "Session succeeded community updates average time:",
      community.sessionSucceededCommunityUpdateAverageTime,
    );
    console.log(
      "Session succeeded community updates median time:",
      community.sessionSucceededCommunityUpdateMedianTime,
    );

    console.log("Succeeded community pages:", community.succeededCommunityPageCount);
    console.log("Failed community pages:", community.failedCommunityPageCount);
    console.log(
      "Succeeded community pages average time:",
      community.succeededCommunityPageAverageTime,
    );
    console.log(
      "Succeeded community pages median time:",
      community.succeededCommunityPageMedianTime,
    );

    console.log("Session succeeded community pages:", community.sessionSucceededCommunityPageCount);
    console.log("Session failed community pages:", community.sessionFailedCommunityPageCount);
    console.log(
      "Session succeeded community pages average time:",
      community.sessionSucceededCommunityPageAverageTime,
    );
    console.log(
      "Session succeeded community pages median time:",
      community.sessionSucceededCommunityPageMedianTime,
    );

    console.log("Succeeded comments:", community.succeededCommentCount);
    console.log("Failed comments:", community.failedCommentCount);
    console.log("Succeeded comments average time:", community.succeededCommentAverageTime);
    console.log("Succeeded comments median time:", community.succeededCommentMedianTime);

    console.log("Session succeeded comments:", community.sessionSucceededCommentCount);
    console.log("Session failed comments:", community.sessionFailedCommentCount);
    console.log(
      "Session succeeded comments average time:",
      community.sessionSucceededCommentAverageTime,
    );
    console.log(
      "Session succeeded comments median time:",
      community.sessionSucceededCommentMedianTime,
    );

    console.log("Succeeded comment updates:", community.succeededCommentUpdateCount);
    console.log("Failed comment updates:", community.failedCommentUpdateCount);
    console.log(
      "Succeeded comment updates average time:",
      community.succeededCommentUpdateAverageTime,
    );
    console.log(
      "Succeeded comment updates median time:",
      community.succeededCommentUpdateMedianTime,
    );

    console.log("Session succeeded comment updates:", community.sessionSucceededCommentUpdateCount);
    console.log("Session failed comment updates:", community.sessionFailedCommentUpdateCount);
    console.log(
      "Session succeeded comment updates average time:",
      community.sessionSucceededCommentUpdateAverageTime,
    );
    console.log(
      "Session succeeded comment updates median time:",
      community.sessionSucceededCommentUpdateMedianTime,
    );
  }
}

for (const ipfsClientUrl in ipfsClients) {
  const ipfsClient = ipfsClients[ipfsClientUrl];
  console.log("IPFS Client URL:", ipfsClientUrl);
  console.log("Connected peers:", ipfsClient.peers.length); // IPFS peers https://docs.ipfs.tech/reference/kubo/rpc/#api-v0-swarm-peers

  console.log("Total downloaded:", ipfsClient.totalIn); // IPFS stats https://docs.ipfs.tech/reference/kubo/rpc/#api-v0-stats-bw
  console.log("Total uploaded:", ipfsClient.totalOut);
  console.log("Download rate:", ipfsClient.rateIn);
  console.log("Upload rate:", ipfsClient.rateOut);

  console.log("Session downloaded:", ipfsClient.sessionTotalIn);
  console.log("Session uploaded:", ipfsClient.sessionTotalOut);
  console.log("Session download rate:", ipfsClient.sessionRateIn);
  console.log("Session upload rate:", ipfsClient.sessionRateOut);

  console.log("Succeeded IPFS:", ipfsClient.succeededIpfsCount);
  console.log("Failed IPFS:", ipfsClient.failedIpfsCount);
  console.log("Succeeded IPFS averate time:", ipfsClient.succeededIpfsAverageTime);
  console.log("Succeeded IPFS median time:", ipfsClient.succeededIpfsMedianTime);

  console.log("Session succeeded IPFS:", ipfsClient.sessionSucceededIpfsCount);
  console.log("Session failed IPFS:", ipfsClient.sessionFailedIpfsCount);
  console.log("Session succeeded IPFS averate time:", ipfsClient.sessionSucceededIpfsAverageTime);
  console.log("Session succeeded IPFS median time:", ipfsClient.sessionSucceededIpfsMedianTime);

  console.log("Succeeded IPNS:", ipfsClient.succeededIpnsCount);
  console.log("Failed IPNS:", ipfsClient.failedIpnsCount);
  console.log("Succeeded IPNS averate time:", ipfsClient.succeededIpnsAverageTime);
  console.log("Succeeded IPNS median time:", ipfsClient.succeededIpnsMedianTime);

  console.log("Session succeeded IPNS:", ipfsClient.sessionSucceededIpnsCount);
  console.log("Session failed IPNS:", ipfsClient.sessionFailedIpnsCount);
  console.log("Session succeeded IPNS averate time:", ipfsClient.sessionSucceededIpnsAverageTime);
  console.log("Session succeeded IPNS median time:", ipfsClient.sessionSucceededIpnsMedianTime);

  for (const communityAddress in ipfsClient.communities) {
    const community = ipfsClient.communities[communityAddress];
    console.log("Community:", communityAddress);

    console.log("Succeeded community updates:", community.succeededCommunityUpdateCount);
    console.log("Failed community updates:", community.failedCommunityUpdateCount);
    console.log(
      "Succeeded community updates average time:",
      community.succeededCommunityUpdateAverageTime,
    );
    console.log(
      "Succeeded community updates median time:",
      community.succeededCommunityUpdateMedianTime,
    );

    console.log(
      "Session succeeded community updates:",
      community.sessionSucceededCommunityUpdateCount,
    );
    console.log("Session failed community updates:", community.sessionFailedCommunityUpdateCount);
    console.log(
      "Session succeeded community updates average time:",
      community.sessionSucceededCommunityUpdateAverageTime,
    );
    console.log(
      "Session succeeded community updates median time:",
      community.sessionSucceededCommunityUpdateMedianTime,
    );

    console.log("Succeeded community pages:", community.succeededCommunityPageCount);
    console.log("Failed community pages:", community.failedCommunityPageCount);
    console.log(
      "Succeeded community pages average time:",
      community.succeededCommunityPageAverageTime,
    );
    console.log(
      "Succeeded community pages median time:",
      community.succeededCommunityPageMedianTime,
    );

    console.log("Session succeeded community pages:", community.sessionSucceededCommunityPageCount);
    console.log("Session failed community pages:", community.sessionFailedCommunityPageCount);
    console.log(
      "Session succeeded community pages average time:",
      community.sessionSucceededCommunityPageAverageTime,
    );
    console.log(
      "Session succeeded community pages median time:",
      community.sessionSucceededCommunityPageMedianTime,
    );

    console.log("Succeeded comments:", community.succeededCommentCount);
    console.log("Failed comments:", community.failedCommentCount);
    console.log("Succeeded comments average time:", community.succeededCommentAverageTime);
    console.log("Succeeded comments median time:", community.succeededCommentMedianTime);

    console.log("Session succeeded comments:", community.sessionSucceededCommentCount);
    console.log("Session failed comments:", community.sessionFailedCommentCount);
    console.log(
      "Session succeeded comments average time:",
      community.sessionSucceededCommentAverageTime,
    );
    console.log(
      "Session succeeded comments median time:",
      community.sessionSucceededCommentMedianTime,
    );

    console.log("Succeeded comment updates:", community.succeededCommentUpdateCount);
    console.log("Failed comment updates:", community.failedCommentUpdateCount);
    console.log(
      "Succeeded comment updates average time:",
      community.succeededCommentUpdateAverageTime,
    );
    console.log(
      "Succeeded comment updates median time:",
      community.succeededCommentUpdateMedianTime,
    );

    console.log("Session succeeded comment updates:", community.sessionSucceededCommentUpdateCount);
    console.log("Session failed comment updates:", community.sessionFailedCommentUpdateCount);
    console.log(
      "Session succeeded comment updates average time:",
      community.sessionSucceededCommentUpdateAverageTime,
    );
    console.log(
      "Session succeeded comment updates median time:",
      community.sessionSucceededCommentUpdateMedianTime,
    );
  }
}

for (const pubsubClientUrl in pubsubClients) {
  const pubsubClient = pubsubClients[pubsubClientUrl];
  console.log("Pubsub Client URL:", pubsubClientUrl);
  console.log("Connected peers:", pubsubClient.peers.length);

  console.log("Total downloaded:", pubsubClient.totalIn);
  console.log("Total uploaded:", pubsubClient.totalOut);
  console.log("Download rate:", pubsubClient.rateIn);
  console.log("Upload rate:", pubsubClient.rateOut);

  console.log("Session downloaded:", pubsubClient.sessionTotalIn);
  console.log("Session uploaded:", pubsubClient.sessionTotalOut);
  console.log("Session download rate:", pubsubClient.sessionRateIn);
  console.log("Session upload rate:", pubsubClient.sessionRateOut);

  console.log(
    "Succeeded challenge request messages:",
    pubsubClient.succeededChallengeRequestMessageCount,
  );
  console.log(
    "Failed challenge request messages:",
    pubsubClient.failedChallengeRequestMessageCount,
  );
  console.log(
    "Succeeded challenge request messages average time:",
    pubsubClient.succeededChallengeRequestMessageAverageTime,
  );
  console.log(
    "Succeeded challenge request messages median time:",
    pubsubClient.succeededChallengeRequestMessageMedianTime,
  );

  console.log(
    "Succeeded challenge answer messages:",
    pubsubClient.succeededChallengeAnswerMessageCount,
  );
  console.log("Failed challenge answer messages:", pubsubClient.failedChallengeAnswerMessageCount);
  console.log(
    "Succeeded challenge answer messages average time:",
    pubsubClient.succeededChallengeAnswerMessageAverageTime,
  );
  console.log(
    "Succeeded challenge answer messages median time:",
    pubsubClient.succeededChallengeAnswerMessageMedianTime,
  );

  console.log(
    "Session succeeded challenge request messages:",
    pubsubClient.sessionSucceededChallengeRequestMessageCount,
  );
  console.log(
    "Session failed challenge request messages:",
    pubsubClient.sessionFailedChallengeRequestMessageCount,
  );
  console.log(
    "Session succeeded challenge request messages average time:",
    pubsubClient.sessionSucceededChallengeRequestMessageAverageTime,
  );
  console.log(
    "Session succeeded challenge request messages median time:",
    pubsubClient.sessionSucceededChallengeRequestMessageMedianTime,
  );

  console.log(
    "Session succeeded challenge answer messages:",
    pubsubClient.sessionSucceededChallengeAnswerMessageCount,
  );
  console.log(
    "Session failed challenge answer messages:",
    pubsubClient.sessionFailedChallengeAnswerMessageCount,
  );
  console.log(
    "Session succeeded challenge answer messages average time:",
    pubsubClient.sessionSucceededChallengeAnswerMessageAverageTime,
  );
  console.log(
    "Session succeeded challenge answer messages median time:",
    pubsubClient.sessionSucceededChallengeAnswerMessageMedianTime,
  );

  for (const communityAddress in pubsubClient.communities) {
    const community = pubsubClient.communities[communityAddress];
    console.log("Community:", communityAddress);

    console.log(
      "Succeeded challenge request messages:",
      community.succeededChallengeRequestMessageCount,
    );
    console.log("Failed challenge request messages:", community.failedChallengeRequestMessageCount);
    console.log(
      "Succeeded challenge request messages average time:",
      community.succeededChallengeRequestMessageAverageTime,
    );
    console.log(
      "Succeeded challenge request messages median time:",
      community.succeededChallengeRequestMessageMedianTime,
    );

    console.log(
      "Succeeded challenge answer messages:",
      community.succeededChallengeAnswerMessageCount,
    );
    console.log("Failed challenge answer messages:", community.failedChallengeAnswerMessageCount);
    console.log(
      "Succeeded challenge answer messages average time:",
      community.succeededChallengeAnswerMessageAverageTime,
    );
    console.log(
      "Succeeded challenge answer messages median time:",
      community.succeededChallengeAnswerMessageMedianTime,
    );

    console.log(
      "Session succeeded challenge request messages:",
      community.sessionSucceededChallengeRequestMessageCount,
    );
    console.log(
      "Session failed challenge request messages:",
      community.sessionFailedChallengeRequestMessageCount,
    );
    console.log(
      "Session succeeded challenge request messages average time:",
      community.sessionSucceededChallengeRequestMessageAverageTime,
    );
    console.log(
      "Session succeeded challenge request messages median time:",
      community.sessionSucceededChallengeRequestMessageMedianTime,
    );

    console.log(
      "Session succeeded challenge answer messages:",
      community.sessionSucceededChallengeAnswerMessageCount,
    );
    console.log(
      "Session failed challenge answer messages:",
      community.sessionFailedChallengeAnswerMessageCount,
    );
    console.log(
      "Session succeeded challenge answer messages average time:",
      community.sessionSucceededChallengeAnswerMessageAverageTime,
    );
    console.log(
      "Session succeeded challenge answer messages median time:",
      community.sessionSucceededChallengeAnswerMessageMedianTime,
    );
  }
}

for (const chainProviderUrl in chainProviders) {
  const chainProvider = chainProviders[chainProviderUrl];
  console.log("Chain provider URL:", chainProviderUrl);
}
```
