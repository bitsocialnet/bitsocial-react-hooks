import {
  getChallengeIndexes,
  getPkcClientOptions,
  getPkcCommunityAddresses,
  normalizeChallengeAnswersForPkc,
  withPublishChallengeAnswersCompat,
} from "./pkc-compat";

describe("getPkcCommunityAddresses", () => {
  test("returns the address of each pkc-js communities entry", () => {
    const communities = [
      { name: "named.bso", publicKey: "12D3KooWNamed", address: "named.bso", started: true },
      { publicKey: "12D3KooWUnnamed", address: "12D3KooWUnnamed", started: false },
    ];
    expect(getPkcCommunityAddresses({ communities })).toEqual(["named.bso", "12D3KooWUnnamed"]);
  });

  test("keeps address strings listed by older pkc-js", () => {
    expect(getPkcCommunityAddresses({ communities: ["a.bso", "12D3KooWKey"] })).toEqual([
      "a.bso",
      "12D3KooWKey",
    ]);
  });

  test("skips malformed entries and treats a missing list as empty", () => {
    expect(getPkcCommunityAddresses({ communities: [null, {}, { address: 1 }, "a.bso"] })).toEqual([
      "a.bso",
    ]);
    expect(getPkcCommunityAddresses({})).toEqual([]);
    expect(getPkcCommunityAddresses(undefined)).toEqual([]);
  });
});

describe("getPkcClientOptions", () => {
  test("adds a bso resolver for each configured eth provider", async () => {
    const options = await getPkcClientOptions(
      {
        chainProviders: { eth: { urls: ["https://eth.example", "viem", "ethers.js"], chainId: 1 } },
      },
      { dataPath: "/data", resolveAuthorAddresses: true },
    );
    expect(options.nameResolvers.map((resolver: any) => [resolver.key, resolver.provider])).toEqual(
      [
        ["eth-eth.example", "https://eth.example"],
        ["eth-viem", "viem"],
      ],
    );
    expect(options.resolveAuthorNames).toBe(true);
    expect(options.resolveAuthorAddresses).toBeUndefined();
  });

  test("leaves name resolvers unset when no provider is configured", async () => {
    const options = await getPkcClientOptions({}, { dataPath: "/data" });
    expect(options).toEqual({ dataPath: "/data" });
  });

  test("passes through missing options", async () => {
    expect(await getPkcClientOptions({}, undefined)).toBeUndefined();
  });
});

describe("withPublishChallengeAnswersCompat", () => {
  // a CHALLENGE only carries the challenges still pending, keyed by challenge index
  const sparseChallenge = {
    type: "CHALLENGE",
    challenges: {
      "3": { challenge: "3+3=?", type: "text/plain" },
      "1": { challenge: "1+1=?", type: "text/plain" },
    },
  };
  const createPublication = () => {
    const publishChallengeAnswers = vi.fn(async (_options: any) => ({ success: true }));
    const publication: any = { publishChallengeAnswers };
    return { publication, publishChallengeAnswers };
  };

  test("passes a record keyed by challenge index to pkc-js", async () => {
    const { publication, publishChallengeAnswers } = createPublication();
    withPublishChallengeAnswersCompat(publication, sparseChallenge);
    await publication.publishChallengeAnswers({ "1": "2", "3": "6" });
    expect(publishChallengeAnswers).toHaveBeenCalledWith({
      challengeAnswers: { "1": "2", "3": "6" },
    });
  });

  test("accepts the record wrapped as { challengeAnswers }", async () => {
    const { publication, publishChallengeAnswers } = createPublication();
    withPublishChallengeAnswersCompat(publication, sparseChallenge);
    await publication.publishChallengeAnswers({ challengeAnswers: { "3": "6" } });
    expect(publishChallengeAnswers).toHaveBeenCalledWith({ challengeAnswers: { "3": "6" } });
  });

  test("maps a deprecated array onto the ascending keys of the CHALLENGE", async () => {
    const { publication, publishChallengeAnswers } = createPublication();
    withPublishChallengeAnswersCompat(publication, sparseChallenge);
    await publication.publishChallengeAnswers(["2", "6"]);
    expect(publishChallengeAnswers).toHaveBeenLastCalledWith({
      challengeAnswers: { "1": "2", "3": "6" },
    });

    // wrapped arrays too; a shorter array leaves the remaining keys unanswered
    await publication.publishChallengeAnswers({ challengeAnswers: [""] });
    expect(publishChallengeAnswers).toHaveBeenLastCalledWith({ challengeAnswers: { "1": "" } });
  });

  test("maps a deprecated array onto the keys of the latest CHALLENGE, wrapping once", async () => {
    const { publication, publishChallengeAnswers } = createPublication();
    withPublishChallengeAnswersCompat(publication, sparseChallenge);
    const wrapped = publication.publishChallengeAnswers;
    withPublishChallengeAnswersCompat(publication, {
      type: "CHALLENGE",
      challenges: { "2": { challenge: "2+2=?", type: "text/plain" } },
    });
    expect(publication.publishChallengeAnswers).toBe(wrapped);

    await publication.publishChallengeAnswers(["4", "ignored"]);
    expect(publishChallengeAnswers).toHaveBeenCalledTimes(1);
    expect(publishChallengeAnswers).toHaveBeenCalledWith({ challengeAnswers: { "2": "4" } });
  });

  test.each([
    ["undefined", undefined],
    ["null", null],
    ["an empty array", []],
    ["an empty record", {}],
    ["an empty wrapped array", { challengeAnswers: [] }],
    ["an empty wrapped record", { challengeAnswers: {} }],
    ["a wrapped undefined", { challengeAnswers: undefined }],
  ])("rejects %s instead of publishing it", async (_name, challengeAnswers) => {
    const { publication, publishChallengeAnswers } = createPublication();
    withPublishChallengeAnswersCompat(publication, sparseChallenge);
    await expect(publication.publishChallengeAnswers(challengeAnswers)).rejects.toThrow(
      /non-empty record of answers keyed by challenge index/,
    );
    expect(publishChallengeAnswers).not.toHaveBeenCalled();
  });

  test("rejects a deprecated array when no challenge index is known", () => {
    expect(() => normalizeChallengeAnswersForPkc(["4"])).toThrow(
      /can't map an array of answers before a challenge message is received/,
    );
  });

  test("reads the challenge indexes of a CHALLENGE in ascending numeric order", () => {
    expect(getChallengeIndexes({ challenges: { "10": {}, "2": {}, "0": {} } })).toEqual([
      "0",
      "2",
      "10",
    ]);
    expect(getChallengeIndexes(undefined)).toEqual([]);
  });
});
