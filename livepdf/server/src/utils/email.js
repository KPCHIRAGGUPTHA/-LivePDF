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
      <div style="font-family:sans-serif;max-width:480px;margin:auto">
        <h2 style="color:#1a1a1a">Welcome to LivePDF, ${fullName}!</h2>
        <p style="color:#555">Use the code below to verify your email address. It expires in 15 minutes.</p>
        <div style="font-size:36px;font-weight:bold;letter-spacing:8px;color:#1a1a1a;
                    background:#f5f5f5;padding:20px;text-align:center;border-radius:8px;
                    margin:24px 0">
          ${otpCode}
        </div>
        <p style="color:#999;font-size:13px">If you didn't sign up for LivePDF, ignore this email.</p>
      </div>
    `,
  });
}

module.exports = { sendVerificationEmail };
