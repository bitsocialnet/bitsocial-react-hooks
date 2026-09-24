import { getPkcClientOptions } from "./pkc-compat";

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
