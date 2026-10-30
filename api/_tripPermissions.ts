import { getDocument, decodeValue } from './_firebaseAdmin.js';
import type { Impersonation } from './_verifyToken.js';

/**
 * Organisation trips follow the member's current role, even if they created the trip. A private trip is
 * its creator's alone, as in the Firestore rules. A "Sign in as" session reaches only the shared trips
 * of the team it was opened for.
 */
export async function canEditTrip(uid: string, fields: Record<string, any>, imp: Impersonation | null = null): Promise<boolean> {
  const orgId = decodeValue(fields.organization_id);
  const isPrivate = decodeValue(fields.private) === true;
  if (imp && (orgId !== imp.org || isPrivate)) return false;
  if (isPrivate && decodeValue(fields.user_id) !== uid) return false;
  if (typeof orgId === 'string' && orgId) {
    const member = await getDocument('org_members', `${uid}_${orgId}`).catch(() => null);
    return ['owner', 'admin', 'agent'].includes(String(decodeValue(member?.fields?.role) || ''));
  }
  return !!uid && decodeValue(fields.user_id) === uid;
}
