import { connection } from 'next/server';
import { getDatabase } from '../../../../server/database.mjs';
import { json } from '@/server/http';

export async function GET() {
  await connection();
  try { getDatabase().prepare('SELECT 1').get(); return json({ status: 'ok' }); }
  catch { return json({ status: 'unavailable' }, 503); }
}
