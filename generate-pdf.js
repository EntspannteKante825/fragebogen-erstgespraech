'use strict';
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const fs = require('fs');

const C = {
  navy:    rgb(0.102, 0.180, 0.290),
  gold:    rgb(0.788, 0.659, 0.298),
  white:   rgb(1, 1, 1),
  dark:    rgb(0.10, 0.10, 0.10),
  gray:    rgb(0.42, 0.42, 0.42),
  border:  rgb(0.72, 0.78, 0.88),
  fieldBg: rgb(0.93, 0.96, 1.00),
  noteBg:  rgb(0.91, 0.95, 1.00),
  rowAlt:  rgb(0.97, 0.97, 0.99),
};

const PW = 595, PH = 842;
const ML = 38, MR = 38;
const MT = 36, MB = 52;
const CW = PW - ML - MR; // 519 pt

// ── GENERATOR ──────────────────────────────────────────────────
class Gen {
  constructor() {
    this.doc      = null;
    this.form     = null;
    this.tocPage  = null;
    this.pages    = [];
    this.page     = null;
    this.y        = 0;
    this.fonts    = {};
    this.n        = 0;
    this.sections = [];
  }

  async init() {
    this.doc  = await PDFDocument.create();
    this.form = this.doc.getForm();
    this.fonts.r = await this.doc.embedFont(StandardFonts.Helvetica);
    this.fonts.b = await this.doc.embedFont(StandardFonts.HelveticaBold);
    this.fonts.i = await this.doc.embedFont(StandardFonts.HelveticaOblique);
    // Page 1 = TOC (no footer yet, filled later)
    this.tocPage = this.doc.addPage([PW, PH]);
    this.pages.push(this.tocPage);
  }

  startContent() { this.newPage(); }

  newPage() {
    this.page = this.doc.addPage([PW, PH]);
    this.pages.push(this.page);
    this.y = PH - MT;
    const pn = this.pages.length;
    this.page.drawText('Fragebogen Unternehmenskunden  |  Erstgespraech', {
      x: ML, y: 20, font: this.fonts.r, size: 6.5, color: C.gray
    });
    this.page.drawText(`Seite ${pn}`, {
      x: PW - MR - 32, y: 20, font: this.fonts.r, size: 7, color: C.gray
    });
  }

  // Ensure at least `needed` pts remain on page
  chk(needed) { if (this.y - needed < MB) this.newPage(); }
  sp(n = 6)   { this.y -= n; }

  // ── PRIMITIVES ────────────────────────────────────────────────
  rect(x, y, w, h, fill, stroke, sw = 0.5) {
    this.page.drawRectangle({ x, y, width: w, height: h, color: fill,
      ...(stroke ? { borderColor: stroke, borderWidth: sw } : {}) });
  }

  txt(s, x, y, sz = 8, f = 'r', col = C.dark) {
    if (!s && s !== 0) return;
    this.page.drawText(String(s), { x, y, font: this.fonts[f], size: sz, color: col });
  }

  tw(s, sz = 8) { return this.fonts.r.widthOfTextAtSize(String(s), sz); }

  wrap(text, sz, maxW) {
    const words = text.split(' '), lines = [];
    let cur = '';
    for (const w of words) {
      const t = cur ? `${cur} ${w}` : w;
      if (this.fonts.r.widthOfTextAtSize(t, sz) > maxW) { if (cur) lines.push(cur); cur = w; }
      else cur = t;
    }
    if (cur) lines.push(cur);
    return lines;
  }

  // ── FORM FIELDS ───────────────────────────────────────────────
  addTF(x, y, w, h, multiline = false) {
    const f = this.form.createTextField(`f${this.n++}`);
    if (multiline) f.enableMultiline();
    f.addToPage(this.page, {
      x: x + 1, y: y + 1, width: w - 2, height: h - 2,
      borderWidth: 0, font: this.fonts.r,
    });
    f.setFontSize(9);
  }

  addCB(x, y, sz = 9) {
    const f = this.form.createCheckBox(`c${this.n++}`);
    f.addToPage(this.page, { x, y, width: sz, height: sz });
  }

  // ── LAYOUT ELEMENTS ───────────────────────────────────────────

  // Section header (dark-blue bar, gold left accent)
  header(title) {
    this.chk(46);
    this.sp(14);
    this.sections.push({ title, page: this.pages.length });
    const h = 27;
    this.rect(ML, this.y - h, CW, h, C.navy);
    this.rect(ML, this.y - h, 4,  h, C.gold);
    this.txt(title, ML + 12, this.y - 19, 10, 'b', C.white);
    this.y -= h;
    this.sp(10);
  }

