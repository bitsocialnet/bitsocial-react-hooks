import { getPkcClientOptions, getPkcCommunityAddresses } from "./pkc-compat";

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
