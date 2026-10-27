import { connection } from 'next/server';
import { readCatalog } from '@/server/store';
import { handleError, json } from '@/server/http';

export async function GET() {
  await connection();
  try { return json(readCatalog()); } catch (error) { return handleError(error); }
}
