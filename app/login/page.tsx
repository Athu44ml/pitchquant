"use client";
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { addMember, isMember, setSession, validEmail } from '@/lib/clientAuth';

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'create' | 'login'>('create');
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState<{ tone: 'err' | 'ok'; text: string } | null>(null);

  const submit = () => {
    const e = email.trim().toLowerCase();
    if (!validEmail(e)) {
      setMsg({ tone: 'err', text: 'Enter a valid email address.' });
      return;
    }
    if (mode === 'create') {
      if (isMember(e)) {
        setMsg({ tone: 'err', text: 'Account already exists on this browser — use LOG IN.' });
        setMode('login');
        return;
      }
      addMember(e);
      setSession(e);          // ← this line was missing before: create now signs you in
      router.replace('/');
    } else {
      if (!isMember(e)) {
        setMsg({ tone: 'err', text: 'No account on this browser yet — create one first.' });
        return;
      }
      setSession(e);
      router.replace('/');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg)] px-4">
      <div className="w-full max-w-[340px]">
        <div className="flex items-center gap-2 mb-6">
          <span className="w-[7px] h-[7px] bg-[var(--acc)] rounded-[1px]"></span>
          <span className="text-[12.5px] font-semibold tracking-tight text-[#E8ECF0]">PitchQuant</span>
        </div>

        <p className="eyebrow mb-1">Members area</p>
        <h1 className="h-title mb-1">Sign in</h1>
        <p className="sub text-[11.5px] mb-5">No password. Use your email to create an account or log in.</p>

        <div className="flex gap-4 border-b border-[var(--line)] mb-4">
          {(['create', 'login'] as const).map((m) => (
            <button
              key={m}
              onClick={() => { setMode(m); setMsg(null); }}
              className={`pb-2 text-[10.5px] tracking-[0.12em] uppercase transition-colors
                ${mode === m ? 'text-[#E8ECF0] shadow-[inset_0_-1px_0_var(--acc)]' : 'text-[var(--dim)] hover:text-[var(--tx)]'}`}
            >
              {m === 'create' ? 'Create account' : 'Log in'}
            </button>
          ))}
        </div>

        <input
          value={email}
          onChange={(e) => { setEmail(e.target.value); setMsg(null); }}
          onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
          placeholder="you@email.com"
          type="email"
          className="w-full px-3 py-2 rounded-[3px] bg-[var(--sf)] border border-[var(--line)] text-[12.5px] text-[var(--tx)] placeholder:text-[var(--dim)] focus:outline-none focus:border-[var(--acc)] mb-3"
        />

        {msg && (
          <p className={`text-[11px] mb-3 ${msg.tone === 'err' ? 'neg' : 'pos'}`}>{msg.text}</p>
        )}

        <button
          onClick={submit}
          className="w-full py-2 rounded-[3px] bg-[var(--acc)] text-[#081009] text-[12px] font-semibold hover:brightness-110 transition"
        >
          Continue
        </button>

        <p className="sub text-[10.5px] mt-4">Access is tied to this browser.</p>
      </div>
    </div>
  );
}