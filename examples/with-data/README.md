# Migration Example (With Data)

Simulate a CMS migration by feeding real exported data alongside your Contentful schemas.

## Usage

```bash
# From the package root:
cms-sim --schemas=examples/with-data/schemas/ --input=examples/with-data/data/sample-export.ndjson --open

# With verbose logging:
cms-sim --schemas=examples/with-data/schemas/ --input=examples/with-data/data/ --verbose --open
```

## What's in here

```
schemas/
  blogPost.js           – Target Contentful content type
  author.js             – Target Contentful content type
data/
  sample-export.ndjson  – Sample source data (5 entries, 2 locales)
```

## Data format

The input data is NDJSON (one JSON object per line):

```json
{"contentType":"blogPost","locale":"en","path":"/blog/hello","data":{"title":"Hello","slug":"hello","body":"<p>Content</p>"}}
```

Each line needs at minimum:
- `contentType` — maps to a schema ID
- `locale` — locale code
- `data` or `fields` — the field values

See the [migration guides](../migration-guides/) for CMS-specific export formats and transforms.
