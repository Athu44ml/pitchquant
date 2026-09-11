"use client";
import { useEffect, useState } from 'react';
import { getSession } from '@/lib/clientAuth';

export default function UserChip() {
  const [name, setName] = useState('Analyst');
  useEffect(() => {
    const s = getSession();
    if (s) setName(s.split('@')[0]);
  }, []);
  return (
    <div className="flex items-center gap-2">
      <span className="w-5 h-5 rounded-[4px] bg-[#17A371]/15 border border-[#17A371]/30 text-[#3ECF8E] flex items-center justify-center text-[9px] font-bold">
        {name.slice(0, 2).toUpperCase()}
      </span>
      <span className="text-[12px] text-[#9AA7B4] capitalize">{name}</span>
    </div>
  );
}