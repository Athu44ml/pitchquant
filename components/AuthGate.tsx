"use client";
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { getSession } from '@/lib/clientAuth';

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    setLoggedIn(!!getSession());
    setReady(true);
  }, [pathname]);

  useEffect(() => {
    if (ready && !loggedIn && pathname !== '/login') router.replace('/login');
  }, [ready, loggedIn, pathname, router]);

  if (!ready) return <div className="h-screen flex items-center justify-center text-white text-2xl">Loading...</div>;
  if (!loggedIn && pathname !== '/login') return null;
  return <>{children}</>;
}