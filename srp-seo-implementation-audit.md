# Simple Roster Plus — SEO Implementation Audit

**For ChatGPT architecture decision: SEO Operations Console**

| | |
|---|---|
| **Repo** | `https://github.com/ellodanem/simplerosterplus.git` |
| **Inspected** | `main` @ `bf59e57` (“Harden site-wide SEO verification”) |
| **Local path** | `C:\Cursor Projects\simple roster plus\srp` |
| **Constraint** | Discovery only at time of audit; no code changes were made |
| **Audit date** | 15 August 2026 |
| **Local `seo:check`** | Pass — 0 FAIL across all 7 indexable pages |

This document is the verified technical report of the current Simple Roster Plus SEO implementation. It is intended as input for the next architecture decision on a separate internal SEO Operations Console.

---

## A. Executive Summary

Simple Roster Plus is a **good first project** for an external SEO Operations Console. The marketing surface is small, already indexable, and already has a **project-local validation gate** that a console can call rather than reinvent.

**What actually exists today**

- Marketing is **hand-authored static HTML** in `landing-page/`, hosted separately from the Next.js app.
- **7 indexable URLs** (homepage + the six commercial pages originally listed). Those six commercial URLs match the repo exactly. No extras, no missing ones.
- Shared **footer generation + drift check**. Headers, CSS, copy, and `<head>` metadata are **not** generated.
- Strong local verification: `npm run seo:check` (ran during audit; **0 FAIL**). Production verify exists (`seo:verify`) but is **manual, per-page, and writes artifacts**.
- **No GitHub Actions.** Nothing in CI currently blocks a bad SEO deploy.
- **No Search Console, GA4, GTM, Bing, rank, or backlink integration** in the repo.

**Opinionated verdict**

1. **Keep the console separate.** Do **not** put an in-app SEO CMS inside the Next.js product. Marketing is not served by Next.js. A draft/publish database would fight the current Git-backed static HTML model.
2. **Git as source of truth is the right long-term model** for this site. It is **over-engineered for v0.1**. There are 7 HTML files. Humans already edit them in Git. The missing capability is **visibility**, not an editor.
3. **Do not keep polishing technical SEO.** Foundation work is largely done. Remaining SRP work before Console v0.1 is a short list (app `noindex` is the only real technical risk found). Then shift to Search Performance Baseline.
4. **Do not duplicate `seo:check` / `seo:verify` in the console.** Call them. Surface the results.

---

## B. Current Architecture

### Where the marketing site lives

| Surface | Host | Code | Stack |
|---|---|---|---|
| Marketing | `https://www.simplerosterplus.com` | `landing-page/` | Static HTML, no bundler, no SSG |
| App | `https://app.simplerosterplus.com` | repo root (`app/`, Next 16) | Next.js App Router, Clerk, Prisma |
| Operator console (product ops, not SEO) | `admin.simplerosterplus.com` (documented) | `app/ops/` | Same Next.js app |

**Same git repository.** Different deploy roots. `landing-page/vercel.json` is the only Vercel config in-repo:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "cleanUrls": true,
  "trailingSlash": false
}
```

There is **no** root `vercel.json`, **no** `.github/`, **no** `.vercel/` in the working tree. Production-from-`main` and preview deploys are **inferred** as standard Vercel Git integration, not proven from repo files. Treat “two Vercel projects, marketing Root Directory = `landing-page`” as the working assumption until confirmed in the Vercel dashboard.

Git remotes / branch at audit time:

- `origin` → `https://github.com/ellodanem/simplerosterplus.git`
- Active branch: `main` tracking `origin/main` @ `bf59e57`

### How pages are created

New commercial pages are **copied HTML files**:

- `landing-page/<slug>/index.html` for commercial URLs (cleanUrls → `/<slug>`)
- `landing-page/index.html` for `/`
- `landing-page/privacy.html` → `/privacy`
- `landing-page/terms.html` → `/terms`

There is **no** template engine, shared CSS file, or head partial. Each commercial page is ~900–1,300 lines of HTML with **duplicated embedded CSS**, duplicated header markup, and a duplicated JSON-LD block.

**Shared pieces**