  // Sub-heading
  sub(title) {
    this.chk(26);
    this.sp(8);
    this.txt(title, ML, this.y, 8.5, 'b', C.navy);
    this.y -= 16;
  }

  // Small label drawn ABOVE a field
  lbl(text, x = ML, sz = 7.5) {
    this.txt(text, x, this.y - 10, sz, 'r', C.gray);
    this.y -= 12;
  }

  // Single-line text field
  field(label, w = CW, x = ML, fh = 18) {
    this.chk(fh + 18);
    if (label) this.lbl(label, x);
    this.rect(x, this.y - fh, w, fh, C.fieldBg, C.border);
    this.addTF(x, this.y - fh, w, fh);
    this.y -= fh + 7;
  }

  // Multi-line textarea
  area(label, lines = 3, w = CW, x = ML) {
    const fh = lines * 14 + 4;
    this.chk(fh + 18);
    if (label) this.lbl(label, x);
    this.rect(x, this.y - fh, w, fh, C.fieldBg, C.border);
    this.addTF(x, this.y - fh, w, fh, true);
    this.y -= fh + 7;
  }

  // Row of text fields.  cells = [{label, w}]  w = fraction of CW
  row(cells, gap = 10) {
    const fh = 18;
    this.chk(fh + 20);

    const fixedW    = cells.filter(c => c.w).reduce((s, c) => s + c.w * CW, 0);
    const nAuto     = cells.filter(c => !c.w).length;
    const totalGaps = (cells.length - 1) * gap;
    const autoW     = nAuto > 0 ? (CW - fixedW - totalGaps) / nAuto : 0;

    const sy = this.y;
    let x = ML, minY = sy;

    for (const cell of cells) {
      const cw = Math.floor(cell.w ? cell.w * CW : autoW);
      this.y = sy;
      if (cell.label) this.lbl(cell.label, x);
      this.rect(x, this.y - fh, cw, fh, C.fieldBg, C.border);
      this.addTF(x, this.y - fh, cw, fh);
      const ey = this.y - fh - 7;
      if (ey < minY) minY = ey;
      x += cw + gap;
    }
    this.y = minY;
  }

  // Consultant note box
  note(text) {
    const lines = this.wrap(text, 8, CW - 28);
    const bh = lines.length * 11 + 22;
    this.chk(bh + 12);
    this.sp(4);
    this.rect(ML, this.y - bh, CW, bh, C.noteBg, C.gold, 0.9);
    this.rect(ML, this.y - bh, 3, bh, C.gold);
    this.txt('Gesprachseinstieg:', ML + 10, this.y - 14, 7.5, 'b', rgb(0.08, 0.22, 0.48));
    let ty = this.y - 27;
    for (const l of lines) {
      this.txt(l, ML + 10, ty, 8, 'i', rgb(0.08, 0.18, 0.38));
      ty -= 11;
    }
    this.y -= bh;
    this.sp(10);
  }

  // Grid of checkboxes
  cbGrid(options, cols = 4) {
    const cbSz = 9, rowH = 17;
    const colW = CW / cols;
    const numRows = Math.ceil(options.length / cols);
    this.chk(numRows * rowH + 10);
    this.sp(3);
    for (let i = 0; i < options.length; i++) {
      const r = Math.floor(i / cols), c = i % cols;
      const x = ML + c * colW;
      // Checkbox bottom-left y in PDF coords (y increases upward)
      const cbY = this.y - r * rowH - rowH + 4;
      this.addCB(x, cbY, cbSz);
      this.txt(options[i], x + cbSz + 4, cbY + 1, 8);
    }
    this.y -= numRows * rowH + 7;
  }

  // Inline row: [prefix text] [cb opt] [cb opt] ... [optional text field]
  // KEY FIX: generous y decrement so no overlap with next element
  inline(prefix, options = [], optField = null) {
    this.chk(24);
    const cbSz = 9;
    const textY = this.y - 13;   // text baseline
    const cbY   = textY - 6;     // checkbox bottom (aligns with text)
    let x = ML;

    if (prefix) {
      this.txt(prefix, x, textY, 8);
      x += this.tw(prefix) + 5;
    }

    for (const opt of options) {
      if (x + cbSz + this.tw(opt) + 10 > ML + CW) break; // guard
      this.addCB(x, cbY, cbSz);
      x += cbSz + 3;
      this.txt(opt, x, textY, 8);
      x += this.tw(opt) + 10;
    }

    if (optField) {
      const available = ML + CW - x - 4;
      const fw = Math.min(optField.w || 90, available);
      if (optField.label) {
        this.txt(optField.label, x, textY, 8, 'r', C.gray);
        x += this.tw(optField.label) + 4;
      }
      if (fw > 15) {
        this.rect(x, cbY - 1, fw, cbSz + 2, C.fieldBg, C.border);
        this.addTF(x, cbY - 1, fw, cbSz + 2);
      }
    }

    this.y -= 26; // KEY FIX: was 16 — now 26 to guarantee clearance
  }

