import React, { useState, useEffect } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ResetPassword() {
  const { resetPassword } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  
  const token = searchParams.get('token');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!token) {
      setError('Invalid or missing password reset token.');
    }
  }, [token]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    
    if (!token) {
      setError('Missing reset token.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    setLoading(true);
    const result = await resetPassword(token, password);
    setLoading(false);

    if (result.success) {
      setSuccess(true);
      setTimeout(() => {
        navigate('/login');
      }, 3000);
    } else {
      setError(result.error);
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h1 style={styles.logo}>LivePDF</h1>
        <h2 style={styles.title}>Set new password</h2>

        {error && <div style={styles.errorBox}>{error}</div>}
        {success && <div style={styles.successBox}>Password reset successful! Redirecting to login...</div>}

        {!success && token && (
          <form onSubmit={handleSubmit} style={styles.form}>
            <label style={styles.label}>New Password</label>
            <input
              style={styles.input}
              type="password"
              placeholder="Minimum 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />

            <label style={styles.label}>Confirm New Password</label>
            <input
              style={styles.input}
              type="password"
              placeholder="Confirm password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />

            <button style={styles.btn} type="submit" disabled={loading}>
              {loading ? 'Resetting password…' : 'Reset password'}
            </button>
          </form>
        )}

        <p style={styles.footer}>
          Go back to <Link to="/login" style={styles.link}>Log in</Link>
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
