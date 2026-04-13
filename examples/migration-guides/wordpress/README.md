# WordPress → Contentful Migration Guide

> **Full guide with working example:** See [`examples/wordpress/`](../../wordpress/)

The full WordPress guide includes:
- Working sample data (Gutenberg XML) with real post types
- Schemas and transforms with detailed inline comments
- Programmatic `run.js` example
- Step-by-step walkthrough from export to import (10 steps)
- Auto-scaffold option (`cms-sim scaffold`)
- Setting up Contentful and importing
- Common warnings and FAQ

---

## Quick Reference

### How the WordPress Reader Normalizes Fields

| WordPress structure | After reader normalization |
|---|---|
| `<title>My Post</title>` | `d.title` → `"My Post"` |
| `<content:encoded>` (HTML) | `d.body` → HTML string |
| `<excerpt:encoded>` | `d.excerpt` → HTML string |
| `<wp:post_name>` | `d.slug` → `"my-post"` |
| `<wp:post_date>` | `d.publishDate` → ISO date string |
| `<wp:status>` | `d.status` → `"publish"`, `"draft"`, etc. |
| `<dc:creator>` | `d.author` → author login string |
| `<category domain="category">` | `d.categories` → `["Cat1", "Cat2"]` |
| `<category domain="post_tag">` | `d.tags` → `["Tag1", "Tag2"]` |
| `<wp:post_type>attachment</wp:post_type>` | Separate document with `contentType: "attachment"` |
| Authors (`<wp:author>`) | Separate documents with `contentType: "author"` |
| Categories (`<wp:category>`) | Separate documents with `contentType: "category"` |
| Tags (`<wp:tag>`) | Separate documents with `contentType: "tag"` |

### Transform Return Shape

```js
// ✅ CORRECT — every transform must return this shape
export function register(registry) {
  // Skip internal WP types
  registry.skip(['attachment', 'page', 'nav_menu_item', 'wp_navigation']);

  registry.register('post', (doc, locale) => {
    const d = doc.data || {};
    return {
      fields: {
        title: { [locale]: d.title },
        slug:  { [locale]: d.slug },
        body:  { [locale]: d.body },   // HTML → auto-converted to Rich Text
        publishDate: { [locale]: d.publishDate },
      },
    };
  }, 'blogPost');
}
```

### Schema Mapping

| WordPress concept | Contentful `type` | Notes |
|---|---|---|
| Post title | `Symbol` | Max 256 chars |
| Post content (HTML) | `RichText` | HTML auto-converted |
| Excerpt | `Text` | Long text |
| Slug | `Symbol` | |
| Post date | `Date` | |
| Status (publish/draft) | `Symbol` | Add `validations: [{ in: ['draft','published','archived'] }]` |
| Featured image | `Link` with `linkType: 'Asset'` | |
| Author | `Link` with `linkType: 'Entry'` | Or `Symbol` for simple login string |
| Categories | `Array` of `Symbol` or `Array` of `Link` (Entry) | |
| Tags | `Array` of `Symbol` or `Array` of `Link` (Entry) | |
| Custom fields / ACF | `Symbol`, `Text`, `Object`, etc. | Depends on field type |

### Auto-Scaffold (WXR only)

```bash
# Auto-generate schemas and transforms from your XML export
npx cms-sim scaffold --input=data/your-site.xml --output=. --verbose
```

### Simulate

```bash
npx cms-sim \
  --schemas=schemas/ \
  --input=data/your-site.xml \
  --transforms=transforms/ \
  --open
```

### Edge Cases

- **Gutenberg blocks** — Rendered as HTML by WordPress; the simulator converts the HTML to Rich Text
- **Shortcodes** — Not expanded; they appear as raw `[shortcode]` text in the output
- **ACF / Custom fields** — Available in `d.meta` or `d.customFields` depending on export format
- **Multisite** — Export each site separately
- **WPML / Polylang** — Use `--locales=en,es` and map `doc.locale` in your transform
