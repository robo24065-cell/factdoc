// 관리자 게이트 (W1 데모) — sessionStorage 기반 패스코드.
// ⚠ 운영 시 Supabase Auth + 역할 기반 RLS로 교체(현재는 데모용 클라이언트 게이트).
const KEY = 'factdoc_admin'
const PASS = (import.meta.env.VITE_ADMIN_PASSCODE as string | undefined) ?? 'factdoc2026'

export function isAdmin(): boolean {
  try { return sessionStorage.getItem(KEY) === '1' } catch { return false }
}

export function login(passcode: string): boolean {
  if (passcode === PASS) {
    try { sessionStorage.setItem(KEY, '1') } catch { /* ignore */ }
    return true
  }
  return false
}

export function logout(): void {
  try { sessionStorage.removeItem(KEY) } catch { /* ignore */ }
}
