# Exa Search API Reference

> Source: https://exa.ai/docs/llms.txt — self-contained reference for coding agents.
> Full docs index: https://exa.ai/docs/llms.txt

**Endpoint:** `POST https://api.exa.ai/search`  
**Auth:** `x-api-key` header. Keys at https://dashboard.exa.ai/api-keys

## Install

```bash
pip install exa-py    # Python
npm install exa-js    # JavaScript
```

## Minimal Example

```bash
curl -X POST "https://api.exa.ai/search" \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -d '{"query": "latest LLM developments", "contents": {"highlights": {"maxCharacters": 4000}}}'
```

```python
from exa_py import Exa
exa = Exa(api_key="YOUR_API_KEY")
result = exa.search("latest LLM developments", contents={"highlights": {"max_characters": 4000}})
```

```javascript
import Exa from "exa-js";
const exa = new Exa("YOUR_API_KEY");
const result = await exa.search("latest LLM developments", {
  contents: { highlights: { maxCharacters: 4000 } },
});
```

## Request Parameters

| Parameter            | Type      | Default        | Description                                                                                              |
| -------------------- | --------- | -------------- | -------------------------------------------------------------------------------------------------------- |
| `query`              | string    | **(required)** | Natural language query. Supports long, semantically rich descriptions.                                   |
| `type`               | string    | `"auto"`       | `auto`, `fast`, `instant`, `deep-lite`, `deep`, `deep-reasoning`                                        |
| `stream`             | boolean   | `false`        | `true` returns `text/event-stream` with OpenAI-compatible chunks.                                       |
| `numResults`         | integer   | `10`           | 1–100                                                                                                    |
| `category`           | string    | —              | `company`, `people`, `research paper`, `news`, `personal site`, `financial report`                       |
| `userLocation`       | string    | —              | ISO country code e.g. `"US"`                                                                             |
| `includeDomains`     | string[]  | —              | Only return results from these domains. Max 1200.                                                        |
| `excludeDomains`     | string[]  | —              | Exclude these domains. Max 1200.                                                                         |
| `startPublishedDate` | string    | —              | ISO 8601. Only results published after this date.                                                        |
| `endPublishedDate`   | string    | —              | ISO 8601. Only results published before this date.                                                       |
| `startCrawlDate`     | string    | —              | ISO 8601. Only results crawled after this date.                                                          |
| `endCrawlDate`       | string    | —              | ISO 8601. Only results crawled before this date.                                                         |
| `moderation`         | boolean   | `false`        | Filter unsafe content.                                                                                   |
| `additionalQueries`  | string[]  | —              | Extra query variations for deep-search variants.                                                         |
| `systemPrompt`       | string    | —              | Instructions guiding synthesized output and search planning.                                             |
| `outputSchema`       | object    | —              | JSON schema for synthesized `output.content`. Response includes `output` when provided.                  |

### Contents Parameters (nested under `contents`)

| Parameter                    | Type              | Default | Description                                                                                                                    |
| ---------------------------- | ----------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `contents.text`              | boolean or object | —       | Full page text as markdown. Object: `{maxCharacters, includeHtmlTags, verbosity, includeSections, excludeSections}`            |
| `contents.highlights`        | boolean or object | —       | Key excerpts relevant to query. Object: `{maxCharacters, query}`                                                               |
| `contents.summary`           | boolean or object | —       | LLM-generated summary. Object: `{query, schema}`                                                                               |
| `contents.livecrawlTimeout`  | integer           | `10000` | Timeout for livecrawl in ms.                                                                                                   |
| `contents.maxAgeHours`       | integer           | —       | `0` = always livecrawl. `-1` = never livecrawl. Omit for default (livecrawl as fallback).                                     |
| `contents.subpages`          | integer           | `0`     | Subpages to crawl per result.                                                                                                  |
| `contents.subpageTarget`     | string or string[]| —       | Keywords to prioritize when selecting subpages.                                                                                |
| `contents.extras.links`      | integer           | `0`     | URLs to extract from each page.                                                                                                |
| `contents.extras.imageLinks` | integer           | `0`     | Image URLs to extract from each page.                                                                                          |

### Text Object Options

| Parameter         | Type      | Default     | Description                                                                                                   |
| ----------------- | --------- | ----------- | ------------------------------------------------------------------------------------------------------------- |
| `maxCharacters`   | integer   | —           | Character limit.                                                                                              |
| `includeHtmlTags` | boolean   | `false`     | Preserve HTML tags.                                                                                           |
| `verbosity`       | string    | `"compact"` | `compact`, `standard`, or `full`. Use `maxAgeHours: 0` for fresh content.                                    |
| `includeSections` | string[]  | —           | `header`, `navigation`, `banner`, `body`, `sidebar`, `footer`, `metadata`. Use `maxAgeHours: 0` for fresh.   |
| `excludeSections` | string[]  | —           | Exclude these sections. Same options as `includeSections`.                                                    |

## Search Types & Latency

| `type`           | Approx latency | Notes                                                      |
| ---------------- | -------------- | ---------------------------------------------------------- |
| `instant`        | ~250 ms        | Real-time apps (chat, voice, autocomplete).                |
| `fast`           | ~450 ms        | Good relevance, optimized for speed.                       |
| `auto` (default) | ~1 second      | Router picks variant per query; balanced.                  |
| `deep-lite`      | 4 seconds      | Lightweight synthesis; cheaper than full `deep`.           |
| `deep`           | 4–15 seconds   | Multi-step planning with structured outputs.               |
| `deep-reasoning` | 12–40 seconds  | Deep search with maximum reasoning per step.               |

