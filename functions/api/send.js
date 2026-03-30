/**
 * Temporary protected mail sender for DayToy.
 *
 * Required environment variables:
 *   RESEND_API_KEY  - Resend API key
 *   SEND_MAIL_KEY   - Shared secret required by /send.html
 */
export async function onRequestPost(context) {
  const { request, env } = context;
  const contentType = request.headers.get('content-type') || '';

  if (!contentType.includes('application/json')) {
    return json({ error: 'Content-Type must be application/json' }, 400);
  }

  const sendKey = request.headers.get('x-send-key') || '';
  if (!env.SEND_MAIL_KEY) {
    return json({ error: 'SEND_MAIL_KEY is not configured' }, 500);
  }
  if (sendKey !== env.SEND_MAIL_KEY) {
    return json({ error: 'Unauthorized' }, 401);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const to = String(body.to || '').trim();
  const subject = String(body.subject || '').trim();
  const message = String(body.message || '').trim();
  const replyTo = String(body.replyTo || '').trim();
  const senderName = String(body.senderName || 'DayToy').trim();

  if (!to || !subject || !message) {
    return json({ error: 'to, subject, and message are required' }, 400);
  }

  if (!isValidEmail(to)) {
    return json({ error: 'Invalid recipient email address' }, 400);
  }

  if (replyTo && !isValidEmail(replyTo)) {
    return json({ error: 'Invalid reply-to email address' }, 400);
  }

  if (subject.length > 200 || message.length > 10000 || senderName.length > 100) {
    return json({ error: 'Input too long' }, 400);
  }

  if (!env.RESEND_API_KEY) {
    return json({ error: 'Mail service not configured' }, 500);
  }

  const resendPayload = {
    from: `${senderName} <contact@daytoy.online>`,
    to: [to],
    subject,
    html: `
      <div style="font-family:Inter,Segoe UI,Arial,sans-serif;line-height:1.7;color:#111827;max-width:680px;margin:0 auto;padding:24px;">
        <p style="white-space:pre-wrap;margin:0 0 16px;">${escapeHtml(message)}</p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;" />
        <p style="color:#6b7280;font-size:14px;margin:0;">Sent via DayToy</p>
      </div>
    `,
    text: message,
  };

  if (replyTo) {
    resendPayload.reply_to = replyTo;
  }

  let resendRes;
  try {
    resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(resendPayload),
    });
  } catch (error) {
    console.error('Resend request failed:', error);
    return json({ error: 'Failed to reach mail service' }, 502);
  }

  if (!resendRes.ok) {
    const errorBody = await resendRes.text();
    console.error('Resend API error:', errorBody);
    return json({ error: 'Failed to send email' }, 502);
  }

  const result = await resendRes.json();
  return json({ ok: true, id: result.id || null });
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(),
  });
}

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
    'Access-Control-Allow-Headers': 'Content-Type, x-send-key',
  };
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}