| Piece | Mechanism |
|---|---|
| Footer | Generated into HTML between `<!-- BEGIN GENERATED MARKETING FOOTER -->` markers by `scripts/seo/footer-generator.mjs` |
| Header | Hand-copied per page. Homepage: logo + Log in + Start Free. Commercial: logo + **in-page** anchors + CTAs. Not a site-wide nav. |
| Mobile marketing nav | Not a hamburger. Commercial headers wrap `.header-nav` under logo/CTAs at ≤820px (commit `99be171`). Homepage has no in-page nav. |
| Sitemap / robots | Hand-maintained files in `landing-page/` |
| App CTAs | Hardcoded absolute `https://app.simplerosterplus.com/...` in HTML. Homepage also has `window.SRP_APP_*` JS constants. |

**Build scripts:** marketing has **no build**. App build is `prisma generate && migrate && next build` — irrelevant to marketing HTML.

**Stale docs (do not trust without re-reading HTML)**

- `landing-page/MAPPING.md` still lists an old homepage title (`Simple Roster Plus | Weekly Schedules & Attendance for Managers`). Live title is **Employee Roster Software for Small Teams | Simple Roster Plus**.
- `landing-page/LANDING-PAGE.md` says OG image is `solution-attendance.png`; live homepage OG image is `app-roster-week.png`. Mentions a sibling `landing page/` experiment folder; **that folder is not in this repo now**.
- `docs/seo-phase-3-site-structure-audit.md` (24 Jul 2026) says only leave + time-clock have runner configs. **Obsolete.** Homepage + all six commercial pages are in `page-configs.mjs` now.
- `docs/seo-validation-audit.md` (16 Jul 2026) describes a 1-page site with no robots/sitemap. **Historical only.**

### Positioning (verified from rules + live homepage)

- Product lens: managers create weekly schedules and track attendance in minutes; Auto Scheduler keeps it fast and simple.
- Customer-facing copy must **not** say “AI”; use **Auto Scheduler**.
- Canonical marketing host: `https://www.simplerosterplus.com`
- App: `https://app.simplerosterplus.com`

---

## C. SEO Tooling Inventory

`npm run seo:check` was run on current `main` during the audit.

- Footer check: 7/7 PASS
- Site-wide: 6 PASS, 0 FAIL
- Per-page: 0 FAIL
- Warnings only from the risky-claim scanner (homepage SMS/WhatsApp/Auto Scheduler; SMB “mobile app” / “self-service”)

| Path / command | Purpose | Inputs | Outputs | Mutates? | Pages | Reusable by Console? |
|---|---|---|---|---|---|---|
| `npm run seo:check` | Footer drift + site-wide uniqueness + per-page static SEO | `landing-page/**`, `page-configs.mjs` | stdout PASS/WARN/FAIL, exit 1 on FAIL | Read-only | All 7 configured, or one via positional key | **Yes — primary gate.** No network. |
| `npm run seo:check:all` | **Identical** to `seo:check` with no page key | same | same | Read-only | All 7 | Redundant alias. |
| `npm run seo:verify` | Live production/browser/Lighthouse | `--page <key>` or `--url` | stdout + `artifacts/seo-verification/<key>/` (gitignored) | Writes artifacts only | One URL per run | Yes, but slow, flaky-ish (Lighthouse), needs Chromium. Not a default PR gate. |
| `npm run footer:generate` | Rewrite generated footer regions | `footer-generator.mjs` page list | HTML files | **Yes** | Homepage + 6 commercial | Call only as a controlled mutation. |
| `npm run footer:check` | Drift vs template | same | stdout, exit 1 on drift | Read-only | same 7 | Already chained into `seo:check`. |
| `npm run seo:selftest:site-wide` | In-memory fixture tests for site-wide helpers | fixtures + real HTML | stdout | Read-only | n/a | Optional CI unit test. |
| `scripts/seo/page-configs.mjs` | Expected title/H1/canonical/schema/internal links | hardcoded | consumed by check/verify | n/a | 7 keys | This **is** the page inventory contract. |
| `scripts/seo/shared.mjs` | Extractors, canonical rules, CTA allowlist, Lighthouse thresholds | — | helpers | n/a | — | SRP-specific (`www.simplerosterplus.com` hardcoded). |
| `scripts/seo/site-wide.mjs` | Duplicate titles/descriptions; sitemap ↔ config | configs + HTML + sitemap | reporter | Read-only | all configured | Yes, via `seo:check`. |
| `scripts/seo/prohibited-claims.mjs` | WARN-only claim scan | HTML text | WARN excerpts | Read-only | any | Useful; not blocking. |
| `scripts/seo/lighthouse.mjs` | Mobile Lighthouse via Playwright Chromium | live URL | html/json + scores | Writes artifacts | one URL | Production-only. Thresholds: SEO 100 FAIL, A11y 90 FAIL, BP 90 FAIL, Perf 75 WARN. |
| `landing-page/robots.txt` | Allow all + sitemap URL | hand-edited | served as `/robots.txt` | — | site | Do not let console rewrite blindly. |
| `landing-page/sitemap.xml` | 7 indexable URLs, hand-edited | hand-edited | served as `/sitemap.xml` | — | 7 | Must stay in lockstep with `page-configs`. |
| `docs/seo-verification-runner.md` | Operator guide | — | — | — | — | Authoritative for CLI behavior. **Phase 4F CI is explicitly not done.** |

