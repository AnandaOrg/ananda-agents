import type { Locale } from '@ananda-agents/shared';

/** The sign-in link e-mail, in the person's app language. */
export function signInLinkEmail(locale: Locale, name: string, url: string, minutes: number): { subject: string; text: string } {
  const first = name.split(' ')[0];
  if (locale === 'bg')
    return {
      subject: 'Вашата връзка за вход в ANANDA',
      text: `Здравейте, ${first},\n\nВлезте в ANANDA с тази връзка:\n${url}\n\nТя работи ${minutes} минути и само веднъж. След нея ще ви поискаме кода от приложението за удостоверяване.\n\nАко не сте поискали вход, просто игнорирайте този имейл.\n\nANANDA`,
    };
  if (locale === 'he')
    return {
      subject: 'קישור הכניסה שלך ל-ANANDA',
      text: `שלום ${first},\n\nכניסה ל-ANANDA בקישור הזה:\n${url}\n\nהוא עובד ${minutes} דקות ופעם אחת בלבד. אחריו נבקש את הקוד מאפליקציית האימות.\n\nאם לא ביקשת להיכנס, אפשר להתעלם מהמייל הזה.\n\nANANDA`,
    };
  return {
    subject: 'Your ANANDA sign-in link',
    text: `Hello ${first},\n\nSign in to ANANDA with this link:\n${url}\n\nIt works for ${minutes} minutes and only once. After it, we'll ask for the code from your authenticator app.\n\nIf you didn't ask to sign in, you can ignore this e-mail.\n\nANANDA`,
  };
}
