import localforage from "localforage";

// import crypto from 'crypto'

// fix TextDecoder isn't defined in jsdom
// const {TextEncoder, TextDecoder} = require('util')
// global.TextEncoder = TextEncoder
// global.TextDecoder = TextDecoder

// fix TypeError: Failed to execute 'digest' on 'SubtleCrypto': 2nd argument is not instance of ArrayBuffer, Buffer, TypedArray, or DataView.
// fix TypeError: crypto.web.getRandomValues is not a function
// Object.defineProperty(global.self, 'crypto', {value: {
//   subtle: crypto.webcrypto.subtle,
//   getRandomValues: (arr) => crypto.randomBytes(arr.length)
// }})

// fix TypeError: Failed to execute 'digest' on 'SubtleCrypto': 2nd argument is not instance of ArrayBuffer, Buffer, TypedArray, or DataView.
// which is because @noble/ed25519 in getSolWalletFromPlebbitPrivateKey doesn't use the correct crypto because of the vitest/jsdom env
{
  // don't put digest in global scope
  const digest = globalThis.crypto.subtle.digest.bind(globalThis.crypto.subtle);
  globalThis.crypto.subtle.digest = async (algorithm, data) => {
    let view;
    if (data instanceof ArrayBuffer) {
      view = new DataView(data);
    } else if (ArrayBuffer.isView(data)) {
      const buf = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
      view = new DataView(buf);
    } else {
      throw new TypeError(
        `crypto.subtle.digest only accepts ArrayBuffer, TypedArray or DataView got: ${typeof data}`,
      );
    }
    return digest(algorithm, view);
  };
}

const localforageDatabases = new Map();
const getLocalforageStoreKey = (options) =>
  `${options.name}/${options.storeName || "keyvaluepairs"}`;
const cloneLocalforageValue = (value) => {
  if (value === undefined || value === null) {
    return value;
  }
  return structuredClone(value);
};

await localforage.defineDriver({
  _driver: "vitestMemoryStorageDriver",
  _support: true,
  async _initStorage(options) {
    const storeKey = getLocalforageStoreKey(options);
    if (!localforageDatabases.has(storeKey)) {
      localforageDatabases.set(storeKey, new Map());
    }
    this._dbInfo = {
      ...(this._dbInfo || {}),
      name: options.name,
      storeName: options.storeName || "keyvaluepairs",
      store: localforageDatabases.get(storeKey),
    };
  },
  async clear() {
    this._dbInfo.store.clear();
  },
  async getItem(key) {
    if (!this._dbInfo.store.has(key)) {
      return null;
    }
    return cloneLocalforageValue(this._dbInfo.store.get(key));
  },
  async iterate(iterator) {
    let iterationNumber = 1;
    for (const [key, value] of this._dbInfo.store.entries()) {
      const result = iterator(cloneLocalforageValue(value), key, iterationNumber++);
      if (result !== undefined) {
        return result;
      }
    }
    return undefined;
  },
  async key(index) {
    return Array.from(this._dbInfo.store.keys())[index] || null;
  },
  async keys() {
    return Array.from(this._dbInfo.store.keys());
  },
  async length() {
    return this._dbInfo.store.size;
  },
  async removeItem(key) {
    this._dbInfo.store.delete(key);
  },
  async setItem(key, value) {
    const storedValue = cloneLocalforageValue(value);
    this._dbInfo.store.set(key, storedValue);
    return cloneLocalforageValue(storedValue);
  },
  async dropInstance(options = {}) {
    const name = options.name;
    const storeName = options.storeName;
    if (!name) {
      localforageDatabases.clear();
      return;
    }
    if (storeName) {
      localforageDatabases.delete(getLocalforageStoreKey({ name, storeName }));
      return;
    }
    for (const storeKey of [...localforageDatabases.keys()]) {
      if (storeKey.startsWith(`${name}/`)) {
        localforageDatabases.delete(storeKey);
      }
    }
  },
});

const originalLocalforageCreateInstance = localforage.createInstance.bind(localforage);
localforage.createInstance = (options) =>
  originalLocalforageCreateInstance({
    ...options,
    driver: "vitestMemoryStorageDriver",
  });

localforage.config({ driver: "vitestMemoryStorageDriver" });
await localforage.setDriver("vitestMemoryStorageDriver");
