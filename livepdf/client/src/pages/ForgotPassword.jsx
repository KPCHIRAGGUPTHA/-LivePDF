import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ForgotPassword() {
  const { forgotPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);

    const result = await forgotPassword(email);
    setLoading(false);

    if (result.success) {
      setMessage(result.message || 'If that email exists, a reset link was sent.');
    } else {
      setError(result.error);
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h1 style={styles.logo}>LivePDF</h1>
        <h2 style={styles.title}>Reset your password</h2>

        {error && <div style={styles.errorBox}>{error}</div>}
        {message && <div style={styles.successBox}>{message}</div>}

        {!message && (
          <form onSubmit={handleSubmit} style={styles.form}>
            <label style={styles.label}>Email Address</label>
            <input
              style={styles.input}
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />

            <button style={styles.btn} type="submit" disabled={loading}>
              {loading ? 'Sending link…' : 'Send reset link'}
            </button>
          </form>
        )}

        <p style={styles.footer}>
          Remember your password?{' '}
          <Link to="/login" style={styles.link}>Log in</Link>
        </p>
      </div>
    </div>
  );
}

const styles = {
  page: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f9f9f7', padding: '1rem' },
  card: { background: '#fff', borderRadius: 12, border: '0.5px solid #e0e0e0', padding: '2rem', width: '100%', maxWidth: 400 },
  logo: { fontSize: 22, fontWeight: 600, marginBottom: 4, color: '#1a1a1a' },
  title: { fontSize: 16, fontWeight: 500, marginBottom: '1.5rem', color: '#444' },
  form: { display: 'flex', flexDirection: 'column', gap: 12 },
  label: { fontSize: 13, color: '#555', marginBottom: 2 },
  input: { padding: '10px 12px', borderRadius: 8, border: '0.5px solid #d0d0d0', fontSize: 14, outline: 'none', width: '100%' },
  btn: { marginTop: 8, padding: '11px', borderRadius: 8, background: '#1a1a1a', color: '#fff', border: 'none', fontSize: 14, fontWeight: 500, cursor: 'pointer' },
  errorBox: { background: '#fde8e8', color: '#e02424', padding: '10px 12px', borderRadius: 8, fontSize: 13, marginBottom: '1rem', border: '0.5px solid #f8b4b4' },
  successBox: { background: '#eafaf1', color: '#0e6251', padding: '10px 12px', borderRadius: 8, fontSize: 13, marginBottom: '1rem', border: '0.5px solid #a2d9ce' },
  footer: { marginTop: '1.5rem', textAlign: 'center', fontSize: 13, color: '#666' },
  link: { color: '#2563eb', textDecoration: 'none', fontWeight: 500 }
};
