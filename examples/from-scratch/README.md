# From-Scratch Example

Preview a Contentful content model without any source data.
The simulator auto-generates realistic mock entries from your schemas.

## Usage

```bash
# From the package root:
cms-sim --schemas=examples/from-scratch/schemas/ --open

# With multiple locales:
cms-sim --schemas=examples/from-scratch/schemas/ --locales=en,es,fr --open

# More mock entries per type:
cms-sim --schemas=examples/from-scratch/schemas/ --entries-per-type=10 --open
```

## What's in here

```
schemas/
  blogPost.js   – Blog post content type (title, slug, body, tags, etc.)
  author.js     – Author content type (name, bio, avatar, etc.)
```

## Adding your own schemas

Create a `.js` or `.json` file per content type using the Contentful field format:

```js
export default {
  id: 'myContentType',
  name: 'My Content Type',
  displayField: 'title',
  fields: [
    { id: 'title', name: 'Title', type: 'Symbol', required: true, localized: true },
    { id: 'body', name: 'Body', type: 'RichText', localized: true },
    { id: 'image', name: 'Image', type: 'Link', linkType: 'Asset' },
    // ... more fields
  ],
};
```

Supported field types: `Symbol`, `Text`, `RichText`, `Integer`, `Number`, `Boolean`, `Date`, `Link` (Asset/Entry), `Array`, `Object`, `Location`.
