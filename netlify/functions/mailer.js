// Brevo transactional email (free plan, single-sender verification). Swappable: keep the send() signature.
// Env: BREVO_API_KEY, MAIL_FROM (the sender address you verified in Brevo), MAIL_FROM_NAME (optional).
const enabled = () => !!(process.env.BREVO_API_KEY && process.env.MAIL_FROM);
async function send({ to, subject, text, html }) {
  if (!enabled()) throw new Error('EMAIL_DISABLED');
  const r = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST', signal: AbortSignal.timeout(8000),
    headers: { 'api-key': process.env.BREVO_API_KEY, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ sender: { email: process.env.MAIL_FROM, name: process.env.MAIL_FROM_NAME || 'ScholarFind' },
      to: [{ email: to }], subject, textContent: text, htmlContent: html })
  });
  if (!r.ok) throw new Error('Email HTTP ' + r.status);   // response body is never logged
}
module.exports = { enabled, send };