Latency modifiers that stack on base type:
- `outputSchema` present → adds synthesis latency
- `contents.maxAgeHours: 720` → returns cached content (faster)

**For real-time paths:** use `type: "fast"` or `"instant"`, omit `outputSchema`, omit `maxAgeHours`.

## Token Efficiency

| Mode         | Best For                                                               |
| ------------ | ---------------------------------------------------------------------- |
| `text`       | Deep analysis, full context, broad research                            |
| `highlights` | Factual questions, specific lookups, multi-step agent workflows        |
| `summary`    | Quick overviews, structured extraction, tight output size control      |

**Use `highlights` for agent/voice workflows** — most relevant excerpts at 10x fewer tokens.

```json
{
  "query": "What is the current Fed interest rate?",
  "contents": {
    "highlights": { "maxCharacters": 4000 },
    "maxAgeHours": 0
  }
}
```

## Category Filters

| Category           | Restrictions                                                                                                              |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `company`          | NO: `startPublishedDate`, `endPublishedDate`, `startCrawlDate`, `endCrawlDate`, `excludeDomains`                         |
| `people`           | NO: date filters, `excludeDomains`. `includeDomains` only accepts LinkedIn.                                               |
| `research paper`   | None                                                                                                                      |
| `news`             | None                                                                                                                      |
| `personal site`    | None                                                                                                                      |
| `financial report` | None                                                                                                                      |

## Output Schema

`outputSchema` shapes `output.content`. Works with **every** search type.

- `{"type": "text", "description": "..."}` → plain text output
- `{"type": "object", "properties": {...}, "required": [...]}` → structured JSON

Limits: max nesting depth 2, max total properties 10.  
Do NOT include citation/confidence fields — grounding data returned automatically in `output.grounding`.

## Response Schema

```json
{
  "requestId": "...",
  "searchType": "neural",
  "results": [
    {
      "title": "Page Title",
      "url": "https://example.com/page",
      "id": "https://example.com/page",
      "publishedDate": "2024-01-15T00:00:00.000Z",
      "author": "Author Name",
      "text": "Full page content as markdown...",
      "highlights": ["Key excerpt..."],
      "highlightScores": [0.46],
      "summary": "LLM-generated summary...",
      "subpages": [],
      "extras": { "links": ["https://example.com/related"] }
    }
  ],
  "output": {
    "content": "Synthesized answer or structured object",
    "grounding": [
      {
        "field": "content",
        "citations": [{ "url": "https://example.com", "title": "Source Title" }],
        "confidence": "high"
      }
    ]
  },
  "costDollars": { "total": 0.007 }
}
```

## CRITICAL: Common Mistakes (LLMs frequently get these wrong)

| Wrong                                                      | Correct                                                                              |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `useAutoprompt: true`                                      | Remove it — deprecated, does nothing                                                 |
| `includeUrls` / `excludeUrls`                              | Use `includeDomains` / `excludeDomains`                                              |
| `text: true` (top-level)                                   | `"contents": {"text": true}` — must nest under `contents`                            |
| `summary: true` (top-level)                                | `"contents": {"summary": true}` — must nest                                          |
| `highlights: {...}` (top-level)                            | `"contents": {"highlights": {...}}` — must nest                                      |
| `numSentences`                                             | Deprecated — use `maxCharacters`                                                     |
| `highlightsPerUrl`                                         | Deprecated — use `maxCharacters`                                                     |
| `tokensNum`                                                | Does not exist — use `contents.text.maxCharacters`                                   |
| `livecrawl: "always"`                                      | Deprecated — use `contents.maxAgeHours: 0`                                           |
| `excludeDomains` with `company` or `people` category       | Remove it — returns 400 error                                                        |

**SDK case rules:**
- Python SDK uses **snake_case** everywhere including dict keys: `num_results`, `max_characters`, `output_schema`, `contents={"highlights": {"max_characters": 4000}}`
- JavaScript SDK and cURL use **camelCase**: `numResults`, `maxCharacters`, `outputSchema`, `contents: { highlights: { maxCharacters: 4000 } }`

## Complete Examples

### Agent/voice workflow (highlights, fast)
```json
{
  "query": "recent breakthroughs in quantum computing",
  "type": "fast",
  "numResults": 5,
  "contents": {
    "highlights": { "maxCharacters": 4000 }
  }
}
```

### News with domain filter
```json
{
  "query": "AI regulation policy updates",
  "type": "auto",
  "category": "news",
  "numResults": 10,
  "includeDomains": ["reuters.com", "nytimes.com", "bbc.com"],
  "startPublishedDate": "2025-01-01",
  "contents": {
    "highlights": { "maxCharacters": 2000 }
  }
}
```

### Deep search with structured output
```json
{
  "query": "compare the latest frontier AI model releases",
  "type": "deep",
  "systemPrompt": "Prefer official sources and avoid duplicate results",
  "outputSchema": {
    "type": "object",
    "required": ["models"],
    "properties": {
      "models": {
        "type": "array",
        "items": {
          "type": "object",
          "required": ["name", "notable_claims"],
          "properties": {
            "name": { "type": "string" },
            "notable_claims": { "type": "array", "items": { "type": "string" } }
          }
        }
      }
    }
  }
}
```

### Company research
```json
{
  "query": "agtech companies in the US that have raised series A",
  "type": "auto",
  "category": "company",
  "numResults": 10,
  "contents": {
    "highlights": { "maxCharacters": 4000 }
  }
}
```