**package.json scripts (verified)**

```json
"footer:generate": "node scripts/seo/footer-generator.mjs",
"footer:check": "node scripts/seo/footer-generator.mjs --check",
"seo:check": "npm run footer:check && node scripts/seo-check.mjs",
"seo:check:all": "npm run footer:check && node scripts/seo-check.mjs",
"seo:selftest:site-wide": "node scripts/seo/site-wide-selftest.mjs",
"seo:verify": "node scripts/seo-verify.mjs"
```

**Not found**

- Sitemap generator
- Header generator
- GitHub Action / Vercel build command for SEO
- JSON machine-readable report from `seo:check` (stdout only)
- GSC / GA / GTM / Bing / rank / backlink code
- `FAQPage` schema (omitted **on purpose** in Phase 1)

**Reliability**

- Static check: **high**. Deterministic, no network, currently green.
- Production verify: **medium**. Needs Playwright Chromium, live DNS, Lighthouse. Designed as post-deploy smoke, not merge gate.
- Risky-claim scan: **noisy by design** (homepage always WARNs on “Auto Scheduler” / “SMS” even when labeled Coming soon). Do not treat WARN as FAIL.

**Console call shape (already possible)**

```bash
npm run seo:check                  # gate
npm run seo:check -- homepage      # single page + still runs site-wide
npm run seo:verify -- homepage     # post-deploy / preview URL
```

Gap: no `--json` output. Console would parse stdout or a tiny JSON reporter can be added later **in SRP**, not in the console.

---

## D. Current Page & Metadata Model

**Authoritative store: the HTML file.** Not a config, not a CMS, not the database.

| Field | Where it lives | Shared? |
|---|---|---|
| `<title>` | Hardcoded in each `<head>` | Also duplicated in `page-configs.mjs` as exact-match expectation |
| Meta description | Hardcoded per page | Checked for **existence** + **cross-page uniqueness**, not exact string match |
| Canonical | Hardcoded `<link rel="canonical">` | Exact-match vs `page-configs`; OG `og:url` must equal it |
| H1 | Hardcoded in hero (`<span class="accent">` allowed; checker flattens tags) | Exact-match vs `page-configs` |
| JSON-LD | Hardcoded `<script type="application/ld+json">` | Homepage: Organization + WebSite + SoftwareApplication + Offers. Commercial: WebPage + BreadcrumbList |
| Open Graph | Hardcoded per page | `og:url` enforced; `og:title`/`og:description`/`og:image` **not** exact-matched |
| Twitter | Present on all 7 indexable pages | **Not checked** by the runner. Homepage lacks `og:image:alt` / `twitter:image:alt`; commercial pages have them |
| Body copy | Hardcoded | Unchecked except risky-phrase WARN |
| Images/alt | Hardcoded `<picture>`/`<img>` | Alt required (empty allowed); local files must exist; WebP WARN only if PNG with zero WebP refs |
| Internal links | Hardcoded + generated footer | Required hrefs from `page-configs`; all local hrefs must resolve |

### Live metadata (verified from HTML)

