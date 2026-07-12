import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Signup() {
  const { signup, loading } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({ fullName: '', email: '', password: '' });
  const [error, setError] = useState('');

  const handleChange = (e) => {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    const result = await signup(form.email, form.password, form.fullName);
    if (result.success) {
      navigate('/verify-email', { state: { userId: result.userId, email: form.email, otpMock: result.otpMock } });
    } else {
      setError(result.error);
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h1 style={styles.logo}>LivePDF</h1>
        <h2 style={styles.title}>Create your account</h2>

        {error && <div style={styles.errorBox}>{error}</div>}

        <form onSubmit={handleSubmit} style={styles.form}>
          <label style={styles.label}>Full name</label>
          <input
            style={styles.input}
            name="fullName"
            type="text"
            placeholder="Chirag Guptha"
            value={form.fullName}
            onChange={handleChange}
            required
          />

          <label style={styles.label}>Email</label>
          <input
            style={styles.input}
            name="email"
            type="email"
            placeholder="you@example.com"
            value={form.email}
            onChange={handleChange}
            required
          />

          <label style={styles.label}>Password</label>
          <input
            style={styles.input}
            name="password"
            type="password"
            placeholder="Min 8 characters, include a number"
            value={form.password}
            onChange={handleChange}
            required
          />

          <button style={styles.btn} type="submit" disabled={loading}>
            {loading ? 'Creating account…' : 'Sign up'}
          </button>
        </form>

        <p style={styles.footer}>
          Already have an account?{' '}
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
  errorBox: { background: '#fff0f0', border: '0.5px solid #fca5a5', borderRadius: 8, padding: '10px 12px', fontSize: 13, color: '#b91c1c', marginBottom: 8 },
  footer: { textAlign: 'center', fontSize: 13, color: '#888', marginTop: '1.25rem' },
  link: { color: '#1a1a1a', fontWeight: 500 },
};
