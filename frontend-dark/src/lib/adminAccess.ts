// Central admin gating for privileged pages (Knowledge, Admin, Publish).
//
// Only Kriem and Manoj should see these — everyone else gets no access,
// even if their DB role is admin/owner. The email allowlist is the source of
// truth; the role check is a secondary hint used only for legacy screens.

export const ADMIN_EMAILS: readonly string[] = [
  'manojikumar1295@gmail.com',
  'kriem00@hotmail.com',
]

export interface AdminAccessUser {
  email?: string | null
  role?: string | null
}

export function isAdminUser(user: AdminAccessUser | null | undefined): boolean {
  if (!user?.email) return false
  return ADMIN_EMAILS.includes(user.email.trim().toLowerCase())
}
