# CONSTERA Industrial Group

Static corporate website concept prepared for GitHub Pages deployment.

## Structure

- `index.html` - main entry point
- `catalog.html` - ConstEra Enterprise v2 marketplace catalog
- `brands.html` - brand center
- `suppliers.html` - supplier center
- `rfq.html` - local RFQ draft flow
- `admin.html` - catalog/admin structure preview
- `assets/css/` - styles
- `assets/js/` - scripts
- `assets/js/catalog-data.js` - starter marketplace data
- `assets/js/marketplace.js` - catalog, RFQ and admin rendering
- `assets/images/` - content images and logo
- `assets/icons/` - favicon set and manifest

## Run locally

Open `index.html` in a browser or serve the folder with any static server.

## Deploy on Vercel

This is a static site. Vercel can run:

```bash
npm run vercel-build
```

The command validates that the required static pages and assets exist, then
copies the deployable site into `dist`.

## ConstEra Enterprise v2

The current milestone keeps the project static and dependency-free while adding
the first B2B marketplace platform layer:

- construction categories and subcategories
- supplier and brand profiles
- product cards with SKU, package, origin, status and price notes
- browser-local favorites and compare flags
- RFQ draft form
- admin structure preview for future CRUD and CSV/Excel import

Prices marked as `Sorğu əsasında` require supplier confirmation before public
use. Public catalog pages are used for product names, package sizes, technical
properties, source links and official product images. If an official page does
not publish a price, the product stays request-based until a supplier price list
is added to the admin/import flow.
