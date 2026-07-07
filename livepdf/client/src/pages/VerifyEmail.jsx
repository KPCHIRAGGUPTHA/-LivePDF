import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function VerifyEmail() {
  const { verifyEmail, resendOtp, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const { userId, email } = location.state || {};
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [resent, setResent] = useState(false);

  if (!userId) {
    navigate('/signup');
    return null;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const result = await verifyEmail(userId, otp.trim());
    if (result.success) {
      navigate('/login', { state: { verified: true } });
    } else {
      setError(result.error);
    }
  };

  const handleResend = async () => {
    const result = await resendOtp(userId);
    if (result.success) {
      setResent(true);
      setTimeout(() => setResent(false), 5000);
    } else {
      setError(result.error);
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h1 style={styles.logo}>LivePDF</h1>
        <h2 style={styles.title}>Check your email</h2>
        <p style={styles.sub}>
          We sent a 6-digit code to <strong>{email}</strong>.
          Enter it below to verify your account.
        </p>

        {error && <div style={styles.errorBox}>{error}</div>}
        {resent && <div style={styles.successBox}>New code sent to your email.</div>}

        <form onSubmit={handleSubmit} style={styles.form}>
          <input
            style={styles.otpInput}
            type="text"
            inputMode="numeric"
            maxLength={6}
            placeholder="000000"
            value={otp}
            onChange={(e) => { setOtp(e.target.value); setError(''); }}
            required
          />
          <button style={styles.btn} type="submit" disabled={loading || otp.length < 6}>
            {loading ? 'Verifying…' : 'Verify email'}
          </button>
        </form>

        <p style={styles.footer}>
          Didn't receive it?{' '}
          <button onClick={handleResend} style={styles.linkBtn}>Resend code</button>
        </p>
      </div>
    </div>
  );
}

const styles = {
  page: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f9f9f7', padding: '1rem' },
  card: { background: '#fff', borderRadius: 12, border: '0.5px solid #e0e0e0', padding: '2rem', width: '100%', maxWidth: 400 },
  logo: { fontSize: 22, fontWeight: 600, marginBottom: 4, color: '#1a1a1a' },
  title: { fontSize: 16, fontWeight: 500, marginBottom: 8, color: '#444' },
  sub: { fontSize: 13, color: '#666', lineHeight: 1.6, marginBottom: '1.5rem' },
  form: { display: 'flex', flexDirection: 'column', gap: 12 },
  otpInput: { padding: '14px', borderRadius: 8, border: '0.5px solid #d0d0d0', fontSize: 28, fontWeight: 600, textAlign: 'center', letterSpacing: 12, outline: 'none' },
  btn: { padding: '11px', borderRadius: 8, background: '#1a1a1a', color: '#fff', border: 'none', fontSize: 14, fontWeight: 500, cursor: 'pointer' },
  errorBox: { background: '#fff0f0', border: '0.5px solid #fca5a5', borderRadius: 8, padding: '10px 12px', fontSize: 13, color: '#b91c1c', marginBottom: 8 },
  successBox: { background: '#f0fdf4', border: '0.5px solid #86efac', borderRadius: 8, padding: '10px 12px', fontSize: 13, color: '#15803d', marginBottom: 8 },
  footer: { textAlign: 'center', fontSize: 13, color: '#888', marginTop: '1.25rem' },
  linkBtn: { background: 'none', border: 'none', color: '#1a1a1a', fontWeight: 500, cursor: 'pointer', fontSize: 13, padding: 0 },
};
