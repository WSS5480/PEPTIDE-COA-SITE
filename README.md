# Peptide COA site

A static lab-report library: every report filed by peptide name and vial size (mg),
found by picking the name and size or by searching a batch code or task number,
with the lab's document and its verification key and link.
Hosted on Render as a static site (publish directory: repo root, no build step).
Every push to `main` redeploys it.

## Editing

Everything you change lives in two labelled blocks inside `index.html`.
Search the file for `1. SITE SETTINGS` to jump to them.

1. **SITE SETTINGS**: brand name, tagline, the notice line, and the intro text under the headline.
2. **LAB REPORTS**: one entry per report, copied from the lab's document exactly as printed.

Report images go in the `coa/` folder and are referenced by file name in the report's `image` field.

## Adding a report

1. Put the report image in `coa/`.
2. Copy an existing entry in the LAB REPORTS block and change every field to match the new document:
   strength (the vial size, e.g. "20 mg"), sample, task number, key, verify link, batch,
   the three dates, tests requested, and each results row.
3. Commit. Render redeploys on its own.

A new peptide name in `product` creates its own section on the page automatically.

## Search engines

`index.html` carries `<meta name="robots" content="noindex">` near the top, so search engines
do not list the site. Delete that line when you want it to be found.
