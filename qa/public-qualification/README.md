This is source for three finite local public qualification selections. No browser,
compile, import, test or provider execution was performed by the QA author.

The thin pages import the real production Astro pages. This preserves BaseLayout,
Header/Footer, ContactSection and its actual ContactForm, and the actual MatchTool
page and island. The only build-data alias supplies three visibly FICTIF properties.
The local static configuration uses the existing React/Tailwind integrations and
production styles. It excludes the Cloudflare adapter, platform proxy and API page
tree. It reads an empty env directory, fixes telemetry defines to empty/zero, and
uses a hardcoded loopback site and port 4240. Minimal favicon/PWA/brand assets are
copied byte-for-byte; the fictitious property illustration is local SVG.

Five task parameters are required by both configurations: QUAL_QA_PROVENANCE
(SHA256 of source-pins.json), QUAL_QA_OUTPUT (absolute child directory of this
task's public-qa artifact root), QUAL_QA_PROFILE, QUAL_QA_FLOW, QUAL_QA_LANG.
There are no credentials or origin parameters, defaults or all-profile autoruns.
Root's compile command also sets the constant ASTRO_TELEMETRY_DISABLED=1, for
six environment entries total; it is not another selection parameter.

| Profile | Flow | Language | Browser | Viewport | Page |
| --- | --- | --- | --- | --- | --- |
| desktop | normal | fr | Chromium | 1366 × 850 | /trouver-mon-bien/ |
| portrait | errors-back-normal | fr | WebKit | 390 × 844 | /contact/ |
| landscape | unknown-recover | fr | WebKit | 844 × 390 | /contact/ |

Root must review/freeze these inputs, then separately compile once with the local
configuration qa/public-qualification/astro.config.mjs. Only after inspecting that
exact HTML may root select the first browser via playwright.public-qualification.config.ts.
The local serve.py serves only QUAL_QA_OUTPUT/html with Python on 127.0.0.1:4240;
reuseExistingServer is false, so an occupied port fails instead of using another task.
The same compiled HTML may serve the other two tuples after the first acceptance.
Portrait also returns from an invalid bedroom count to the project step, advances
back to criteria, then corrects that visible error before proceeding.
Worker count is one, retries zero and each selected test has a 90 second budget.

Every browser request is intercepted before delivery. Only local static GET/HEAD,
the finite qualified POST response port, and one anonymous chat-session model on
explicit desktop inline-help opening are allowed. That model requires exactly
POST /api/chat/session with body {}, JSON type, no CSRF header, a one-use permit
and the real dialog already open. Its response follows the actual ChatClient
SessionResponse: a fictitious nonce, empty bot conversation, ordinary policy with
files disabled, empty contacts/attachments, and no cookie or real credential.
Every conversation/message/handoff/file/AI/other chat endpoint remains blocked.
Other local API attempts
fail the selection; all external requests are aborted. The static server adds a
local-only CSP and disables DNS prefetch, covering BaseLayout's external preconnect
hint as well. Compiled HTML, local/inline styles/scripts and worker blobs remain
unchanged. The real agency map's
OpenFreeMap requests reaching routing are recorded as blocked (CSP may block them
earlier); any other external attempt fails. No map
accuracy or live provider result is claimed. The landscape port aborts its first
submit, then acknowledges only the explicit recover. It records no POST body in
attachments. Test assertions compare the two in-memory payloads exactly, including
the UUID, and permit only delivery_mode to differ. This port proves UI behavior;
the 21 real SQLite server cases and management PG checks are separate evidence.

Screenshots, video and measurements are written for the selected tuple. Screenshots
mask editable free-value controls. Video shows only deliberately fictitious inputs;
no CSS, clock, scroll position, animation or browser capability is patched. The
normal desktop uses real wheel input. Responsive WebKit viewports use native
Option+Tab (Alt+Tab) until focus, then real page-gutter wheel input sized from the
target/viewport edges while retaining that focus. The two WebKit launches keep
390 × 844 and 844 × 390 without isMobile/hasTouch. This is responsive keyboard-plus-wheel
coverage, not iOS touch emulation or evidence of touch/swipe/onscreen-keyboard use. Assertions cover 44px form targets, real
viewport and center hit testing, opaque ancestors, horizontal overflow, bottom
actions, heading/return focus, focus ring, private replay attributes, and no
identity values in URL or browser storage. Captured pixels/video require actual
root inspection before any visual acceptance; source/oracle counts are not passes.
The launcher must exist and have computed visibility hidden while qualification
is open. Both bottom actions are checked at all four inset corners and their
center, in addition to full viewport/opacity checks. The existing desktop scenario
also opens and closes the real chat through inline help, captures the panel and
returned focus, and proves zero implicit session and lead requests before that
explicit opening. Portrait/landscape never permit a chat session. No new case or
profile is added. No conversation/message API is permitted; the response is only
a UI model and creates no server state.

These selections cover French and the specified flows. They do not certify RTL,
all six translations, every operation, real transport latency, reload recovery,
Cloudflare/native limiter configuration, D1 durability or a deployed release.

The closed root probe on the same compiled portrait HTML confirmed that ordinary
Tab cycles through text controls while Option+Tab reaches real buttons, including
the qualification entry. The mobile key choice follows that observed WebKit
behavior; the focus, viewport, hit-test and focus-ring assertions remain intact.
The original portrait failure and desktop acceptance are retained. No product or
HTML change, recompilation or desktop replay is needed for this QA-only delta.

The root02 failure exposed a QA race: requiring focus and settled viewport in
the same Tab loop let navigation leave an already focused target while native
focus-scroll was still moving. Acquisition now stops at native focus alone. The
existing final focus, viewport, center-hit, focus-ring and 44px oracles remain;
mobile wheel distances follow the visible-edge deficit instead of fixed jumps.
Root01/root02 evidence and accepted desktop are retained without recompilation.

Root03 exposed a driver limit: wheel input is unsupported when WebKit launches
with isMobile=true. The configuration now selects the same WebKit engines and
viewports without isMobile/hasTouch. No runtime capability, DOM focus/scroll or CSS
is injected, and every existing reach/focus/geometry oracle remains unchanged.
Desktop previously used false/false, so its launch semantics and accepted evidence
remain valid. Root01/root02/root03 failures are preserved; root04 uses new output
with the same compiled HTML, without a rebuild or desktop replay.
