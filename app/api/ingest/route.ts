import { NextResponse } from 'next/server';
import { ingestCSVs, ingestTheSportsDB } from '@/lib/ingestion';

export const maxDuration = 60;

async function run(req: Request) {
  const { searchParams } = new URL(req.url);
  const secret = req.headers.get('x-ingest-secret') || searchParams.get('secret') || '';
  if (!process.env.INGEST_SECRET || secret !== process.env.INGEST_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const source = searchParams.get('source') || 'csv';
  const league = searchParams.get('league') || undefined;

  if (source === 'csv') {
    const r = await ingestCSVs(league);
    return NextResponse.json({ source, league: league || 'all', ...r });
  }
  if (source === 'thesportsdb') {
    const r = await ingestTheSportsDB();
    return NextResponse.json({ source, ...r });
  }
  return NextResponse.json({ error: 'use ?source=csv or ?source=thesportsdb' }, { status: 400 });
}

export async function GET(req: Request) { return run(req); }
export async function POST(req: Request) { return run(req); }