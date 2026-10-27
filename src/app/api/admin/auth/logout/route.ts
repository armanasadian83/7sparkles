import { logoutAdmin } from '@/server/admin-auth';
import { assertSameOrigin, handleError, json } from '@/server/http';

export async function POST(request: Request) {
  try { assertSameOrigin(request); await logoutAdmin(); return json({ ok: true }); }
  catch (error) { return handleError(error); }
}
