import { adminMutation } from '@/server/admin-api';
import { readJson } from '@/server/http';
import { createProduct } from '@/server/store';
import { validateProduct } from '@/server/validation';

export async function POST(request: Request) {
  return adminMutation(request, async () => { createProduct(validateProduct(await readJson(request, 262_144))); });
}
