#!/usr/bin/env node
// Daily blog post generator. Run by .github/workflows/daily-blog-post.yml on a cron.
//
// Calls the site's own Claude proxy (netlify/functions/capture-lead.js, the same
// endpoint the on-site tools already use) so no separate API key needs to exist
// anywhere but the Netlify dashboard. Rotates through BLOG.md's target keyword
// themes one per day, writes a static HTML post from _template.html, and updates
// posts.json + sitemap.xml. Idempotent: if a post already exists for today's
// date, it exits without creating a second one.

const fs = require('fs');
const path = require('path');

const BLOG_DIR = __dirname;
const SITE_ROOT = path.join(BLOG_DIR, '..');
const POSTS_JSON = path.join(BLOG_DIR, 'posts.json');
const POSTS_DIR = path.join(BLOG_DIR, 'posts');
const TEMPLATE_PATH = path.join(BLOG_DIR, '_template.html');
const SITEMAP_PATH = path.join(SITE_ROOT, 'sitemap.xml');
const SITE_URL = 'https://mackmortgages.ca';
const ENDPOINT = `${SITE_URL}/.netlify/functions/capture-lead`;

const THEMES = [
  {
    keyword: 'Vancouver mortgage broker',
    tag: 'Vancouver Mortgage Broker',
    angleHints: 'why work with an independent broker instead of walking into a bank branch, how brokers actually get access to better rates, good questions to ask before choosing a broker, what a broker does day to day that a bank employee cannot, signs you have outgrown your current lender relationship',
    relatedTool: { label: 'Try the free Mortgage Health Check', href: '/mortgage-health-check.html' },
  },
  {
    keyword: 'Richmond mortgage broker',
    tag: 'Richmond',
    angleHints: 'Richmond BC housing market specifics like Steveston or new-build condo towers near Richmond Centre, financing considerations for new-to-Canada buyers who are common in Richmond, BC Assessment quirks specific to Richmond, detached vs condo financing differences in Richmond',
    relatedTool: { label: "Check what your Richmond home is worth", href: '/home-value-estimator.html' },
  },
  {
    keyword: 'Burnaby mortgage broker',
    tag: 'Burnaby',
    angleHints: 'Burnaby neighbourhoods like Metrotown, Brentwood, or Edmonds and how they differ for buyers, condo presale financing considerations specific to Burnaby developments, comparing Burnaby affordability to Vancouver proper, commuter-friendly financing considerations',
    relatedTool: { label: 'See what you can afford in Burnaby', href: '/affordability-check.html' },
  },
  {
    keyword: 'Vancouver first-time home buyer mortgage',
    tag: 'First-Time Buyers',
    angleHints: 'the BC first-time buyer Property Transfer Tax exemption and its thresholds, minimum down payment rules by purchase price, the mortgage stress test explained in plain English, common first-time buyer mistakes in a competitive market, how much income is realistically needed to qualify in Metro Vancouver',
    relatedTool: { label: 'Find your max purchase price', href: '/affordability-check.html' },
  },
  {
    keyword: 'mortgage for self-employed Vancouver',
    tag: 'Self-Employed',
    angleHints: 'stated income vs fully verified income programs, how legitimate business write-offs can work against you when qualifying, bank statement programs as an alternative, what lenders actually want to see from self-employed applicants, incorporated vs sole proprietor differences for qualifying',
    relatedTool: null,
  },
  {
    keyword: 'mortgage renewal Vancouver',
    tag: 'Renewals',
    angleHints: 'why the renewal offer your bank mails you is rarely their best rate, how rate holds and renewal timelines work, switching lenders at renewal with no penalty, the right time before maturity to start shopping, what happens if you do nothing and just sign the renewal letter',
    relatedTool: { label: 'Run a free Mortgage Health Check', href: '/mortgage-health-check.html' },
  },
  {
    keyword: 'refinance mortgage Vancouver',
    tag: 'Refinancing',
    angleHints: 'when refinancing actually makes financial sense, how breaking a mortgage early and penalties work at a high level, accessing home equity through a refinance vs a HELOC, using a refinance for debt consolidation, financing a renovation through your mortgage',
    relatedTool: { label: "Check your home's current value and equity", href: '/home-value-estimator.html' },
  },
  {
    keyword: 'mortgage pre-approval Vancouver',
    tag: 'Pre-Approval',
    angleHints: 'the real difference between pre-approval and pre-qualification, how long a pre-approval typically holds, documents to gather before applying, why a pre-approval makes an offer stronger in a competitive Vancouver market, what a rate hold actually protects you from',
    relatedTool: { label: 'See your estimated max purchase price', href: '/affordability-check.html' },
  },
  {
    keyword: 'investment property mortgage Vancouver',
    tag: 'Investment Properties',
    angleHints: 'down payment rules for rental properties versus a primary residence, how lenders treat rental income when qualifying you, financing a second property in Metro Vancouver, using a HELOC on your primary home as a down payment source, secondary suite income and how it factors in',
    relatedTool: { label: 'See your equity position for a next purchase', href: '/home-value-estimator.html' },
  },
];

