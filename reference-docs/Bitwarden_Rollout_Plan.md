# Bitwarden Rollout Plan

Drafted Aug 2026 in response to "Setup Bitwarden" on the Hub bug/feature list. Covers: which plan to buy, whether it can be tried before paying, and what (if anything) can integrate with the Hub itself.

## Recommended plan: Teams, $4/user/month (billed annually)

Confirmed directly from bitwarden.com/pricing as of Aug 2026:

| Plan | Price | Notes |
|---|---|---|
| Free | $0 | Personal use only - no organization/team sharing beyond one other person |
| Premium | $1.65/mo | Still personal, 1 account |
| Families | $3.99/mo | Up to 6 people - too small and not built for business use (no admin controls, audit logs, or provisioning) |
| **Teams** | **$4/user/mo** | Shared collections, event/audit logs, directory sync, SCIM provisioning - the right tier for an agency team |
| Enterprise | $6/user/mo | Adds SSO, self-hosting, advanced access control - overkill unless you specifically need SSO or self-hosting |

Teams is the right fit: it gives every teammate their own login, lets you organize shared logins into collections (e.g. "Client Ad Accounts," "Internal Tools"), and gives you an audit trail of who accessed what. Enterprise's extra features (SSO, self-hosting) aren't something this team needs today.

**Cost estimate:** $4/user/month × 12 = $48/user/year. Multiply by however many Hub accounts should get a Bitwarden seat (not necessarily everyone in Team Roster - see Rollout Steps below for who actually needs one first).

## Can it be set up without paying first? Yes, two ways

You mentioned seeing an option to create an account without buying a plan - both of these are real:

1. **Genuinely free, forever, but capped at 2 people.** Bitwarden's Free tier includes creating a "Free organization" that can share vault items with exactly **one other existing Bitwarden user**. Good for a small pilot (you + one teammate) to get a feel for shared collections before spending anything, but it will not scale to the whole team.
2. **Free trial of the actual Teams plan.** The Teams pricing card has a "Start Free Trial" button, so you can try the real multi-seat product before paying. Bitwarden's pricing page doesn't state the trial length or whether payment info is required upfront - worth confirming during signup rather than assuming.

## Hub integration: not possible, by design

Checked what a "Hub integration" could realistically mean and confirmed there's no path to it:

- Bitwarden's **zero-knowledge encryption** means vault contents (the actual saved passwords) are never accessible to Bitwarden itself, let alone a third-party app - there is no API that lets an external tool like the Hub read or write vault items. This isn't a missing feature, it's the core security guarantee the product is built on.
- The only programmatic surface Bitwarden exposes to an organization is around **account provisioning** - SCIM/directory sync (Teams and up) automates creating and deactivating Bitwarden *accounts* to match a directory, not accessing what's stored inside them.
- Given the Hub already gates every teammate by their `@revitalproductions.com` email (Cloudflare Access + Firebase), a SCIM sync isn't adding much value at this team's size - it's built for automatically de-provisioning people in bulk at bigger headcounts. Worth revisiting only if the team grows a lot or turnover picks up.

**Bottom line:** there's no "click a saved password from inside the Hub" feature to build. Bitwarden stays a separate app/browser extension; the two systems just happen to be gated by the same email domain.

## Rollout steps

1. **Pilot first (optional, free).** Create a Free organization with one other trusted teammate to get comfortable with collections, sharing, and the browser extension before spending anything.
2. **Start the Teams free trial** with the real team once ready to test at scale - confirm trial length/payment requirement at signup.
3. **Decide who actually needs a seat first.** Not necessarily everyone in Team Roster on day one - a sensible first wave is anyone who currently has, or needs, shared access to client ad accounts, hosting/domain logins, or other shared credentials (this overlaps heavily with who has broader Team Access sections in the Hub already).
4. **Structure collections to mirror how the Hub already separates access** - e.g. a collection per client's ad accounts, one for internal tools/subscriptions, one for hosting/domains. This has to be set up and maintained manually inside Bitwarden; nothing here syncs automatically from Team Access.
5. **Subscribe to Teams annually** once the pilot/trial confirms it's a fit, at $4/user/month billed annually for the confirmed headcount.
6. **Revisit SCIM/directory sync later** if headcount or turnover grows enough that manually adding/removing Bitwarden seats becomes a real burden - not worth the setup effort at today's team size.

Sources:
- [Bitwarden Pricing & Plans](https://bitwarden.com/pricing/)
