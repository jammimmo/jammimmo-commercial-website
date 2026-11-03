import type { APIRoute } from 'astro';
import { handleListingTranslationRequest, type ListingTranslationEnvironment } from '@/lib/listing-translation-server';

export const prerender = false;
interface CFLocals { runtime?: { env?: ListingTranslationEnvironment } }
const handle: APIRoute = ({ request, locals }) => handleListingTranslationRequest(request, (locals as CFLocals).runtime?.env ?? {});
export const POST = handle;
export const ALL = handle;