  // Insurance overview table: pre-labeled rows + ja/nein checkboxes
  insTable(rows, colHeaders) {
    const hh = 20, rh = 21;
    const c1W = Math.floor(CW * 0.44);
    const cW  = Math.floor((CW - c1W) / colHeaders.length);

    this.chk(hh + rows.length * rh + 8);

    // Header bar
    this.rect(ML, this.y - hh, CW, hh, C.navy);
    this.txt('Versicherung', ML + 5, this.y - 14, 7.5, 'b', C.white);
    let hx = ML + c1W;
    for (const col of colHeaders) {
      this.txt(col, hx + 5, this.y - 14, 7, 'b', C.white);
      hx += cW;
    }
    this.y -= hh;

    for (let r = 0; r < rows.length; r++) {
      const bg = r % 2 === 0 ? C.fieldBg : C.rowAlt;
      this.rect(ML, this.y - rh, CW, rh, bg, C.border, 0.3);
      // Row label
      this.txt(rows[r], ML + 5, this.y - rh / 2 - 3, 7.5, 'r', C.dark);
      // ja / nein per column
      let cx = ML + c1W;
      for (let ci = 0; ci < colHeaders.length; ci++) {
        const cbSz = 8, cbY = this.y - rh / 2 - 3;
        this.addCB(cx + 6,          cbY, cbSz);
        this.txt('ja',   cx + 6 + cbSz + 2,    cbY + 1, 7);
        this.addCB(cx + cW / 2 + 2, cbY, cbSz);
        this.txt('nein', cx + cW / 2 + 2 + cbSz + 2, cbY + 1, 7);
        cx += cW;
      }
      this.y -= rh;
    }
    this.sp(8);
  }

  // Table with all text-field cells
  tbl(headers, colWidths, rowCount, rowH = 17) {
    const hh    = 17;
    const total = colWidths.reduce((s, w) => s + w, 0);
    const sw    = colWidths.map(w => Math.floor((w / total) * CW));
    this.chk(hh + rowCount * rowH + 8);

    this.rect(ML, this.y - hh, CW, hh, C.navy);
    let x = ML;
    for (let i = 0; i < headers.length; i++) {
      this.txt(headers[i], x + 4, this.y - 12, 7, 'b', C.white);
      x += sw[i];
    }
    this.y -= hh;

    for (let r = 0; r < rowCount; r++) {
      const bg = r % 2 === 0 ? C.fieldBg : C.rowAlt;
      x = ML;
      for (let ci = 0; ci < headers.length; ci++) {
        this.rect(x, this.y - rowH, sw[ci], rowH, bg, C.border, 0.3);
        this.addTF(x, this.y - rowH, sw[ci], rowH);
        x += sw[ci];
      }
      this.y -= rowH;
    }
    this.sp(8);
  }

