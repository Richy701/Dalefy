const KEY = "daf-pending-invite";
const EMAIL_KEY = "daf-pending-invite-email";

/** Invite token waiting to be accepted once the user is signed in. Kept in
 *  localStorage so it survives new tabs and OAuth redirects. */
export function getPendingInvite(): string | null {
  try {
    return localStorage.getItem(KEY) || sessionStorage.getItem(KEY) || null;
  } catch {
    return null;
  }
}

export function setPendingInvite(token: string, email?: string): void {
  try {
    localStorage.setItem(KEY, token);
    if (email) localStorage.setItem(EMAIL_KEY, email);
  } catch { /* storage unavailable */ }
}

/** Email address the pending invite was sent to, for prefilling sign-in/sign-up. */
export function getPendingInviteEmail(): string | null {
  try {
    return localStorage.getItem(EMAIL_KEY);
  } catch {
    return null;
  }
}

export function clearPendingInvite(): void {
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem(EMAIL_KEY);
    sessionStorage.removeItem(KEY);
  } catch { /* storage unavailable */ }
}
