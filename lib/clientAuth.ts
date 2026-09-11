const MEMBERS_KEY = 'fa_members';
const SESSION_KEY = 'fa_session';

export function validEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export function getMembers(): string[] {
  try {
    const list = JSON.parse(localStorage.getItem(MEMBERS_KEY) || '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function isMember(email: string): boolean {
  return getMembers().includes(email.trim().toLowerCase());
}

export function addMember(email: string): void {
  const e = email.trim().toLowerCase();
  const list = getMembers();
  if (!list.includes(e)) list.push(e);
  localStorage.setItem(MEMBERS_KEY, JSON.stringify(list));
}

export function setSession(email: string): void {
  localStorage.setItem(SESSION_KEY, email.trim().toLowerCase());
}

export function getSession(): string | null {
  return localStorage.getItem(SESSION_KEY);
}

export function clearSession(): void {
  localStorage.removeItem(SESSION_KEY);
}