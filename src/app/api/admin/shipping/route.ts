import { adminMutation } from '@/server/admin-api';
import { readJson } from '@/server/http';
import { updateShippingSettings } from '@/server/store';
import { validateShippingSettings } from '@/server/validation';

export async function PUT(request: Request) {
  return adminMutation(request, async () => {
    updateShippingSettings(validateShippingSettings(await readJson(request)));
  });
}
