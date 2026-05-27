import type { APIRoute } from 'astro';
import { getPublicPropertyByRef, listAllPublicRefs } from '@/lib/supabase.build';
import { slugToRef } from '@/lib/reference';

export const prerender = true;

export async function getStaticPaths() {
  const refs = await listAllPublicRefs();
  return refs.map((r) => ({ params: { ref: r.reference.toLowerCase() } }));
}

export const GET: APIRoute = async ({ params }) => {
  const ref = params.ref;
  if (!ref) return new Response('Not found', { status: 404 });
  const p = await getPublicPropertyByRef(slugToRef(ref));
  if (!p) return new Response('Not found', { status: 404 });
  return new Response(JSON.stringify(p), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600' },
  });
};
