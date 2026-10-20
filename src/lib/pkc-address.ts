import { fromString as uint8ArrayFromString } from "uint8arrays/from-string";
import { toString as uint8ArrayToString } from "uint8arrays/to-string";
import { create as createMultihash } from "multiformats/hashes/digest";

// The PKC address of an ed25519 public key is its libp2p peer id: an identity multihash of the
// protobuf-encoded key, in base58btc. Same result as pkc-js getPKCAddressFromPublicKey.
const protobufPublicKeyPrefix = new Uint8Array([8, 1, 18, 32]);
const multihashIdentityCode = 0;
export const getPkcAddressFromPublicKey = (publicKeyBase64: string) => {
  const publicKeyBuffer = uint8ArrayFromString(publicKeyBase64, "base64");
  const publicKeyBufferWithPrefix = new Uint8Array(
    protobufPublicKeyPrefix.length + publicKeyBuffer.length,
  );
  publicKeyBufferWithPrefix.set(protobufPublicKeyPrefix, 0);
  publicKeyBufferWithPrefix.set(publicKeyBuffer, protobufPublicKeyPrefix.length);
  const multihash = createMultihash(multihashIdentityCode, publicKeyBufferWithPrefix).bytes;
  return uint8ArrayToString(multihash, "base58btc");
};
