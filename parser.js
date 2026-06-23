/* XRechnung parser — UBL 2.1 + UN/CEFACT CII (EN 16931 / XRechnung 3.0).
   Pure client-side. Namespace-prefix-agnostic (matches by localName).
   Maps the EN 16931 business terms (BT-*) to a normalised invoice object. */

const UNIT_CODES = {
  HUR: "Stunde", DAY: "Tag", MON: "Monat", ANN: "Jahr", WEE: "Woche",
  C62: "Stück", H87: "Stück", XPP: "Packung", PR: "Paar", SET: "Satz",
  KGM: "kg", GRM: "g", TNE: "t", MTR: "m", CMT: "cm", MMT: "mm",
  KMT: "km", MTK: "m²", MTQ: "m³", LTR: "l", MLT: "ml",
  KWH: "kWh", MWH: "MWh", NAR: "Anzahl", P1: "Prozent", PCE: "Stück",
  E49: "Arbeitstag", XBX: "Box", XCS: "Karton", XPK: "Packstück",
};

const TAX_CATEGORY = {
  S: "Regelsteuersatz", Z: "Nullsatz", E: "steuerbefreit",
  AE: "Reverse Charge (Steuerschuldnerschaft des Leistungsempfängers)",
  K: "innergemeinschaftliche Lieferung", G: "Ausfuhrlieferung",
  O: "nicht im Umfang der Umsatzsteuer", L: "Kanaren IGIC", M: "Ceuta/Melilla IPSI",
};

const PAYMENT_MEANS = {
  "10": "Bar", "20": "Scheck", "30": "Überweisung", "42": "Zahlung auf Bankkonto",
  "48": "Kartenzahlung", "49": "Lastschrift", "57": "Dauerauftrag",
  "58": "SEPA-Überweisung", "59": "SEPA-Lastschrift", "97": "Verrechnung",
};

const DOC_TYPE = {
  "380": "Rechnung", "381": "Gutschrift / Korrekturrechnung", "384": "Korrigierte Rechnung",
  "389": "Selbst ausgestellte Rechnung", "326": "Teilrechnung", "875": "Abschlagsrechnung",
};

const ll = (el) => (el.localName || el.nodeName.replace(/^.*:/, ""));
const attr = (el, name) => (el && el.getAttribute ? el.getAttribute(name) || "" : "");
const elementChildren = (el) =>
  el ? Array.from(el.childNodes).filter((c) => c.nodeType === 1) : [];
const kids = (el, name) => elementChildren(el).filter((c) => ll(c) === name);
const kid = (el, name) => kids(el, name)[0] || null;

/* navigate down a path of local names, return text of leaf */
function t(el, ...path) {
  let cur = el;
  for (const p of path) {
    if (!cur) return "";
    cur = kid(cur, p);
  }
  return cur ? cur.textContent.trim() : "";
}
/* node at a path */
function n(el, ...path) {
  let cur = el;
  for (const p of path) {
    if (!cur) return null;
    cur = kid(cur, p);
  }
  return cur || null;
}
/* first descendant (any depth) by local name */
function deep(el, name) {
  if (!el) return null;
  for (const c of elementChildren(el)) {
    if (ll(c) === name) return c;
    const found = deep(c, name);
    if (found) return found;
  }
  return null;
}

const fmtMoney = (v, cur) => {
  if (v === "" || v == null) return "";
  const num = Number(v);
  if (Number.isNaN(num)) return v;
  return num.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) +
    (cur ? " " + cur : "");
};
const fmtNum = (v) => {
  if (v === "" || v == null) return "";
  const num = Number(v);
  if (Number.isNaN(num)) return v;
  return num.toLocaleString("de-DE", { maximumFractionDigits: 4 });
};
const fmtPercent = (v) => (v === "" || v == null ? "" : fmtNum(v) + " %");

function fmtDateUBL(s) {
  if (!s) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : s;
}
function fmtDateCII(s) {
  if (!s) return "";
  const m = /^(\d{4})(\d{2})(\d{2})$/.exec(s);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : s;
}
const unit = (c) => (c ? (UNIT_CODES[c] || c) : "");

