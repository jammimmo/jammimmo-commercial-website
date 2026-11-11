import { useEffect, useRef } from 'react';
import ChatWidget from './ChatWidget';
import { ChatClient, DEFAULT_POLICY, type Attachment, type Conversation, type MessageRequest } from './chat-client';
type FixtureWindow = Window & { __jammChatQA?: { readonly held: boolean; releaseReply: () => void } };

/** Dev-only visual fixture. No network, provider, live property or real handoff. */
export default function ChatWidgetFixture({ simulateFiles = false }: { simulateFiles?: boolean }) {
  const conversation = useRef<Conversation>({ id: 'qa-conversation', status: 'bot', version: 1, messages: [] });
  const replies = useRef(new Map<string, unknown>());
  const files = useRef(new Map<string, Attachment>());
  const lostUploadAcknowledgements = useRef(new Set<string>());
  const delayedReply = useRef<{ held: boolean; release?: () => void }>({ held: false });
  useEffect(() => {
    if (!import.meta.env.DEV || import.meta.env.PUBLIC_CHAT_UI_QA !== 'true') return;
    const target = window as unknown as FixtureWindow;
    const control = { get held() { return delayedReply.current.held; }, releaseReply() {
      delayedReply.current.held = false; delayedReply.current.release?.(); delayedReply.current.release = undefined;
    } };
    target.__jammChatQA = control;
    return () => { control.releaseReply(); if (target.__jammChatQA === control) delete target.__jammChatQA; };
  }, []);
  const api = useRef(new ChatClient(async (input, init) => {
    const path = String(input);
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : {};
    await new Promise(resolve => setTimeout(resolve, 300));
    const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
    if (path.endsWith('/session') && init?.method === 'DELETE') { conversation.current = { id: 'qa-conversation-new', status: 'bot', version: 1, messages: [] }; replies.current.clear(); files.current.clear(); return json({ ok: true }); }
    if (path.endsWith('/session')) return json({ csrf: 'fixture-not-a-real-capability', conversation: conversation.current, attachments: [...files.current.values()], policy: { ...DEFAULT_POLICY, files: { ...DEFAULT_POLICY.files, enabled: simulateFiles } }, contacts: {} });
    if (path.endsWith('/conversation')) return json({ conversation: conversation.current, attachments: [...files.current.values()] });
    if (simulateFiles && path.endsWith('/attachments') && init?.method === 'POST') {
      let file = files.current.get(body.requestId);
      if (!file) { file = { id: crypto.randomUUID(), name: body.name, size: body.size, state: 'uploading', countsTowardsQuota: true }; files.current.set(body.requestId, file); }
      return json({ id: file.id, state: file.state, uploadUrl: `/api/chat/attachments/${file.id}` });
    }
    if (simulateFiles && path.includes('/attachments/') && init?.method === 'PUT') {
      const file = [...files.current.values()].find(file => path.endsWith(`/${file.id}`));
      if (!file) return json({ code: 'fixture-file-not-found' }, 404);
      // Explicit simulated UI states; no scanner, file read or AV guarantee.
      file.state = /refus/i.test(file.name) ? 'rejected' : 'quarantined';
      if (/accuse-perdu/i.test(file.name) && !lostUploadAcknowledgements.current.has(file.id)) {
        lostUploadAcknowledgements.current.add(file.id); throw new TypeError('fixture-upload-acknowledgement-lost');
      }
      return json({ id: file.id, state: file.state });
    }
    if (path.endsWith('/message')) {
      if (replies.current.has(body.requestId)) return json(replies.current.get(body.requestId));
      const message = body as MessageRequest;
      if (/erreur réseau/i.test(message.text)) return json({ error: 'fixture-network-failure' }, 503);
      if (message.text === 'Réponse différée de recette') {
        delayedReply.current.held = true;
        await new Promise<void>(resolve => { delayedReply.current.release = resolve; });
      }
      const human = /conseiller|personne|humain/i.test(message.text);
      conversation.current.messages.push({ id: `${message.requestId}-visitor`, role: 'visitor', content: message.text, citations: [] });
      const answer = { id: `${message.requestId}-reply`, role: 'assistant' as const, content: human ? 'Bien sûr. Choisissez comment poursuivre avec l’équipe.' : 'Pour préparer votre projet, commencez par les informations et les outils du site. Un conseiller peut ensuite vous aider à préciser votre recherche.', citations: human ? [] : [{ id: 'qa-tool', title: 'Les outils pour votre projet', url: '/outils', quote: 'Retrouvez les outils Jamm Immo pour préparer votre projet immobilier.' }] };
      conversation.current.messages.push(answer); conversation.current.version++;
      const result = { conversation: structuredClone(conversation.current), message: answer, mode: human ? 'human' : 'sources', handoffSuggested: human };
      replies.current.set(body.requestId, result); return json(result);
    }
    if (path.endsWith('/handoff')) {
      conversation.current.status = 'waiting'; conversation.current.version++;
      conversation.current.receipt = { id: 'QA-RECU-LOCAL', state: 'recorded', notification: 'unconfigured' };
      return json({ conversation: conversation.current, receipt: conversation.current.receipt });
    }
    return json({ error: 'fixture-route-not-implemented' }, 404);
  }));
  return <ChatWidget client={api.current} reserveBottom />;
}
