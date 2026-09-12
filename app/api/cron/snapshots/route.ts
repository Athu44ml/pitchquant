import { NextResponse } from 'next/server';
import { capturePass } from '@/lib/capture';

export const maxDuration = 60;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const auth = req.headers.get('authorization') || `Bearer ${searchParams.get('secret') || ''}`;
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const result = await capturePass();
  return NextResponse.json(result);
}