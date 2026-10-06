# Peptide COA site

A static site: product pages that carry each batch's lab certificates, a catalog,
and a searchable COA reports page. Hosted on Render as a static site
(publish directory: repo root, no build step).

## Editing

Everything you change lives in three labelled blocks inside `index.html`.
Search the file for `1. SITE SETTINGS` to jump to them.

1. **SITE SETTINGS**: brand name, tagline, notice text, which product the site opens on.
2. **PRODUCTS**: name, sizes and prices, volume discounts, stock.
3. **LAB REPORTS**: one entry per lab test (batch, date, lab, results, documents).

Lab documents (images or PDFs) go in the `coa/` folder.

## Before going live

- Entries marked `sample: true` are placeholders. Delete them and add the real ones.
- Remove the `<meta name="robots" content="noindex">` line near the top of `index.html`.
- "Add to cart" only updates the cart total. There is no checkout behind it yet.
