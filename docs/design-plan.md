# ANANDA Broker app: design plan

21 Nov 2026. A plan to bring the agent app in this repo in line with the **ANANDA - Broker** prototype
(64 screens, desktop and phone, updated 10 Nov 2026) and the **ANANDA design system** it is built on.

Sources:

- Prototype: https://claude.ai/artifact/QLwghXxxPfG2Yt4TgyEGdc
- Design system: https://claude.ai/artifact/RtaodyaJDnJHvB5o3RRMPT (README, `tokens.json`, 40 component specs)
- Our app: `apps/web` at commit `b5d0f66`, running locally

## Summary

- The prototype is built on the design system: its `tokens.css` is byte-for-byte the design system's, and it
  uses the same font file. **Where the two disagree, we build to the design system** (list below).
- **Our 12 core screens all exist** and follow the same flow, but none match the design system closely.
  Most differences repeat across screens: button and pill shapes, sheet style, page titles, header,
  secondary-text colour, toasts, loading and errors. Fixing the shared foundation and components first
  brings every screen most of the way.
- **52 prototype screens are new to us.** About a third are front-end only: loading, error, offline,
  signed-out, no-access and notification states. The rest need backend work: document upload, Settings,
  invite and sign-in without a password, the set-up flow with contract signing, and the "As of" date.
- **Two phone layouts are broken today** (order page banner, Collections cards). Fix them now.
- **The agent role is now called "Broker"**, and Brokers are companies (EOOD, VAT number, commission
  invoices). That touches copy, the data model and Settings.

Effort sizes used below are rough: **S** up to a day, **M** 2–4 days, **L** a week or more.

## Decisions needed

These block parts of the plan. The recommendation is ours; Royi or the product owner decides.