| Page | Title | Canonical |
|---|---|---|
| Homepage | Employee Roster Software for Small Teams \| Simple Roster Plus | `https://www.simplerosterplus.com/` |
| Scheduling | Employee Scheduling Software for Small Teams \| Simple Roster Plus | `.../employee-scheduling-software` |
| Attendance | Employee Attendance Software Connected to Your Roster \| Simple Roster Plus | `.../employee-attendance-software` |
| ZKTeco | ZKTeco Attendance Integration \| Simple Roster Plus | `.../zkteco-attendance-integration` |
| SMB scheduling | Employee Scheduling Software for Small Business \| Simple Roster Plus | `.../small-business-employee-scheduling` |
| Leave | Employee Leave and Availability Software \| Simple Roster Plus | `.../employee-leave-and-availability` |
| Time clock | Employee Time Clock Software for Scheduled Teams \| Simple Roster Plus | `.../employee-time-clock-app` |
| Privacy | Privacy Policy \| Simple Roster Plus | `.../privacy` (`noindex`) |
| Terms | Terms of Service \| Simple Roster Plus | `.../terms` (`noindex`) |

**H1s (flattened)**

| Page | H1 |
|---|---|
| Homepage | Build and Share Staff Rosters—Then Track What Actually Happened |
| Scheduling | Employee Scheduling Software That Keeps Every Shift Clear |
| Attendance | Employee Attendance Software That Shows What Actually Happened |
| ZKTeco | Connect Supported ZKTeco Attendance Terminals to Your Staff Roster |
| SMB | Simple Employee Scheduling Software for Small Businesses |
| Leave | Manage Leave and Availability Before You Build the Roster |
| Time clock | Connect Clock Events to the Weekly Roster |

**Editing a title “safely” through Git today requires touching at least:**

1. HTML `<title>`
2. Usually `og:title` and `twitter:title` (not enforced, but they will drift)
3. Often JSON-LD `name` / `description`
4. `scripts/seo/page-configs.mjs` `title` — **or `seo:check` FAILs**

Adding a **new** page requires: HTML file, sitemap row, `page-configs` entry, `footer-generator.mjs` link list + page mission, then `footer:generate`. Four sources of truth. That is the main Git-editor risk, not HTML itself.

**Difficulty for an external tool:** medium for title/description/canonical/H1 on an existing page; **high** for new pages until those four lists are unified or generated from one manifest.

Legal pages are **out of this model**: no meta description, no OG/Twitter, `noindex`, not in sitemap, not in `page-configs`, not in footer generator.

---

## E. Existing Page Inventory

### Indexable marketing pages (in sitemap + `page-configs`)

| URL | File | Role |
|---|---|---|
| `/` | `landing-page/index.html` | Homepage — employee roster software |
| `/employee-scheduling-software` | `landing-page/employee-scheduling-software/index.html` | Commercial |
| `/employee-attendance-software` | `landing-page/employee-attendance-software/index.html` | Commercial |
| `/zkteco-attendance-integration` | `landing-page/zkteco-attendance-integration/index.html` | Commercial |
| `/small-business-employee-scheduling` | `landing-page/small-business-employee-scheduling/index.html` | Commercial |
| `/employee-leave-and-availability` | `landing-page/employee-leave-and-availability/index.html` | Commercial |
| `/employee-time-clock-app` | `landing-page/employee-time-clock-app/index.html` | Commercial |

The six commercial pages listed in the original brief **match the repo exactly**. No missing pages. No extra commercial pages.

### Informational pages

None beyond the homepage. No blog. No docs subdomain in this marketing tree.

### Legal pages (intentionally noindex, excluded from sitemap)

| URL | File | Notes |
|---|---|---|
| `/privacy` | `landing-page/privacy.html` | Placeholder + `TODO(seo)` comment. `noindex, follow` |
| `/terms` | `landing-page/terms.html` | Placeholder + `TODO(seo)` comment. `noindex, follow` |

Internal drafts exist (`docs/privacy-policy-draft.md`, `docs/legal-policy-implementation-checklist.md`) and are **not published**.

### Redirects

Not defined in git beyond `cleanUrls: true` and `trailingSlash: false`. Production verify expects:

- Apex `https://simplerosterplus.com` → `www`
- Trailing slash → canonical
- `/index.html` → canonical

Those hops are **Vercel/host behavior**, not fully encoded as redirect files in the repo.

---

## F. Existing Safeguards

### Automatically enforced — **if someone runs `seo:check`**

Not enforced on merge/deploy. No CI.

