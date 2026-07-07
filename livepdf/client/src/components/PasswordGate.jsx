import { useState } from 'react';
import api from '../utils/api';

export default function PasswordGate({ token, onUnlock }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.post(`/share/${token}/unlock`, { password }, { skipAuthRedirect: true });
      onUnlock(
        res.data.signedUrl,
        res.data.allowDownload,
        password,
        res.data.versions,
        res.data.documentId,
        res.data.versionNumber,
        res.data.diff,
        res.data.showWatermark
      );
    } catch (err) {
      setError(err.response?.data?.error || 'Incorrect password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h2 style={styles.title}>🔒 Protected document</h2>
        <p style={styles.sub}>Enter the password to view this document.</p>
        {error && <div style={styles.error}>{error}</div>}
        <form onSubmit={handleSubmit} style={styles.form}>
          <input
            style={styles.input}
            type="password"
            placeholder="Enter password"
            value={password}
            onChange={e => { setPassword(e.target.value); setError(''); }}
            required
            autoFocus
          />
          <button style={styles.btn} type="submit" disabled={loading}>
            {loading ? 'Unlocking…' : 'Unlock document'}
          </button>
        </form>
      </div>
    </div>
  );
}

const styles = {
  page: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f9f9f7' },
  card: { background: '#fff', border: '0.5px solid #e0e0e0', borderRadius: 12, padding: '2rem', width: '100%', maxWidth: 380 },
  title: { fontSize: 18, fontWeight: 500, marginBottom: 8, color: '#1a1a1a' },
  sub: { fontSize: 13, color: '#666', marginBottom: '1.25rem' },
  form: { display: 'flex', flexDirection: 'column', gap: 10 },
  input: { padding: '10px 12px', borderRadius: 8, border: '0.5px solid #d0d0d0', fontSize: 14, outline: 'none' },
  btn: { padding: 11, borderRadius: 8, background: '#1a1a1a', color: '#fff', border: 'none', fontSize: 14, fontWeight: 500, cursor: 'pointer' },
  error: { background: '#fff0f0', border: '0.5px solid #fca5a5', borderRadius: 8, padding: '9px 12px', fontSize: 13, color: '#b91c1c', marginBottom: 8 },
};
