/* XRechnung Viewer — UI glue. Loads XML, renders the parsed invoice,
   prints to PDF, and captures Pro-waitlist sign-ups. No data leaves the
   browser except an explicit waitlist e-mail the user types in. */
(function () {
  "use strict";

  const WAITLIST_ENDPOINT = "https://auth.solytics.de/t/xrechnung/marketing/public/lead-capture";
  const WAITLIST_SEGMENT = "pro-waitlist";

  const $ = (id) => document.getElementById(id);
  const esc = (s) =>
    String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const dropzone = $("dropzone");
  const fileInput = $("fileInput");
  const errorBox = $("errorBox");
  const resultSection = $("result");

  function showError(msg) {
    errorBox.textContent = msg;
    errorBox.hidden = false;
    resultSection.hidden = true;
  }
  function clearError() { errorBox.hidden = true; }

  function handleXML(xmlString, fileName) {
    clearError();
    let inv;
    try {
      inv = parseInvoiceXML(xmlString);
    } catch (e) {
      showError(e && e.message ? e.message : "Die Datei konnte nicht gelesen werden.");
      return;
    }
    renderInvoice(inv, fileName);
  }

  function loadFile(file) {
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) { showError("Die Datei ist größer als 8 MB – das ist für eine XRechnung ungewöhnlich."); return; }
    const reader = new FileReader();
    reader.onload = () => handleXML(reader.result, file.name);
    reader.onerror = () => showError("Die Datei konnte nicht gelesen werden.");
    reader.readAsText(file, "UTF-8");
  }

  /* ---- events: drag & drop, browse, demo ---- */
  dropzone.addEventListener("click", (e) => { if (e.target.closest(".linklike")) return; fileInput.click(); });
  dropzone.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileInput.click(); } });
  $("browseBtn").addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", () => loadFile(fileInput.files[0]));

  ["dragenter", "dragover"].forEach((ev) =>
    dropzone.addEventListener(ev, (e) => { e.preventDefault(); dropzone.classList.add("dragover"); }));
  ["dragleave", "drop"].forEach((ev) =>
    dropzone.addEventListener(ev, (e) => { e.preventDefault(); dropzone.classList.remove("dragover"); }));
  dropzone.addEventListener("drop", (e) => {
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) loadFile(f);
  });

  document.querySelectorAll("[data-demo]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const which = btn.getAttribute("data-demo");
      const url = which === "cii" ? "samples/demo-cii.xml" : "samples/demo-ubl.xml";
      fetch(url).then((r) => r.text())
        .then((xml) => handleXML(xml, which === "cii" ? "beispiel-cii.xml" : "beispiel-ubl.xml"))
        .catch(() => showError("Beispiel konnte nicht geladen werden."));
    }));

  $("resetBtn") && $("resetBtn").addEventListener("click", () => {
    resultSection.hidden = true; clearError(); fileInput.value = "";
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
  $("printBtn") && $("printBtn").addEventListener("click", () => window.print());

  /* ---- render ---- */
  function partyBlock(label, p) {
    const lines = [];
    if (p.name) lines.push(`<p class="pname">${esc(p.name)}</p>`);
    if (p.tradeName && p.tradeName !== p.name) lines.push(`<p class="muted">${esc(p.tradeName)}</p>`);
    if (p.street) lines.push(`<p>${esc(p.street)}</p>`);
    const cityLine = [p.zip, p.city].filter(Boolean).join(" ");
    if (cityLine || p.country) lines.push(`<p>${esc([cityLine, p.country].filter(Boolean).join(" · "))}</p>`);
    if (p.vatId) lines.push(`<p class="muted">USt-IdNr.: ${esc(p.vatId)}</p>`);
    if (p.taxId) lines.push(`<p class="muted">Steuernr.: ${esc(p.taxId)}</p>`);
    if (p.email) lines.push(`<p class="muted">${esc(p.email)}</p>`);
    if (p.phone) lines.push(`<p class="muted">${esc(p.phone)}</p>`);
    return `<div class="party"><h4>${esc(label)}</h4>${lines.join("")}</div>`;
  }

  function row(lbl, val) { return val ? `<div class="row"><span class="lbl">${esc(lbl)}</span><span>${esc(val)}</span></div>` : ""; }

  function renderInvoice(inv, fileName) {
    $("formatBadge").textContent = inv.format || "XRechnung";
    $("fileName").textContent = fileName || "";

    const linesHtml = inv.lines.map((l, i) => `
      <tr>
        <td class="num">${esc(l.id || (i + 1))}</td>
        <td>
          <div class="line-name">${esc(l.name || "—")}</div>
          ${l.description && l.description !== l.name ? `<div class="line-desc">${esc(l.description)}</div>` : ""}
          ${l.note ? `<div class="line-note">${esc(l.note)}</div>` : ""}
        </td>
        <td class="num">${esc([l.qty, l.unit].filter(Boolean).join(" "))}</td>
        <td class="num">${esc(l.price)}</td>
        <td class="num">${esc(l.rate)}</td>
        <td class="num">${esc(l.total)}</td>
      </tr>`).join("");

    const taxRows = inv.taxLines.map((tx) => `
      <tr><td>${esc(tx.category || "USt")}</td><td>${esc(tx.rate)}</td><td>${esc(tx.base)}</td><td>${esc(tx.amount)}</td></tr>`).join("");

    const pay = inv.payment || {};
    const payHtml = [
      pay.means ? `<p><span class="kv">Zahlungsart:</span> ${esc(pay.means)}</p>` : "",
      pay.iban ? `<p><span class="kv">IBAN:</span> ${esc(pay.iban)}</p>` : "",
      pay.bic ? `<p><span class="kv">BIC:</span> ${esc(pay.bic)}</p>` : "",
      pay.reference ? `<p><span class="kv">Verwendungszweck:</span> ${esc(pay.reference)}</p>` : "",
      pay.terms ? `<p><span class="kv">Zahlungsbedingungen:</span> ${esc(pay.terms)}</p>` : "",
    ].filter(Boolean).join("");

    const t = inv.totals || {};
    const metaRows = [
      row("Rechnungsnummer", inv.number),
      row("Rechnungsdatum", inv.issueDate),
      row("Fälligkeit", inv.dueDate),
      row("Leitweg-ID", inv.buyerReference),
      row("Bestellreferenz", inv.orderReference),
    ].join("");

    $("invoice").innerHTML = `
      <div class="inv-head">
        <div>
          <h1 class="inv-title">${esc(inv.type || "Rechnung")}<small>${esc(inv.format)}</small></h1>
        </div>
        <div class="inv-meta">
          <div class="num">${esc(inv.number || "")}</div>
          <div>${esc(inv.issueDate || "")}</div>
        </div>
      </div>

      <div class="inv-parties">
        ${partyBlock("Rechnungssteller", inv.seller || {})}
        ${partyBlock("Rechnungsempfänger", inv.buyer || {})}
      </div>

      ${metaRows ? `<div class="totals" style="max-width:420px;margin-bottom:18px">${metaRows}</div>` : ""}

      <table class="lines">
        <thead><tr>
          <th>Pos.</th><th>Bezeichnung</th><th class="num">Menge</th>
          <th class="num">Einzelpreis</th><th class="num">USt</th><th class="num">Betrag</th>
        </tr></thead>
        <tbody>${linesHtml || `<tr><td colspan="6" class="muted">Keine Positionen gefunden.</td></tr>`}</tbody>
      </table>

      <div class="inv-bottom">
        <div>
          ${taxRows ? `<div class="tax-box"><h4>Steueraufschlüsselung</h4>
            <table class="tax-table"><thead><tr><th>Kategorie</th><th>Satz</th><th>Netto</th><th>Steuer</th></tr></thead>
            <tbody>${taxRows}</tbody></table></div>` : ""}
          ${payHtml ? `<div class="payment-box"><h4>Zahlung</h4>${payHtml}</div>` : ""}
        </div>
        <div class="totals">
          ${row("Summe Positionen", t.lines)}
          ${row("Abzüge", t.allowance)}
          ${row("Zuschläge", t.charge)}
          ${row("Nettobetrag", t.net)}
          ${row("Umsatzsteuer", t.tax)}
          ${t.prepaid ? row("Anzahlungen", t.prepaid) : ""}
          <div class="row grand"><span class="lbl">Zahlbetrag</span><span>${esc(t.payable || t.gross || "")}</span></div>
        </div>
      </div>

      ${inv.note ? `<div class="inv-note">${esc(inv.note)}</div>` : ""}
    `;

    resultSection.hidden = false;
    resultSection.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /* ---- Pro waitlist ---- */
  const form = $("waitlistForm");
  if (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      const status = $("wlStatus");
      const email = $("wlEmail").value.trim();
      const trap = $("wlCompanyTrap").value.trim();
      status.className = "waitlist-status";
      if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        status.textContent = "Bitte geben Sie eine gültige E-Mail-Adresse ein.";
        status.classList.add("err");
        return;
      }
      if (trap) { // honeypot filled = bot → pretend success, send nothing
        status.textContent = "Danke! Wir melden uns zum Start.";
        status.classList.add("ok");
        form.reset();
        return;
      }
      const btn = $("wlSubmit");
      btn.disabled = true;
      status.textContent = "Wird gesendet…";
      fetch(WAITLIST_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email, segment: WAITLIST_SEGMENT, source: "xrechnung-viewer" }),
      })
        .then((r) => {
          if (!r.ok) throw new Error("bad status " + r.status);
          status.textContent = "Danke! Wir melden uns, sobald Pro startet.";
          status.classList.add("ok");
          form.reset();
        })
        .catch(() => {
          status.textContent = "Senden fehlgeschlagen. Bitte später erneut versuchen oder an info@solytics.de schreiben.";
          status.classList.add("err");
        })
        .finally(() => { btn.disabled = false; });
    });
  }
})();
