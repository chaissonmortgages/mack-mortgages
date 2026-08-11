# CLAUDE.md - Mack Mortgages Project

This file gives Claude Code full context on the Mack Mortgages project.
Read this before making any changes to any file.


## WHO THIS IS FOR

Mack Chaisson — Licensed Mortgage Broker, BC and Canada.
Business: Mack Mortgages (personal brand) / Clear Trust Mortgages / DLC.
Goal: Grow from ~$50-60K annual commission to $100K+ through digital lead generation.
Phone: 778-874-2451 | Email: Mack.Chaisson@Cleartrust.ca
Calendly: https://calendly.com/chaissonmortgages/initialmeet
Site: mackmortgages.ca | Hosting: Netlify (auto-deploys from this repo, main branch)


## ABSOLUTE RULES — NEVER BREAK THESE

- NO em dashes (—) anywhere in any file, ever. Use commas, periods, or colons instead.
- NEVER advertise specific mortgage rates in ad copy or social content.
- All booking CTAs use Calendly popup, not a new tab:
  `Calendly.initPopupWidget({url:'https://calendly.com/chaissonmortgages/initialmeet'})`
- Mack's name is always "Mack Chaisson" — never "Mackenzie"
- Refer to him as "broker" (singular), never "brokers"
- The tone is always "professional friend" — light but to the point, polite but direct


## TECH STACK

- Pure HTML/CSS/JS — no framework, no build step
- Netlify for hosting and serverless functions
- Netlify Function: `netlify/functions/capture-lead.js`
- APIs used inside capture-lead.js: Anthropic (Claude), Notion, Mailchimp
- Google Fonts: DM Sans + Playfair Display
- Calendly widget (loaded via script tag)
- Meta Pixel ID: 644144389454728 (installed on all HTML pages)


## DESIGN SYSTEM

```
--bg:           #F8F8F6   (page background)
--ink:          #111110   (primary text)
--ink-soft:     #555552   (secondary text)
--accent:       #3D5A80   (slate blue — primary brand colour)
--accent-light: #E8EEF4   (light blue tint)
--border:       #E2E2DE   (dividers)
--white:        #FFFFFF
--green:        #2D6A4F   (positive/good states)
--amber:        #B45309   (warning states)
--red:          #991B1B   (error states)
--radius:       4px

Fonts: DM Sans (body), Playfair Display (headings/serif accents)
```


## FILE STRUCTURE

```
/
├── index.html                    Homepage
├── mortgage-health-check.html    Free tool: score current mortgage (AI-powered)
├── home-value-estimator.html     Free tool: AI property valuation
├── affordability-check.html      Free tool: max purchase price (GDS + stress test)
├── closing-costs.html            Free tool: BC closing costs calculator
├── property-search.html          Property portal hub (REW, Realtor.ca, Zolo)
├── homebuyer-guide.html          Landing page for free PDF booklet download
├── mack.jpg                      Profile photo
├── homebuyer-guide.pdf           First-Time Buyer Guide (12 pages, BC 2026)
└── netlify/
    └── functions/
        └── capture-lead.js       Serverless function — all form submissions
```


## NETLIFY FUNCTION: capture-lead.js

Handles two completely different request types:

### 1. Claude Proxy (AI scoring for tools)
Triggered when payload contains `claudeMessages`
- Proxies to Anthropic API and returns the response
- Does NOT write to Notion or Mailchimp
- Used by MHC and HVE tools to get AI-scored results

### 2. Lead Capture (form submissions)
Triggered when payload contains `name` + `email`
- Writes to Notion Leads DB (gated: only if BOTH name and email are present)
- Subscribes to Mailchimp with the `source` value as the tag
- Source values in use:
  - `'Mortgage Health Check'`
  - `'Home Value Estimator'`
  - `'Affordability Check'`
  - `'Closing Costs Calculator'`
  - `'Booklet Download'`
  - `'Contact Form'`

CRITICAL: The Notion write must stay gated on both name AND email.
Without this gate, every AI scoring call creates a blank "Unknown" row in Notion.


## ENVIRONMENT VARIABLES (set in Netlify dashboard — never commit these)

```
ANTHROPIC_API_KEY
NOTION_API_KEY
NOTION_LEADS_DB_ID       = 40a96fb3-b624-4ea1-a95c-d13d82b5ed05
MAILCHIMP_API_KEY
MAILCHIMP_DC             = (e.g. us21)
MAILCHIMP_AUDIENCE_ID
```


## LEAD PIPELINE FLOW

```
Website form submit
  -> capture-lead.js
  -> Notion (new lead page created)
  -> Mailchimp (contact subscribed with tag)
  -> Mailchimp automation fires on tag
  -> 3-email sequence runs over 8 days
  -> "Newsletter" tag added at sequence end
```


## FREE TOOLS LOGIC

### Mortgage Health Check
- Uses Claude proxy to score mortgage out of 100
- Inputs: address, balance, rate, lender, term remaining
- Gate before full report: name + email
- Fires fbq Lead event on unlock

### Home Value Estimator
- Uses Claude proxy to estimate property value range
- Inputs: address, property type, purchase price, purchase year, mortgage balance
- Gate before full report: name + email
- Fires fbq Lead event on unlock