| # | Question | Prototype | Ours today | Recommendation |
|---|---|---|---|---|
| 1 | Role name | "Broker" | "Sales agent" | Adopt "Broker" in all three languages (copy only) |
| 2 | How Brokers sign in | Google or an e-mail link, no password. Two-step sign-in built but switched off | E-mail and password | Needs a product and security decision; it also affects Admin sign-in. Keep passwords until decided (phase 5d) |
| 3 | Commission on New sale and Sent | One figure ("€144.00") | "Net + VAT = gross" | Follow the prototype: net figure in the sale flow, breakdown only on the order page |
| 4 | When commission is paid | One invoice a month, uploaded by the Broker, then paid | "Paid as soon as the sale closes" | Decide before building Earnings copy and Settings › Agreement and invoices |
| 5 | VAT number for a new customer | Optional; phone optional; address split into street, postcode, city | VAT required and unique; one address field | Keep VAT required for now. VAT-less customers break ownership and duplicate checks |
| 6 | "As of" date for Brokers | Header chip; past dates make the app read-only | Not built | Defer. It needs order and ownership history the API doesn't store |
| 7 | Order statuses shown to Brokers | 5 (paid, warehouse, delivered and invoiced shown as "Delivered · paid") | 7 | Show 5 to Brokers, keep 7 in the data |
| 8 | Language and theme in the header | Header buttons, plus Theme in the profile menu | Language in Profile only (our earlier decision #19) | Follow the design system: header buttons plus the profile row |
| 9 | Documents a Broker uploads | "Only you and the Admins see it", but also "goes with the payment request" | No uploads | Decide whether the customer ever receives them; choose a storage provider |
| 10 | Selling before ANANDA countersigns | "You can add customers while you wait" | No onboarding | Decide whether sending payment requests is blocked until countersigned |
| 11 | Collections "Due in the next 7 days" | Not shown (the example data has none) | Own section | Keep it; check with the designer |

## Where the prototype and the design system disagree

Build to the design system. Flag these to the designer so the prototype gets fixed too.

| Prototype | Design system |
|---|---|
| Controls 46 px tall, some cards 18 px radius, 14.5 px text, 30 px titles on sign-in | 44 px controls, `radius-lg` 16, no half pixels, type styles only |
| Selected segment is a white fill | `accent` fill |
| Disabled primary button is a dimmed yellow | `surface-3` fill with `text-subtle` |
| Blue tier hint on New sale, blue unread dot in notifications | `blue` only for Broker-name and role tags |
| Busy VAT check changes the label to "Checking" | Busy buttons keep their label and show a spinner |
| Review: long inline error with a "Try again" link | Panel errors are 2–4 words; one-tap page failures use an error toast |
| Notifications list the Broker's own actions ("sent for approval") | Own actions never go in the panel |
| Amber warning banner (bank change, look-back mode) | Banner has only info and problem tones. **Add a warn tone to the design system** |
| Checkbox grid in Settings › Notifications; red outline "close account" button | No Checkbox component; the only red button is Discard. **Add them or change the screens** |
| Amounts start-aligned in some tables | Amounts end-aligned, counts centred |

One inconsistency inside the design system: the `sidebar-width` token is 257 px, but the Sidebar
component spec says 280 px. Ask which is right.

## Phase 0: fix now

| Problem | Where | Fix | Effort |
|---|---|---|---|
| Late-payment banner squeezes its text into a column one word wide | Order page, phone | Stack Call / E-mail / Remind under the text below 768 px | S |
| Customer names cut off ("Sofia Ro…"), details wrap into a narrow strip | Collections, phone | Stack the actions under the text; use the ListCard layout | S |
| Every side panel shows a 2 px yellow outline when it opens | All panels | Focus the panel's heading or first control, not the dialog element | S |
| A 403 or 404 shows "Something went wrong. Try again." with a retry that can't work | Customer and order pages | API returns `forbidden` and `not_found` codes; UI shows No access and Not found pages | S |
| Text below the 12 px minimum (tags, badge counts, tab labels at 11 px) | Several | Use `caption` (12 px) | S |
| The login page's subtitle is left-aligned on phone | `/login` | Scope the sidebar `.brand` rule so it doesn't apply on the login page | S |

## Phase 1: foundation

### 1.1 Tokens and themes (M)

- Generate `apps/web/app/tokens.css` from the design system's `tokens.json`: all 44 colour tokens with dark and
  light values, spacing `space-1`…`space-8`, layout tokens, radii, control heights, icon sizes, shadows,
  breakpoints. We have the dark subset only. Missing tokens include `line-soft`, `accent-pressed`,
  `info`, `nav-selected`, `secondary-on-tint`, `icon-box`, `bad-strong`, `warn-pill` and `count-*`.
- Remove our own tokens that aren't in the system (`--line-strong`, `--grey`, `--control`).
- Fix values that drifted: `text-subtle` is `#6A6A68` (ours `#807F7C`).
- Themes: `data-theme="light"` on the root, dark by default. The choice is kept per person, so add
  `theme` to the user next to `locale` (API change, S). Apply the light-mode rules in the README:
  accent is a fill and never text, secondary buttons on tinted backgrounds are white, a soft grey
  selected nav item, and warn pills.

### 1.2 Type and spacing (S)

- Add the missing type styles: `display` (34/40/300), `body-lg`, `body`, `body-strong`, `body-sm`,
  `caption`.
- Fix `title-3` to 18/24/400 (ours 17/24/500).
- Secondary text that people read uses `text-muted`, not `text-subtle`: table headers, overlines,
  sub-lines, hints, placeholders. `text-subtle` stays for disabled, empty and decorative things only.
- In Hebrew, `overline` drops its letter-spacing.
- Replace raw pixel spacing with the scale and layout tokens: `page-margin` 20, `layout-gap` 20,
  `section-gap` 16, `row-gap` 12, `card-padding` 20, phone margin 16.

### 1.3 Components (L in total)

Turn our CSS classes into components that follow the specs. Most screens change through these alone.

| Design system component | Ours today | Change |
|---|---|---|
| Button | `.btn`, radius 12 | `radius-full`; sizes `sm` 36, `md` 44, `lg` 48 (main phone action); disabled = `surface-3` / `text-subtle`; `busy` state (16 px spinner, label kept, `aria-busy`); pressed scale 98% |
| IconButton | `.icon-btn`, 44, borderless | 36, `surface-1`, `line` border, count badge on the top end corner |
| Pill | `.chip`, 26 px, fully rounded | 24 px, `radius-sm`, 6 px dot, `caption` 500; tones good, warn, bad, info, blue, mute, plus `tag` |
| Chip / chip row | `.seg` | 36 px, `radius-full`, selected = `accent`; a row shares the width equally; becomes a Dropdown when it doesn't fit in BG |
| SegmentedToggle | `.seg`, `surface-3` selected | `radius-full`, `accent` selected (Cartons/Units, proforma language, Theme) |
| Sheet | `.panel`, flush to the edge with header and footer bars | Desktop: inset 12 px, `radius-lg`, 24 px padding, `title-2` title, round close button, `shadow-panel`. Phone: bottom sheet with a grab handle. Footer buttons share the width; Esc and the scrim close it |
| TextField / TextArea / Dropdown | `surface-1`, `line-strong` | `surface-2` fill, `line` border, `caption` label, `bad` border and helper text on error, 16 px text on phone. Custom Dropdown with a Menu instead of a native select |
| Search | 44 px, `radius-md`, separate Search button | 36 px on desktop, 44 px on phone, `radius-full`, filters as you type |
| KpiTile | Late tile filled red | Plain surface; only the figure turns `bad`; equal widths; "Nobody" sub-line at zero |
| Table / ListCard | Close | `line-soft` dividers, headers in `text-muted`, counts centred, amounts end-aligned; phone ListCard: name and amount on line 1, detail and pill on line 2 |
| ProgressSteps | Coloured bars | 24 px numbered circles: done = `accent` with a check, current = `accent` ring, late = `bad` ring; vertical on the order page and Sent, horizontal for summaries |
| Stepper | Joined 44 px box | Round 36 px buttons, the number in a 48 px `bg` box you can type into |
| Banner | Several ad-hoc banners | Info and problem tones (warn once the design system adds it); one small secondary button |
| Toast | Bottom end, up to 3, whole toast clickable | Rewrite to the spec: centred over the header row on desktop, under the status bar on phone, one at a time; kinds Saved, Saved + View, Saved + Undo, Error + Try again, Info, Incoming, In progress; close ×; 5 s with pause on hover |
| EmptyState | `Empty` text | 56 px `accent-soft` icon box, `title-2`, one sentence, one action |
| Avatar | Grey | `accent` fill |
| Menu, Tooltip, Calendar, SettingsItem, DocumentRow, DocumentPreview, FileUpload, KeyValue | Partly or not at all | Build when a phase needs them |

### 1.4 Loading and error states (M)

From the design system's Loading and Toasts and errors sections:

- **Skeletons** instead of "Loading…": 6 table rows on desktop and skeleton ListCards on phone, shaped like
  the data, with a shimmer (none with reduced motion), shown only after about 300 ms, `aria-busy` on the table.
  Keep the page title, KPI tiles, filters and table header in place.
- **Never a full-page loader.** `AppShell` currently waits for `/me` before showing anything, and detail
  pages replace their title while loading.
- **LoadError** in place of the rows: "Couldn't load your orders", "Check your connection, then try again.
  Nothing was changed.", plus Try again. Tell server errors apart from connection errors.
- **Inline errors in panels and forms**, directly above the buttons, with an icon, keeping what was typed,
  and scrolled into view.
- **Error toast** for a failed one-tap action on a page (Send reminder, Approve).
- "Try again" links are `text`, 500 weight, underlined, never yellow.

## Phase 2: shell and navigation (M)

- **Sidebar** as a floating card: `surface-1`, `line-soft` border, `radius-lg`, 20 px from the screen
  edge. It holds the "A" mark with the ANANDA wordmark and a "Sales" tag, New sale, nav items with
  counts, and a user card at the bottom with avatar, name, "Broker" and sign-out. The "1 thing to set
  up" hint stays until set-up exists (phase 5d).
- **Icon rail from 768 to 1279 px** (72 px): icons only, New sale as a round "+", counts as badges.
  The menu button, or hovering for 300 ms on laptops, opens the full sidebar over the page without a
  scrim. We currently switch straight from sidebar to tab bar.
- **PageHeader on every page**: breadcrumb with a house icon, optional line above the title (count or
  sort), `display` title (34/300; phone `title-1`), up to three actions aligned to the title. Detail
  pages get a back IconButton before the title. Today our desktop pages have no visible title.
- **Header row tools**: notifications (tray icon, count badge), language, theme. The "As of" chip only
  if decision 6 says yes.
- **Phone**: top bar with logo, bell and avatar; page title in the content; tab bar per the TabBar spec,
  with the current tab as an `accent-soft` pill. Focused flows (New sale, Review, Sent, sign-in, set-up)
  hide the tab bar and show back + title.
- **Toast position** moves to the header row (part of 1.3).

## Phase 3: existing screens

All front end unless noted. Done after phases 1 and 2, so each item is only what is left.

| Screen | Main changes | Effort |
|---|---|---|
| Customers | `display` title; "MY CUSTOMERS · n" overline; live search without a Search button; no VAT sub-line; full dates in Last order; 6-month note as the table footer. Phone: "Yours for 6 months" sub-line, Add customer next to the title | S |
| Search, no match | Card "None of your customers matches this name" + "Add as a new customer", which opens Add customer with the name or VAT filled in. Today a name search can't lead to adding | S |
| New sale | One column: customer card (delivery address and Change), four flavour cards (2 × 2 on desktop), full-width price list, one-line delivery instructions, full-width bottom action bar (cartons · units, commission, total incl. VAT, Review) | M |
| Review | Customer card, lines and totals card and PROFORMA card side by side; language as a SegmentedToggle; Send payment request as a tall two-line button in the action bar | S |
| Sent | Solid `accent` success mark; "What happens next" as vertical ProgressSteps; actions in the action bar (stacked on phone) | S |
| Orders | Desktop: status Chip row with counts and an "All customers" SelectPill, search and New sale in the PageHeader, Filters drawer only below 768 px. Phone: round filter IconButton; ListCards with the number, date and pill on line 2 | M |
| Filters | Title "Filter orders"; overline labels; "When" as a chip row; Clear and Show n orders under the fields | S |
| Order page | Vertical ProgressSteps on the left with Proforma PDF and Ask for a correction under them. Right column: What they ordered, Your commission (neutral card, breakdown, gross in accent), Documents (phase 5b). Banner: Call, E-mail and Remind all secondary. Full dates with year. Proforma opens in a DocumentPreview sheet | M |
| Collections | One table with headers (Customer, Late, Amount) and one "Get in touch" menu per row (Call, E-mail, Remind), at every width. Remind isn't red. Footer note inside the card. Phone: 2 KPI tiles, subtitle "2 customers paying late". Decision 11 for the due-soon section | M |
| Reminder panel | Sheet spec; copy check against the prototype | S |
| Earnings | "BY ORDER" overline; two-line order cell ("customer hasn't paid" / "paid 4 Aug 2026"); Coming tile in `accent-soft` with an info tooltip; amounts in `text`; footnote inside the card. Wording depends on decision 4 | S |
| Profile menu | Avatar header without a title; rows without dividers; Language as one row; Theme row (System / Light / Dark); Payment details as a good-tone pill "IBAN ···· 5678"; Events & festivals with an "If invited" pill; Settings opens the Settings page (phase 5c) | S |
| Notifications | Desktop popover, phone bottom sheet; "Mark all as read" at the top; All / Unread chips; groups Today / Yesterday / Earlier; rows with a type icon, bold title, body line and time; unread dot; footer with "Notification settings" and the unread count; "You're all caught up" and EmptyState. Toasts only for Incoming (blue bell + one action), not for every notification. Messages need title and body templates (i18n only) | M |

## Phase 4: new front-end states

| States | Prototype screens | What to build | Effort |
|---|---|---|---|
| Offline / back online | 46 | Banner at the top of the content using react-query's online manager; "You're back online" toast | M |
| Signed out | 47 | Dialog over the scrim instead of the hard redirect; return to the same page after signing in. Change the copy ("Your edits are saved"), since only the sale draft survives today | M |
| No access, Not found | 48 | Full pages inside the shell with an icon box, title, one sentence, Back to Customers / Orders. Needs the API codes from phase 0 | S |
| Add-customer errors | 17, 44 | "One detail is missing" summary, focus the first error, "Not sent for approval. Try again." above the buttons | S |
| Review errors | 42, 43 | Busy button; inline or toast error per the design-system rule (see the disagreements table) | S |

## Phase 5: new features that need backend work

Each one depends on the decisions above. Order them by business value.

### 5a. Add customer as one form (M–L)

Prototype screens 2, 3, 13–17, 19. One sheet replaces our two panels (Find by VAT, then the form):

- **VAT field** with Check: checking → Valid ("Found in the EU register") / not found (inline `bad`
  helper) / register not answering (inline warn card, "fill in the rest and carry on").
- **Form groups:** COMPANY (name, country dropdown, reverse-charge note), BILLING ADDRESS (street,
  postcode and city), "Deliver to the billing address", WHO YOU TALK TO (contact, phone, e-mail).
  Fields filled from the register show "From the register".
- **Already in ANANDA:** the claim, take-over and remind-when-free results replace the form.
- **API:** address split into street, postcode and city. Optional VAT and phone only if decision 5 says
  so. A VIES re-check before the first proforma if we keep the prototype's promise; today an Admin
  reviews it by hand.

### 5b. Documents and upload (L)

Prototype screens 20–25. A Documents card on the order page and "Documents (optional)" on New sale:

- **Upload sheet:** "What is it?" (purchase order, signed order, proof of payment, delivery photo,
  something else + description), FileUpload (drop zone on desktop, Take a photo / Choose a file on
  phone; PDF, JPG, PNG, HEIC up to 10 MB), an optional note for the Admin.
- **Inline errors:** too big, wrong type, connection dropped (resends the same file).
- **Upload status pills:** New / Admin checking / Seen by Admin. A file can be removed until the Admin
  opens it.
- **System documents** (proforma, delivery note, invoice) appear as DocumentRows.
- **API:** file storage (none today), an order-documents table, upload, list and delete endpoints with
  server-side type and size checks, attachment during New sale, Admin notification, and an "opened by
  Admin" state. Depends on decision 9.

### 5c. Settings (L in total)

Prototype screens 54–64. A full page opened from the profile menu: a section list beside the
content on desktop; on phone, a list that opens each section.

| Section | Needs |
|---|---|
| Profile | Name, phone, photo, sign-in e-mail change by link; language and theme. API: `PATCH /me` with name, phone and theme, photo storage, e-mail verification |
| Company and payouts | Read-only company details from the register, "Ask to change" (a new request type), bank account summary. API: a Broker company record |
| Change bank account, SMS code, account on hold | New IBAN → 6-digit SMS code → payouts move to the new account after 24 hours, can be cancelled, e-mail to the Broker and Admins. API: SMS provider, one-time codes, verified phone, pending IBAN with a start time. Decide whether it also applies the first time bank details are added |
| Agreement and invoices | Signed agreement (version, dates, download); monthly commission invoices with Upload, received and paid states. API: agreement records, file storage, invoice status. Depends on decision 4 |
| Notifications | Per-event and per-channel preferences, daily summary, quiet hours. API: preferences table, summary job, push (if "Phone" means push) |
| Selling defaults | Default proforma language, reply-to, signature, reminder tone. API: user fields, reminder templates in three tones and two languages |
| Security | Sign-in method, signed-in devices with "Sign out" and "Sign out everywhere else". API: device, IP and last-seen on sessions |
| Account | Export my data (ZIP by e-mail), Ask to close my account. API: export job, close-account request |

### 5d. Invite, sign-in and set-up (L)

Prototype screens 26–39, depending on decision 2:

- **Invite e-mail** (HTML), Accept the invite (Google or an e-mail link, terms in a sheet), wrong Google
  account, Check your e-mail, Sign in, link expired, no account.
- **Set-up in three steps** with no app shell, "Saved as you go":
  1. Company, in Bulgaria (look-up by VAT/EIK) or abroad.
  2. Bank details: currency, bank address outside SEPA, optional bank letter.
  3. Sign the contract: Evrotrust / B-Trust, or download, sign and upload.

  It ends on "That's everything we need", with countersigning pending.
- **API:** invites (token, expiry, inviter) and an Admin "Invite Broker" screen; sign-in links (single
  use, 15 minutes, rate-limited); Google OAuth matched to the invite; passwords removed or kept per
  decision 2; terms version and acceptance; Broker company profile; Commercial Register look-up; file
  storage; e-signature integration; Admin countersign; a gate that sends Brokers to set-up until
  they finish.

### 5e. "As of" date (L, only if decision 6 says yes)

Prototype screens 49–50:

- **Calendar popover** (Today, End of last month / quarter / year, month grid). A past date shows a warn
  bar on every page and makes the app read-only.
- **API:** an `asOf` parameter on every Broker read, rebuilding status, lateness, owed amounts and
  commission at that date, and ownership history (we store only the current owner). The server must
  refuse writes in this mode.

## Suggested order

| Step | Contents | Effort |
|---|---|---|
| 1 | Phase 0 fixes | S |
| 2 | Decisions 1, 3, 7, 8, 11 (they only change copy or the UI) | — |
| 3 | Phase 1: tokens, type, components, loading and errors | L |
| 4 | Phase 2: shell, rail, PageHeader, header tools | M |
| 5 | Phase 3: existing screens | L |
| 6 | Phase 4: front-end states | M |
| 7 | Decisions 2, 4, 5, 9, 10, then phases 5a → 5b → 5c → 5d by value | L each |
| 8 | Phase 5e only if decision 6 says yes | L |

Steps 3–6 need no backend work except the `theme` field and the API error codes. After them the app
matches the design system for everything that exists today, in dark and light, EN, BG and HE.

## Screen coverage

Every prototype screen, what we have, and the phase that covers it.

| # | Prototype screen | Ours | Phase |
|---|---|---|---|
| 1 | Customers (home) | Partial: `/customers` | 3 |
| 2 | Add customer · VAT found, filled in | Partial: Find by VAT → New customer panels | 5a |
| 3 | Add customer · ready to send | Partial | 5a |
| 4 | New sale in cartons | Partial: `/sales/new` | 3 |
| 5 | Review and send | Partial | 3 |
| 6 | Payment request sent | Partial: `/sales/sent/[id]` | 3 |
| 7 | Orders | Partial: `/orders` | 3 |
| 8 | Orders · Filters drawer | Partial | 3 |
| 9 | Order page | Partial: `/orders/[id]` | 0, 3 |
| 10 | Collections | Partial: `/collections` | 0, 3 |
| 11 | Earnings | Partial (close) | 3 |
| 12 | Profile menu | Partial: Profile panel | 3 |
| 13 | Add customer · empty | Partial | 5a |
| 14 | Add customer · checking the VAT | Partial | 5a |
| 15 | Add customer · VAT not found | Partial | 5a |
| 16 | Add customer · register not answering | Partial | 5a |
| 17 | Add customer · missing details | Partial | 4, 5a |
| 18 | Search · finds your customer | Partial | 3 |
| 19 | Search · no match, add it | Partial | 3 |
| 20 | Order page · documents | Missing | 5b |
| 21 | Upload a document | Missing | 5b |
| 22 | Upload · file too big | Missing | 5b |
| 23 | Upload · wrong file type | Missing | 5b |
| 24 | Upload · stopped halfway | Missing | 5b |
| 25 | New sale · document attached | Missing | 5b |
| 26 | Invite e-mail | Missing | 5d |
| 27 | Accept the invite | Missing | 5d |
| 28 | Accept the invite · logo panel | Missing (switched off in the prototype) | 5d |
| 29 | Accept the invite · terms open | Missing | 5d |
| 30 | Google account not invited | Missing | 5d |
| 31 | Check your e-mail | Missing | 5d |
| 32 | Sign in · returning | Partial: password `/login` | 5d |
| 33 | Sign-in link expired | Missing | 5d |
| 34 | Sign in · no account (no invite) | Missing | 5d |
| 35 | Set-up 1 · company in Bulgaria | Missing | 5d |
| 36 | Set-up 1 · company abroad | Missing | 5d |
| 37 | Set-up 2 · bank details | Partial: Payment details panel | 5d |
| 38 | Set-up 3 · sign the contract | Missing | 5d |
| 39 | Set-up · done | Missing | 5d |
| 40 | Orders · loading | Partial: "Loading…" text | 1 |
| 41 | Customers · loading | Partial | 1 |
| 42 | Review · sending the payment request | Partial: label changes to "Sending…" | 1, 4 |
| 43 | Review · couldn't send | Partial: generic error box | 4 |
| 44 | Add customer · couldn't save | Partial | 4 |
| 45 | Orders · couldn't load | Partial: generic error box | 1 |
| 46 | Customers · offline | Missing | 4 |
| 47 | Signed out | Missing: hard redirect | 4 |
| 48 | Customer · no access | Missing: generic error | 0, 4 |
| 49 | Calendar · today | Missing | 5e |
| 50 | Calendar · looking back | Missing | 5e |
| 51 | Notifications · unread | Partial: side panel | 3 |
| 52 | Notifications · all read | Missing | 3 |
| 53 | Notifications · empty | Partial: "Nothing new." | 3 |
| 54 | Settings | Missing | 5c |
| 55 | Settings · profile | Partial: language in Profile | 5c |
| 56 | Settings · company and payouts | Missing | 5c |
| 57 | Settings · change bank account | Partial: Payment details panel | 5c |
| 58 | Settings · confirm with SMS code | Missing | 5c |
| 59 | Settings · new account on hold | Missing | 5c |
| 60 | Settings · agreement and invoices | Missing | 5c |
| 61 | Settings · notifications | Missing | 5c |
| 62 | Settings · selling defaults | Missing | 5c |
| 63 | Settings · security | Missing | 5c |
| 64 | Settings · account | Missing | 5c |

## How this was compared

- Every prototype screen was rendered offline in Chrome, desktop and phone (128 screenshots). Our app was
  captured at 1440 px and 390 px, signed in as Ivan on fresh demo data. Each screen was compared against
  ours, our code, and the design system's README, tokens and component specs.
- The prototype's phone screenshots came out in its "looking back to 31 Oct" mode, carried over from the
  calendar screen. That disabled its primary buttons in those shots. The comparison allowed for it;
  desktop screenshots were not affected.
- The prototype is not pixel truth: where it deviates from the design system, this plan follows the
  design system.
- Admin-only screens in the prototype source (approvals, Admin orders and customers, warehouse) are not
  covered. They belong to the Admin app.