const STATIC_PAGES = [
  '', 'mortgage-health-check.html', 'home-value-estimator.html', 'affordability-check.html',
  'closing-costs.html', 'property-search.html', 'homebuyer-guide.html', 'blog/',
];

function slugify(s) {
  return String(s || '')
    .toLowerCase().trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80)
    .replace(/^-+|-+$/g, '');
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function loadPosts() {
  try {
    const data = JSON.parse(fs.readFileSync(POSTS_JSON, 'utf8'));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function buildPrompt(theme, recentTitles, todayDisplay) {
  const avoidList = recentTitles.length
    ? `Titles already published, do not repeat these angles or phrasing:\n${recentTitles.map(t => `- ${t}`).join('\n')}\n\n`
    : '';

  return `You are writing one blog post for Mack Chaisson, a licensed mortgage broker in BC (DLC / Clear Trust Mortgages, based in Richmond, serving Metro Vancouver). This is for his site's blog, aimed at local SEO for the keyword theme below. Return ONLY a JSON object (no markdown fences, no preamble).

Target keyword theme: "${theme.keyword}"
Possible angles to draw from (pick ONE specific, genuinely useful angle, do not try to cover all of them): ${theme.angleHints}
Today's date: ${todayDisplay}

${avoidList}When you need to cite a specific BC or federal mortgage rule, use ONLY these figures, they are the same ones already used elsewhere on this site and must stay consistent, do not use different numbers from your own general knowledge:
- BC Property Transfer Tax: 1% on the first $200,000, 2% on the portion from $200,000 to $2,000,000, 3% on the portion from $2,000,000 to $3,000,000, plus a further 2% on the residential portion above $3,000,000.
- BC first-time buyer PTT exemption: fully exempt under $500,000, partial exemption $500,000 to $525,000.
- New-build PTT exemption: fully exempt under $750,000, partial exemption $750,000 to $800,000.
- Minimum down payment: 5% on the portion up to $500,000, 10% on the portion from $500,000 to $999,999, 20% minimum on $1,000,000 and above.
- CMHC insured mortgage price cap: $1,500,000 for first-time buyers and new builds specifically, with a 30-year amortization option available to them.
- Mortgage stress test: qualify at the higher of your contract rate plus 2%, or 5.25%.
- Standard qualifying guideline: GDS max 39%, TDS max 44%.
If a fact you want to mention is not in this list, describe it in general terms instead of stating a specific number.

ABSOLUTE RULES, never break these:
- Never use an em dash (—) anywhere. Use commas, periods, or colons instead.
- Never state a specific mortgage interest rate or promise a specific savings dollar amount. Rates change constantly and stating one would be inaccurate and against site policy. You CAN cite fixed BC rules that don't change with the market, like Property Transfer Tax percentages or minimum down payment tiers.
- Never guarantee an outcome ("you will save", "guaranteed approval"). Use language like "may", "could", "many buyers find".
- Mack's name is always "Mack Chaisson", never "Mackenzie". Refer to him as "broker" (singular), never "brokers".
- Tone is "professional friend": light but to the point, polite but direct, never salesy or hypey.
- This must be genuinely original, specific, locally grounded content, not generic filler that could apply to any city. Reference real Metro Vancouver context (specific neighbourhoods, BC-specific rules, local market dynamics) naturally throughout.
- Do not fabricate statistics, studies, or client stories. General, defensible statements only.

Structure the body_html as clean semantic HTML fragment (NOT a full page, no <html>/<head>/<body>/<h1> tags, that's handled separately):
- Open with a short, specific hook paragraph that names the real situation a Metro Vancouver buyer/owner in this scenario faces.
- 2 to 3 <h2> sections covering one chosen angle with real specificity, using <h3> for a sub-point only if genuinely useful.
- Include at least one <ul> or <ol> with practical, concrete items somewhere in the piece.
- Use <strong> for genuinely important terms, not decoration.
- Close with a short paragraph that naturally transitions toward wanting a real conversation about their specific situation, but do NOT include a call-to-action button or "book a call" sentence yourself, that is added separately after your content.
- Roughly 550 to 750 words total. Keep it tight and useful rather than padded, this is a hard limit, do not exceed 750 words.
- Use <p> for every paragraph, do not leave bare text outside tags.

Return this exact JSON structure:
{
  "title": <string, includes the target keyword phrase naturally, reads like a real headline not a keyword stuffed string>,
  "slug": <string, lowercase-hyphenated, url-friendly, based on the title, under 60 chars>,
  "meta_description": <string, under 155 characters, includes the keyword naturally, compelling for a search results page>,
  "cta_headline": <string, short, specific to this post's topic, e.g. "Thinking about your renewal?">,
  "cta_sub": <string, 1-2 sentences specific to this post's topic, inviting them to book a free call, do not include a button or link, just the sentence>,
  "body_html": <string, the full HTML fragment described above>
}`;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Netlify's function timeout is short relative to how long a several-hundred-
// token generation can take, so an occasional timeout is expected background
// noise rather than a real failure. Retry a couple times before giving up.
async function callWithRetry(prompt, attempts = 3) {
  let lastErr;
  for (let i = 1; i <= attempts; i++) {
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ claudeMessages: [{ role: 'user', content: prompt }], maxTokens: 2200 }),
      });
      if (!res.ok) {
        throw new Error(`Netlify function returned HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
      }
      return await res.json();
    } catch (e) {
      lastErr = e;
      console.log(`Attempt ${i}/${attempts} failed: ${e.message}`);
      if (i < attempts) await sleep(5000 * i);
    }
  }
  throw lastErr;
}

async function main() {
  const posts = loadPosts();
  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  if (posts.some(p => p.date === today)) {
    console.log(`A post already exists for ${today}, skipping.`);
    return;
  }

  const theme = THEMES[posts.length % THEMES.length];
  const recentTitles = posts.slice(0, 15).map(p => p.title);
  const dateDisplay = new Date(`${today}T12:00:00`).toLocaleDateString('en-CA', { month: 'long', day: 'numeric', year: 'numeric' });

  console.log(`Generating post #${posts.length + 1} for theme: ${theme.keyword}`);

  const prompt = buildPrompt(theme, recentTitles, dateDisplay);
  const data = await callWithRetry(prompt);
  const text = data.claude?.content?.find(b => b.type === 'text')?.text || '';
  let post;
  try {
    post = JSON.parse(text.replace(/```json|```/g, '').trim());
  } catch (e) {
    throw new Error(`Failed to parse Claude response as JSON: ${e.message}\nRaw response start: ${text.slice(0, 500)}`);
  }

  if (!post.title || !post.body_html || post.body_html.length < 400) {
    throw new Error(`Generated post missing required fields or body too short. Got: ${JSON.stringify(post).slice(0, 300)}`);
  }
  if (data.claude.stop_reason === 'max_tokens') {
    throw new Error('Claude response was truncated (hit max_tokens), refusing to publish a cut-off post.');
  }

  const baseSlug = slugify(post.slug || post.title);
  let finalSlug = baseSlug || `post-${today}`;
  let n = 2;
  while (posts.some(p => p.slug === finalSlug) || fs.existsSync(path.join(POSTS_DIR, `${finalSlug}.html`))) {
    finalSlug = `${baseSlug}-${n}`;
    n++;
  }

  const canonicalUrl = `${SITE_URL}/blog/posts/${finalSlug}.html`;

  let relatedBlock = '';
  if (theme.relatedTool) {
    relatedBlock = `  <p class="post-related">Related: <a href="../..${theme.relatedTool.href}">${escapeHtml(theme.relatedTool.label)}</a></p>\n`;
  }

  let html = fs.readFileSync(TEMPLATE_PATH, 'utf8');
  html = html
    .split('{{TITLE_JSON}}').join(JSON.stringify(post.title))
    .split('{{META_DESCRIPTION_JSON}}').join(JSON.stringify(post.meta_description || ''))
    .split('{{TITLE}}').join(escapeHtml(post.title))
    .split('{{META_DESCRIPTION}}').join(escapeHtml(post.meta_description || ''))
    .split('{{CANONICAL_URL}}').join(canonicalUrl)
    .split('{{DATE_ISO}}').join(today)
    .split('{{DATE_DISPLAY}}').join(dateDisplay)
    .split('{{PRIMARY_TAG}}').join(escapeHtml(theme.tag))
    .split('{{BODY_HTML}}').join(post.body_html)
    .split('{{RELATED_TOOL_BLOCK}}').join(relatedBlock)
    .split('{{CTA_HEADLINE}}').join(escapeHtml(post.cta_headline || 'Ready to talk through your options?'))
    .split('{{CTA_SUB}}').join(escapeHtml(post.cta_sub || "Book a free 30-minute call and I'll shop 50+ lenders to find what fits your situation, no obligation, no cost to you."));

  fs.mkdirSync(POSTS_DIR, { recursive: true });
  fs.writeFileSync(path.join(POSTS_DIR, `${finalSlug}.html`), html);

  posts.unshift({
    slug: finalSlug,
    title: post.title,
    meta_description: post.meta_description || '',
    date: today,
    primary_tag: theme.tag,
    keyword: theme.keyword,
  });
  fs.writeFileSync(POSTS_JSON, `${JSON.stringify(posts, null, 2)}\n`);

  writeSitemap(posts);

  console.log(`Published: "${post.title}" -> blog/posts/${finalSlug}.html`);
}

function writeSitemap(posts) {
  const staticUrls = STATIC_PAGES.map(p => `  <url><loc>${SITE_URL}/${p}</loc></url>`);
  const postUrls = posts.map(p => `  <url><loc>${SITE_URL}/blog/posts/${p.slug}.html</loc><lastmod>${p.date}</lastmod></url>`);
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${staticUrls.concat(postUrls).join('\n')}\n</urlset>\n`;
  fs.writeFileSync(SITEMAP_PATH, xml);
}

main().catch(err => {
  console.error('Blog generation failed:', err.message);
  process.exit(1);
});
