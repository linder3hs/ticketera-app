import { clerkClient } from '@clerk/nextjs/server';
import { verifyWebhook } from '@clerk/nextjs/webhooks';
import type { NextRequest } from 'next/server';

import { softDeleteUser } from '@/modules/user/services/user-service';
import { syncClerkUser } from '@/modules/user/services/user-sync-service';

export async function POST(request: NextRequest) {
  let event;
  try {
    event = await verifyWebhook(request);
  } catch {
    return new Response('Invalid webhook signature', { status: 400 });
  }

  if (event.type === 'user.created' || event.type === 'user.updated') {
    const client = await clerkClient();
    await syncClerkUser(await client.users.getUser(event.data.id));
  } else if (event.type === 'user.deleted' && event.data.id) {
    await softDeleteUser(event.data.id);
  }

  return new Response('ok');
}