| Regression | Static check | Production verify |
|---|---|---|
| Missing title | FAIL (count ≠ 1) | FAIL |
| Duplicate title across indexable pages | FAIL (exact, case-insensitive) | no |
| Wrong canonical shape/host/slash/`index.html` | FAIL | FAIL + redirect chain |
| Canonical ≠ config | FAIL | FAIL |
| `og:url` ≠ canonical | FAIL | FAIL |
| `noindex` on a configured commercial/home page | FAIL | FAIL |
| Missing H1 / multiple H1 | FAIL | FAIL |
| H1 ≠ config | FAIL | FAIL |
| Missing meta description | FAIL | FAIL |
| Duplicate meta descriptions | FAIL | no |
| Broken JSON-LD parse | FAIL | FAIL (rendered) |
| Missing required schema types | FAIL | FAIL if config present |
| Breadcrumb host not www | FAIL | — |
| Broken **local** internal links | FAIL | live status for internal links |
| Required internal link missing | FAIL | FAIL |
| Configured URL missing from sitemap / extra sitemap URL | FAIL | live sitemap contains URL |
| Relative `/sign-up` or `/login` CTA | FAIL | — |
| Footer drift | FAIL (`footer:check`) | no |
| Missing local images/CSS/JS | FAIL | images loaded in browser |
| Apex / trailing slash / `index.html` redirects | no | FAIL unless 301/308 → canonical 200 |

**WARN only (does not block)**

- Risky claims (SMS, WhatsApp, Auto Scheduler, payroll integration, etc.)
- Missing image width/height
- PNG with no WebP
- Missing one of the three absolute app CTAs (sign-up / demo / login) — WARN not FAIL
- Lighthouse performance < 75
- Heading level skips

Lighthouse thresholds (`scripts/seo/shared.mjs`):

| Category | Threshold | Behavior |
|---|---|---|
| SEO | 100 | FAIL below |
| Accessibility | 90 | FAIL below |
| Best Practices | 90 | FAIL below |
| Performance | 75 | WARN below (does not fail) |

### Currently dependent on manual review

- Running `seo:check` at all (no CI — documented as Phase 4F)
- Running `seo:verify` after deploy
- Search Console coverage / indexing / query performance
- Copy quality, keyword targeting, screenshot accuracy
- Near-duplicate titles (only exact duplicates fail)
- Title/description **length**
- OG/Twitter title/description/image consistency with `<title>`
- `FAQPage` (intentionally absent)
- App subdomain indexing (see Risks)
- Legal page quality
- Unused large PNGs still sitting in `landing-page/images/` (up to **2.7 MB** `solution-attendance@2x.png`; several files are **unreferenced** by HTML: `pain-before-workflow.png`, `solution-ai-assist.png`, `hero-weekly-schedule-attendance.png`, `solution-schedule-builder.png`)
- “Incorrect app CTA” beyond relative vs absolute
- Whether production HTML matches git (verify covers this if run)

**Bottom line for a future publish gate:** `seo:check` is already a credible gate. It is just not wired to GitHub/Vercel. `seo:verify` should stay post-deploy/preview, not a merge hard-block, because Lighthouse and network make it a bad PR required check.

---

## G. Git-Based Publishing Feasibility

**Feasible. Natural fit. Do not build it in v0.1.**

Current workflow in practice:

```text
edit landing-page/*.html (+ page-configs / sitemap / footer-generator)
→ npm run seo:check
→ commit to main (or a branch)
→ Vercel deploy (assumed)
→ optionally npm run seo:verify -- <page>
```

| Console capability | Feasibility now |
|---|---|
| Create a branch | Yes (normal GitHub) |
| Controlled edit of title/description/canonical/H1 | Yes, if it updates HTML **and** `page-configs.mjs` together |
| Run validation | Yes: `npm run seo:check` |
| Commit / open PR | Yes |
| Preview deploy | **Probably yes** on Vercel PRs for the marketing project; unconfirmed in-repo |
| `seo:verify --url <preview>` | Yes, designed for arbitrary URLs (skips exact title/H1 if no page key) |
| Merge after approval | Yes, human or later bot |
| Uncontrolled CMS publish | **Must not exist.** Repo HTML is production. |

**Why Git write-back is over-engineered for v0.1**

- 7 pages, one editor, already in Git.
- Four files must stay in sync for structural changes.
- No JSON reporter, no CI, no GitHub App permissions designed yet.
- The user-facing problem is “how are we doing in Google?”, not “I cannot edit a title.”

**Why Git write-back is still the right Phase 2+ for this repo**

- Static HTML has no runtime CMS. A database-backed SEO admin in the Next app would publish to the wrong host or invent a second source of truth.
- `seo:check` already encodes the validation contract a PR bot would run.

