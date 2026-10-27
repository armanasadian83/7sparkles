import { requireAdmin } from '@/server/admin-auth';
import { connection } from 'next/server';
import { readSnapshot } from '@/server/store';
import { handleError, json } from '@/server/http';

export async function GET() {
  await connection();
  try { await requireAdmin(); return json({ snapshot: readSnapshot() }); }
  catch (error) { return handleError(error); }
}
