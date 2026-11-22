import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { FLAVOUR_NAMES, formatDate, formatMoney, type Flavour, type ProformaLanguage } from '@ananda-agents/shared';
import type { OrderRecord } from './order-rows';
import { rtlFragments, wrapLines } from './rtl';

// Literal paths so the deployment bundler (Vercel) ships the font files with the function.
// DejaVu Sans covers Latin, Cyrillic and Hebrew.
const FONT_REGULAR = require.resolve('dejavu-fonts-ttf/ttf/DejaVuSans.ttf');
const FONT_BOLD = require.resolve('dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf');

interface Copy {
  title: string;
  no: string;
  issued: string;
  validUntil: string;
  due: string;
  billTo: string;
  deliverTo: string;
  vat: string;
  customerNo: string;
  flavour: string;
  cartons: string;
  units: string;
  unitPrice: string;
  amount: string;
  net: string;
  vatLine: string;
  vat0: string;
  reverse: string;
  total: string;
  payTitle: string;
  pay: (n: string) => string;
  hold: (d: string) => string;
  bank: string;
  instructions: string;
  agent: string;
  note: string;
}

const L: Record<ProformaLanguage, Copy> = {
  en: {
    title: 'PROFORMA INVOICE',
    no: 'No.',
    issued: 'Issue date',
    validUntil: 'Valid until',
    due: 'Payment due',
    billTo: 'Bill to',
    deliverTo: 'Deliver to',
    vat: 'VAT No.',
    customerNo: 'Customer No.',
    flavour: 'Flavour',
    cartons: 'Cartons',
    units: 'Units',
    unitPrice: 'Unit price',
    amount: 'Amount',
    net: 'Net',
    vatLine: 'VAT 20%',
    vat0: 'VAT 0%',
    reverse: 'VAT 0% · intra-Community supply, reverse charge (Art. 138 Directive 2006/112/EC)',
    total: 'Total',
    payTitle: 'How to pay',
    pay: (n) => `Bank transfer to the account below, quoting ${n} as the payment reference.`,
    hold: (d) => `Your stock is held until ${d}. It ships once the payment is confirmed.`,
    bank: 'Bank',
    instructions: 'Delivery instructions',
    agent: 'Your sales agent',
    note: 'This is a payment request, not a tax invoice. The invoice follows delivery.',
  },
  bg: {
    title: 'ПРОФОРМА ФАКТУРА',
    no: '№',
    issued: 'Дата на издаване',
    validUntil: 'Валидна до',
    due: 'Срок за плащане',
    billTo: 'Получател',
    deliverTo: 'Адрес за доставка',
    vat: 'ДДС №',
    customerNo: 'Клиентски №',
    flavour: 'Вкус',
    cartons: 'Кашони',
    units: 'Бройки',
    unitPrice: 'Ед. цена',
    amount: 'Стойност',
    net: 'Данъчна основа',
    vatLine: 'ДДС 20%',
    vat0: 'ДДС 0%',
    reverse: 'ДДС 0% · вътреобщностна доставка, обратно начисляване (чл. 138 Директива 2006/112/ЕО)',
    total: 'Общо',
    payTitle: 'Начин на плащане',
    pay: (n) => `Банков превод по сметката по-долу с основание ${n}.`,
    hold: (d) => `Стоката е запазена до ${d} и се изпраща след потвърждаване на плащането.`,
    bank: 'Банка',
    instructions: 'Указания за доставка',
    agent: 'Вашият търговски представител',
    note: 'Това е искане за плащане, а не данъчна фактура. Фактурата се издава след доставката.',
  },
  he: {
    title: 'חשבונית פרופורמה',
    no: 'מס׳',
    issued: 'תאריך הנפקה',
    validUntil: 'בתוקף עד',
    due: 'מועד התשלום',
    billTo: 'לחיוב',
    deliverTo: 'כתובת למשלוח',
    vat: 'מס׳ מע״מ',
    customerNo: 'מס׳ לקוח',
    flavour: 'טעם',
    cartons: 'קרטונים',
    units: 'יחידות',
    unitPrice: 'מחיר ליחידה',
    amount: 'סכום',
    net: 'סכום לפני מע״מ',
    vatLine: 'מע״מ 20%',
    vat0: 'מע״מ 0%',
    reverse: 'מע״מ 0% · אספקה תוך-קהילתית, חיוב הפוך (סעיף 138 להנחיה \u20662006/112/EC\u2069)',
    total: 'סה״כ',
    payTitle: 'אופן התשלום',
    pay: (n) => `העברה בנקאית לחשבון שלהלן, עם ${n} כאסמכתא לתשלום.`,
    hold: (d) => `המלאי שלכם שמור עד ${d}. המשלוח יוצא לאחר אישור התשלום.`,
    bank: 'בנק',
    instructions: 'הוראות משלוח',
    agent: 'איש המכירות שלכם',
    note: 'זוהי דרישת תשלום ולא חשבונית מס. החשבונית תונפק לאחר המסירה.',
  },
};

