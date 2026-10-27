import { setupAdmin } from '@/server/admin-auth';
import { assertSameOrigin, handleError, json, readJson } from '@/server/http';
import { record } from '@/server/validation';

export async function POST(request: Request) {
  try { assertSameOrigin(request); await setupAdmin(record(await readJson(request))); return json({ ok: true }, 201); }
  catch (error) { return handleError(error); }
}
