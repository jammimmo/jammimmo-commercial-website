import type { APIContext } from 'astro';
import { handleChat, type ChatAction } from './server';
import type { ChatEnv } from './types';
export function chatRoute(action: ChatAction) {
  return (context: APIContext) => handleChat(action, context.request,
    (context.locals as { runtime?: { env?: ChatEnv } }).runtime?.env ?? {}, context.params.id);
}
