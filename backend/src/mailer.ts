import { activationEmail, passwordResetEmail } from './emailTemplates';

async function sendMail(
  to: string,
  subject: string,
  html: string,
  apiKey: string,
  from: string
): Promise<void> {
  console.log('[mailer] Odesílám mail...');
  console.log('[mailer] Komu:', to);
  console.log('[mailer] Od:', from);
  console.log('[mailer] Předmět:', subject);
  console.log('[mailer] API klíč nastaven:', !!apiKey, '| délka:', apiKey?.length ?? 0);

  if (!apiKey) {
    throw new Error('RESEND_API_KEY není nastavený v .dev.vars!');
  }

  const payload = { from, to, subject, html };
  console.log('[mailer] Posílám na Resend API, payload (bez html):', { from, to, subject });

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const responseText = await res.text();
  console.log('[mailer] Resend odpověď status:', res.status);
  console.log('[mailer] Resend odpověď body:', responseText);

  if (!res.ok) {
    throw new Error(`Resend API error ${res.status}: ${responseText}`);
  }

  console.log('[mailer] Mail úspěšně odeslán.');
}

export async function sendActivationEmail(
  to: string,
  name: string,
  token: string,
  apiKey: string,
  from: string,
  frontendUrl: string
): Promise<void> {
  console.log('[mailer] sendActivationEmail zavolán pro:', to);
  const url = `${frontendUrl}/aktivace?token=${token}`;
  const { subject, html } = activationEmail(name, url);
  await sendMail(to, subject, html, apiKey, from);
}

export async function sendPasswordResetEmail(
  to: string,
  name: string,
  token: string,
  apiKey: string,
  from: string,
  frontendUrl: string
): Promise<void> {
  console.log('[mailer] sendPasswordResetEmail zavolán pro:', to);
  const url = `${frontendUrl}/reset-hesla?token=${token}`;
  const { subject, html } = passwordResetEmail(name, url);
  await sendMail(to, subject, html, apiKey, from);
}
