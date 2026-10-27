import { getDocument, decodeValue } from './_firebaseAdmin.js';

/** Organisation trips follow the member's current role, even if they created the trip. */
export async function canEditTrip(uid: string, fields: Record<string, any>): Promise<boolean> {
  const orgId = decodeValue(fields.organization_id);
  if (typeof orgId === 'string' && orgId) {
    const member = await getDocument('org_members', `${uid}_${orgId}`).catch(() => null);
    return ['owner', 'admin', 'agent'].includes(String(decodeValue(member?.fields?.role) || ''));
  }
  return !!uid && decodeValue(fields.user_id) === uid;
}
