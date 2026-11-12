import type { ReactNode } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { AppShell } from '../../components/AppShell';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: ReactNode }) {
  // Cheap gate; the API validates the session on every call and the client redirects on 401.
  if (!(await cookies()).get('aa_session')) redirect('/login');
  return <AppShell>{children}</AppShell>;
}
