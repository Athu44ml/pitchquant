export function getMembers(): string[] {
  try { return JSON.parse(localStorage.getItem('fa_members') || '[]'); } catch { return []; }
}
export function addMember(email: string) {
  const members = getMembers();
  if (!members.includes(email)) {
    members.push(email);
    localStorage.setItem('fa_members', JSON.stringify(members));
  }
}
export function isMember(email: string): boolean {
  return getMembers().includes(email);
}
export function getSession(): string | null {
  return localStorage.getItem('fa_session');
}
export function setSession(email: string) {
  localStorage.setItem('fa_session', email);
}
export function clearSession() {
  localStorage.removeItem('fa_session');
}