**Recommended sequencing:** Console v0.1 = **read-only Git + call `seo:check` locally/CI later**. Write path only after GSC proves which edits matter.

---

## H. Recommended SRP ↔ SEO Console Boundary

### Remain inside SRP (project-local)

- Static HTML pages, images, robots, sitemap
- `page-configs.mjs` + footer generator
- `seo:check` / `seo:verify` / Lighthouse thresholds
- Canonical host, CTA allowlist, prohibited-claims list
- App `noindex` / robots for `app.simplerosterplus.com`
- Vercel routing (`cleanUrls`, trailing slash)
- Product-specific copy rules (Auto Scheduler, not “AI”; ZKTeco claim limits)

### Belong in the SEO Console

- Multi-project list
- Google Search Console (and later Bing) **read**
- Search performance overview (queries, pages, clicks, impressions, coverage)
- Page inventory **view** (sourced from SRP adapter, not recrawled as truth)
- Health status (last `seo:check` / `seo:verify` result)
- Task list with plain-English “why this matters”
- Change log (“what changed” = Git history + GSC deltas)
- Later: content calendar, briefs, rank/backlink **integrations**, monthly reports

### Challenge the split

- **Do not put page inventory authorship only in the console.** SRP’s `page-configs.mjs` + sitemap already are the inventory. Console should **read** them.
- **Do not put “SEO health” as a recrawl inside the console.** That duplicates `seo:check`.
- **Do not put a metadata editor in SRP’s Next.js app** (the portable “SEO Control Center” skill pattern). Wrong host, wrong persistence model.
- **CI (`seo:check` on PRs) should live in SRP**, not the console. The console can display the check; GitHub should enforce it.
- Analytics/GA4 can wait; GSC is enough for Search Performance Baseline. If you add GA4, it belongs on the **marketing** HTML, configured from SRP, reported in the console.

---

## I. Proposed Adapter / Integration Contract

Smallest interface that keeps the console generic. One manifest file **in each product repo** (SRP first). Console knows only this file + Git + optional GSC property.

```json
{
  "projectId": "simple-roster-plus",
  "displayName": "Simple Roster Plus",
  "canonicalOrigin": "https://www.simplerosterplus.com",
  "appOrigin": "https://app.simplerosterplus.com",
  "repository": "ellodanem/simplerosterplus",
  "productionBranch": "main",
  "marketingRoot": "landing-page",
  "sitemap": {
    "path": "landing-page/sitemap.xml",
    "url": "https://www.simplerosterplus.com/sitemap.xml"
  },
  "robots": {
    "path": "landing-page/robots.txt",
    "url": "https://www.simplerosterplus.com/robots.txt"
  },
  "pageInventory": {
    "module": "scripts/seo/page-configs.mjs",
    "export": "PAGE_CONFIGS"
  },
  "validation": {
    "command": "npm run seo:check",
    "cwd": ".",
    "exitZeroMeansPass": true
  },
  "productionValidation": {
    "command": "npm run seo:verify -- {{pageKey}}",
    "optional": true
  },
  "build": {
    "marketing": null,
    "app": "npm run build"
  },
  "preview": {
    "provider": "vercel",
    "marketingRootDirectory": "landing-page"
  },
  "editableFields": [
    "title",
    "metaDescription",
    "canonical",
    "h1",
    "ogTitle",
    "ogDescription",
    "ogImage"
  ],
  "protectedFields": [
    "appCtaOrigins",
    "robotsAllow",
    "schemaRequiredTypes"
  ],
  "generatedRegions": [
    {
      "marker": "BEGIN GENERATED MARKETING FOOTER",
      "command": "npm run footer:generate"
    }
  ],
  "doNotEditDirectly": [
    "landing-page/**/index.html footer between generated markers"
  ],
  "syncOnEdit": ["scripts/seo/page-configs.mjs"],
  "noindexPaths": ["/privacy", "/terms"],
  "gsc": {
    "siteUrl": "https://www.simplerosterplus.com/"
  }
}
```

**Rules**

- Console never parses SRP HTML selectors itself in v0.1.
- Inventory = `PAGE_CONFIGS` + sitemap check command.
- Publish gate = `validation.command`.
- Generated footers are regenerated, not hand-patched.
- Track Lucia / TidyCorePlus get their own manifest even if they are Next.js, WordPress, or something else. **Do not assume static HTML.**

That is enough. Do not add a plugin SDK, webhook bus, or metadata GraphQL layer.

---

