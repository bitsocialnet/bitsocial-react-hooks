const pkcMock = vi.hoisted(() => {
  const pkc: any = vi.fn(async () => ({}));
  pkc.getShortAddress = vi.fn(({ name }: { name?: string }) => `short:${name}`);
  return { pkc };
});

vi.mock("@pkcprotocol/pkc-js", () => ({ default: pkcMock.pkc }));

const mockContent = vi.hoisted(() => ({ imports: 0 }));
vi.mock("./pkc-js-mock-content", async (importOriginal) => {
  mockContent.imports++;
  return importOriginal();
});

import PkcJs, { restorePkcJs } from "./index";

describe("pkc-js adapter", () => {
  beforeEach(() => {
    pkcMock.pkc.mockClear();
    pkcMock.pkc.getShortAddress.mockClear();
    restorePkcJs();
  });

  test("normalizes address params for pkc-js getShortAddress", async () => {
    const address = "12D3KooWMZPQsQdYtrakc4D1XtzGXwN1X3DBnAobcCjcPYYXTB6o";

    await PkcJs.PKC();

    expect(PkcJs.PKC.getShortAddress({ address })).toBe(`short:${address}`);
    expect(pkcMock.pkc.getShortAddress).toHaveBeenCalledWith({ address, name: address });
  });

  test("keeps name params compatible with existing address callers", async () => {
    const name = "12D3KooWS3z6sH3Q7NU2FWU5KL9t1XXSmfnE15BE7vjuFXSvQYSZ";

    await PkcJs.PKC();

    expect(PkcJs.PKC.getShortAddress({ name })).toBe(`short:${name}`);
    expect(pkcMock.pkc.getShortAddress).toHaveBeenCalledWith({ address: name, name });
  });

  test("does not import the mock content without its env var", async () => {
    await PkcJs.PKC();

    expect(mockContent.imports).toBe(0);
  });

  test("imports the mock content on first use when its env var is set", async () => {
    const address = "12D3KooWMZPQsQdYtrakc4D1XtzGXwN1X3DBnAobcCjcPYYXTB6o";
    process.env.REACT_APP_BITSOCIAL_REACT_HOOKS_MOCK_CONTENT = "1";
    vi.resetModules();
    try {
      const { default: protocolClient } = await import("./index");
      expect(mockContent.imports).toBe(0);
      // Until it has loaded, short addresses use the fallback.
      expect(protocolClient.PKC.getShortAddress({ address })).toBe(address.substring(2, 14));

      const pkc = await protocolClient.PKC();

      expect(mockContent.imports).toBe(1);
      expect(pkcMock.pkc).not.toHaveBeenCalled();
      expect(typeof pkc.createComment).toBe("function");
      expect(protocolClient.PKC.getShortAddress({ address })).toBe(address.substring(0, 12));
    } finally {
      delete process.env.REACT_APP_BITSOCIAL_REACT_HOOKS_MOCK_CONTENT;
      vi.resetModules();
    }
  });
});
