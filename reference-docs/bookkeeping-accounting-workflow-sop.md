# Bookkeeping & Accounting Workflow

**Category suggestion:** Finance (or Operations & Admin, if you'd rather not create a new category)

## Purpose

This defines who touches Revital Productions' financial data, where each person works, and how the in-house bookkeeper and outside accountant/CPA stay in sync. It exists so a new hire or a new outside accountant can read one page and know exactly how this works, instead of relying on institutional memory.

## Roles

**In-house bookkeeper** is a Revital Productions team member (has a revitalproductions.com Google account) responsible for day-to-day bookkeeping: categorizing transactions, reconciling accounts, and keeping the books current in QuickBooks Online. They're assigned the Finance role in the Hub's Team Access tool, which gives them the Financial Center dashboard along with the Contract & Invoice Tracker, Subscription Tracker, and Budget Pacing views — the agency-specific numbers that don't live in QuickBooks. Their primary workspace for actual bookkeeping is still QuickBooks Online itself; the Hub is the consolidated summary view on top of it.

**Outside accountant/CPA** is not a Revital Productions employee and does not get a Hub account. They're invited directly into QuickBooks Online as an Accountant user (QuickBooks Online → Manage Users → Accountants → Invite Accountant), which gives them full accounting-level access to the company file without using a regular paid user seat and without needing any access to the Hub. Their review work — periodic reconciliation checks, tax prep, year-end close — happens entirely inside QuickBooks.

## Where the numbers live

QuickBooks Online is the single source of truth for all real accounting data (transactions, account balances, reports). Both the in-house bookkeeper and the outside accountant see the exact same live company file, so there's no manual hand-off of numbers between them and no risk of the two working from different versions of the truth.

The Hub's Financial Center is a summary dashboard on top of QuickBooks, not a replacement for it — it pulls cash, revenue, expenses, and credit card balance from QuickBooks with a manual "Sync Now," and combines that with agency-specific figures (outstanding invoices, software subscription costs) that QuickBooks itself doesn't track. It's built for a fast leadership/finance glance, not for the detailed bookkeeping work itself.

## How they communicate

Since both parties already work from the same live QuickBooks file, day-to-day communication between the in-house bookkeeper and the outside accountant is lightweight — mostly flagging questions, unusual transactions, or requesting documents, not relaying numbers. Email is the default channel, since it's the lowest-friction option for someone outside the company's day-to-day tools (ClickUp, Slack, the Hub).

It's worth setting a recurring check-in cadence between the two — monthly or quarterly, whichever matches your filing rhythm — so review happens on a schedule rather than only reactively when something looks wrong. Any documents that need to pass between them (receipts, bank statements, prior filings) can be attached directly to the relevant transaction inside QuickBooks, which keeps them tied to the record they belong to instead of scattered across email threads.

## Access summary

| Person | Gets access to | Does not get |
|---|---|---|
| In-house bookkeeper | QuickBooks Online (regular user), Hub Finance role (Financial Center, Contract & Invoice Tracker, Subscription Tracker, Budget Pacing) | Client production/creative/sales sections of the Hub |
| Outside accountant/CPA | QuickBooks Online (Accountant-invite access) | Any Hub account at all |

## Current QuickBooks setup (October 2026)

- **Plan:** QuickBooks Online **Simple Start** (upgraded from Free to enable the Stripe sync). Bill Pay is Essentials-only; until contractor/vendor volume justifies Essentials, pay contractors by ACH from the business bank account and log each payment as an expense against the vendor (this also tracks 1099-NEC totals: the reporting threshold was $600 for payments through 2025 and is $2,000 for payments made in 2026 onward - confirm with your CPA).
- **Connected:** the business bank account and the **Stripe Connector** (Apps → Stripe). Stripe charges, fees and payouts appear under Transactions → Integration transactions → Stripe, where the bookkeeper reviews and confirms them. Stripe payouts go straight to the business checking account (Stripe → Settings → Payouts → Payout destinations: *Transfer all revenue to your payout bank account*, set Oct 2026), not to Stripe's own Business/Treasury account; confirm the bank's last four digits match the real checking account.
- **Clients:** every client should exist as a QuickBooks customer so Stripe payments can be matched to them. Evry Intention LLC, ImTheThird and TheHighTable were added Oct 20, 2026; add each new client when their profile is created.
- **First-payment check:** the first real Stripe payment should show up in Integration transactions within hours; confirm the fee is split out as an expense. (The Hub also emails invoices@ and the account manager when a first payment arrives.)
- **Payment links:** only links generated in the Hub are tied to the Contract & Invoice Tracker; hand-made Stripe links still reach QuickBooks through the connector but won't update the Tracker.

*Last updated: October 2026*
