# ANANDA Sales Agent

The field sales agent's app: find a business by VAT, add or claim it, sell in cartons, send the
proforma, chase late money and see your commission. Desktop (sidebar + right-hand panels) and phone
(tab bar + bottom sheets), in English, Bulgarian and Hebrew (right-to-left).

Built from `ANANDA Sales Agent PRD.pdf` (9 Nov 2026). All 12 screens and the 14 use cases are in;
P2 items are listed under [Not built yet](#not-built-yet).

- **Backend:** NestJS 11, Drizzle ORM, PostgreSQL 17 (`apps/api`)
- **Frontend:** Next.js 16 (App Router), React 19, TanStack Query, next-intl (`apps/web`)
- **Shared:** `packages/shared` holds the business rules both sides use: price tiers, VAT and reverse
  charge, commission, the 6-month ownership rule, due dates, VAT-number and IBAN checks, API types

## Run it

### In Docker

```bash
cp apps/api/.env.example apps/api/.env      # then set DATA_KEY: openssl rand -base64 32
docker compose up -d --build                # web http://localhost:3020 · API :4020 · inbox http://localhost:8027
```

On start the API applies migrations and seeds the demo data into an empty database. The images run in
production mode, so `db:reset` is refused inside them. For a fresh start, run `docker compose down -v`
(this deletes the database volume), then `up` again. The containers read `DATA_KEY` and `SELLER_*` from
`apps/api/.env`.

### For development

Requirements: Node 22+ (tested on 26), pnpm 11, Docker.

```bash
pnpm install
docker compose up -d db mail                # Postgres :5434, Mailpit SMTP :1027 (inbox http://localhost:8027)
cp apps/api/.env.example apps/api/.env      # then set DATA_KEY: openssl rand -base64 32
pnpm db:reset                               # empty database, migrations, demo data
pnpm dev                                    # API http://localhost:4020/api · web http://localhost:3020
```

Sign in with password `ananda-demo-2026`:

| User | Role | What to try |
| --- | --- | --- |
| `ivan@ananda.test` | Sales agent (Ivan Petrov) | Search `BG203145882` → add → (approve as admin) → open the notification → sell → send |
| `admin@ananda.test` | Admin | `/admin`: approve customers and requests, confirm payment, deliver, invoice |
| `maria@ananda.test` | Sales agent | Owns Plovdiv Wine House (another agent's customer for Ivan) |

Demo VAT numbers: `BG203145882` not a customer yet · `BG103562271` free to claim · `BG115620839` another
agent's. Every e-mail (proformas with the PDF, reminders, Admin copies) lands in Mailpit.

Ports differ from `ananda-admin` (5433 / 4010 / 3010) so both run side by side.

### On Vercel

`vercel.json` deploys one project with two [services](https://vercel.com/docs/services) on one domain:

| Service | Root | Public path |
| --- | --- | --- |
| `api` (NestJS) | `apps/api` | `/api/*` |
| `web` (Next.js) | `apps/web` | everything else |

There are no bindings, because neither service calls the other from its own server. The browser calls the
relative `/api`, and the top-level rewrite sends it to `api`, so the session cookie stays first-party. Run
both services together locally with `vercel dev -L`.

Before the first deploy:

- **Database:** a hosted Postgres, such as Neon from the Vercel Marketplace (use its pooled URL). The `api` build runs
  the migrations (`pnpm db:migrate`), so give preview deployments their own database or branch.
  Load demo data once with `DATABASE_URL=… pnpm db:seed` if you want it.
- **Environment variables:** `DATABASE_URL`, `DATA_KEY` (keep the same key, or stored IBANs and contacts
  become unreadable), `SMTP_*`, `MAIL_FROM`, `SELLER_*`, and `CRON_SECRET`.
- **Cron:** Vercel Cron calls `GET /api/cron/free-reminders` daily at 06:00 UTC with
  `Authorization: Bearer $CRON_SECRET` (refused when `CRON_SECRET` isn't set). Hobby allows daily crons
  only; on Pro, `0 * * * *` makes it hourly. Self-hosted, the in-process `@Cron` runs it hourly.
- **Demo data on a public URL:** seed with `SEED_PASSWORD=…`, so the users don't get the password printed here.
- The login limit (5 failures per 15 minutes) is stored in Postgres, so it holds across function instances.

## Tests

```bash
pnpm test             # business rules, incl. the PRD's figures (12 cartons → €1,779.84, €144.00 commission)
pnpm test:journey     # API end to end against a running API on fresh demo data (pnpm db:reset first)
```

The journey test covers Journey 1 (search → add → approve → notification → send, including a
double-tapped send making one proforma), claiming, take-over privacy, reminders with the 24-hour cap,
IBAN validation and access rules. Walked through the UI, Journey 1 takes **13 clicks and fields**
(PRD target ≤ 13).

## How it fits together

```
apps/web  ── /api/* rewrite ──▶  apps/api (NestJS)  ──▶  PostgreSQL
                                     ├─ EU VIES REST API (3 s timeout, cached, manual fallback)
                                     ├─ SMTP (Mailpit locally)
                                     └─ pdfkit + DejaVu Sans (proforma in EN / BG)
```

- **API modules:** `auth` (e-mail + password, hashed session tokens in an httpOnly cookie, rate-limited
  login), `customers` (overview, search + VIES, add, claim, take-over, free-from reminder, price
  requests), `orders` (send payment request, orders, order page, PDF, corrections, reminders,
  collections, earnings), `me` (language, payment details), `notifications` (bell, deep links, hourly
  free-from job), `admin` (the Admin steps the agent waits on).
- **Money** is integer cents everywhere; VAT and commission are rounded once per document by the shared
  rules, so the screen, the PDF and the stored order agree.
- **Sending is idempotent:** the sale draft carries a key; a retry or double tap returns the first
  proforma (unique index on agent + key).
- **The sale draft** (quantities, instructions, language) is kept in the browser, so it survives closing
  the app or losing connection.
- **Privacy:** customer contact data and IBANs are encrypted at rest (AES-256-GCM, `DATA_KEY`); the full
  IBAN never leaves the API. Another agent's customer shows only agent name, last order and free-from date.
- **Audit:** `audit_log` is append-only (a trigger rejects UPDATE and DELETE). It records approvals,
  claims, take-overs, price requests, proforma sends, reminders, corrections and payment-detail changes.
- **RTL:** layout uses CSS logical properties only, so Hebrew mirrors without separate styles.

## Decisions taken on the PRD's open questions

The PRD lists these as needing a decision; the app ships with the defaults below, each easy to change.

| Question | Default in this build | Where |
| --- | --- | --- |
| Does claiming a free customer need Admin approval? | No: claim → straight to New sale (≈ 8 taps) | `CustomersService.claim` |
| Commission net vs gross | New sale shows **net** (labelled). Review, order page and confirmation spell out net + VAT = gross. Earnings shows **incl. VAT** (labelled) | screens |
| Price tiers | Admin app's tier table (€5.15 from 1 carton, €5.10 from 210 …), but with the PRD's 1-carton minimum (Admin uses 42). The prototype's €2.40 for S-0010 is not reproduced | `packages/shared/src/domain.ts` |
| Does a cancelled order restart the 6-month clock? | No: cancelled orders don't count as the last order | `AdminController.advance` |
| Orders filters: chips or drawer? | One Filters drawer on desktop and phone, live count before applying (#10) | `orders/page.tsx` |
| Date and language in the header? | Moved to the profile (#19); the header has breadcrumb and bell only | `AppShell` |
| Payment terms per customer | The Admin sets them at approval (default "due on receipt"). Shown on the customer card, New sale and Review | `admin/customers/:id/approve` |
| When is "due on receipt" late? | After the 7-day stock hold, so a fresh proforma reads "Waiting for payment" | `dueDateFor` |
| VIES down or VAT invalid | Retry, or enter by hand; hand-typed customers are flagged for Admin review. A stale cached VIES result is used if VIES is down | `ViesService`, `FindPanel` |
| Who receives "Ask to take over"? | The Admins (e-mail + `/admin`); the agent sees "Take-over requested" until decided | `requestTakeOver` |
| Proforma validity | 14 days (PRD); the Admin app uses 7 | `PROFORMA_VALIDITY_DAYS` |
| Reminder frequency cap | One per order per 24 hours | `REMINDER_COOLDOWN_HOURS` |

Also needs a check before go-live: the reverse-charge wording on the PDF (accountant), and the seller's
legal details and bank account (`SELLER_*` in `.env`, placeholders now).

## Not built yet

- **Shared backend with the Admin app.** The PRD makes the Admin app the single source of truth. This repo
  has its own database and mirrors the Admin rules in `packages/shared`. Connecting it means pointing at
  the Admin database/API or publishing one shared rules package.
- **P2 backlog:** Events & festivals and Settings (they open a short note), Journey 1 analytics, and
  changing the delivery address per sale.
- **NFR gaps:** 2FA and SSO, push notifications (in-app bell only), e-mail bounce webhooks (a failed send
  is caught and flagged, but a later bounce is not), error tracking, logging views of contact data, a
  data-retention job, and a light theme.
- **Stock levels.** The proforma records a 7-day hold date; the warehouse stock itself lives in the Admin app.
