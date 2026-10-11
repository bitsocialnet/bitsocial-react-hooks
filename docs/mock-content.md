# Mock content

Use synthetic communities and posts while developing your interface.

#### Install the node module

```sh
yarn add @bitsocial/bitsocial-react-hooks
```

If you are developing in this repo, run `corepack enable` once first so `yarn` uses the pinned Yarn 4 release.

#### Add env variable for mocking

The mock client reads these `process.env` values at import time. In setups that expose `REACT_APP_*` variables to the browser bundle, add them to your React app's `.env` file:

```sh
REACT_APP_BITSOCIAL_REACT_HOOKS_MOCK_CONTENT=1
REACT_APP_BITSOCIAL_REACT_HOOKS_MOCK_CONTENT_LOADING_TIME=1000
```

Your bundler must substitute these exact `process.env` keys. Adding a `.env` file alone is not sufficient in every React setup. Restart the development server after changing them.

#### Get a mock feed

```js
import { useFeed } from "@bitsocial/bitsocial-react-hooks";

function App() {
  const { feed, hasMore, loadMore } = useFeed({
    communities: [{ name: "news.eth" }],
    sortType: "new",
  });
  console.log({ feed });
  return <div className="App"></div>;
}
```

#### Disable caching (warning: extremely slow loading)

- Add to your .env file:

```sh
REACT_APP_BITSOCIAL_REACT_HOOKS_NO_CACHE=1
```

#### Delete databases and caches

```js
import { deleteCaches, deleteDatabases } from "@bitsocial/bitsocial-react-hooks";

// delete all databases, including all caches and accounts data
await deleteDatabases();

// delete the cached comments, cached communities and cached pages only, no accounts data
await deleteCaches();
```