export interface ProformaInput {
  order: OrderRecord;
  lines: { flavour: Flavour; cartons: number; units: number; unitPriceCents: number; lineNetCents: number }[];
  agent: { name: string; email: string; phone: string | null };
}

const seller = () => ({
  name: process.env.SELLER_NAME ?? 'ANANDA Ltd. (demo details)',
  address: process.env.SELLER_ADDRESS ?? 'Sofia, Bulgaria',
  vat: process.env.SELLER_VAT ?? 'BG000000000',
  iban: process.env.SELLER_IBAN ?? 'BG00 XXXX 0000 0000 0000 00',
  bank: process.env.SELLER_BANK ?? 'Bank (set SELLER_BANK)',
  email: process.env.SELLER_EMAIL ?? 'office@ananda.test',
});

type Align = 'left' | 'right';

/** Proforma PDF (FR-15) in English, Bulgarian or Hebrew (mirrored, right to left). Built from the order's
 *  own snapshot so a later customer edit never changes it. */
@Injectable()
export class ProformaService {
  render({ order, lines, agent }: ProformaInput): Promise<Buffer> {
    const lang: ProformaLanguage = order.language;
    const rtl = lang === 'he';
    const t = L[lang];
    const money = (c: number) => formatMoney(c, lang);
    const date = (d: string | Date) => formatDate(d, lang, { year: true });
    const s = seller();

    // `font` replaces pdfkit's default Helvetica, whose data it loads in a way bundlers can't trace.
    const doc = new PDFDocument({ size: 'A4', margin: 48, font: FONT_REGULAR, info: { Title: `${t.title} ${order.number}`, Author: s.name } });
    doc.registerFont('regular', FONT_REGULAR);
    doc.registerFont('bold', FONT_BOLD);
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

    const left = 48;
    const width = doc.page.width - 96;
    const muted = '#6B6A64';
    const ink = '#1D1D1B';

    // Layout is written left-to-right; in Hebrew every box is mirrored and alignment flips.
    const X = (x: number, w: number) => (rtl ? left + width - (x - left) - w : x);
    const A = (a: Align): Align => (rtl ? (a === 'left' ? 'right' : 'left') : a);
    /** Draw text in a box; returns the y below it. */
    const put = (text: string, x: number, y: number, w: number, align: Align = 'left', opts: { spacing?: number } = {}) => {
      const characterSpacing = rtl ? 0 : (opts.spacing ?? 0);
      if (!rtl) {
        doc.text(text, x, y, { width: w, align, characterSpacing });
        return doc.y;
      }
      let yy = y;
      const space = doc.widthOfString(' ');
      for (const line of wrapLines(text, w, (str) => doc.widthOfString(str))) {
        const parts = rtlFragments(line);
        // Each fragment is measured as drawn.
        const total = parts.reduce((sum, p) => sum + doc.widthOfString(p), 0) + space * Math.max(0, parts.length - 1);
        let px = A(align) === 'right' ? X(x, w) + w - total : X(x, w);
        for (const part of parts) {
          doc.text(part, px, yy, { lineBreak: false });
          px += doc.widthOfString(part) + space;
        }
        yy += doc.currentLineHeight(true);
      }
      doc.y = yy;
      return yy;
    };
    const label = (text: string, x: number, y: number, w: number, align: Align = 'left') => {
      doc.font('bold').fontSize(8).fillColor(muted);
      return put(text.toUpperCase(), x, y, w, align, { spacing: 0.6 });
    };

    // Seller (start side) and document title (end side)
    doc.font('bold').fontSize(22).fillColor(ink);
    put('ANANDA', left, 48, 200);
    doc.font('regular').fontSize(9).fillColor(muted);
    let y = 76;
    for (const l of [s.name, s.address, `${t.vat} ${s.vat}`, s.email]) y = put(l, left, y, 240);

    doc.font('bold').fontSize(14).fillColor(ink);
    y = put(t.title, left, 48, width, 'right');
    doc.font('regular').fontSize(10);
    y = put(`${t.no} ${order.number}`, left, y, width, 'right');
    doc.fontSize(9).fillColor(muted);
    y = put(`${t.issued}: ${date(order.issuedAt)}`, left, y, width, 'right');
    y = put(`${t.validUntil}: ${date(order.validUntil)}`, left, y, width, 'right');
    put(`${t.due}: ${date(order.dueDate)}`, left, y, width, 'right');

    // Parties
    const partyY = 150;
    const colW = (width - 24) / 2;
    const party = (x: number, title: string, linesOut: string[]) => {
      label(title, x, partyY, colW);
      doc.font('bold').fontSize(10).fillColor(ink);
      let py = put(linesOut[0], x, partyY + 14, colW);
      doc.font('regular').fontSize(9).fillColor(ink);
      for (const l of linesOut.slice(1)) py = put(l, x, py, colW);
    };
    const b = order.billTo;
    party(left, t.billTo, [b.name, b.address, `${t.vat} ${b.vatNumber}`, ...(b.customerNumber ? [`${t.customerNo} ${b.customerNumber}`] : [])]);
    party(left + colW + 24, t.deliverTo, [b.name, order.deliveryAddress, ...(order.deliveryInstructions ? [`${t.instructions}: ${order.deliveryInstructions}`] : [])]);

    // Lines
    y = 260;
    const cols: { label: string; x: number; w: number; align: Align }[] = [
      { label: t.flavour, x: left, w: 170, align: 'left' },
      { label: t.cartons, x: left + 170, w: 70, align: 'right' },
      { label: t.units, x: left + 240, w: 70, align: 'right' },
      { label: t.unitPrice, x: left + 310, w: 90, align: 'right' },
      { label: t.amount, x: left + 400, w: width - 400, align: 'right' },
    ];
    doc.rect(left, y - 6, width, 22).fill('#ECEBE4');
    for (const c of cols) label(c.label, c.x + 6, y, c.w - 12, c.align);
    y += 26;
    for (const l of lines) {
      doc.font('regular').fontSize(10).fillColor(ink);
      const cells = [FLAVOUR_NAMES[l.flavour], String(l.cartons), String(l.units), money(l.unitPriceCents), money(l.lineNetCents)];
      cols.forEach((c, i) => put(cells[i], c.x + 6, y, c.w - 12, c.align));
      y += 20;
      doc.moveTo(left, y - 5).lineTo(left + width, y - 5).strokeColor('#D8D6CC').lineWidth(0.5).stroke();
    }

    // Totals (end side)
    y += 8;
    const totalsX = left + width - 260;
    const totalRow = (text: string, value: string, bold = false) => {
      doc.font(bold ? 'bold' : 'regular').fontSize(bold ? 12 : 10).fillColor(ink);
      put(text, totalsX, y, 150);
      put(value, totalsX + 150, y, 110, 'right');
      y += bold ? 22 : 18;
    };
    totalRow(t.net, money(order.netCents));
    if (order.vatRateBp > 0) totalRow(t.vatLine, money(order.vatCents));
    else {
      doc.font('regular').fontSize(8).fillColor(muted);
      y = put(t.reverse, totalsX, y, 260) + 6;
      totalRow(t.vat0, money(0));
    }
    totalRow(t.total, money(order.totalCents), true);

    // Payment
    y += 18;
    label(t.payTitle, left, y, width);
    doc.font('regular').fontSize(10).fillColor(ink);
    y = put(t.pay(order.number), left, y + 14, width);
    y = put(`IBAN ${s.iban} · ${t.bank}: ${s.bank}`, left, y, width);
    put(t.hold(date(order.holdUntil)), left, y + 6, width);

    // Footer
    const footY = doc.page.height - 110;
    label(t.agent, left, footY, width);
    doc.font('regular').fontSize(9).fillColor(ink);
    put([agent.name, agent.phone, agent.email].filter(Boolean).join(' · '), left, footY + 13, width);
    doc.fontSize(8).fillColor(muted);
    put(t.note, left, footY + 34, width);

    doc.end();
    return done;
  }
}
