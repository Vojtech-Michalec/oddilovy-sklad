/**
 * emailTemplates.ts - HTML šablony e-mailů.
 *
 * Inline styly: většina poštovních klientů (Gmail, Outlook) zahazuje
 * externí CSS, takže styly musí být přímo v atributu style="...".
 * Šablony záměrně držíme jednoduché, aby vypadaly dobře všude.
 */

const COLORS = {
  primary: '#007bff',     // oddílová zelená
  text: '#222',
  muted: '#666',
  bg: '#f4f6f8',
  card: '#ffffff'
};

/** Společný "rám" pro všechny e-maily - hlavička, patička, zarovnání. */
function wrap(title: string, contentHtml: string): string {
  return `
  <!DOCTYPE html>
  <html lang="cs">
  <head><meta charset="UTF-8"><title>${title}</title></head>
  <body style="margin:0;padding:0;background:${COLORS.bg};font-family:Arial,Helvetica,sans-serif;color:${COLORS.text};">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${COLORS.bg};padding:32px 16px;">
      <tr><td align="center">
        <table role="presentation" width="560" cellspacing="0" cellpadding="0"
               style="background:${COLORS.card};border-radius:12px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.06);">
          <tr>
            <td style="background:${COLORS.primary};padding:20px 28px;color:#fff;font-size:20px;font-weight:bold;">
               Správa Oddílového Vybavení
            </td>
          </tr>
          <tr>
            <td style="padding:28px;font-size:15px;line-height:1.55;">
              ${contentHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:18px 28px;background:#fafafa;border-top:1px solid #eee;font-size:12px;color:${COLORS.muted};">
              Tato zpráva byla odeslána automaticky systémem pro správu oddílového vybavení.<br>
              Pokud jste o ni nežádali, můžete ji ignorovat.
            </td>
          </tr>
        </table>
      </td></tr>
    </table>
  </body>
  </html>`;
}

/** Tlačítko v e-mailu - opět vše inline. */
function button(label: string, url: string): string {
  return `
    <p style="text-align:center;margin:28px 0;">
      <a href="${url}"
         style="display:inline-block;background:${COLORS.primary};color:#fff;text-decoration:none;
                padding:12px 24px;border-radius:8px;font-weight:bold;font-size:15px;">
        ${label}
      </a>
    </p>
    <p style="font-size:12px;color:${COLORS.muted};word-break:break-all;">
      Pokud tlačítko nefunguje, zkopírujte si odkaz: <br>${url}
    </p>`;
}

/** Aktivace účtu po registraci. */
export function activationEmail(name: string, activationUrl: string) {
  return {
    subject: 'Aktivace účtu - Správa Oddílového Vybavení',
    html: wrap('Aktivace účtu', `
      <h2 style="margin:0 0 12px 0;color:${COLORS.primary};">Ahoj ${escapeHtml(name)},</h2>
      <p>vítáme tě v systému pro správu oddílového vybavení. Abys mohl/a začít používat svůj účet, je potřeba ho aktivovat:</p>
      ${button('Aktivovat účet', activationUrl)}
      <p style="color:${COLORS.muted};font-size:13px;">Odkaz je platný 24 hodin.</p>
    `)
  };
}

/** Reset zapomenutého hesla. */
export function passwordResetEmail(name: string, resetUrl: string) {
  return {
    subject: 'Obnovení hesla - Správa Oddílového Vybavení',
    html: wrap('Obnovení hesla', `
      <h2 style="margin:0 0 12px 0;color:${COLORS.primary};">Ahoj ${escapeHtml(name)},</h2>
      <p>obdrželi jsme žádost o obnovení tvého hesla. Pokud jsi o reset opravdu žádal/a, klikni níže:</p>
      ${button('Nastavit nové heslo', resetUrl)}
      <p style="color:${COLORS.muted};font-size:13px;">
        Odkaz je platný 1 hodinu. Pokud jsi o reset nežádal/a, zprávu prostě ignoruj - heslo se nezmění.
      </p>
    `)
  };
}

/** Pomocná funkce - escape HTML znaků (ochrana proti XSS v e-mailu). */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
