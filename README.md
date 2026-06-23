# XRechnung Viewer

Client-side web tool to open, read and print German **XRechnung** e-invoices (EN 16931 / XRechnung 3.0). A received `.xml` invoice is parsed in the browser and shown as a clean, human-readable document. No upload — the file never leaves the browser.

**Live:** https://jenslaufer.github.io/xrechnung-viewer/

## Why

Since 2025 every German business must be able to *receive* e-invoices. Most arrive as raw XRechnung XML that ERP/email cannot display. Searchers look for "xrechnung öffnen / anzeigen / lesen". This is the free top-of-funnel tool; **Pro** (batch → PDF/ZIP, branded export, ZUGFeRD extraction) is the paid upgrade.

## Architecture

Zero build step. Static files, vanilla JS, hand-written CSS — deploys to GitHub Pages from repo root.

| File | Purpose |
|---|---|
| `index.html` | Landing + tool + SEO content (FAQ, JSON-LD) + Pro waitlist + legal |
| `parser.js` | XRechnung parser. UBL 2.1 + CII (UN/CEFACT). Namespace-prefix-agnostic, maps EN 16931 BT-* terms to a normalised invoice object. Browser `DOMParser`, no deps. |
| `app.js` | UI glue: drag-drop/file/demo load, render, print-to-PDF, Pro-waitlist capture |
| `styles.css` | Styling incl. print stylesheet (→ clean PDF via browser print) |
| `samples/` | KoSIT demo invoices (UBL + CII) for the "Beispiel" buttons |
| `parser.test.js` | Node test of the parser against both samples (known KoSIT figures) |

## Test

```bash
npm install   # @xmldom/xmldom — test-only DOM shim
node parser.test.js
```

Asserts both UBL and CII produce the correct known values (parties, lines, 7% tax, 22,04 € tax, 336,90 € gross, IBAN) and that unknown XML throws a friendly error.

## Waitlist

Pro sign-ups POST to the Launch Kit public lead-capture endpoint of tenant `xrechnung`, segment `pro-waitlist` (`https://auth.solytics.de/t/xrechnung/marketing/public/lead-capture`). Honeypot field + client-side validation.

## Monetisation / next steps

- **Payment:** the Stripe restricted key is read-only — enabling a real Buy button needs a Stripe Payment Link (Jens). Until then Pro = validated demand via waitlist.
- **Traffic:** SEO (mandate-driven intent) + Bing/Google Ads (APIs configured).
- **Domain:** lives on `*.github.io`; a custom subdomain (e.g. `xrechnung.solytics.de`) can be pointed via Namecheap DNS.
- **Legal:** Impressum (§ 5 DDG) + Datenschutz need completion before paid promotion.

A product of Solytics.
