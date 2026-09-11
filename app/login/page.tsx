"use client";
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { addMember, isMember, setSession } from '@/lib/clientAuth';

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'login' | 'create'>('create');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const clean = email.trim().toLowerCase();
    if (!clean.includes('@') || !clean.includes('.')) { setError('Enter a valid email'); return; }
    if (mode === 'create') { addMember(clean); setSession(clean); router.push('/'); }
    else if (isMember(clean)) { setSession(clean); router.push('/'); }
    else setError('Account not found — create one first.');
  }

  return (
    <div className="fixed inset-0 z-50 bg-[#0B0F17] flex items-center justify-center p-6">
      <div className="w-full max-w-xs space-y-5">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 bg-[#17A371] rounded-[2px]"></span>
          <span className="text-[13px] font-semibold tracking-tight text-[#E9EEF3]">PitchQuant</span>
        </div>

        <div>
          <p className="eyebrow mb-1">Members area</p>
          <h1 className="h-title">Sign in</h1>
          <p className="h-desc mt-1">No password. Use your email to create an account or log in.</p>
        </div>

        <div className="flex border-b border-white/[0.08]">
          <button onClick={() => { setMode('create'); setError(''); }} className={`mod-tab ${mode === 'create' ? 'on' : ''}`}>Create account</button>
          <button onClick={() => { setMode('login'); setError(''); }} className={`mod-tab ${mode === 'login' ? 'on' : ''}`}>Log in</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="email"
            placeholder="you@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="select-input w-full"
          />
          {error && <p className="neg text-[12px]">{error}</p>}
          <button type="submit" className="btn-primary w-full">Continue</button>
        </form>

        <p className="sub">Access is tied to this browser.</p>
      </div>
    </div>
  );
}