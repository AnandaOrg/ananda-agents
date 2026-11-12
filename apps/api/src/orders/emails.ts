import { formatDate, formatMoney, type ProformaLanguage } from '@ananda-agents/shared';
import type { OrderRecord } from './order-rows';

// Customer-facing e-mails in the proforma's language (EN or BG), independent of the agent's UI language.

export function proformaEmail(o: OrderRecord, customerName: string, agentName: string): { subject: string; text: string } {
  const money = formatMoney(o.totalCents, o.language);
  const valid = formatDate(o.validUntil, o.language, { year: true });
  const hold = formatDate(o.holdUntil, o.language, { year: true });
  if (o.language === 'bg') {
    return {
      subject: `Проформа ${o.number} от ANANDA – ${money}`,
      text: `Здравейте,\n\nПрилагаме проформа фактура ${o.number} за ${customerName} на стойност ${money}.\nПроформата е валидна до ${valid}. Стоката е запазена до ${hold} и се изпраща след получаване на плащането.\n\nМоля, посочете ${o.number} като основание за превода.\n\nПоздрави,\n${agentName}\nANANDA`,
    };
  }
  return {
    subject: `ANANDA proforma ${o.number} – ${money}`,
    text: `Hello,\n\nPlease find attached proforma ${o.number} for ${customerName}, total ${money}.\nIt is valid until ${valid}. Your stock is held until ${hold} and ships once we receive payment.\n\nPlease quote ${o.number} as the payment reference.\n\nBest regards,\n${agentName}\nANANDA`,
  };
}

export function reminderDraft(o: OrderRecord, lang: ProformaLanguage, daysLate: number, agentName: string): { subject: string; body: string } {
  const money = formatMoney(o.totalCents, lang);
  const due = formatDate(o.dueDate, lang, { year: true });
  if (lang === 'bg') {
    return {
      subject: `Напомняне: проформа ${o.number} – ${money}`,
      body: `Здравейте,\n\nПроформа ${o.number} на стойност ${money} беше с падеж ${due}${daysLate > 0 ? ` и е просрочена с ${daysLate} дни` : ''}. Все още не сме получили плащането.\n\nМоля, преведете сумата с основание ${o.number}. Ако вече сте платили, моля, изпратете ни платежното нареждане.\n\nБлагодаря!\n${agentName}\nANANDA`,
    };
  }
  return {
    subject: `Reminder: proforma ${o.number} – ${money}`,
    body: `Hello,\n\nProforma ${o.number} for ${money} was due on ${due}${daysLate > 0 ? ` and is now ${daysLate} day${daysLate === 1 ? '' : 's'} late` : ''}. We have not received the payment yet.\n\nPlease transfer the amount quoting ${o.number}. If you have already paid, just reply with the payment confirmation.\n\nThank you,\n${agentName}\nANANDA`,
  };
}
