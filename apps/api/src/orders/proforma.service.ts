import { Injectable } from '@nestjs/common';
import { dirname, join } from 'node:path';
import PDFDocument from 'pdfkit';
import { FLAVOUR_NAMES, formatDate, formatMoney, type Flavour, type ProformaLanguage } from '@ananda-agents/shared';
import type { OrderRecord } from './order-rows';

const FONT_DIR = join(dirname(require.resolve('dejavu-fonts-ttf/package.json')), 'ttf');

const L = {
  en: {
    title: 'PROFORMA INVOICE',
    no: 'No.',
    issued: 'Issue date',
    validUntil: 'Valid until',
    due: 'Payment due',
    seller: 'Seller',
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
    reverse: 'VAT 0% · intra-Community supply, reverse charge (Art. 138 Directive 2006/112/EC)',
    total: 'Total',
    payTitle: 'How to pay',
    pay: (n: string) => `Bank transfer to the account below, quoting ${n} as the payment reference.`,
    hold: (d: string) => `Your stock is held until ${d}. It ships once the payment is confirmed.`,
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
    seller: 'Доставчик',
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
    reverse: 'ДДС 0% · вътреобщностна доставка, обратно начисляване (чл. 138 Директива 2006/112/ЕО)',
    total: 'Общо',
    payTitle: 'Начин на плащане',
    pay: (n: string) => `Банков превод по сметката по-долу с основание ${n}.`,
    hold: (d: string) => `Стоката е запазена до ${d} и се изпраща след потвърждаване на плащането.`,
    bank: 'Банка',
    instructions: 'Указания за доставка',
    agent: 'Вашият търговски представител',
    note: 'Това е искане за плащане, а не данъчна фактура. Фактурата се издава след доставката.',
  },
} as const;

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

/** Proforma PDF (FR-15). Built from the order's own snapshot so a later customer edit never changes it. */
@Injectable()
export class ProformaService {
  render({ order, lines, agent }: ProformaInput): Promise<Buffer> {
    const lang: ProformaLanguage = order.language;
    const t = L[lang];
    const money = (c: number) => formatMoney(c, lang);
    const date = (d: string | Date) => formatDate(d, lang, { year: true });
    const s = seller();

    const doc = new PDFDocument({ size: 'A4', margin: 48, info: { Title: `${t.title} ${order.number}`, Author: s.name } });
    doc.registerFont('regular', join(FONT_DIR, 'DejaVuSans.ttf'));
    doc.registerFont('bold', join(FONT_DIR, 'DejaVuSans-Bold.ttf'));
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

    const left = 48;
    const width = doc.page.width - 96;
    const muted = '#6B6A64';
    const ink = '#1D1D1B';

    doc.font('bold').fontSize(22).fillColor(ink).text('ANANDA', left, 48);
    doc.font('regular').fontSize(9).fillColor(muted).text(s.name, left, 76).text(s.address).text(`${t.vat} ${s.vat}`).text(s.email);

    doc.font('bold').fontSize(14).fillColor(ink).text(t.title, left, 48, { width, align: 'right' });
    doc.font('regular').fontSize(10).text(`${t.no} ${order.number}`, { width, align: 'right' });
    doc.fontSize(9).fillColor(muted);
    doc.text(`${t.issued}: ${date(order.issuedAt)}`, { width, align: 'right' });
    doc.text(`${t.validUntil}: ${date(order.validUntil)}`, { width, align: 'right' });
    doc.text(`${t.due}: ${date(order.dueDate)}`, { width, align: 'right' });

    // Parties
    const partyY = 150;
    const colW = (width - 24) / 2;
    const party = (x: number, label: string, linesOut: string[]) => {
      doc.font('bold').fontSize(8).fillColor(muted).text(label.toUpperCase(), x, partyY, { width: colW, characterSpacing: 0.6 });
      doc.font('bold').fontSize(10).fillColor(ink).text(linesOut[0], x, partyY + 14, { width: colW });
      doc.font('regular').fontSize(9).fillColor(ink);
      for (const l of linesOut.slice(1)) doc.text(l, { width: colW });
    };
    const b = order.billTo;
    party(left, t.billTo, [b.name, b.address, `${t.vat} ${b.vatNumber}`, ...(b.customerNumber ? [`${t.customerNo} ${b.customerNumber}`] : [])]);
    party(left + colW + 24, t.deliverTo, [b.name, order.deliveryAddress, ...(order.deliveryInstructions ? [`${t.instructions}: ${order.deliveryInstructions}`] : [])]);

    // Lines
    let y = 260;
    const cols = [
      { label: t.flavour, x: left, w: 170, align: 'left' as const },
      { label: t.cartons, x: left + 170, w: 70, align: 'right' as const },
      { label: t.units, x: left + 240, w: 70, align: 'right' as const },
      { label: t.unitPrice, x: left + 310, w: 90, align: 'right' as const },
      { label: t.amount, x: left + 400, w: width - 400, align: 'right' as const },
    ];
    doc.rect(left, y - 6, width, 22).fill('#ECEBE4');
    doc.font('bold').fontSize(8).fillColor(muted);
    for (const c of cols) doc.text(c.label.toUpperCase(), c.x + 6, y, { width: c.w - 12, align: c.align });
    y += 26;
    doc.font('regular').fontSize(10).fillColor(ink);
    for (const l of lines) {
      const cells = [FLAVOUR_NAMES[l.flavour], String(l.cartons), String(l.units), money(l.unitPriceCents), money(l.lineNetCents)];
      cols.forEach((c, i) => doc.text(cells[i], c.x + 6, y, { width: c.w - 12, align: c.align }));
      y += 20;
      doc.moveTo(left, y - 5).lineTo(left + width, y - 5).strokeColor('#D8D6CC').lineWidth(0.5).stroke();
    }

    // Totals
    y += 8;
    const totalsX = left + width - 260;
    const totalRow = (label: string, value: string, bold = false) => {
      doc.font(bold ? 'bold' : 'regular').fontSize(bold ? 12 : 10).fillColor(ink);
      doc.text(label, totalsX, y, { width: 150 });
      doc.text(value, totalsX + 150, y, { width: 110, align: 'right' });
      y += bold ? 22 : 18;
    };
    totalRow(t.net, money(order.netCents));
    if (order.vatRateBp > 0) totalRow(t.vatLine, money(order.vatCents));
    else {
      doc.font('regular').fontSize(8).fillColor(muted).text(t.reverse, totalsX, y, { width: 260 });
      y = doc.y + 6;
      totalRow('VAT 0%', money(0));
    }
    totalRow(t.total, money(order.totalCents), true);

    // Payment
    y += 18;
    doc.font('bold').fontSize(8).fillColor(muted).text(t.payTitle.toUpperCase(), left, y, { characterSpacing: 0.6 });
    doc.font('regular').fontSize(10).fillColor(ink).text(t.pay(order.number), left, y + 14, { width });
    doc.text(`IBAN ${s.iban} · ${t.bank}: ${s.bank}`, { width });
    doc.moveDown(0.5).text(t.hold(date(order.holdUntil)), { width });

    // Footer
    const footY = doc.page.height - 110;
    doc.font('bold').fontSize(8).fillColor(muted).text(t.agent.toUpperCase(), left, footY, { characterSpacing: 0.6 });
    doc.font('regular').fontSize(9).fillColor(ink).text([agent.name, agent.phone, agent.email].filter(Boolean).join(' · '), left, footY + 13, { width });
    doc.fontSize(8).fillColor(muted).text(t.note, left, footY + 34, { width });

    doc.end();
    return done;
  }
}