## J. Search Console / Analytics Readiness

Searched the repo for GSC, GA4, GTM, Bing, PageSpeed, rank, and backlink providers.

| Integration | Status in SRP repo |
|---|---|
| Google Search Console | **Not present.** Runner prints “Test live URL in Google Search Console” / “Request indexing” as **manual remaining**. Indexing API intentionally not automated. |
| Google Analytics / GA4 | **Not present.** `landing-page/MAPPING.md` still says analytics is out of scope. |
| Google Tag Manager | **Not present.** |
| Bing Webmaster Tools | **Not present.** |
| PageSpeed Insights API | **Not present.** Local Lighthouse via `seo:verify` only. |
| Rank tracking | **Not present.** |
| Backlink providers | **Not present.** |
| `google-site-verification` / Bing meta | **Not present** in marketing HTML. |
| Lighthouse | **Present** as a **devDependency** (`lighthouse@^12.8.2`) used by `scripts/seo/lighthouse.mjs`. |

Do not assume GSC is configured in Google’s UI either — that cannot be verified from git.

---

## K. Remaining SRP SEO Work

### MUST DO BEFORE CONSOLE

1. **Hard-`noindex` the application host.** Next.js `app/layout.tsx` has **no** `robots: { index: false }`. Only `app/share/roster/[token]/page.tsx` is noindex. There is **no** `public/robots.txt` for the app. Public routes (`/sign-up`, `/sign-in`, `/login`, `/demo`) can be indexed and will pollute GSC / compete with marketing URLs. This is the one technical SEO hole that can corrupt a Search Performance Baseline.
2. **Confirm GSC property + sitemap submitted** for `https://www.simplerosterplus.com` (and decide whether the app host is a separate property). **Cannot be verified from the repo.** If this is not done, Console v0.1 has nothing to show.

That is the strict list. Technical on-page SEO for the seven URLs is already green locally.

### CAN WAIT (do after v0.1 exists, or when a real GSC issue appears)

- Phase 4F: GitHub Action running `seo:check` on PRs that touch `landing-page/` or `scripts/seo/`
- `--json` reporter for `seo:check` so the console does not scrape stdout
- Unify the four inventories (HTML, sitemap, `page-configs`, footer-generator) into one SRP-side source
- Publish lawyer-approved Privacy/Terms and then remove `noindex`
- Homepage `og:image:alt` / `twitter:image:alt`
- GA4 or GTM on marketing pages
- Delete or stop shipping unreferenced multi-MB PNGs
- Header generator / shared CSS (maintainability, not rankings)
- FAQPage schema (still a conscious deferral)
- Apex/www/preview confirmation documented from the Vercel dashboard

### DO NOT BOTHER

- Migrating marketing to Next.js / a CMS to “enable the console”
- Building an in-app SEO Control Center in SRP
- Keyword-density / title-length hard fails
- Sitemap XML generator for 7 URLs
- Automating Search Console “request indexing”
- More commercial landing pages **until GSC shows which queries have impressions**
- Lighthouse-in-CI as a required check
- Further WebP/CLS polish as a prerequisite for the console (Phases 4B/4D are already committed)

---

## L. SEO Console v0.1 Recommendation

**Success test:** Can a non-SEO expert open one screen and understand how Simple Roster Plus is performing in Google and what should be worked on next?

### Ship in v0.1

1. **Projects** — one row: Simple Roster Plus. Schema allows more; UI can be single-project.
2. **Google Search Console (read-only)** — last 28 days: clicks, impressions, CTR, average position; top queries; top pages; coverage counts if the API allows.
3. **One home screen** for a non-SEO owner:
   - “Google sent us N clicks / M impressions”
   - “These pages are in the sitemap / indexable”
   - “Health: last `seo:check` pass/fail” (even if pasted/manual at first)
   - “Do next: 3 tasks” with a sentence of why
4. **Page inventory** — read from SRP `PAGE_CONFIGS` + sitemap (via adapter or even a checked-in JSON dump for v0.1). Show indexable vs noindex legal.
5. **Plain-English metric copy** — e.g. impressions ≠ rankings; position 15 is “barely visible”; 0 clicks with impressions = title/snippet problem.

### Defer from the original 10-item list

