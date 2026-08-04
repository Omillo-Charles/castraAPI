/**
 * Email template - Password Reset
 *
 * Returns { subject, html, text } for the forgot-password flow.
 *
 * @param {object} opts
 * @param {string} opts.firstName  – recipient's first name
 * @param {string} opts.resetUrl   – full URL to the reset-password page
 */
export function resetPasswordEmail({ firstName, resetUrl }) {
    const subject = "Reset your Castra password";

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background:#0A0A0A;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0A0A0A;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" style="max-width:520px;background:#111111;border-radius:16px;border:1px solid #27272a;overflow:hidden;">

          <!-- Header -->
          <tr>
            <td style="background:#18181b;padding:28px 32px;border-bottom:1px solid #27272a;">
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding-right:12px;vertical-align:middle;">
                    <div style="width:40px;height:40px;border-radius:10px;background:#0A0A0A;border:1px solid rgba(198,161,106,0.4);text-align:center;line-height:40px;">
                      <img src="https://castrahouseholds.co.ke/branding/logo.png" alt="Castra" width="28" height="28" style="display:inline-block;vertical-align:middle;" />
                    </div>
                  </td>
                  <td>
                    <div style="font-size:18px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;line-height:1.1;">CASTRA</div>
                    <div style="font-size:9px;text-transform:uppercase;letter-spacing:3px;color:#C6A16A;font-weight:600;">Households</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:36px 32px 28px;">

              <!-- Lock icon -->
              <div style="width:56px;height:56px;border-radius:14px;background:rgba(198,161,106,0.12);border:1px solid rgba(198,161,106,0.25);margin:0 auto 24px;text-align:center;font-size:26px;line-height:56px;">
                🔑
              </div>

              <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#ffffff;text-align:center;">Reset your password</h1>
              <p style="margin:0 0 24px;font-size:14px;color:#a1a1aa;text-align:center;line-height:1.6;">
                Hi ${firstName}, we received a request to reset the password for your Castra account.
                Click the button below to choose a new password.
              </p>

              <!-- CTA -->
              <div style="text-align:center;margin-bottom:28px;">
                <a href="${resetUrl}"
                   style="display:inline-block;padding:14px 32px;background:#C6A16A;color:#111111;font-size:14px;font-weight:700;text-decoration:none;border-radius:10px;letter-spacing:0.2px;">
                  Reset My Password
                </a>
              </div>

              <!-- Expiry notice -->
              <p style="margin:0 0 20px;font-size:12px;color:#71717a;text-align:center;line-height:1.6;">
                This link expires in <strong style="color:#a1a1aa;">1 hour</strong>.
                If you didn't request a password reset, you can safely ignore this email - your password won't change.
              </p>

              <!-- Fallback URL -->
              <div style="background:#18181b;border-radius:8px;padding:12px 16px;margin-bottom:4px;">
                <p style="margin:0 0 4px;font-size:11px;color:#71717a;">Or copy and paste this link into your browser:</p>
                <p style="margin:0;font-size:11px;color:#C6A16A;word-break:break-all;">${resetUrl}</p>
              </div>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px;border-top:1px solid #27272a;text-align:center;">
              <p style="margin:0;font-size:11px;color:#52525b;line-height:1.6;">
                You're receiving this because a password reset was requested for your account at
                <a href="https://castrahouseholds.co.ke" style="color:#71717a;text-decoration:none;">castrahouseholds.co.ke</a>.
                <br />If you didn't do this, please ignore this email.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    const text = `Hi ${firstName},

We received a request to reset the password on your Castra account.

Reset your password here:
${resetUrl}

This link expires in 1 hour. If you didn't request a reset, just ignore this email - your password won't change.

- Castra Households
https://castrahouseholds.co.ke`;

    return { subject, html, text };
}