### What Can I Afford (affordability-check.html)
- Pure math — no AI call
- Qualifies at stress test rate: max(contractRate + 0.02, 0.0525) per OSFI B-20
- Shows max purchase price, mortgage, and monthly payment at CONTRACT rate (not stress rate)
- GDS limit: 39%, TDS limit: 44%
- Gate before full report: name + email
- Fires fbq Lead event on unlock

### BC Closing Costs (closing-costs.html)
- Pure math — no AI call
- BC PTT rates: 1% on first $200K, 2% on $200K-$2M, 3% on $2M-$3M
- FTB exemption: fully exempt under $500K, partial $500K-$525K
- New build exemption: fully exempt under $750K, partial $750K-$800K
- Includes: legal fees, inspection, title insurance, tax adjustment, moving estimate
- Gate before full report: name + email
- Fires fbq Lead event on unlock

### Booklet Landing Page (homebuyer-guide.html)
- Captures name + email
- On submit: shows immediate download button + triggers Mailchimp "Booklet Download" sequence
- PDF at: mackmortgages.ca/homebuyer-guide.pdf


## HOMEPAGE SECTION ORDER (index.html)

1. Nav — links: Services / Calculator / Free Tools / Property Search / FAQ
2. Hero — Mack photo (220px circle, left column) + headline + CTAs (right column)
3. Stats strip — Since 2018 / $100M+ / 100+ homeowners / 5.0 stars (dark bg)
4. Rates — 4 clean cards, NO bars, NO specific rates in ads
   Current: 5yr Fixed 4.09%, 5yr Variable 3.45%, 3yr Fixed 3.89%, HELOC 4.45%
5. Calculator — Manual number inputs + sliders, synced bidirectionally
6. Free Tools — 2x2 grid (MHC, HVE, Affordability, Closing Costs)
7. Services — First-Time Buyers, Refinancing, Investment Properties
8. Testimonials — 4 real Google reviews (Eric A., Eivan, Tarek T., Jasmine H.)
9. FAQ — 13 questions (see index.html for full list)
10. Contact — Calendly-focused, no form. "Book a Free Call with Mack" CTA


## MAILCHIMP SEQUENCES (all active)

| Journey            | Tag                       | Emails | Delays        |
|--------------------|---------------------------|--------|---------------|
| MHC                | Mortgage Health Check     | 3      | 0 / 3 / 7 days |
| HVE                | Home Value Estimator      | 3      | 0 / 4 / 8 days |
| Buyers             | Affordability Check       | 3      | 0 / 4 / 8 days |
| Buyers             | Closing Costs Calculator  | 3      | 0 / 4 / 8 days |
| Booklet            | Booklet Download          | 3      | 0 / 4 / 8 days |

All journeys end with Tag Contact -> "Newsletter"

Core email messaging:
- Broker vs bank: I work for you, not a lender
- Rate monitoring story: saved a client 0.25% after approval by renegotiating
  when rates dropped twice before closing. Banks do not do this.
- Renewal opportunity: most clients auto-sign, that is a costly mistake


## META ADS

Pixel installed on all pages. fbq('track','Lead') fires on every tool unlock.

Campaign structure:
- Campaign 1: Booklet lead gen — $15/day — BC 24-44 — -> homebuyer-guide.html
- Campaign 2: MHC traffic — $10/day — BC 28-55 — -> mortgage-health-check.html
- Campaign 3: Retargeting — $10/day — website visitors last 30 days

Static ad files (HTML, screenshot at 1080x1080 in Chrome):
- ad-static-booklet.html, ad-static-healthcheck.html, ad-static-rates.html (V1)
- ad-v2-booklet.html, ad-v2-healthcheck.html, ad-v2-broker.html (V2)

Video scripts: see ad-scripts.md (5 scripts across 4 locations)


## DEPLOYMENT

Push any file to main branch on GitHub.
Netlify auto-deploys within 60-90 seconds. No build step needed.

To edit an existing file on GitHub:
  Repo -> click file -> pencil icon -> edit -> commit to main

To add a new file on GitHub:
  Repo -> Add file -> Create new file -> type path/filename -> paste content -> commit

For capture-lead.js specifically, the path in the repo is:
  netlify/functions/capture-lead.js


## MORTGAGE RULES AND COMPLIANCE

Stress test: max(contract rate + 2%, 5.25%) — OSFI B-20
Min down payment: 5% under $500K, 10% on $500K-$999K portion, 20% on $1M+
CMHC 2026: insured cap $1.5M, 30yr amortization for FTB and new builds
Standard GDS max: 39% | TDS max: 44%
Property tax estimate used in tools: 0.5% of purchase price / 12

AML: For Credit Bureau ID mismatch, use Driver's License + NOA as
two separate reliable documents (Gary / Velocity July 2026 guidance)

NEVER advertise specific rates. Use:
"More options, more transparency, just results. Free mortgage quotes."


## PENDING WORK

- [ ] Launch 3 Meta ad campaigns in Ads Manager
- [ ] Film 5 video ads (scripts ready in ad-scripts.md)
- [ ] Realtor referral outreach (Ty Corsie)
- [ ] Consider IDX property search embed (~$50/mo) once ad traffic justifies it
- [ ] Month 1 ad review: pause bottom 50% creatives, double top performers
