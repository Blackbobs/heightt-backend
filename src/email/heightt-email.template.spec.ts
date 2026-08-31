import { escapeHtml, renderHeighttEmail } from './heightt-email.template';

describe('Heightt email template', () => {
  it('escapes untrusted values and URLs', () => {
    const html = renderHeighttEmail({
      preheader: 'Account update',
      headline: 'Verify your email',
      recipientName: '<script>alert(1)</script>',
      intro: 'Please verify your account.',
      actionLabel: 'Verify email',
      actionUrl: 'https://heightt.app/verify?token="bad"&next=<unsafe>',
      reason: 'An account action was requested.',
    });

    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('token=&quot;bad&quot;&amp;next=&lt;unsafe&gt;');
  });

  it('does not render rows for unavailable optional values', () => {
    const html = renderHeighttEmail({
      preheader: 'Payment update',
      headline: 'Payment received',
      intro: 'Your payment was received.',
      details: [
        { label: 'Reference', value: 'HTT-123' },
        { label: 'Provider reference', value: undefined },
      ],
      reason: 'You made a payment.',
    });

    expect(html).toContain('HTT-123');
    expect(html).not.toContain('Provider reference');
  });

  it('escapes all HTML-sensitive characters', () => {
    expect(escapeHtml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;');
  });
});
