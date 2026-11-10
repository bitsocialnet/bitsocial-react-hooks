import localForage from "localforage";

// the database made active by the last rotation holds the highest generation under this key, so a
// reload finds the active database even after removeItem changed how many items each one holds
const activeGenerationKey = "__localForageLruActiveGeneration";

function createLocalForageInstance(localForageLruOptions: any): any {
  if (typeof localForageLruOptions?.size !== "number") {
    throw Error(
      `LocalForageLru.createInstance localForageLruOptions.size '${localForageLruOptions?.size}' not a number`,
    );
  }
  const localForageOptions = { ...localForageLruOptions };
  delete localForageOptions.size;
  let database1: any,
    database2: any,
    databaseSize: number,
    activeGeneration: number,
    initialized = false;

  const initializationPromize = new Promise(async (resolve) => {
    const localForage1 = localForage.createInstance({
      ...localForageOptions,
      name: localForageLruOptions.name,
    });
    const localForage2 = localForage.createInstance({
      ...localForageOptions,
      name: localForageLruOptions.name + "2",
    });
    const [localForage1Size, localForage2Size, localForage1Generation, localForage2Generation] =
      await Promise.all([
        localForage1.length(),
        localForage2.length(),
        localForage1.getItem(activeGenerationKey),
        localForage2.getItem(activeGenerationKey),
      ]);
    const generation1 = typeof localForage1Generation === "number" ? localForage1Generation : -1;
    const generation2 = typeof localForage2Generation === "number" ? localForage2Generation : -1;
    let localForage1IsActive: boolean;
    if (generation1 !== -1 || generation2 !== -1) {
      localForage1IsActive = generation1 > generation2;
    } else {
      // databases that never rotated with the generation key:
      // largest db is always active db, unless is max size, because max sized db is always inactive
      localForage1IsActive =
        (localForage1Size >= localForage2Size && localForage1Size !== localForageLruOptions.size) ||
        localForage2Size === localForageLruOptions.size;
    }
    if (localForage1IsActive) {
      database2 = localForage2;
      database1 = localForage1;
      databaseSize = localForage1Size - (generation1 !== -1 ? 1 : 0);
    } else {
      database2 = localForage1;
      database1 = localForage2;
      databaseSize = localForage2Size - (generation2 !== -1 ? 1 : 0);
    }
    activeGeneration = Math.max(generation1, generation2, 0);
    initialized = true;
    resolve(undefined);
  });

  return {
    getItem: async function (key: string) {
      await initialization();
      const [value, value2] = await Promise.all([database1.getItem(key), database2.getItem(key)]);

      let returnValue = value;
      if (returnValue !== null && returnValue !== undefined) return returnValue;
      if ((returnValue = value2) !== null && (returnValue = value2) !== undefined) {
        await updateDatabases(key, returnValue);
        return returnValue;
      }
    },
    setItem: async function (key: string, value: any) {
      await initialization();
      const databaseValue = await database1.getItem(key);
      if (databaseValue !== null && databaseValue !== undefined) {
        try {
          await database1.setItem(key, value);
        } catch (error: any) {
          console.error("localforageLru.setItem setItem error", {
            error,
            errorMessage: error?.message,
            key,
            value,
          });
          throw error;
        }
      } else {
        await updateDatabases(key, value);
      }
    },
    removeItem: async function (key: string) {
      await initialization();
      await Promise.all([database1.removeItem(key), database2.removeItem(key)]);
    },
    clear: async function () {
      await initialization();
      await Promise.all([database1.clear(), database2.clear()]);
    },
    key: async function (keyIndex: number) {
      throw Error("not implemented");
    },
    // don't use for init react state, use entries() instead
    keys: async function () {
      await initialization();
      const [keys1, keys2] = await Promise.all([database1.keys(), database2.keys()]);
      return [...new Set([...keys1, ...keys2])].filter((key) => key !== activeGenerationKey);
    },
    // useful to init a react state on load
    entries: async function () {
      await initialization();
      const [keys1, keys2] = await Promise.all([database1.keys(), database2.keys()]);
      const keys = [...new Set([...keys1, ...keys2])].filter((key) => key !== activeGenerationKey);
      const entries: any[] = [];
      const getItem = async (key: string) => {
        const [value, value2] = await Promise.all([database1.getItem(key), database2.getItem(key)]);
        if (value !== null && value !== undefined) {
          return value;
        }
        return value2;
      };
      await Promise.all(
        keys.map((key, i) =>
          getItem(key).then((value) => {
            entries[i] = [key, value];
          }),
        ),
      );
      return entries;
    },
    length: async function () {
      throw Error("not implemented");
    },
  };

  async function updateDatabases(key: string, value: any) {
    try {
      await database1.setItem(key, value);
    } catch (error: any) {
      console.error("localforageLru updateDatabases setItem error", {
        error,
        errorMessage: error?.message,
        key,
        value,
      });

      // ignore this error, don't know why it happens
      if (error?.message?.includes?.("unit storage quota has been exceeded")) {
        return;
      }
      throw error;
    }
    databaseSize++;
    if (databaseSize >= localForageLruOptions.size) {
      databaseSize = 0;
      const database1Temp = database1;
      const database2Temp = database2;
      database2 = database1Temp;
      database1 = database2Temp;
      await database1.clear();
      try {
        await database1.setItem(activeGenerationKey, ++activeGeneration);
      } catch (error: any) {
        console.error("localforageLru updateDatabases setItem active generation error", {
          error,
          errorMessage: error?.message,
        });
      }
    }
  }

  async function initialization() {
    if (initialized) {
      return;
    }
    return initializationPromize;
  }
}

export const instances: any = {};

const createInstance = (localForageLruOptions: any) => {
  if (typeof localForageLruOptions?.name !== "string") {
    throw Error(
      `LocalForageLru.createInstance localForageLruOptions.name '${localForageLruOptions?.name}' not a string`,
    );
  }
  if (instances[localForageLruOptions.name]) {
    if (localForageLruOptions.size) {
      throw Error(
        `LocalForageLru.createInstance with name '${localForageLruOptions.name}' already created, remove localForageLruOptions.size, size cannot be changed`,
      );
    }
    return instances[localForageLruOptions.name];
  }
  instances[localForageLruOptions.name] = createLocalForageInstance(localForageLruOptions);
  return instances[localForageLruOptions.name];
};

// clear an instance's databases, also when this session hasn't created the instance, e.g. the
// databases of an account that wasn't loaded
const clearInstance = async (name: string) => {
  if (instances[name]) {
    await instances[name].clear();
    return;
  }
  await Promise.all([
    localForage.createInstance({ name }).clear(),
    localForage.createInstance({ name: name + "2" }).clear(),
  ]);
};

export default { createInstance, clearInstance };
