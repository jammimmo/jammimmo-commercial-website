import { useEffect, useRef, useState, type FormEvent, type CSSProperties } from 'react';
import { ArrowDown, ArrowLeft, ArrowUp, Check, FileText, LoaderCircle, MessageCircle, Paperclip, ShieldCheck, X } from 'lucide-react';
import { SITE } from '@/lib/site-config';
import { ChatClient, ChatError, DEFAULT_POLICY, attachmentLabel, formatFileLimit, formatFileSize, safeSourceUrl, validateFiles, type Attachment, type ChatMessage, type Conversation, type HandoffRequest, type MessageRequest, type Receipt, type SessionResponse } from './chat-client';
import './chat.css';

interface Props { reserveBottom?: boolean; client?: ChatClient; }
type Pending = { kind: 'message'; body: MessageRequest } | { kind: 'handoff'; body: HandoffRequest };
const STATUS: Record<Conversation['status'], string> = { bot: 'Assistant automatisé', waiting: 'Demande enregistrée · en attente de l’équipe', assigned: 'Un conseiller a pris en charge l’échange', waiting_visitor: 'Un conseiller vous a répondu', closed: 'Échange terminé' };

function requestId() { return crypto.randomUUID(); }
function errorText(error: unknown) { return error instanceof Error ? error.message : 'Une erreur est survenue. Votre texte reste ici.'; }
function receiptText(receipt: Receipt) {
  if (receipt.state === 'claimed') return 'Un conseiller a pris en charge votre demande.';
  if (receipt.state === 'available') return 'Votre demande est transmise à l’équipe.';
  return 'Votre demande est enregistrée. Sa transmission à l’équipe est en attente.';
}

