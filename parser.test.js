/* Node test for the XRechnung parser. Shims the browser DOMParser with @xmldom/xmldom.
   Verifies both UBL and CII samples produce the same correct, known values
   (totals, parties, lines, tax) — these are the real numbers in the KoSIT fixtures. */
const fs = require("fs");
const path = require("path");
const { DOMParser } = require("@xmldom/xmldom");
global.DOMParser = DOMParser;
const { parseInvoiceXML } = require("./parser.js");

let pass = 0, fail = 0;
function eq(actual, expected, msg) {
  if (actual === expected) { pass++; }
  else { fail++; console.error(`  ✗ ${msg}\n      expected: ${JSON.stringify(expected)}\n      actual:   ${JSON.stringify(actual)}`); }
}
function truthy(v, msg) { if (v) pass++; else { fail++; console.error(`  ✗ ${msg} (got: ${JSON.stringify(v)})`); } }

function checkCommon(inv, label) {
  console.log(`\n[${label}]`);
  eq(inv.number, "123456XX", `${label}: invoice number`);
  eq(inv.issueDate, "04.04.2016", `${label}: issue date formatted DD.MM.YYYY`);
  eq(inv.type, "Rechnung", `${label}: doc type 380 -> Rechnung`);
  eq(inv.currency, "EUR", `${label}: currency`);
  eq(inv.buyerReference, "04011000-12345-03", `${label}: Leitweg-ID / buyer reference`);
  // totals (the real figures in the fixture)
  eq(inv.totals.net, "314,86 EUR", `${label}: net total`);
  eq(inv.totals.tax, "22,04 EUR", `${label}: tax total`);
  eq(inv.totals.gross, "336,90 EUR", `${label}: gross total`);
  eq(inv.totals.payable, "336,90 EUR", `${label}: payable`);
  // tax breakdown
  eq(inv.taxLines.length, 1, `${label}: one tax line`);
  eq(inv.taxLines[0].rate, "7 %", `${label}: tax rate 7%`);
  eq(inv.taxLines[0].amount, "22,04 EUR", `${label}: tax line amount`);
  // payment
  eq(inv.payment.iban, "DE75512108001245126199", `${label}: IBAN`);
  truthy(/SEPA|58/.test(inv.payment.means), `${label}: payment means resolved`);
  // parties
  truthy(inv.seller.name, `${label}: seller name present`);
  truthy(/123456789/.test(inv.seller.vatId), `${label}: seller VAT id`);
  truthy(inv.seller.email, `${label}: seller email`);
  // lines
  eq(inv.lines.length, 2, `${label}: two invoice lines`);
  eq(inv.lines[1].name, "Porto + Versandkosten", `${label}: second line name`);
  eq(inv.lines[0].total, "288,79 EUR", `${label}: first line total`);
  eq(inv.lines[0].rate, "7 %", `${label}: first line tax rate`);
}

const ubl = fs.readFileSync(path.join(__dirname, "samples/demo-ubl.xml"), "utf8");
const cii = fs.readFileSync(path.join(__dirname, "samples/demo-cii.xml"), "utf8");

const invUBL = parseInvoiceXML(ubl);
eq(invUBL.format, "XRechnung (UBL 2.1)", "UBL: format detected");
checkCommon(invUBL, "UBL");

const invCII = parseInvoiceXML(cii);
truthy(/CII/.test(invCII.format), "CII: format detected");
checkCommon(invCII, "CII");

// negative: garbage input must throw a friendly error
let threw = false;
try { parseInvoiceXML("<foo>not an invoice</foo>"); } catch (e) { threw = /XRechnung|Format/.test(e.message); }
truthy(threw, "unknown root element -> friendly error");

console.log(`\n${fail === 0 ? "✓ ALL PASS" : "✗ FAILURES"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