  // ── TOC PAGE ──────────────────────────────────────────────────
  drawTOC() {
    const p = this.tocPage, f = this.fonts;

    // Title block
    p.drawRectangle({ x: ML, y: PH - MT - 72, width: CW, height: 72, color: C.navy });
    p.drawRectangle({ x: ML, y: PH - MT - 72, width: 4,  height: 72, color: C.gold });
    p.drawText('Fragebogen Unternehmenskunden', {
      x: ML + 14, y: PH - MT - 28, font: f.b, size: 16, color: C.white });
    p.drawText('Erstgespraech  –  Gewerbeversicherungen & Betriebliche Vorsorge', {
      x: ML + 14, y: PH - MT - 48, font: f.r, size: 9, color: rgb(0.78, 0.86, 0.95) });
    // Gold rule
    p.drawLine({ start: { x: ML, y: PH - MT - 84 }, end: { x: ML + CW, y: PH - MT - 84 },
      thickness: 2, color: C.gold });

    p.drawText('Inhalt', {
      x: ML, y: PH - MT - 108, font: f.b, size: 12, color: C.navy });

    let ty = PH - MT - 132;
    for (let i = 0; i < this.sections.length; i++) {
      const { title, page } = this.sections[i];
      const pageStr = `Seite ${page}`;
      const pgW     = f.b.widthOfTextAtSize(pageStr, 9);
      const titleW  = f.r.widthOfTextAtSize(title, 9);

      // Alternating row
      if (i % 2 === 0)
        p.drawRectangle({ x: ML, y: ty - 5, width: CW, height: 19, color: rgb(0.95, 0.96, 0.99) });

      p.drawText(title, { x: ML + 6, y: ty + 2, font: f.r, size: 9, color: C.dark });

      // Leader dots
      const dotX0 = ML + 6 + titleW + 4;
      const dotX1 = ML + CW - pgW - 8;
      if (dotX1 > dotX0 + 10) {
        const dots = '.'.repeat(Math.max(0, Math.floor((dotX1 - dotX0) / 3.6)));
        p.drawText(dots, { x: dotX0, y: ty + 2, font: f.r, size: 9, color: C.gray });
      }

      p.drawText(pageStr, { x: ML + CW - pgW - 2, y: ty + 2, font: f.b, size: 9, color: C.navy });
      ty -= 20;
    }

    // Footer
    p.drawText('Fragebogen Unternehmenskunden  |  Erstgespraech', {
      x: ML, y: 20, font: f.r, size: 6.5, color: C.gray });
    p.drawText('Seite 1', {
      x: PW - MR - 32, y: 20, font: f.r, size: 7, color: C.gray });
  }

  async save(path) {
    const bytes = await this.doc.save();
    fs.writeFileSync(path, bytes);
    console.log(`Gespeichert: ${path}  (${Math.round(bytes.length / 1024)} KB, ${this.pages.length} Seiten)`);
  }
}

