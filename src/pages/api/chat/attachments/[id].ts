import type { APIRoute } from 'astro';
import { chatRoute } from '@/lib/chat/route';
export const prerender = false;
export const ALL: APIRoute = chatRoute('upload');
