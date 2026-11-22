import { formatDate, formatMoney, type ProformaLanguage } from '@ananda-agents/shared';
import type { OrderRecord } from './order-rows';

// Customer-facing e-mails in the proforma's language (EN, BG or HE), independent of the Broker's UI language.

export function proformaEmail(o: OrderRecord, customerName: string, agentName: string): { subject: string; text: string } {
  const money = formatMoney(o.totalCents, o.language);
  const valid = formatDate(o.validUntil, o.language, { year: true });
  const hold = formatDate(o.holdUntil, o.language, { year: true });
  if (o.language === 'he') {
    return {
      subject: `ANANDA פרופורמה ${o.number} – ${money}`,
      text: `שלום,\n\nמצורפת חשבונית פרופורמה ${o.number} עבור ${customerName}, על סך ${money}.\nהיא בתוקף עד ${valid}. המלאי שלכם שמור עד ${hold} והמשלוח יוצא לאחר קבלת התשלום.\n\nנא לציין ${o.number} כאסמכתא להעברה.\n\nבברכה,\n${agentName}\nANANDA`,
    };
  }
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
  if (lang === 'he') {
    return {
      subject: `תזכורת: פרופורמה ${o.number} – ${money}`,
      body: `שלום,\n\nמועד התשלום של פרופורמה ${o.number} על סך ${money} היה ${due}${daysLate > 0 ? ` והיא באיחור של ${daysLate === 1 ? 'יום אחד' : `${daysLate} ימים`}` : ''}. התשלום עדיין לא התקבל אצלנו.\n\nנא להעביר את הסכום עם ${o.number} כאסמכתא. אם כבר שילמתם, אפשר פשוט להשיב עם אישור ההעברה.\n\nתודה,\n${agentName}\nANANDA`,
    };
  }
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
