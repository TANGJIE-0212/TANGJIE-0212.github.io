/**
 * Cloudflare Pages Function: POST /api/contact
 *
 * Environment variables required (set in Cloudflare Pages dashboard):
 *   RESEND_API_KEY   — your Resend API key (re_xxxxxxxx)
 *   TO_EMAIL         — where you want to receive messages, e.g. contact@daytoy.online
 */
export async function onRequestPost(context) {
  const { request, env } = context;

  // CORS preflight is handled by GET below; only POST allowed here
  const contentType = request.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    return json({ error: 'Content-Type must be application/json' }, 400);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const name    = String(body.name    || '').trim();
  const email   = String(body.email   || '').trim();
  const message = String(body.message || '').trim();

  if (!name || !email || !message) {
    return json({ error: 'name, email, and message are required' }, 400);
  }

  // Basic email format check
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: 'Invalid email address' }, 400);
  }

  // Length guard — prevent abuse
  if (name.length > 100 || email.length > 200 || message.length > 4000) {
    return json({ error: 'Input too long' }, 400);
  }

  const apiKey = env.RESEND_API_KEY;
  const toEmail = env.TO_EMAIL || 'contact@daytoy.online';

  if (!apiKey) {
    console.error('RESEND_API_KEY is not set');
    return json({ error: 'Mail service not configured' }, 500);
  }

  const resendPayload = {
    from: 'daytoy.online <contact@daytoy.online>',
    to: [toEmail],
    reply_to: email,
    subject: `[daytoy.online] New message from ${name}`,
    html: `
      <p><strong>Name:</strong> ${escapeHtml(name)}</p>
      <p><strong>Email:</strong> ${escapeHtml(email)}</p>
      <p><strong>Message:</strong></p>
      <p style="white-space:pre-wrap">${escapeHtml(message)}</p>
    `,
  };

  let resendRes;
  try {
    resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(resendPayload),
    });
  } catch (err) {
    console.error('Resend fetch error:', err);
    return json({ error: 'Failed to reach mail service' }, 502);
  }

  if (!resendRes.ok) {
    const errBody = await resendRes.text();
    console.error('Resend error response:', errBody);
    return json({ error: 'Failed to send email' }, 502);
  }

  return json({ ok: true });
}

// Allow browsers to preflight
export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(),
  });
}

// ── helpers ──────────────────────────────────────────────────────────────────

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  });
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
