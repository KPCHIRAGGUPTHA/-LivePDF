const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { validationResult } = require('express-validator');
const crypto = require('crypto');
const pool = require('../config/db');
const { sendVerificationEmail, sendResetPasswordEmail } = require('../utils/email');

// ─── helpers ────────────────────────────────────────────────
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, fullName: user.full_name, plan: user.plan || 'FREE' },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

// ─── POST /auth/signup ───────────────────────────────────────
async function signup(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { email, password, fullName } = req.body;

  try {
    // Check duplicate
    const existing = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [email.toLowerCase()]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const otp = generateOTP();
    const otpExpires = new Date(Date.now() + 15 * 60 * 1000); // 15 min

    const result = await pool.query(
      `INSERT INTO users (email, password_hash, full_name, otp_code, otp_expires_at)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, email, full_name, is_verified, created_at`,
      [email.toLowerCase(), passwordHash, fullName, otp, otpExpires]
    );

    const user = result.rows[0];

    // Send OTP email (don't await — let it run in background)
    sendVerificationEmail(user.email, fullName, otp).catch(console.error);

    const responsePayload = {
      message: 'Account created. Check your email for the verification code.',
      userId: user.id,
    };

    if (process.env.NODE_ENV === 'development' || process.env.EMAIL_USER === 'dummy_livepdf_email@gmail.com') {
      responsePayload.otpMock = otp;
    }

    res.status(201).json(responsePayload);
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ error: 'Server error during signup' });
  }
}

// ─── POST /auth/verify-email ─────────────────────────────────
async function verifyEmail(req, res) {
  const { userId, otp } = req.body;

  if (!userId || !otp) {
    return res.status(400).json({ error: 'userId and otp are required' });
  }

  try {
    const result = await pool.query(
      'SELECT id, otp_code, otp_expires_at, is_verified FROM users WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];

    if (user.is_verified) {
      return res.status(400).json({ error: 'Email already verified' });
    }

    if (user.otp_code !== otp) {
      return res.status(400).json({ error: 'Invalid OTP code' });
    }

    if (new Date() > new Date(user.otp_expires_at)) {
      return res.status(400).json({ error: 'OTP has expired. Request a new one.' });
    }

    // Mark verified, clear OTP
    await pool.query(
      `UPDATE users
       SET is_verified = TRUE, otp_code = NULL, otp_expires_at = NULL, updated_at = NOW()
       WHERE id = $1`,
      [userId]
    );

    res.json({ message: 'Email verified successfully. You can now log in.' });
  } catch (err) {
    console.error('Verify email error:', err);
    res.status(500).json({ error: 'Server error during verification' });
  }
}

// ─── POST /auth/resend-otp ───────────────────────────────────
async function resendOtp(req, res) {
  const { userId } = req.body;

  if (!userId) return res.status(400).json({ error: 'userId is required' });

  try {
    const result = await pool.query(
      'SELECT id, email, full_name, is_verified FROM users WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];

    if (user.is_verified) {
      return res.status(400).json({ error: 'Email already verified' });
    }

    const otp = generateOTP();
    const otpExpires = new Date(Date.now() + 15 * 60 * 1000);

    await pool.query(
      'UPDATE users SET otp_code = $1, otp_expires_at = $2 WHERE id = $3',
      [otp, otpExpires, userId]
    );

    sendVerificationEmail(user.email, user.full_name, otp).catch(console.error);

    const responsePayload = { message: 'New OTP sent to your email.' };
    if (process.env.NODE_ENV === 'development' || process.env.EMAIL_USER === 'dummy_livepdf_email@gmail.com') {
      responsePayload.otpMock = otp;
    }

    res.json(responsePayload);
  } catch (err) {
    console.error('Resend OTP error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

// ─── POST /auth/login ────────────────────────────────────────
async function login(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { email, password } = req.body;

  try {
    const result = await pool.query(
      'SELECT id, email, full_name, password_hash, is_verified, plan FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = result.rows[0];

    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    if (!user.is_verified) {
      const responsePayload = {
        error: 'Email not verified',
        userId: user.id,
        requiresVerification: true,
      };
      if (process.env.NODE_ENV === 'development' || process.env.EMAIL_USER === 'dummy_livepdf_email@gmail.com') {
        responsePayload.otpMock = user.otp_code;
      }
      return res.status(403).json(responsePayload);
    }

    const token = signToken(user);

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        plan: user.plan || 'FREE',
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error during login' });
  }
}

// ─── GET /auth/me ────────────────────────────────────────────
async function getMe(req, res) {
  try {
    const result = await pool.query(
      'SELECT id, email, full_name, is_verified, plan, created_at FROM users WHERE id = $1',
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];
    res.json({
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      isVerified: user.is_verified,
      plan: user.plan || 'FREE',
      createdAt: user.created_at,
    });
  } catch (err) {
    console.error('Get me error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

// ─── POST /auth/forgot-password ──────────────────────────────
async function forgotPassword(req, res) {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const result = await pool.query(
      'SELECT id, email, full_name FROM users WHERE email = $1',
      [email.toLowerCase().trim()]
    );

    if (result.rows.length === 0) {
      return res.json({ message: 'If that email exists, a reset link was sent.' });
    }

    const user = result.rows[0];
    const resetToken = crypto.randomBytes(20).toString('hex');
    const resetExpires = new Date(Date.now() + 3600000); // 1 hour

    await pool.query(
      'UPDATE users SET reset_password_token = $1, reset_password_expires = $2 WHERE id = $3',
      [resetToken, resetExpires, user.id]
    );

    sendResetPasswordEmail(user.email, user.full_name, resetToken).catch(console.error);

    const responsePayload = { message: 'If that email exists, a reset link was sent.' };
    if (process.env.NODE_ENV === 'development' || process.env.EMAIL_USER === 'dummy_livepdf_email@gmail.com') {
      const resetLink = `${process.env.CLIENT_URL || 'http://localhost:5173'}/reset-password?token=${resetToken}`;
      responsePayload.resetLinkMock = resetLink;
    }

    res.json(responsePayload);
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

// ─── POST /auth/reset-password ───────────────────────────────
async function resetPassword(req, res) {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) {
      return res.status(400).json({ error: 'Token and new password are required' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const result = await pool.query(
      'SELECT id, reset_password_expires FROM users WHERE reset_password_token = $1',
      [token]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid or expired token' });
    }

    const user = result.rows[0];
    const expires = new Date(user.reset_password_expires);
    if (expires < new Date()) {
      return res.status(400).json({ error: 'Invalid or expired token' });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(newPassword, salt);

    await pool.query(
      'UPDATE users SET password_hash = $1, reset_password_token = NULL, reset_password_expires = NULL WHERE id = $2',
      [passwordHash, user.id]
    );

    res.json({ message: 'Password has been reset successfully.' });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

module.exports = { signup, login, verifyEmail, resendOtp, getMe, forgotPassword, resetPassword };