/** One first-party, private conversation. All model text is rendered as text. */
export default function ChatWidget({ reserveBottom = false, client: suppliedClient }: Props) {
  const api = useRef(suppliedClient ?? new ChatClient());
  const dialog = useRef<HTMLDialogElement>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const transcript = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const atBottom = useRef(true);
  const lastMessageKey = useRef('');
  const uploadRetry = useRef<Array<{ file: File; requestId: string }>>([]);
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fileAdvice, setFileAdvice] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [handoffOpen, setHandoffOpen] = useState(false);
  const [handoffSuggested, setHandoffSuggested] = useState(false);
  const [newMessages, setNewMessages] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [context, setContext] = useState<{ path: string; title?: string; propertyReference?: string } | null>(null);
  const [launcherBottom, setLauncherBottom] = useState(reserveBottom ? 94 : 20);
  const policy = session?.policy ?? DEFAULT_POLICY;
  const human = conversation && conversation.status !== 'bot';
  const closed = conversation?.status === 'closed';
  const messages = conversation?.messages ?? [];
  const [handoffDraft, setHandoffDraft] = useState({ name: '', channel: 'chat' as HandoffRequest['channel'], contact: '', summary: '', topic: 'property' as HandoffRequest['topic'], consent: false });

  function close() { setOpen(false); dialog.current?.close(); requestAnimationFrame(() => launcher.current?.focus()); }
  function openHandoff() {
    setHandoffDraft(current => ({ ...current, summary: current.summary || text || [...messages].reverse().find(message => message.role === 'visitor')?.content || '' }));
    setHandoffOpen(true); setConfirmClear(false);
  }
  function updateConversation(next: Conversation) {
    const key = `${next.version}:${next.messages.length}:${next.messages.at(-1)?.id ?? ''}`;
    const changed = key !== lastMessageKey.current;
    lastMessageKey.current = key;
    setConversation(next);
    if (atBottom.current) requestAnimationFrame(() => { if (transcript.current) transcript.current.scrollTop = next.messages.length ? transcript.current.scrollHeight : 0; });
    else if (changed) setNewMessages(true);
  }
  async function bootstrap() {
    setLoading(true); setError(''); setFileAdvice(false);
    try { const value = await api.current.session(); setSession(value); updateConversation(value.conversation); setAttachments(value.attachments ?? []); }
    catch (failure) { setError(errorText(failure)); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    if (!open) return;
    const element = dialog.current;
    if (!element) return;
    const media = matchMedia('(max-width: 640px), (max-height: 500px)');
    const display = () => {
      const active = document.activeElement as HTMLElement | null;
      if (element.open) element.close();
      if (media.matches) element.showModal(); else element.show();
      if (active && element.contains(active)) active.focus({ preventScroll: true });
    };
    display(); heading.current?.focus({ preventScroll: true });
    media.addEventListener('change', display);
    return () => { media.removeEventListener('change', display); if (element.open) element.close(); };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const viewport = window.visualViewport;
    const size = () => {
      dialog.current?.style.setProperty('--chat-viewport-height', `${viewport?.height ?? innerHeight}px`);
      dialog.current?.style.setProperty('--chat-viewport-top', `${viewport?.offsetTop ?? 0}px`);
    };
    viewport?.addEventListener('resize', size); viewport?.addEventListener('scroll', size); size();
    return () => { viewport?.removeEventListener('resize', size); viewport?.removeEventListener('scroll', size); };
  }, [open]);

  useEffect(() => {
    if (open && !session && !loading) void bootstrap();
    // Bootstrap only on an explicit open, not on an error-render/retry loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (handoffOpen) dialog.current?.querySelector('.jamm-chat-handoff')?.scrollIntoView({ block: 'start' });
  }, [handoffOpen]);

  useEffect(() => {
    const ref = document.querySelector<HTMLElement>('[data-copy-ref][data-ref]')?.dataset.ref;
    if (ref) setContext({ path: location.pathname, title: document.querySelector('main h1')?.textContent?.trim().slice(0, 200), propertyReference: ref });
  }, []);

  useEffect(() => {
    // Only fixed controls intersecting this corner affect the launcher's clearance.
    let frame = 0;
    const measure = () => {
      frame = 0;
      let bottom = 20;
      for (const element of document.querySelectorAll<HTMLElement>('[data-chat-obstruction], [data-cta-bar]')) {
        const rect = element.getBoundingClientRect();
        if (getComputedStyle(element).position === 'fixed' && rect.width > 0 && rect.height > 0 && rect.top < innerHeight && rect.bottom > innerHeight - 140 && rect.left < 200) bottom = Math.max(bottom, innerHeight - rect.top + 12);
      }
      setLauncherBottom(Math.min(bottom, Math.max(20, innerHeight - 100)));
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(measure); };
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'style', 'hidden'] });
    addEventListener('resize', schedule); addEventListener('scroll', schedule, { passive: true }); measure();
    return () => { observer.disconnect(); cancelAnimationFrame(frame); removeEventListener('resize', schedule); removeEventListener('scroll', schedule); };
  }, []);

  useEffect(() => {
    if (!open || !conversation || !human || closed) return;
    let stopped = false; let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      if (document.visibilityState === 'visible') {
        try { const result = await api.current.conversation(); if (!stopped) { updateConversation(result.conversation); setAttachments(result.attachments); } }
        catch (failure) { if (!stopped) { setFileAdvice(false); setError(errorText(failure)); } }
      }
      if (!stopped) timer = setTimeout(poll, 20_000);
    };
    timer = setTimeout(poll, 20_000);
    return () => { stopped = true; clearTimeout(timer); };
  }, [open, conversation?.id, !!human, !!closed]);

  async function execute(action: Pending) {
    setPending(action); setBusy(true); setError(''); setFileAdvice(false);
    try {
      if (!session) { const current = await api.current.session(); setSession(current); }
      if (action.kind === 'message') {
        const result = await api.current.message(action.body);
        updateConversation(result.conversation); setHandoffSuggested(Boolean(result.handoffSuggested));
        if (result.mode === 'human' && result.conversation.status === 'bot') openHandoff();
        setText('');
      } else {
        const result = await api.current.handoff(action.body);
        updateConversation({ ...result.conversation, receipt: result.receipt }); setHandoffOpen(false); setHandoffSuggested(false);
      }
      setPending(null);
    } catch (failure) { setError(errorText(failure)); if (failure instanceof ChatError && [401, 403].includes(failure.status)) { setSession(null); setPending(null); } }
    finally { setBusy(false); }
  }

  function sendMessage(event?: FormEvent) {
    event?.preventDefault(); if (busy || pending || !text.trim() || !session || !policy.enabled || closed) return;
    void execute({ kind: 'message', body: { requestId: requestId(), text: text.trim(), page: context ?? { path: location.pathname } } });
  }

  async function upload(files: File[], retry = false) {
    if (!retry && uploadRetry.current.length) { setError('Un envoi de fichier reste à confirmer. Réessayez le même envoi avant de choisir un autre fichier.'); return; }
    const failure = validateFiles(files, attachments, policy.files);
    if (failure) { setFileAdvice(true); setError(failure); return; }
    if (!retry) uploadRetry.current = files.map(file => ({ file, requestId: requestId() }));
    setBusy(true); setError(''); setFileAdvice(false);
    try {
      while (uploadRetry.current.length) {
        const item = uploadRetry.current[0];
        const result = await api.current.attachment(item.file, item.requestId);
        setAttachments(current => [...current.filter(file => file.id !== result.id), result]);
        uploadRetry.current.shift();
      }
    } catch (failure) {
      if (failure instanceof ChatError && [400, 413, 429].includes(failure.status)) { uploadRetry.current = []; setFileAdvice(true); }
      setError(errorText(failure));
    }
    finally { setBusy(false); if (fileInput.current) fileInput.current.value = ''; }
  }

  async function clearConversation() {
    setBusy(true); setError(''); setFileAdvice(false);
    try { await api.current.clear(); uploadRetry.current = []; lastMessageKey.current = ''; atBottom.current = true; setConversation(null); setSession(null); setAttachments([]); setPending(null); setText(''); setHandoffOpen(false); setHandoffDraft({ name: '', channel: 'chat', contact: '', summary: '', topic: 'property', consent: false }); setConfirmClear(false); await bootstrap(); }
    catch (failure) { setError(errorText(failure)); }
    finally { setBusy(false); }
  }

  const origin = typeof location === 'undefined' ? 'https://jammimmo.com' : location.origin;
  return <div className="jamm-chat-root rr-block" data-chat-private data-clarity-mask="true">
    <button ref={launcher} className="jamm-chat-launcher" style={{ '--chat-bottom': `${launcherBottom}px` } as CSSProperties} onClick={() => setOpen(true)} aria-expanded={open} aria-controls="jamm-chat-dialog" aria-label="Ouvrir l’assistant Jamm Immo">
      <MessageCircle size={22} aria-hidden="true" /><span>Une question&nbsp;?</span>
    </button>
    <dialog ref={dialog} id="jamm-chat-dialog" className="jamm-chat-dialog" aria-labelledby="jamm-chat-title" onCancel={event => { event.preventDefault(); close(); }} onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); close(); } }}>
      <section className="jamm-chat-shell" lang="fr" dir="ltr">
        <header className="jamm-chat-header">
          <div className="jamm-chat-mark" aria-hidden="true"><MessageCircle size={22} /></div>
          <div className="jamm-chat-heading"><h2 id="jamm-chat-title" tabIndex={-1} ref={heading}>À votre écoute</h2><p>{conversation ? STATUS[conversation.status] : 'Assistant automatisé · Jamm Immo'}</p></div>
          <button className="jamm-chat-icon" aria-label="Fermer la conversation" onClick={close}><X size={22} aria-hidden="true" /></button>
        </header>
        <nav className="jamm-chat-tools" aria-label="Aide et confidentialité">
          <button onClick={openHandoff} disabled={!!human || !session || busy}>Parler à un conseiller</button>
          <a href={SITE.whatsappUrl} target="_blank" rel="noopener noreferrer">WhatsApp <span aria-hidden="true">↗</span></a>
          <button onClick={() => { setConfirmClear(true); setHandoffOpen(false); }} disabled={!session || busy}>Effacer</button>
        </nav>
        <div className="jamm-chat-transcript" ref={transcript} onScroll={() => { const element = transcript.current; if (element) { atBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 48; if (atBottom.current) setNewMessages(false); } }} role="log" aria-label="Messages de la conversation" aria-live="polite" aria-relevant="additions text">
          {context && <div className="jamm-chat-context"><span>À propos de <strong>{context.title || context.propertyReference}</strong></span><button className="jamm-chat-icon" aria-label="Retirer le contexte de ce bien" onClick={() => setContext(null)}><X size={16} aria-hidden="true" /></button></div>}
          <div className="jamm-chat-welcome"><span className="jamm-chat-eyebrow">BIENVENUE CHEZ JAMM IMMO</span><h3>La bonne info.<br /><em>Au bon endroit.</em></h3><p>{policy.welcome}</p></div>
          {loading && <p className="jamm-chat-state" role="status"><LoaderCircle className="jamm-chat-spin" size={16} aria-hidden="true" /> Ouverture de votre échange…</p>}
          {!policy.enabled && session && <div className="jamm-chat-notice">L’assistant est momentanément fermé. Notre équipe reste joignable sur <a href={SITE.whatsappUrl} target="_blank" rel="noopener noreferrer">WhatsApp</a> ou via <a href="/contact">la page contact</a>.</div>}
          {session && !messages.length && policy.enabled && !handoffOpen && <div className="jamm-chat-prompts" aria-label="Quelques pistes pour commencer">
            {['Trouver un bien', 'Comprendre un outil', 'Acheter, louer ou confier un bien'].map(label => <button key={label} onClick={() => { setText(label === 'Trouver un bien' ? 'Comment trouver un bien selon mon budget ?' : label === 'Comprendre un outil' ? 'Quels outils puis-je utiliser sur le site ?' : 'Comment Jamm Immo peut m’accompagner pour acheter, louer ou confier mon bien ?'); composer.current?.focus(); }}>{label}<ArrowUp size={15} aria-hidden="true" /></button>)}
          </div>}
          {messages.map(message => <Message key={message.id} message={message} origin={origin} />)}
          {conversation?.receipt && <div className="jamm-chat-receipt"><Check size={17} aria-hidden="true" /><div><p>{receiptText(conversation.receipt)}</p><small>Reçu {conversation.receipt.id.slice(0, 8).toUpperCase()}</small>{conversation.receipt.state === 'recorded' && <p>Vous pouvez aussi joindre l’agence sur <a href={SITE.whatsappUrl} target="_blank" rel="noopener noreferrer">WhatsApp</a>.</p>}</div></div>}
          {attachments.length > 0 && <ul className="jamm-chat-attachments" aria-label="Pièces jointes">{attachments.map(file => <li key={file.id}><FileText size={19} aria-hidden="true" /><div><strong>{file.name}</strong><small>{formatFileSize(file.size)} · {attachmentLabel(file.state)}</small></div></li>)}</ul>}
          {handoffSuggested && !human && !handoffOpen && <button className="jamm-chat-secondary jamm-chat-wide" onClick={openHandoff}>Transmettre ma question à un conseiller</button>}
          {handoffOpen && !human && <form className="jamm-chat-handoff" onSubmit={event => {
            event.preventDefault(); if (busy || pending || !handoffDraft.consent) return;
            void execute({ kind: 'handoff', body: { requestId: requestId(), ...handoffDraft, consent: true } });
          }}>
            <div className="jamm-chat-form-title"><h3>Un conseiller prend le relais</h3><button className="jamm-chat-icon" type="button" onClick={() => setHandoffOpen(false)} aria-label="Revenir aux messages"><ArrowLeft size={19} /></button></div>
            <p>Partagez votre question et choisissez comment être recontacté.</p>
            <label>Votre prénom<input autoComplete="given-name" maxLength={100} required value={handoffDraft.name} onChange={event => setHandoffDraft({ ...handoffDraft, name: event.target.value })} /></label>
            <label>Votre demande<select value={handoffDraft.topic} onChange={event => setHandoffDraft({ ...handoffDraft, topic: event.target.value as HandoffRequest['topic'] })}><option value="property">Un bien</option><option value="tools">Un outil du site</option><option value="services">Nos services</option><option value="other">Autre question</option></select></label>
            <label>Où poursuivre l’échange&nbsp;?<select value={handoffDraft.channel} onChange={event => setHandoffDraft({ ...handoffDraft, channel: event.target.value as HandoffRequest['channel'], contact: '' })}><option value="chat">Dans cette conversation</option><option value="email">Par email</option><option value="phone">Par téléphone</option></select></label>
            {handoffDraft.channel !== 'chat' && <label>{handoffDraft.channel === 'email' ? 'Votre email' : 'Votre téléphone'}<input required type={handoffDraft.channel === 'email' ? 'email' : 'tel'} autoComplete={handoffDraft.channel === 'email' ? 'email' : 'tel'} maxLength={200} value={handoffDraft.contact} onChange={event => setHandoffDraft({ ...handoffDraft, contact: event.target.value })} /></label>}
            <label>Ce que vous souhaitez savoir<textarea required rows={3} maxLength={2000} value={handoffDraft.summary} onChange={event => setHandoffDraft({ ...handoffDraft, summary: event.target.value })} /></label>
            {policy.files.enabled && <><input ref={fileInput} className="jamm-chat-file-input" type="file" accept={policy.files.types.join(',')} multiple onChange={event => void upload(Array.from(event.target.files ?? []))} /><button className="jamm-chat-secondary" type="button" disabled={busy} onClick={() => fileInput.current?.click()}><Paperclip size={17} aria-hidden="true" /> Joindre un fichier</button><small>JPEG, PNG, WebP ou PDF · {policy.files.maxCount} fichiers · {formatFileLimit(policy.files.maxBytes)} chacun, {formatFileLimit(policy.files.totalBytes)} au total. Analyse antivirus avant transmission. N’envoyez pas de pièce d’identité.</small></>}
            <label className="jamm-chat-consent"><input type="checkbox" required checked={handoffDraft.consent} onChange={event => setHandoffDraft({ ...handoffDraft, consent: event.target.checked })} /><span>J’accepte de transmettre cet échange, mes coordonnées et mes pièces admises à l’équipe Jamm Immo pour cette demande.</span></label>
            <small>Échange conservé au maximum {policy.retentionDays} jours ; pièces jointes, {policy.files.retentionHours} heures. Vous pouvez effacer cet échange à tout moment.</small>
            <button className="jamm-chat-primary" type="submit" disabled={busy || !!pending || !handoffDraft.consent}>{busy ? 'Transmission…' : 'Transmettre ma demande'}<ArrowUp size={17} aria-hidden="true" /></button>
          </form>}
          {confirmClear && <div className="jamm-chat-notice"><strong>Effacer cet échange&nbsp;?</strong><p>Cette action termine la conversation et supprime son contenu selon notre politique de conservation.</p><div className="jamm-chat-button-row"><button className="jamm-chat-secondary" onClick={() => setConfirmClear(false)}>Annuler</button><button className="jamm-chat-primary" disabled={busy} onClick={() => void clearConversation()}>Effacer l’échange</button></div></div>}
          {busy && <p className="jamm-chat-state" role="status"><LoaderCircle className="jamm-chat-spin" size={16} aria-hidden="true" /> {pending?.kind === 'message' ? human ? 'Envoi au conseiller…' : 'Je cherche dans les informations du site…' : 'Transmission en cours…'}</p>}
          {closed && <div className="jamm-chat-notice">Cet échange est terminé. Vous pouvez l’effacer pour ouvrir une nouvelle conversation.</div>}
        </div>
        {newMessages && <button className="jamm-chat-new" onClick={() => { if (transcript.current) transcript.current.scrollTop = transcript.current.scrollHeight; atBottom.current = true; setNewMessages(false); }}><ArrowDown size={15} aria-hidden="true" /> Nouveau message</button>}
        {error && <div className="jamm-chat-error" role="alert"><p>{error}</p>{fileAdvice ? <button disabled={busy || loading} onClick={() => { setError(''); setFileAdvice(false); setHandoffOpen(false); requestAnimationFrame(() => composer.current?.focus()); }}>Continuer sans ajouter de fichier</button> : <button disabled={busy || loading} onClick={() => pending ? void execute(pending) : uploadRetry.current.length ? void upload([], true) : void bootstrap()}>{pending || uploadRetry.current.length ? 'Réessayer le même envoi' : 'Réouvrir la connexion'}</button>}</div>}
        {!handoffOpen && !confirmClear && <form className="jamm-chat-compose" onSubmit={sendMessage}>
          <label htmlFor="jamm-chat-message" className="jamm-chat-sr-only">Votre question à Jamm Immo</label>
          <textarea id="jamm-chat-message" ref={composer} placeholder={human ? 'Écrivez au conseiller…' : 'Posez votre question…'} maxLength={2000} rows={2} value={text} disabled={closed || !policy.enabled} onChange={event => setText(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && !matchMedia('(pointer: coarse)').matches) { event.preventDefault(); sendMessage(); } }} />
          <button className="jamm-chat-send" type="submit" aria-label="Envoyer le message" disabled={busy || !!pending || !session || !text.trim() || closed || !policy.enabled}>{busy ? <LoaderCircle className="jamm-chat-spin" size={19} aria-hidden="true" /> : <ArrowUp size={21} aria-hidden="true" />}</button>
        </form>}
        <footer className="jamm-chat-footer"><ShieldCheck size={13} aria-hidden="true" /><a href={SITE.legal.privacy} target="_blank" rel="noopener noreferrer">Confidentialité</a></footer>
      </section>
    </dialog>
  </div>;
}

function Message({ message, origin }: { message: ChatMessage; origin: string }) {
  const sources = (message.citations ?? []).map(source => ({ ...source, safeUrl: safeSourceUrl(source.url, origin) })).filter(source => source.safeUrl);
  return <article className={`jamm-chat-message jamm-chat-message-${message.role}`} aria-label={message.role === 'visitor' ? 'Votre message' : message.role === 'operator' ? 'Message du conseiller' : 'Réponse de l’assistant'}>
    {message.role !== 'visitor' && <span className="jamm-chat-author">{message.role === 'operator' ? 'L’équipe Jamm Immo' : message.role === 'system' ? 'Votre échange' : 'Assistant Jamm Immo'}</span>}
    <p>{message.content}</p>
    {sources.length > 0 && <div className="jamm-chat-sources"><strong>À consulter sur le site</strong>{sources.map(source => <a key={source.id} href={source.safeUrl!} target="_blank" rel="noopener noreferrer"><span>{source.title}<span aria-hidden="true"> ↗</span></span>{source.quote && !message.content.includes(source.quote) && <q>{source.quote}</q>}</a>)}</div>}
  </article>;
}
