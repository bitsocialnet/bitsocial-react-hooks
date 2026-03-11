---
name: context7
description: Retrieve up-to-date documentation for software libraries, frameworks, and components via the Context7 API. This skill should be used when looking up documentation for any programming library or framework, finding code examples for specific APIs or features, verifying correct usage of library functions, or obtaining current information about library APIs that may have changed since training.
---

# Context7

## Overview

This skill enables retrieval of current documentation for software libraries and components by querying the Context7 API via curl. Use it instead of relying on potentially outdated training data.

## Workflow

### Step 1: Search for the Library

To find the Context7 library ID, query the search endpoint:

```bash
curl -s "https://context7.com/api/v2/libs/search?libraryName=LIBRARY_NAME&query=TOPIC" | jq '.results[0]'
```

**Parameters:**
- `libraryName` (required): The library name to search for (e.g., "react", "zustand", "vitest", "ethers")
- `query` (required): A description of the topic for relevance ranking

**Response fields:**
- `id`: Library identifier for the context endpoint
- `title`: Human-readable library name
- `description`: Brief description of the library
- `totalSnippets`: Number of documentation snippets available

### Step 2: Fetch Documentation

To retrieve documentation, use the library ID from step 1:

```bash
curl -s "https://context7.com/api/v2/context?libraryId=LIBRARY_ID&query=TOPIC&type=txt"
```

**Parameters:**
- `libraryId` (required): The library ID from search results
- `query` (required): The specific topic to retrieve documentation for
- `type` (optional): Response format - `json` (default) or `txt` (plain text, more readable)

## Examples

### Zustand store documentation

```bash
curl -s "https://context7.com/api/v2/libs/search?libraryName=zustand&query=store" | jq '.results[0].id'
curl -s "https://context7.com/api/v2/context?libraryId=/pmndrs/zustand&query=create+store&type=txt"
```

### Vitest testing

```bash
curl -s "https://context7.com/api/v2/libs/search?libraryName=vitest&query=testing" | jq '.results[0].id'
curl -s "https://context7.com/api/v2/context?libraryId=/vitest-dev/vitest&query=mock+functions&type=txt"
```

## Tips

- Use `type=txt` for more readable output
- Use `jq` to filter and format JSON responses
- Be specific with the `query` parameter to improve relevance ranking
- URL-encode query parameters containing spaces (use `+` or `%20`)
- No API key is required for basic usage (rate-limited)
