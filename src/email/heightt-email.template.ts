export const HEIGHTT_LOGO_URL =
  'https://res.cloudinary.com/dbcgdaigj/image/upload/v1788163976/Page_2-removebg-preview_oy5czj.png';

export type EmailTone = 'info' | 'success' | 'warning' | 'danger';

export interface HeighttEmailOptions {
  preheader: string;
  category?: string;
  headline: string;
  recipientName?: string;
  intro: string;
  body?: string;
  details?: Array<{ label: string; value?: string | number | null }>;
  actionLabel?: string;
  actionUrl?: string;
  notice?: string;
  reason: string;
  tone?: EmailTone;
}

export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function toneColour(tone: EmailTone): string {
  return {
    info: '#2563EB',
    success: '#16A34A',
    warning: '#D97706',
    danger: '#DC2626',
  }[tone];
}

function normaliseActionUrl(value?: string): string | undefined {
  if (!value) return undefined;
  try {
    const url = value.startsWith('/')
      ? new URL(value, 'https://www.heightt.app')
      : new URL(value);
    return ['https:', 'http:'].includes(url.protocol)
      ? url.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

export function renderHeighttEmail(options: HeighttEmailOptions): string {
  const colour = toneColour(options.tone || 'info');
  const actionUrl = normaliseActionUrl(options.actionUrl);
  const details = (options.details || []).filter(
    ({ value }) => value !== undefined && value !== null && value !== '',
  );
  const greeting = options.recipientName
    ? `<p style="margin:0 0 16px;color:#0F172A;font-size:16px;line-height:24px;">Hello <strong>${escapeHtml(options.recipientName)}</strong>,</p>`
    : '';
  const detailRows = details
    .map(
      ({ label, value }) => `<tr>
        <td style="padding:10px 12px;border-bottom:1px solid #E2E8F0;color:#64748B;font-size:13px;line-height:19px;vertical-align:top;width:42%;">${escapeHtml(label)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #E2E8F0;color:#0F172A;font-size:13px;line-height:19px;font-weight:bold;text-align:right;vertical-align:top;word-break:break-word;">${escapeHtml(value)}</td>
      </tr>`,
    )
    .join('');
  const action =
    options.actionLabel && actionUrl
      ? `<table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin:28px 0 22px;width:100%;"><tr><td align="center">
        <!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${escapeHtml(actionUrl)}" style="height:48px;v-text-anchor:middle;width:220px;" arcsize="12%" stroke="f" fillcolor="#2563EB"><w:anchorlock/><center style="color:#ffffff;font-family:Arial,sans-serif;font-size:15px;font-weight:bold;">${escapeHtml(options.actionLabel)}</center></v:roundrect><![endif]-->
        <!--[if !mso]><!--><a href="${escapeHtml(actionUrl)}" style="background-color:#2563EB;border-radius:6px;color:#FFFFFF;display:inline-block;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;line-height:48px;text-align:center;text-decoration:none;width:220px;-webkit-text-size-adjust:none;">${escapeHtml(options.actionLabel)}</a><!--<![endif]-->
      </td></tr></table>
      <p style="margin:0 0 22px;color:#64748B;font-size:12px;line-height:18px;">If the button does not work, copy and paste this link into your browser:<br><a href="${escapeHtml(actionUrl)}" style="color:#2563EB;text-decoration:underline;word-break:break-all;">${escapeHtml(actionUrl)}</a></p>`
      : '';

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="x-apple-disable-message-reformatting"><title>${escapeHtml(options.headline)}</title>
<style>@media only screen and (max-width:620px){.email-shell{width:100%!important}.email-card{padding:28px 22px!important}.email-pad{padding:16px 10px!important}}</style></head>
<body data-heightt-email="true" style="margin:0;padding:0;background-color:#F1F5F9;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
<div style="display:none;font-size:1px;color:#F1F5F9;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${escapeHtml(options.preheader)}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
<table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="width:100%;background-color:#F1F5F9;"><tr><td class="email-pad" align="center" style="padding:32px 16px;">
  <table class="email-shell" role="presentation" width="600" border="0" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;">
    <tr><td class="email-card" style="background-color:#FFFFFF;border:1px solid #E2E8F0;border-radius:10px;padding:38px 42px;">
      <div style="margin:0 0 30px;text-align:center;"><a href="https://www.heightt.app" style="display:inline-block;text-decoration:none;"><img src="${HEIGHTT_LOGO_URL}" width="132" alt="Heightt logo" style="display:inline-block;width:132px;height:auto;border:0;outline:none;text-decoration:none;"></a></div>
      ${options.category ? `<p style="margin:0 0 12px;color:${colour};font-size:12px;line-height:18px;font-weight:bold;letter-spacing:.7px;text-transform:uppercase;">${escapeHtml(options.category)}</p>` : ''}
      <h1 style="margin:0 0 20px;color:#0F172A;font-size:27px;line-height:34px;font-weight:bold;">${escapeHtml(options.headline)}</h1>
      ${greeting}
      <p style="margin:0 0 16px;color:#334155;font-size:15px;line-height:24px;">${escapeHtml(options.intro)}</p>
      ${options.body ? `<p style="margin:0 0 20px;color:#334155;font-size:15px;line-height:24px;">${escapeHtml(options.body)}</p>` : ''}
      ${details.length ? `<table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="width:100%;margin:22px 0;border:1px solid #E2E8F0;border-radius:6px;border-collapse:collapse;">${detailRows}</table>` : ''}
      ${action}
      ${options.notice ? `<table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="width:100%;margin-top:20px;"><tr><td style="border-left:4px solid ${colour};background-color:#F8FAFC;padding:13px 15px;color:#475569;font-size:13px;line-height:20px;">${escapeHtml(options.notice)}</td></tr></table>` : ''}
      <p style="margin:26px 0 0;color:#64748B;font-size:13px;line-height:20px;">Need help? Contact <a href="mailto:heightt.finance@gmail.com" style="color:#2563EB;text-decoration:underline;">heightt.finance@gmail.com</a>.</p>
    </td></tr>
    <tr><td style="padding:22px 18px 0;text-align:center;color:#64748B;font-size:11px;line-height:18px;">
      <p style="margin:0 0 6px;">Heightt Technologies Inc. &nbsp;·&nbsp; <a href="https://www.heightt.app" style="color:#475569;text-decoration:underline;">heightt.app</a></p>
      <p style="margin:0 0 6px;">${escapeHtml(options.reason)}</p>
      <p style="margin:0;">&copy; ${new Date().getFullYear()} Heightt Technologies Inc. &nbsp;·&nbsp; <a href="https://www.heightt.app/privacy" style="color:#64748B;">Privacy</a> &nbsp;·&nbsp; <a href="https://www.heightt.app/terms" style="color:#64748B;">Terms</a></p>
    </td></tr>
  </table>
</td></tr></table></body></html>`;
}
