import { NextResponse } from 'next/server';
import { ingestCSVs, ingestTheSportsDB } from '@/lib/ingestion';

/**
 * Protected ingestion endpoint for materializing fixtures into Supabase.
 * Requires INGEST_SECRET header or query param.
 * Zero provider calls.
 */
export async function POST(req: Request) {
  const { searchParams } = new URL(req.url);
  const secret =
    req.headers.get('x-ingest-secret') ||
    searchParams.get('secret') ||
    '';

  if (!process.env.INGEST_SECRET || secret !== process.env.INGEST_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const source = searchParams.get('source') || 'csv';

  let result;
  if (source === 'csv') {
    result = await ingestCSVs();
  } else if (source === 'thesportsdb') {
    result = await ingestTheSportsDB();
  } else {
    return NextResponse.json(
      { error: 'Invalid source. Use ?source=csv or ?source=thesportsdb' },
      { status: 400 }
    );
  }

  return NextResponse.json({
    source,
    teamsCreated: result.teamsCreated,
    fixturesCreated: result.fixturesCreated,
    checkpointsCreated: result.checkpointsCreated,
    errors: result.errors,
  });
}