/* ----------------------------- UBL ----------------------------- */
function parseUBL(root) {
  const cur = t(root, "DocumentCurrencyCode") || "EUR";

  const party = (p) => {
    if (!p) return {};
    const addr = kid(p, "PostalAddress");
    const taxScheme = kids(p, "PartyTaxScheme").map((ts) => ({
      id: t(ts, "CompanyID"), scheme: t(ts, "TaxScheme", "ID"),
    }));
    const vat = taxScheme.find((x) => x.scheme === "VAT");
    const tax = taxScheme.find((x) => x.scheme !== "VAT");
    const contact = kid(p, "Contact");
    const legal = kid(p, "PartyLegalEntity");
    return {
      name: t(legal, "RegistrationName") || t(p, "PartyName", "Name"),
      tradeName: t(p, "PartyName", "Name"),
      legalForm: t(legal, "CompanyLegalForm"),
      regId: t(legal, "CompanyID"),
      street: [t(addr, "StreetName"), t(addr, "AdditionalStreetName")].filter(Boolean).join(", "),
      zip: t(addr, "PostalZone"),
      city: t(addr, "CityName"),
      country: t(addr, "Country", "IdentificationCode"),
      vatId: vat ? vat.id : "",
      taxId: tax ? tax.id : "",
      email: t(contact, "ElectronicMail") || t(p, "EndpointID"),
      phone: t(contact, "Telephone"),
      contactName: t(contact, "Name"),
    };
  };

  const seller = party(n(root, "AccountingSupplierParty", "Party"));
  const buyer = party(n(root, "AccountingCustomerParty", "Party"));

  const pm = kid(root, "PaymentMeans");
  const payment = {
    means: PAYMENT_MEANS[t(pm, "PaymentMeansCode")] || t(pm, "PaymentMeansCode"),
    iban: t(pm, "PayeeFinancialAccount", "ID"),
    accountName: t(pm, "PayeeFinancialAccount", "Name"),
    bic: t(pm, "PayeeFinancialAccount", "FinancialInstitutionBranch", "ID"),
    reference: t(pm, "PaymentID"),
    terms: t(root, "PaymentTerms", "Note"),
  };

  const taxTotal = kid(root, "TaxTotal");
  const taxLines = kids(taxTotal, "TaxSubtotal").map((s) => ({
    base: fmtMoney(t(s, "TaxableAmount"), cur),
    rate: fmtPercent(t(s, "TaxCategory", "Percent")),
    amount: fmtMoney(t(s, "TaxAmount"), cur),
    category: TAX_CATEGORY[t(s, "TaxCategory", "ID")] || t(s, "TaxCategory", "ID"),
  }));

  const lmt = kid(root, "LegalMonetaryTotal");
  const totals = {
    net: fmtMoney(t(lmt, "TaxExclusiveAmount"), cur),
    lines: fmtMoney(t(lmt, "LineExtensionAmount"), cur),
    allowance: fmtMoney(t(lmt, "AllowanceTotalAmount"), cur),
    charge: fmtMoney(t(lmt, "ChargeTotalAmount"), cur),
    tax: fmtMoney(t(taxTotal, "TaxAmount"), cur),
    gross: fmtMoney(t(lmt, "TaxInclusiveAmount"), cur),
    prepaid: fmtMoney(t(lmt, "PrepaidAmount"), cur),
    payable: fmtMoney(t(lmt, "PayableAmount"), cur),
  };

  const lines = kids(root, "InvoiceLine").map((l) => {
    const item = kid(l, "Item");
    return {
      id: t(l, "ID"),
      name: t(item, "Name"),
      description: t(item, "Description"),
      note: t(l, "Note"),
      qty: fmtNum(t(l, "InvoicedQuantity")),
      unit: unit(attr(kid(l, "InvoicedQuantity"), "unitCode")),
      price: fmtMoney(t(l, "Price", "PriceAmount"), cur),
      rate: fmtPercent(t(item, "ClassifiedTaxCategory", "Percent")),
      total: fmtMoney(t(l, "LineExtensionAmount"), cur),
    };
  });

  return {
    format: "XRechnung (UBL 2.1)",
    profile: t(root, "CustomizationID"),
    number: t(root, "ID"),
    type: DOC_TYPE[t(root, "InvoiceTypeCode")] || t(root, "InvoiceTypeCode"),
    issueDate: fmtDateUBL(t(root, "IssueDate")),
    dueDate: fmtDateUBL(t(root, "DueDate")),
    currency: cur,
    buyerReference: t(root, "BuyerReference"),
    orderReference: t(root, "OrderReference", "ID"),
    note: kids(root, "Note").map((x) => x.textContent.trim().replace(/^#[A-Z]{3}#/, "")).join("\n"),
    seller, buyer, payment, taxLines, totals, lines,
  };
}

/* ----------------------------- CII ----------------------------- */
function parseCII(root) {
  const doc = kid(root, "ExchangedDocument");
  const trans = kid(root, "SupplyChainTradeTransaction");
  const agreement = kid(trans, "ApplicableHeaderTradeAgreement");
  const delivery = kid(trans, "ApplicableHeaderTradeDelivery");
  const settlement = kid(trans, "ApplicableHeaderTradeSettlement");
  const cur = t(settlement, "InvoiceCurrencyCode") || "EUR";

  const ciiDate = (node) => fmtDateCII(t(node, "DateTimeString"));

  const party = (p) => {
    if (!p) return {};
    const addr = kid(p, "PostalTradeAddress");
    const contact = kid(p, "DefinedTradeContact");
    const regs = kids(p, "SpecifiedTaxRegistration").map((r) => {
      const idNode = kid(r, "ID");
      return { scheme: idNode ? idNode.getAttribute("schemeID") : "", value: idNode ? idNode.textContent.trim() : "" };
    });
    const vat = regs.find((r) => r.scheme === "VA");
    const tax = regs.find((r) => r.scheme === "FC");
    const uri = kid(p, "URIUniversalCommunication");
    return {
      name: t(p, "Name"),
      tradeName: t(p, "SpecifiedLegalOrganization", "TradingBusinessName"),
      legalForm: t(p, "Description"),
      regId: t(p, "SpecifiedLegalOrganization", "ID"),
      street: [t(addr, "LineOne"), t(addr, "LineTwo")].filter(Boolean).join(", "),
      zip: t(addr, "PostcodeCode"),
      city: t(addr, "CityName"),
      country: t(addr, "CountryID"),
      vatId: vat ? vat.value : "",
      taxId: tax ? tax.value : "",
      email: t(contact, "EmailURIUniversalCommunication", "URIID") || (uri ? t(uri, "URIID") : ""),
      phone: t(contact, "TelephoneUniversalCommunication", "CompleteNumber"),
      contactName: t(contact, "PersonName"),
    };
  };

  const seller = party(kid(agreement, "SellerTradeParty"));
  const buyer = party(kid(agreement, "BuyerTradeParty"));

  const pmNode = kid(settlement, "SpecifiedTradeSettlementPaymentMeans");
  const terms = kid(settlement, "SpecifiedTradePaymentTerms");
  const payment = {
    means: PAYMENT_MEANS[t(pmNode, "TypeCode")] || t(pmNode, "TypeCode"),
    iban: t(pmNode, "PayeePartyCreditorFinancialAccount", "IBANID"),
    accountName: t(pmNode, "PayeePartyCreditorFinancialAccount", "AccountName"),
    bic: t(pmNode, "PayeeSpecifiedCreditorFinancialInstitution", "BICID"),
    reference: t(settlement, "PaymentReference"),
    terms: t(terms, "Description"),
    dueDate: ciiDate(n(terms, "DueDateDateTime")),
  };

  const taxLines = kids(settlement, "ApplicableTradeTax").map((x) => ({
    base: fmtMoney(t(x, "BasisAmount"), cur),
    rate: fmtPercent(t(x, "RateApplicablePercent")),
    amount: fmtMoney(t(x, "CalculatedAmount"), cur),
    category: TAX_CATEGORY[t(x, "CategoryCode")] || t(x, "CategoryCode"),
  }));

  const sum = kid(settlement, "SpecifiedTradeSettlementHeaderMonetarySummation");
  const totals = {
    lines: fmtMoney(t(sum, "LineTotalAmount"), cur),
    allowance: fmtMoney(t(sum, "AllowanceTotalAmount"), cur),
    charge: fmtMoney(t(sum, "ChargeTotalAmount"), cur),
    net: fmtMoney(t(sum, "TaxBasisTotalAmount"), cur),
    tax: fmtMoney(t(sum, "TaxTotalAmount"), cur),
    gross: fmtMoney(t(sum, "GrandTotalAmount"), cur),
    prepaid: fmtMoney(t(sum, "TotalPrepaidAmount"), cur),
    payable: fmtMoney(t(sum, "DuePayableAmount"), cur),
  };

  const lines = kids(trans, "IncludedSupplyChainTradeLineItem").map((l) => {
    const product = kid(l, "SpecifiedTradeProduct");
    const lineAgr = kid(l, "SpecifiedLineTradeAgreement");
    const lineDel = kid(l, "SpecifiedLineTradeDelivery");
    const lineSet = kid(l, "SpecifiedLineTradeSettlement");
    const qtyNode = kid(lineDel, "BilledQuantity");
    const price = t(lineAgr, "NetPriceProductTradePrice", "ChargeAmount") ||
      t(lineAgr, "GrossPriceProductTradePrice", "ChargeAmount");
    return {
      id: t(l, "AssociatedDocumentLineDocument", "LineID"),
      name: t(product, "Name"),
      description: t(product, "Description"),
      note: t(n(l, "AssociatedDocumentLineDocument", "IncludedNote"), "Content"),
      qty: fmtNum(qtyNode ? qtyNode.textContent.trim() : ""),
      unit: unit(qtyNode ? qtyNode.getAttribute("unitCode") : ""),
      price: fmtMoney(price, cur),
      rate: fmtPercent(t(lineSet, "ApplicableTradeTax", "RateApplicablePercent")),
      total: fmtMoney(t(lineSet, "SpecifiedTradeSettlementLineMonetarySummation", "LineTotalAmount"), cur),
    };
  });

  return {
    format: "XRechnung (CII / UN-CEFACT)",
    profile: t(n(doc), "") || t(kid(kid(root, "ExchangedDocumentContext"), "GuidelineSpecifiedDocumentContextParameter"), "ID"),
    number: t(doc, "ID"),
    type: DOC_TYPE[t(doc, "TypeCode")] || t(doc, "TypeCode"),
    issueDate: ciiDate(n(doc, "IssueDateTime")),
    dueDate: payment.dueDate || "",
    currency: cur,
    buyerReference: t(agreement, "BuyerReference"),
    orderReference: t(agreement, "BuyerOrderReferencedDocument", "IssuerAssignedID"),
    note: kids(doc, "IncludedNote").map((x) => t(x, "Content")).join("\n"),
    seller, buyer, payment, taxLines, totals, lines,
  };
}

/* --------------------------- dispatch -------------------------- */
function parseInvoiceXML(xmlString) {
  const dom = new DOMParser().parseFromString(xmlString, "application/xml");
  const perr = dom.querySelector && dom.querySelector("parsererror");
  if (perr) throw new Error("Die Datei ist kein gültiges XML.");
  const root = dom.documentElement;
  if (!root) throw new Error("Die Datei ist kein gültiges XML.");
  const name = ll(root);
  if (name === "Invoice") return parseUBL(root);
  if (name === "CrossIndustryInvoice") return parseCII(root);
  if (name === "CreditNote") return parseUBL(root); // UBL credit note shares structure
  throw new Error(
    "Unbekanntes Format. Diese Datei ist keine XRechnung (UBL oder CII). " +
    "Hinweis: ZUGFeRD-Rechnungen sind PDF-Dateien mit eingebettetem XML — bitte das XML extrahieren oder die XML-Datei direkt laden."
  );
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { parseInvoiceXML, parseUBL, parseCII };
}
