const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: process.env.EMAIL_PORT,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

async function sendVerificationEmail(toEmail, fullName, otpCode) {
  console.log(`\n📧 [EMAIL MOCK] Verification OTP for ${toEmail}: ${otpCode}\n`);
  await transporter.sendMail({
    from: `"LivePDF" <${process.env.EMAIL_USER}>`,
    to: toEmail,
    subject: 'Verify your LivePDF account',
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 500px; margin: 30px auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05); background-color: #ffffff;">
        <div style="background-color: #0f172a; padding: 24px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 800; letter-spacing: -0.5px;">LivePDF</h1>
        </div>
        <div style="padding: 32px 24px;">
          <h2 style="color: #0f172a; font-size: 20px; font-weight: 700; margin-top: 0; margin-bottom: 16px;">Welcome, ${fullName}!</h2>
          <p style="color: #475569; font-size: 15px; line-height: 1.6; margin-bottom: 24px;">
            Thank you for registering with LivePDF. Use the verification code below to confirm your email address and unlock your document workspace.
          </p>
          <div style="font-size: 32px; font-weight: 800; letter-spacing: 6px; color: #2563eb; background-color: #eff6ff; border: 1px dashed #bfdbfe; padding: 18px 24px; text-align: center; border-radius: 8px; margin: 24px 0; font-family: monospace;">
            ${otpCode}
          </div>
          <p style="color: #64748b; font-size: 13px; line-height: 1.5; margin-bottom: 0;">
            This verification code is valid for <strong>15 minutes</strong>. If you did not create a LivePDF account, you can safely ignore this message.
          </p>
        </div>
        <div style="background-color: #f8fafc; padding: 18px 24px; text-align: center; border-top: 1px solid #f1f5f9;">
          <p style="color: #94a3b8; font-size: 12px; margin: 0;">&copy; ${new Date().getFullYear()} LivePDF. All rights reserved.</p>
        </div>
      </div>
    `,
  });
}

async function sendResetPasswordEmail(toEmail, fullName, resetToken) {
  const resetLink = `${process.env.CLIENT_URL || 'http://localhost:5173'}/reset-password?token=${resetToken}`;
  console.log(`\n📧 [EMAIL MOCK] Reset Password Link for ${toEmail}: ${resetLink}\n`);
  await transporter.sendMail({
    from: `"LivePDF" <${process.env.EMAIL_USER}>`,
    to: toEmail,
    subject: 'Reset your LivePDF password',
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 500px; margin: 30px auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05); background-color: #ffffff;">
        <div style="background-color: #0f172a; padding: 24px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 800; letter-spacing: -0.5px;">LivePDF</h1>
        </div>
        <div style="padding: 32px 24px;">
          <h2 style="color: #0f172a; font-size: 20px; font-weight: 700; margin-top: 0; margin-bottom: 16px;">Password Reset Request</h2>
          <p style="color: #475569; font-size: 15px; line-height: 1.6; margin-bottom: 24px;">
            Hello ${fullName}, we received a request to reset your LivePDF account password. Click the button below to set a new password.
          </p>
          <div style="text-align: center; margin: 32px 0;">
            <a href="${resetLink}" style="background-color: #2563eb; color: #ffffff; text-decoration: none; padding: 12px 24px; font-size: 15px; font-weight: 600; border-radius: 6px; display: inline-block;">Reset Password</a>
          </div>
          <p style="color: #64748b; font-size: 13px; line-height: 1.5; margin-bottom: 0;">
            This link is valid for <strong>1 hour</strong>. If you did not request a password reset, you can safely ignore this email.
          </p>
        </div>
        <div style="background-color: #f8fafc; padding: 18px 24px; text-align: center; border-top: 1px solid #f1f5f9;">
          <p style="color: #94a3b8; font-size: 12px; margin: 0;">&copy; ${new Date().getFullYear()} LivePDF. All rights reserved.</p>
        </div>
      </div>
    `,
  });
}

module.exports = { sendVerificationEmail, sendResetPasswordEmail };
