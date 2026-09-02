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
    expect(html).toContain('token=%22bad%22&amp;next=%3Cunsafe%3E');
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

  it('always renders the Heightt brand shell and accessible logo', () => {
    const html = renderHeighttEmail({
      preheader: 'Account update',
      headline: 'Account update',
      intro: 'Your account has been updated.',
      reason: 'This relates to your Heightt account.',
    });

    expect(html).toContain('data-heightt-email="true"');
    expect(html).toContain('alt="Heightt logo"');
    expect(html).toMatch(
      /class="email-card"[\s\S]*text-align:center;[\s\S]*alt="Heightt logo"/,
    );
    expect(html).toContain('#2563EB');
    expect(html).toContain('Heightt Technologies Inc.');
  });

  it('does not render unsafe action URL protocols', () => {
    const html = renderHeighttEmail({
      preheader: 'Account update',
      headline: 'Account update',
      intro: 'Your account has been updated.',
      actionLabel: 'Open account',
      actionUrl: 'javascript:alert(1)',
      reason: 'This relates to your Heightt account.',
    });

    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('Open account');
  });
});
