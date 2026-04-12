# CMS Migration Guides

Step-by-step guides for migrating content from popular CMSs to Contentful using `content-model-simulator`.

## Available Guides

| Source CMS | Guide | Status |
|------------|-------|--------|
| WordPress | [`examples/wordpress/`](../wordpress/) | **Working** — full end-to-end example with real Gutenberg XML |
| Sanity | [sanity/](./sanity/) | Stub — next up |

## How to use these guides

Each guide covers:

1. **Export** — How to get your data out of the source CMS
2. **Schema mapping** — How source content types map to Contentful field types
3. **Transform** — Custom transformer example for the source CMS format
4. **Simulate** — CLI command to preview the migration locally
5. **Edge cases** — Rich text, references, assets, localization

## Contributing a guide

Create a directory under `migration-guides/` with:

```
my-cms/
  README.md           – Full guide
  schemas/            – Example Contentful schemas for common source types
  transforms/         – Custom transformer module(s)
  sample-data/        – Small sample export from the source CMS
```

Each transformer should export a `register(registry)` function:

```js
export function register(registry) {
  registry.add('sourceType', (doc, schema, helpers) => {
    return { /* mapped fields */ };
  });
}
```
