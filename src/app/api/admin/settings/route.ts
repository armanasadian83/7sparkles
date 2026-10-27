import { adminMutation } from '@/server/admin-api';
import { readJson } from '@/server/http';
import { readSettings, updateSettings } from '@/server/store';
import { validateSettings } from '@/server/validation';

export async function PUT(request: Request) {
  return adminMutation(request, async () => {
    const value = await readJson(request);
    updateSettings(validateSettings(value, readSettings()));
  });
}
