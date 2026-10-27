import { loginAdmin } from '@/server/admin-auth';
import { assertSameOrigin, handleError, json, readJson } from '@/server/http';
import { record } from '@/server/validation';

export async function POST(request: Request) {
  try { assertSameOrigin(request); await loginAdmin(record(await readJson(request))); return json({ ok: true }); }
  catch (error) { return handleError(error); }
}
