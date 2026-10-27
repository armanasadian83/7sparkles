import 'server-only';
import { requireAdmin } from './admin-auth';
import { assertSameOrigin, handleError, json } from './http';
import { readSnapshot } from './store';

export async function adminMutation(request: Request, action: () => Promise<void> | void) {
  try {
    assertSameOrigin(request);
    await requireAdmin();
    await action();
    return json({ snapshot: readSnapshot() });
  } catch (error) { return handleError(error); }
}
