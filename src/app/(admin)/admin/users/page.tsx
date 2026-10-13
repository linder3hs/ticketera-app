import type { Metadata } from 'next';

import { UsersAdmin } from '@/modules/user/components/UsersAdmin';
import { requireRole } from '@/modules/user/current-user';
import { listUsersPage } from '@/modules/user/services/user-service';
import { parseUsersQuery } from '@/modules/user/user.schema';

export const metadata: Metadata = { title: 'Usuarios y roles — Ticketera' };

export default async function AdminUsersPage({
  searchParams,
}: PageProps<'/admin/users'>) {
  const actor = await requireRole('admin');
  const query = parseUsersQuery(await searchParams);
  const page = await listUsersPage(query);

  return <UsersAdmin actor={{ id: actor.id, role: actor.role }} query={query} page={page} />;
}