| Item | Why defer |
|---|---|
| Git write / PR workflow | Over-engineered before you know what to change |
| Full Git connection architecture | Read `page-configs` + last check result is enough; OAuth-to-GitHub can wait |
| Live `seo:verify` in the UI | Slow, needs Chromium, artifacts; run in SRP when you care |
| Task engine with AI recommendations | v0.1 tasks can be **hardcoded rules**: “0 clicks on page X”, “coverage error”, “seo:check not run in 14 days” |
| Multi-project UI polish | One project |

### v0.1 architecture (keep boring)

- Internal web app (`C:\Cursor Projects\seointernal` is the right place).
- Auth: owner only (Clerk/Google SSO later).
- GSC via Google OAuth / service account on Search Console API.
- Store: project + GSC tokens + cached daily snapshot + task list.
- SRP adapter: a checked-in manifest; optionally a nightly job that clones/pulls `main` and runs `seo:check`.

If GSC OAuth is the long pole, **v0.1a** can be: paste Search Console CSV + show inventory + 3 tasks. Do not block the whole console on perfect API plumbing — but GSC API is the actual product, so it should be the first real integration.

### Later (dependencies only)

| Later feature | Depends on |
|---|---|
| Content opportunities / briefs | 4–8 weeks of GSC query data |
| AI drafting / blog publishing | Git write path + SRP page template + `seo:check` gate |
| Rank tracking | Optional; GSC average position is enough at this scale |
| Competitors / backlinks | Separate providers; not v0.1 |
| LLM/AI search visibility | Different measurement; ignore until classic search has a baseline |
| Anomaly detection / monthly reports | Need ≥30–90 days of stored GSC snapshots |

---

## M. Risks / Architectural Concerns

1. **App indexing** can poison the baseline. Fix in SRP first.
2. **Four sources of truth** (HTML, sitemap, page-configs, footer-generator). A naive “edit title in HTML” bot will fail `seo:check`.
3. **No CI** = the validation gate is optional today. A console that “blocks publish” cannot block Vercel until SRP adds the Action (or Vercel ignored-build / check).
4. **Stale documentation** will mislead a generic agent. Prefer `page-configs.mjs` + HTML + `seo-verification-runner.md`.
5. **`seo:check:all` is a duplicate.** Harmless, but do not design around two different check modes — they are the same.
6. **Risky-claim WARNs are not a health score.** Homepage will always look “dirty” if you count WARNs.
7. **Legal pages** still say TODO/placeholder. Fine while noindex; do not put them in “indexable inventory.”
8. **Separate console is correct for 3 products.** If Track Lucia / TidyCorePlus slip years, a console is still justified as a GSC viewer — but then keep v0.1 ruthless.
9. **Do not implement the portable SEO-module skill** (DB-backed draft/publish metadata in the product app). It contradicts Git-as-source-of-truth and the split marketing host.
10. **Preview vs production:** `seo:verify` against production is the only live redirect proof (apex, trailing slash, `index.html`). That behavior lives in Vercel, not fully in git.
11. **`seo:verify` was not run during this audit** (it writes artifact files). Local static checks are green; production HTML could theoretically drift if a Vercel deploy is stale. Worth one manual `seo:verify -- homepage` before trusting live SERP data.

---

## N. Questions that materially affect architecture or sequencing

1. **Is `https://www.simplerosterplus.com` already a verified GSC property with the sitemap submitted?** If no, Console v0.1 has no performance data; sequence GSC setup before any UI.
2. **Confirm Vercel:** two projects? Marketing Root Directory = `landing-page`? Production auto-deploy from `main`? PR preview URLs for the marketing project?
3. **Will Track Lucia and TidyCorePlus also be static HTML in Git, or Next/CMS?** If they are CMS-backed, the Git-publish model is SRP-specific and must not be the console’s only write path.
4. **Who uses v0.1 — owner only, or an SEO contractor in week one?** Contractor implies GitHub permissions and audit trail sooner; owner-only can stay read-only GSC.
5. **Is there already a Google Cloud project eligible for the Search Console API?** This is the real v0.1 implementation risk, not HTML parsing.
6. **Should `app.simplerosterplus.com` be globally noindex, or only selected public routes (`/sign-up` indexed on purpose)?** This changes the MUST-DO patch.

---

## Direct recommendation

Treat SRP technical SEO as **complete enough**. Patch app `noindex`, confirm GSC, then build Console v0.1 as a **Search Console + inventory + next-actions screen**. Keep Git publish and multi-repo write-back off the v0.1 critical path. Do not build an in-product SEO CMS.