// ================================================================
//  BUILD
// ================================================================
async function build() {
  const g = new Gen();
  await g.init();
  g.startContent(); // Page 2+

  // Title strip on first content page
  g.rect(ML, PH - MT - 56, CW, 56, C.navy);
  g.rect(ML, PH - MT - 56, 4,  56, C.gold);
  g.txt('Fragebogen Unternehmenskunden', ML + 14, PH - MT - 24, 14, 'b', C.white);
  g.txt('Erstgespraech  –  Gewerbeversicherungen & Betriebliche Vorsorge',
        ML + 14, PH - MT - 44, 8.5, 'r', rgb(0.78, 0.86, 0.95));
  g.y -= 68;

  // Makler-Info box
  g.sp(6);
  g.rect(ML, g.y, CW, 3, C.gold);
  g.sp(3);
  g.rect(ML, g.y - 96, CW, 96, rgb(0.97, 0.97, 0.99), C.border);
  g.sp(10);
  g.txt('Berater / Makler-Information', ML + 8, g.y, 9, 'b', C.navy);
  g.sp(16);
  g.row([{ label: 'Vertriebspartner / Makler-Name' }, { label: 'Kennung / Maklernummer', w: 0.30 }]);
  g.row([{ label: 'Datum', w: 0.20 }, { label: 'Uhrzeit von-bis', w: 0.24 }, { label: 'Gespraechsteilnehmer' }]);
  g.inline('Art:', ['persoenlich', 'telefonisch', 'Online-Meeting']);
  g.sp(10);

  // ── A ────────────────────────────────────────────────────────
  g.header('A  –  Firmenstammdaten & Betriebsstaetten');
  g.row([{ label: 'Firma / Unternehmensname' }, { label: 'Rechtsform', w: 0.24 }]);
  g.row([{ label: 'Betriebsart / Taetigkeitsfeld' }, { label: 'Gruendungsdatum', w: 0.22 }]);
  g.field('Homepage');

  g.sub('Ansprechpartner');
  g.row([{ label: 'Name, Vorname' }, { label: 'Position / Titel', w: 0.30 }]);
  g.row([{ label: 'Geburtsdatum', w: 0.24 }, { label: 'Anrede (Herr/Frau)', w: 0.22 }]);

  g.sub('Adresse Hauptsitz');
  g.row([{ label: 'Strasse / Hausnummer' }, { label: 'PLZ', w: 0.13 }, { label: 'Ort', w: 0.32 }]);
  g.row([{ label: 'Telefon', w: 0.32 }, { label: 'Telefax', w: 0.26 }, { label: 'Mobil', w: 0.26 }]);
  g.field('E-Mail');

  g.sub('Betriebsstaetten (weitere Standorte)');
  for (let i = 1; i <= 3; i++) {
    g.row([{ label: `Betriebsstaette ${i}  –  Strasse / Nr.` }, { label: 'PLZ', w: 0.13 }, { label: 'Ort', w: 0.27 }]);
    g.sp(5);                      // ← gap BEFORE inline checkbox
    g.inline('', ['nur Lager']);  // ← inline now uses y -= 26 → no overlap
  }
  g.field('Weitere rechtl. selbst./unselbst. Firmen');
  g.row([{ label: 'Niederlassungen Inland' }, { label: 'Niederlassungen Ausland' }]);

  // ── B ────────────────────────────────────────────────────────
  g.header('B  –  Unternehmenskennzahlen');

  g.sub('Mitarbeiterstruktur');
  g.row([
    { label: 'Gesamt',   w: 0.13 }, { label: 'Vollzeit', w: 0.13 },
    { label: 'Teilzeit', w: 0.13 }, { label: 'Minijob',  w: 0.13 }, { label: 'Azubi', w: 0.13 },
  ]);
  g.row([{ label: 'davon kaufmaennisch', w: 0.30 }, { label: 'davon gewerblich', w: 0.30 }, { label: 'Inhaber / GF', w: 0.26 }]);

  g.sub('Finanzkennzahlen');
  g.row([{ label: 'Jahresumsatz netto (EUR)' }, { label: 'Brutto-Lohn-/Gehaltssumme gesamt ohne Inhaber (EUR)' }]);
  g.row([{ label: 'davon kaufmaennisch (EUR)' }, { label: 'davon gewerblich (EUR)' }]);
  g.row([{ label: 'Aufwendungen Subunternehmen p.a. (EUR)' }, { label: 'Wareneinsatz p.a. (EUR)' }]);

  g.sub('Taetigkeitsbeschreibung mit %-Aufteilung');
  g.tbl(['%', 'Taetigkeitsbeschreibung'], [10, 90], 5);

  // ── C  bAV ───────────────────────────────────────────────────
  g.header('C  –  Betriebliche Altersvorsorge (bAV)');
  g.note('Seit dem BRSG/BRSG II gibt es klare Pflichten bei der bAV – haben Sie das sauber geloest? Wie viele Mitarbeiter haben einen bAV-Vertrag, und zahlen Sie den Pflichtzuschuss von mind. 15 %?');

  g.inline('bAV-Loesung vorhanden?', ['ja', 'nein']);
  g.sub('Wenn ja – Details');
  g.txt('Durchfuehrungsweg:', ML, g.y, 8, 'b'); g.y -= 15;
  g.cbGrid(['Direktversicherung', 'Pensionskasse', 'Pensionsfonds', 'Unterstuetzungskasse', 'Direktzusage'], 3);
  g.row([{ label: 'Anbieter / Gesellschaft' }, { label: 'Anzahl teilnehmende MA', w: 0.28 }]);
  g.inline('AG-Zuschuss vorhanden?', ['ja', 'nein']);
  g.row([{ label: 'Hoehe AG-Zuschuss (%)', w: 0.30 }, { label: 'BRSG-konform (>= 15 %)?', w: 0.34 }]);

  g.sub('Eingeschlossene MA-Gruppen');
  g.cbGrid(['alle MA', 'nur GF/Fuehrungskraefte', 'nur kaufmaennisch', 'individuell'], 4);
  g.inline('Kennen MA ihre bAV-Ansprueche?', ['ja', 'nein']);
  g.inline('MA ohne bAV-Vertrag vorhanden?', ['ja', 'nein'], { label: 'Anzahl:', w: 70 });

  g.sub('Beratungswunsch');
  g.cbGrid(['Ersteinrichtung', 'Optimierung bestehend', 'BRSG II Check', 'Ueberpruefung Anbieter'], 4);

  // ── D  bKV ───────────────────────────────────────────────────
  g.header('D  –  Betriebliche Krankenversicherung (bKV)');
  g.note('Nutzen Sie schon eine bKV als Mitarbeiter-Benefit? Im Fachkraeftewettbewerb ist das ein guenstiger Hebel – ca. 30-50 EUR pro Monat pro Mitarbeiter.');

  g.inline('bKV vorhanden?', ['ja', 'nein']);
  g.row([{ label: 'Wenn ja – Anbieter' }, { label: 'Aktuelle Bausteine (Freitext)', w: 0.40 }]);

  g.sub('Gewuenschte Bausteine');
  g.cbGrid(['Zahn', 'Brille', 'Krankentagegeld', 'Stationaer', 'Ambulant', 'Vorsorge', 'Heilpraktiker'], 4);

  g.sub('Details');
  g.txt('Budget pro MA/Monat:', ML, g.y, 8, 'b'); g.y -= 15;
  g.cbGrid(['< 25 EUR', '25-50 EUR', '50-100 EUR', '> 100 EUR', 'individuell'], 5);
  g.row([{ label: 'Anzahl einzuschliessende MA', w: 0.38 }]);
  g.inline('Familienangehoerige einschliessen?', ['ja', 'nein']);
  g.inline('Beratungswunsch:', ['Neuabschluss', 'Optimierung bestehend']);

  // ── E  Haftpflicht ───────────────────────────────────────────
  g.header('E  –  Firmen-Haftpflichtversicherungen');
  g.note('Wenn morgen ein Mitarbeiter beim Kunden einen Schaden verursacht – wer haftet, und bis zu welcher Hoehe sind Sie abgesichert?');

  g.sub('Beitraege Mitbewerber (aktuell gezahlt)');
  g.tbl(['Sparte', 'EUR / Jahr'], [65, 35], 5);

  g.sub('Vorschaeden letzte 5 Jahre (Elementar: 10 Jahre)');
  g.inline('', ['keine Vorschaeden', 'ja – Vorschaeden vorhanden']);
  g.field('Schadentage, -hoehe, Sparte');

  g.sub('Versicherungsuebersicht Haftpflicht');
  g.insTable(
    ['Betriebs- & Berufshaftpflicht', 'Umwelthaftpflicht / Oekohaftpflicht',
     'D&O (Managerhaftpflicht)', 'Berufshaftpflicht (spez.)',
     'Vertrauensschadenversicherung', 'Betriebsschliessungsversicherung'],
    ['vorhanden?', 'Angebot?', 'Schaden <5 J.?']
  );

  g.sub('Zusaetzliche Einschluesse');
  g.cbGrid(['Privathaftpflicht fuer Inhaber/GF', 'Tierhalterhaftpflicht'], 2);
  g.row([{ label: 'Anzahl Hunde', w: 0.20 }, { label: 'Rassen' }]);

  // ── F  Sach ──────────────────────────────────────────────────
  g.header('F  –  Firmen-Sachversicherungen');

  g.sub('Geschaefts-Inhaltsversicherung');
  g.field('Art der Vorraete / Waren');
  g.txt('Gewuenschte Gefahren:', ML, g.y, 8, 'b'); g.y -= 15;
  g.cbGrid([
    'Feuer (inkl. BU?)', 'Einbruchdiebstahl/Vandalismus (inkl. BU?)',
    'Leitungswasser (inkl. BU?)', 'Sturm/Hagel (inkl. BU?)',
    'Elementar (inkl. BU?)', 'Elektronik (inkl. BU?)',
  ], 3);

  g.sub('Versicherungssummen');
  g.row([
    { label: 'Betriebseinrichtung Neuwert (EUR)', w: 0.27 },
    { label: 'Vorraete/Waren (EUR)', w: 0.22 },
    { label: 'Vorsorge (EUR)', w: 0.22 },
    { label: 'Klein-BU (EUR)' },
  ]);

  g.sub('Gebaeude');
  g.txt('Art des Gebaeudes:', ML, g.y, 8, 'b'); g.y -= 15;
  g.cbGrid(['Wohn-/Geschaeftshaus', 'Geschaeftshaus', 'Pavillon', 'Garage', 'Container'], 5);
  g.txt('Bauweise:', ML, g.y, 8, 'b'); g.y -= 15;
  g.cbGrid(['Stein/Beton mit Ziegel-/Schieferbedachung'], 1);
  g.field('Andere Bauweise (Details)');
  g.inline('Das Gebaeude ist:', ['gemietet', 'gepachtet', 'Eigenbesitz']);
  g.inline('Weitere Betriebe in Versicherungsraeumen?', ['nein', 'ja'], { label: 'Welche:', w: 130 });

  g.sub('Weitere Sachversicherungen');
  g.insTable(
    ['Ertragsausfall / Betriebsunterbrechung', 'Immobilien (Eigenbesitz)'],
    ['vorhanden?', 'Angebot gewuenscht?']
  );

  // ── G  Elektronik & Glas ─────────────────────────────────────
  g.header('G  –  Elektronik- & Glasversicherung');

  g.sub('Elektronikversicherung');
  g.row([{ label: 'Versicherungssumme (EUR)', w: 0.38 }]);
  g.txt('Zusaetzliche Einschluesse:', ML, g.y, 8, 'b'); g.y -= 15;
  g.cbGrid(['Softwareversicherung', 'Mehrkostenversicherung'], 2);
  g.txt('Vorhandene Geraetegruppen:', ML, g.y, 8, 'b'); g.y -= 15;
  g.cbGrid([
    'Daten-, Kommunikations- & Burotechnik', 'Mess-, Pruef-, Prozesstechnik, Kassen',
    'Satz- & Repro-Technik', 'Bild- & Tontechnik', 'Medizintechnik',
  ], 3);
  g.insTable(
    ['Maschinenversicherung', 'Maschinen-Betriebsunterbrechung'],
    ['vorhanden?', 'Angebot gewuenscht?']
  );

  g.sub('Glasversicherung');
  g.row([{ label: 'Nutzflaeche des Betriebes (qm)', w: 0.35 }]);
  g.inline('Scheiben mit Einzelgroesse > 6 qm?', ['nein', 'ja']);
  g.row([{ label: 'Masse der grossen Scheiben (qm)', w: 0.46 }]);
  g.inline('Werbeanlagen?', ['nein', 'ja'], { label: 'Neuwert (EUR):', w: 100 });

  // ── H  Rechtsschutz ──────────────────────────────────────────
  g.header('H  –  Rechtsschutzversicherung');
  g.note('Wenn ein Mitarbeiter Sie verklagt oder ein Lieferantenstreit eskaliert – was kostet Sie das ohne Rechtsschutz, und wer uebernimmt die Anwaltskosten?');

  g.sub('Firmenrechtsschutz – Bausteine');
  g.cbGrid(['allgemein', 'Arbeitsrechtsschutz', 'Verkehrsrechtsschutz', 'Immobilienrechtsschutz', 'Vertragsrechtsschutz'], 3);
  g.row([{ label: 'Selbstbeteiligung Firma (EUR)', w: 0.35 }]);

  g.sub('Privatrechtsschutz GF / Inhaber');
  g.cbGrid(['allgemein', 'Arbeitnehmerrechtsschutz', 'Verkehrsrechtsschutz', 'Immobilienrechtsschutz'], 4);
  g.cbGrid(['erweiterter Straf-Rechtsschutz fuer Inhaber/GF'], 1);
  g.row([{ label: 'Selbstbeteiligung privat (EUR)', w: 0.35 }]);
  g.field('Besonderheiten (z.B. Vermieter-Rechtsschutz)');
  g.insTable(
    ['Firmenrechtsschutz', 'Straf-Rechtsschutz', 'Privatrechtsschutz GF'],
    ['vorhanden?', 'Angebot gewuenscht?']
  );

  // ── I  KFZ ───────────────────────────────────────────────────
  g.header('I  –  KFZ-Flotte & Werkverkehr / Transport');

  g.sub('Firmen-KFZ');
  g.row([{ label: 'Anzahl PKW', w: 0.25 }, { label: 'Anzahl LKW / Nutzfahrzeuge', w: 0.32 }]);
  g.insTable(['PKW', 'Nutzfahrzeuge / LKW'], ['vorhanden?', 'Angebot?']);

  g.sub('Werkverkehr / Transport');
  g.row([
    { label: 'Anzahl PKW im Werkverkehr', w: 0.28 },
    { label: 'Anzahl LKW im Werkverkehr', w: 0.28 },
    { label: 'Max. Transportwert in allen Fzg. (EUR)' },
  ]);
  g.insTable(['Warentransport / Werkverkehr', 'Verkehrshaftung'], ['vorhanden?', 'Angebot gewuenscht?']);

  // ── J  Cyber ─────────────────────────────────────────────────
  g.header('J  –  Cyber & IT-Sicherheit');
  g.note('Ein Hackerangriff legt Betriebe im Schnitt 3 Wochen still – was wuerde das fuer Ihren Umsatz bedeuten? Verarbeiten Sie Kundendaten? Dann sind Sie DSGVO-pflichtig und haften persoenlich.');

  g.inline('Cyberversicherung vorhanden?', ['nein', 'ja']);
  g.txt('Homeoffice-Anteil MA:', ML, g.y, 8, 'b'); g.y -= 15;
  g.cbGrid(['0%', '< 25%', '25-50%', '> 50%'], 4);
  g.inline('Verarbeitung personenbezogener Daten (DSGVO)?', ['ja', 'nein']);
  g.inline('Online-Shop / E-Commerce vorhanden?', ['ja', 'nein']);
  g.inline('Kritische IT-Infrastruktur (Produktion/Steuerung)?', ['ja', 'nein']);
  g.txt('Letzte IT-Sicherheitspruefung:', ML, g.y, 8, 'b'); g.y -= 15;
  g.cbGrid(['< 1 Jahr', '1-3 Jahre', '> 3 Jahre', 'nie durchgefuehrt'], 4);
  g.inline('Interesse an Cyber-Angebot?', ['ja', 'nein']);

  // ── K  Weitere ───────────────────────────────────────────────
  g.header('K  –  Weitere Firmenversicherungen');
  g.insTable(
    ['Firmen-Gruppenunfall', 'Warenkredit', 'Buergschaft (Avalkredit)', 'Reiseversicherung'],
    ['vorhanden?', 'Angebot?', 'Schaden <5 J.?']
  );

  // ── L  Personenversicherungen ─────────────────────────────────
  g.header('L  –  Personenversicherungen GF / Inhaber');
  g.note('Haben Sie als Geschaeftsfuehrer eine steueroptimierte Altersvorsorge ueber die Firma? Wenn Sie morgen berufsunfaehig werden – was passiert mit dem Betrieb und Ihrer Familie?');
  g.insTable(
    ['Berufsunfaehigkeit (BU)', 'Risikolebensversicherung',
     'Dienstunfaehigkeitsversicherung', 'Private Altersvorsorge', 'Pflegeversicherung (privat)'],
    ['vorhanden?', 'Angebot gewuenscht?']
  );
  g.inline('Krankenversicherung GF:', ['PKV', 'GKV'], { label: 'Anbieter:', w: 120 });

  // ── M  Ergebnis ──────────────────────────────────────────────
  g.header('M  –  Ergebnis & Naechste Schritte');
  g.area('Priorisierte Handlungsfelder', 3);
  g.area('Vereinbarte Massnahmen / Empfohlene Gesellschaft', 2);

  g.sub('Empfohlene Produkte / Konditionen');
  g.tbl(['Sparte', 'Gesellschaft', 'Beitrag EUR', 'Zahlweise', 'Beginn'], [26, 28, 18, 14, 14], 5);

  g.inline('', ['Kunde lehnt Angebot ab', 'Kunde stimmt Angebot zu']);
  g.row([{ label: 'Naechster Termin / Wiedervorlage', w: 0.50 }]);
  g.area('Bemerkungen', 4);

  // Bestaetigung
  g.chk(100);
  g.sp(12);
  const ct = 'Der Kunde hat zu den beantragten Versicherungen die Allgemeinen Versicherungsbedingungen und den persoenlichen Vertragsvorschlag erhalten. Dem Kunden wurden die besprochenen Versicherungsrisiken ausfuehrlich und verstaendlich erlaeutert, dabei wurde ausdruecklich auf finanzielle und existenzielle Risiken hingewiesen. Der Berater vermittelt im Namen der jeweiligen Gesellschaft die angebotenen Produkte; es gelten die aktuellen Versicherungsbedingungen.';
  const cl = g.wrap(ct, 7.5, CW - 22);
  const ch = cl.length * 10 + 24;
  g.rect(ML, g.y - ch, CW, ch, C.noteBg, C.border);
  g.txt('Bestaetigung', ML + 8, g.y - 15, 8, 'b', C.navy);
  let cy2 = g.y - 28;
  for (const l of cl) { g.txt(l, ML + 8, cy2, 7.5, 'r', C.dark); cy2 -= 10; }
  g.y -= ch;
  g.sp(16);

  // Unterschriften
  g.chk(82);
  g.sub('Unterschriften');
  const sigH = 52, sW = Math.floor(CW / 3);
  const sHdr = ['Ort, Datum', 'Unterschrift Kunde', 'Unterschrift Berater'];
  g.rect(ML, g.y - 19, CW, 19, C.navy);
  for (let i = 0; i < 3; i++) g.txt(sHdr[i], ML + i * sW + 5, g.y - 13, 7.5, 'b', C.white);
  g.y -= 19;
  g.rect(ML, g.y - sigH, CW, sigH, C.fieldBg, C.border);
  for (let i = 0; i < 3; i++) g.addTF(ML + i * sW, g.y - sigH, sW, sigH);
  g.y -= sigH;

  // Fill in TOC page
  g.drawTOC();

  await g.save('C:/Users/const/fragebogen-erstgespraech/fragebogen-acroform.pdf');
}

build().catch(err => { console.error(err); process.exit(1); });
