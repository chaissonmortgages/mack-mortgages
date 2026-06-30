// Netlify Function: capture-lead.js
// Receives lead data from the website, saves to Notion, subscribes to Mailchimp
// Deploy at: netlify/functions/capture-lead.js

exports.handler = async (event) => {
  // CORS headers — allow your domain
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const {
    name,
    email,
    source,        // 'Mortgage Health Check' | 'Home Value Estimator' | 'Contact Form'
    address,
    // Mortgage Health Check fields
    balance,
    rate,
    lender,
    term,
    score,
    grade,
    renewal_strategy,
    savings_potential,
    // Home Value Estimator fields
    purchase_price,
    purchase_year,
    prop_type,
    value_mid,
    value_low,
    value_high,
    equity_dollars,
    appreciation_pct,
    // Contact form fields
    phone,
    inquiry_type,
    message,
  } = payload;

  const NOTION_KEY      = process.env.NOTION_API_KEY;
  const NOTION_DB_ID    = process.env.NOTION_LEADS_DB_ID;
  const MAILCHIMP_KEY   = process.env.MAILCHIMP_API_KEY;
  const MAILCHIMP_DC    = process.env.MAILCHIMP_DC;          // e.g. "us21"
  // Single audience (free tier) — segmented by tag instead of separate audiences
  const MAILCHIMP_AUDIENCE_ID = process.env.MAILCHIMP_AUDIENCE_ID;

  const errors = [];

  // ─── 1. SAVE TO NOTION ────────────────────────────────────────────────────
  if (NOTION_KEY && NOTION_DB_ID) {
    try {
      // Build properties based on source
      const properties = {
        // Title = full name
        'Name': {
          title: [{ text: { content: name || 'Unknown' } }]
        },
        'Email': {
          email: email || null
        },
        'Source': {
          select: { name: source || 'Website' }
        },
        'Status': {
          select: { name: 'New Lead' }
        },
        'Address': {
          rich_text: [{ text: { content: address || '' } }]
        },
        'Date Added': {
          date: { start: new Date().toISOString().split('T')[0] }
        },
      };

      // Add phone if present (contact form)
      if (phone) {
        properties['Phone'] = { phone_number: phone };
      }

      // Mortgage Health Check specific fields
      if (source === 'Mortgage Health Check') {
        if (score !== undefined) {
          properties['Health Score'] = { number: score };
        }
        if (grade) {
          properties['Grade'] = { select: { name: grade } };
        }
        if (balance) {
          properties['Mortgage Balance'] = { number: parseFloat(balance) };
        }
        if (rate) {
          properties['Current Rate'] = { number: parseFloat(rate) };
        }
        if (lender) {
          properties['Lender'] = { select: { name: lender } };
        }
        if (term) {
          properties['Term Remaining'] = { select: { name: `${term} yr` } };
        }
        if (renewal_strategy) {
          properties['Recommended Action'] = {
            rich_text: [{ text: { content: renewal_strategy } }]
          };
        }
        if (savings_potential) {
          properties['Savings Potential'] = { number: parseFloat(savings_potential) };
        }
      }

      // Home Value Estimator specific fields
      if (source === 'Home Value Estimator') {
        if (value_mid) {
          properties['Est. Property Value'] = { number: parseFloat(value_mid) };
        }
        if (equity_dollars) {
          properties['Est. Equity'] = { number: parseFloat(equity_dollars) };
        }
        if (purchase_price) {
          properties['Purchase Price'] = { number: parseFloat(purchase_price) };
        }
        if (purchase_year) {
          properties['Purchase Year'] = { number: parseInt(purchase_year) };
        }
        if (appreciation_pct) {
          properties['Appreciation %'] = { number: parseFloat(appreciation_pct) };
        }
        if (prop_type) {
          properties['Property Type'] = { select: { name: prop_type } };
        }
      }

      // Contact form specific
      if (source === 'Contact Form') {
        if (inquiry_type) {
          properties['Inquiry Type'] = { select: { name: inquiry_type } };
        }
        if (message) {
          properties['Message'] = {
            rich_text: [{ text: { content: message.substring(0, 2000) } }]
          };
        }
      }

      const notionRes = await fetch('https://api.notion.com/v1/pages', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${NOTION_KEY}`,
          'Content-Type': 'application/json',
          'Notion-Version': '2022-06-28',
        },
        body: JSON.stringify({
          parent: { database_id: NOTION_DB_ID },
          properties,
        }),
      });

      if (!notionRes.ok) {
        const err = await notionRes.text();
        errors.push(`Notion: ${err}`);
        console.error('Notion error:', err);
      }
    } catch (e) {
      errors.push(`Notion exception: ${e.message}`);
      console.error('Notion exception:', e);
    }
  }

  // ─── 2. SUBSCRIBE TO MAILCHIMP (single audience, tagged by source) ────────
  if (MAILCHIMP_KEY && MAILCHIMP_DC && MAILCHIMP_AUDIENCE_ID && email) {
    try {
      const nameParts = (name || '').trim().split(' ');
      const firstName = nameParts[0] || '';
      const lastName  = nameParts.slice(1).join(' ') || '';

      const mcBody = {
        email_address: email,
        status: 'subscribed',
        merge_fields: {
          FNAME: firstName,
          LNAME: lastName,
          PROPADDR: address || '',
        },
        tags: [source || 'website'],
      };

      // Add source-specific merge fields for email personalisation
      if (source === 'Mortgage Health Check' && score !== undefined) {
        mcBody.merge_fields.SCORE   = String(score);
        mcBody.merge_fields.GRADE   = grade || '';
        mcBody.merge_fields.SAVINGS = savings_potential ? `$${Math.round(savings_potential).toLocaleString()}` : '';
        mcBody.merge_fields.RECACT  = renewal_strategy || '';
      }
      if (source === 'Home Value Estimator' && value_mid) {
        mcBody.merge_fields.ESTVAL  = `$${Math.round(value_mid).toLocaleString()}`;
        mcBody.merge_fields.EQUITY  = equity_dollars ? `$${Math.round(equity_dollars).toLocaleString()}` : 'N/A';
        mcBody.merge_fields.APPRC   = appreciation_pct ? `${parseFloat(appreciation_pct).toFixed(1)}%` : '';
      }

      const mcRes = await fetch(
        `https://${MAILCHIMP_DC}.api.mailchimp.com/3.0/lists/${MAILCHIMP_AUDIENCE_ID}/members`,
        {
          method: 'POST',
          headers: {
            'Authorization': `apikey ${MAILCHIMP_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(mcBody),
        }
      );

      if (!mcRes.ok) {
        const mcErr = await mcRes.json();
        // 400 with "Member Exists" is fine — they're already subscribed.
        // In that case, PUT to update their tags/merge fields instead.
        if (mcErr.title === 'Member Exists') {
          const crypto = require('crypto');
          const subscriberHash = crypto.createHash('md5').update(email.toLowerCase()).digest('hex');

          // Update merge fields
          await fetch(
            `https://${MAILCHIMP_DC}.api.mailchimp.com/3.0/lists/${MAILCHIMP_AUDIENCE_ID}/members/${subscriberHash}`,
            {
              method: 'PUT',
              headers: {
                'Authorization': `apikey ${MAILCHIMP_KEY}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ merge_fields: mcBody.merge_fields }),
            }
          );

          // Add the tag (existing subscribers need a separate tag call)
          await fetch(
            `https://${MAILCHIMP_DC}.api.mailchimp.com/3.0/lists/${MAILCHIMP_AUDIENCE_ID}/members/${subscriberHash}/tags`,
            {
              method: 'POST',
              headers: {
                'Authorization': `apikey ${MAILCHIMP_KEY}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ tags: [{ name: source || 'website', status: 'active' }] }),
            }
          );
        } else {
          errors.push(`Mailchimp: ${mcErr.detail || mcErr.title}`);
          console.error('Mailchimp error:', mcErr);
        }
      }
    } catch (e) {
      errors.push(`Mailchimp exception: ${e.message}`);
      console.error('Mailchimp exception:', e);
    }
  }

  // ─── 3. ALSO PROXY CLAUDE API CALLS ───────────────────────────────────────
  // If the request includes a 'claudeMessages' field, proxy it to Anthropic
  if (payload.claudeMessages) {
    try {
      const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 1000,
          messages: payload.claudeMessages,
        }),
      });
      const claudeData = await anthropicRes.json();
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, claude: claudeData, errors }),
      };
    } catch (e) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ success: false, error: e.message }),
      };
    }
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      success: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    }),
  };
};
