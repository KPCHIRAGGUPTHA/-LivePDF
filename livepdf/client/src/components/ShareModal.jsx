import { useState, useEffect, useCallback } from 'react';
import api from '../utils/api';
import ShareLinkRow from './ShareLinkRow';
import { copyToClipboard } from '../utils/clipboard';

export default function ShareModal({ doc, onClose }) {
  const [activeTab, setActiveTab] = useState('public'); // 'public' | 'private' | 'protected'

  // Input states
  const [password, setPassword] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [allowedEmails, setAllowedEmails] = useState([]);
  const [allowDownload, setAllowDownload] = useState(true);
  const [showWatermark, setShowWatermark] = useState(false);
  const [expiresAt, setExpiresAt] = useState('');

  // Output states
  const [generatedUrl, setGeneratedUrl] = useState(null);
  const [copied, setCopied] = useState(false);
  const [generating, setGenerating] = useState(false);

  // Existing links
  const [existingLinks, setExistingLinks] = useState([]);
  const [loadingLinks, setLoadingLinks] = useState(true);

  const fetchLinks = useCallback(async () => {
    try {
      const res = await api.get(`/share/documents/${doc.id}/share-links`);
      setExistingLinks(res.data);
    } catch (err) {
      console.error('Failed to load share links:', err);
    } finally {
      setLoadingLinks(false);
    }
  }, [doc.id]);

  useEffect(() => {
    fetchLinks();
  }, [fetchLinks]);

  const handleAddEmail = (e) => {
    e.preventDefault();
    const email = emailInput.trim().toLowerCase();
    if (!email) return;
    if (allowedEmails.includes(email)) {
      alert('Email already added');
      return;
    }
    // Simple email regex validation
    if (!/\S+@\S+\.\S+/.test(email)) {
      alert('Invalid email format');
      return;
    }
    setAllowedEmails([...allowedEmails, email]);
    setEmailInput('');
  };

  const handleRemoveEmail = (index) => {
    setAllowedEmails(allowedEmails.filter((_, i) => i !== index));
  };

  const handleGenerate = async (e) => {
    e.preventDefault();
    setGenerating(true);
    setGeneratedUrl(null);

    const body = {
      linkType: activeTab,
      allowDownload,
      showWatermark,
      expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
    };

    if (activeTab === 'protected') {
      if (!password.trim()) {
        alert('Password is required for protected links');
        setGenerating(false);
        return;
      }
      body.password = password;
    }

    if (activeTab === 'private') {
      if (allowedEmails.length === 0) {
        alert('Please add at least one email address');
        setGenerating(false);
        return;
      }
      body.allowedEmails = allowedEmails;
    }

    try {
      const res = await api.post(`/share/documents/${doc.id}/share`, body);
      setGeneratedUrl(res.data.url);
      setConfirmStates();
      fetchLinks();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to generate link');
    } finally {
      setGenerating(false);
    }
  };

  const setConfirmStates = () => {
    setPassword('');
    setAllowedEmails([]);
  };

  const handleCopy = async () => {
    if (!generatedUrl) return;
    const success = await copyToClipboard(generatedUrl);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDeleteLink = async (linkId) => {
    if (!window.confirm('Are you sure you want to delete this share link? It will stop working immediately.')) {
      return;
    }
    try {
      await api.delete(`/share/${linkId}`);
      fetchLinks();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to delete link');
    }
  };

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        {/* Header */}
        <div style={styles.header}>
          <h3 style={styles.title}>Share "{doc.title}"</h3>
          <button onClick={onClose} style={styles.closeBtn}>✕</button>
        </div>

        {/* Tab Headers */}
        <div style={styles.tabs}>
          <button
            onClick={() => { setActiveTab('public'); setGeneratedUrl(null); }}
            style={{ ...styles.tab, ...(activeTab === 'public' ? styles.activeTab : {}) }}
          >
            🌍 Public
          </button>
          <button
            onClick={() => { setActiveTab('private'); setGeneratedUrl(null); }}
            style={{ ...styles.tab, ...(activeTab === 'private' ? styles.activeTab : {}) }}
          >
            🔒 Private
          </button>
          <button
            onClick={() => { setActiveTab('protected'); setGeneratedUrl(null); }}
            style={{ ...styles.tab, ...(activeTab === 'protected' ? styles.activeTab : {}) }}
          >
            🛡️ Protected
          </button>
        </div>

        {/* Tab Content */}
        <div style={styles.content}>
          <form onSubmit={handleGenerate} style={styles.form}>
            {/* Link Type Explanations */}
            {activeTab === 'public' && (
              <p style={styles.desc}>Anyone with this link can view the document without logging in.</p>
            )}
            {activeTab === 'private' && (
              <div style={styles.desc}>
                <p style={{ margin: '0 0 8px 0' }}>Only users logged in with the specified emails can access this link.</p>
                <div style={styles.emailInputRow}>
                  <input
                    style={styles.input}
                    type="email"
                    placeholder="add-email@example.com"
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                  />
                  <button type="button" onClick={handleAddEmail} style={styles.addEmailBtn}>
                    Add
                  </button>
                </div>
                {allowedEmails.length > 0 && (
                  <div style={styles.emailTags}>
                    {allowedEmails.map((email, idx) => (
                      <span key={idx} style={styles.tag}>
                        {email}
                        <button type="button" onClick={() => handleRemoveEmail(idx)} style={styles.tagRemove}>✕</button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
            {activeTab === 'protected' && (
              <div style={styles.desc}>
                <p style={{ margin: '0 0 8px 0' }}>Anyone with this link can view the document, but they must input this password first.</p>
                <input
                  style={styles.input}
                  type="password"
                  placeholder="Set access password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
            )}

            {/* General Link Settings */}
            <div style={styles.settingsRow}>
              <div style={styles.setting}>
                <label style={styles.label}>Expiry date (optional)</label>
                <input
                  style={styles.inputDate}
                  type="datetime-local"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                />
              </div>
              <div style={styles.checkboxSetting}>
                <input
                  type="checkbox"
                  id="allow-download"
                  checked={allowDownload}
                  onChange={(e) => setAllowDownload(e.target.checked)}
                />
                <label htmlFor="allow-download" style={styles.checkboxLabel}>Allow downloading PDF</label>
              </div>
              <div style={styles.checkboxSetting}>
                <input
                  type="checkbox"
                  id="show-watermark"
                  checked={showWatermark}
                  onChange={(e) => setShowWatermark(e.target.checked)}
                />
                <label htmlFor="show-watermark" style={styles.checkboxLabel}>Show watermark on this link</label>
              </div>
            </div>

            <button type="submit" style={styles.generateBtn} disabled={generating}>
              {generating ? 'Generating link...' : 'Generate Link'}
            </button>
          </form>

          {/* Generated Link Result */}
          {generatedUrl && (
            <div style={styles.result}>
              <span style={styles.resultLabel}>Shareable Link Generated:</span>
              <div style={styles.copyRow}>
                <input style={styles.resultInput} type="text" readOnly value={generatedUrl} onClick={(e) => e.target.select()} />
                <button onClick={handleCopy} style={styles.copyBtn}>
                  {copied ? 'Copied! ✓' : 'Copy'}
                </button>
              </div>
            </div>
          )}

          {/* List of Existing Links */}
          <div style={styles.existingSection}>
            <h4 style={styles.sectionHeader}>Existing links for this document</h4>
            {loadingLinks ? (
              <div style={styles.loading}>Loading links...</div>
            ) : existingLinks.length === 0 ? (
              <div style={styles.noLinks}>No share links created yet.</div>
            ) : (
              <div style={styles.tableWrapper}>
                <table style={styles.table}>
                  <thead>
                    <tr style={styles.tableHead}>
                      <th style={styles.th}>Type</th>
                      <th style={styles.th}>Expiry</th>
                      <th style={styles.th}>Stats</th>
                      <th style={{ ...styles.th, textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {existingLinks.map((link) => (
                      <ShareLinkRow
                        key={link.id}
                        link={link}
                        onDelete={handleDeleteLink}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const styles = {
  overlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  modal: { background: '#fff', borderRadius: '12px', border: '0.5px solid #ccc', width: '100%', maxWidth: '520px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 8px 30px rgba(0,0,0,0.12)' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.25rem 1.5rem', borderBottom: '0.5px solid #f0f0ed' },
  title: { fontSize: '16px', fontWeight: 600, color: '#1a1a1a', margin: 0 },
  closeBtn: { background: 'none', border: 'none', fontSize: '18px', color: '#888', cursor: 'pointer', padding: 0 },
  tabs: { display: 'flex', borderBottom: '0.5px solid #f0f0ed', background: '#fafafa' },
  tab: { flex: 1, padding: '10px', background: 'none', border: 'none', fontSize: '13px', fontWeight: 500, color: '#666', cursor: 'pointer', borderBottom: '2px solid transparent', transition: 'all 0.15s ease' },
  activeTab: { color: '#1a1a1a', borderBottomColor: '#1a1a1a', fontWeight: 600, background: '#fff' },
  content: { padding: '1.5rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '20px' },
  form: { display: 'flex', flexDirection: 'column', gap: '16px' },
  desc: { fontSize: '13px', color: '#666', margin: 0, lineHeight: '1.5' },
  emailInputRow: { display: 'flex', gap: '8px', marginTop: '6px' },
  addEmailBtn: { padding: '8px 16px', background: '#1a1a1a', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 500, cursor: 'pointer' },
  emailTags: { display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '10px', background: '#fafafa', border: '0.5px solid #eee', padding: '8px', borderRadius: '8px' },
  tag: { display: 'flex', alignItems: 'center', gap: '4px', background: '#eee', color: '#333', fontSize: '11px', padding: '3px 8px', borderRadius: '12px', fontWeight: 500 },
  tagRemove: { background: 'none', border: 'none', fontSize: '10px', color: '#888', cursor: 'pointer', padding: '0 2px' },
  input: { padding: '8px 12px', borderRadius: '6px', border: '0.5px solid #d0d0d0', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' },
  settingsRow: { display: 'flex', flexDirection: 'column', gap: '12px', background: '#fafafa', padding: '12px', borderRadius: '8px', border: '0.5px solid #eee' },
  setting: { display: 'flex', flexDirection: 'column', gap: '4px' },
  label: { fontSize: '12px', color: '#555', fontWeight: 500 },
  inputDate: { padding: '6px 8px', borderRadius: '4px', border: '0.5px solid #d0d0d0', fontSize: 12, outline: 'none' },
  checkboxSetting: { display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' },
  checkboxLabel: { fontSize: '12px', color: '#333', cursor: 'pointer', userSelect: 'none' },
  generateBtn: { padding: '10px', background: '#1a1a1a', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' },
  result: { background: '#f0fdf4', border: '0.5px solid #86efac', borderRadius: '8px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '6px' },
  resultLabel: { fontSize: '12px', fontWeight: 600, color: '#15803d' },
  copyRow: { display: 'flex', gap: '8px' },
  resultInput: { flex: 1, padding: '8px', fontSize: '12px', border: '0.5px solid #86efac', borderRadius: '6px', background: '#fff', outline: 'none', color: '#15803d' },
  copyBtn: { padding: '0 16px', background: '#15803d', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 500, cursor: 'pointer' },
  existingSection: { borderTop: '0.5px solid #f0f0ed', paddingTop: '16px' },
  sectionHeader: { fontSize: '13px', fontWeight: 600, color: '#1a1a1a', margin: '0 0 10px 0' },
  loading: { textAlign: 'center', fontSize: '12px', color: '#888', padding: '12px 0' },
  noLinks: { fontSize: '12px', color: '#999', fontStyle: 'italic', padding: '8px 0' },
  tableWrapper: { maxHeight: '180px', overflowY: 'auto', border: '0.5px solid #e0e0e0', borderRadius: '8px' },
  table: { width: '100%', borderCollapse: 'collapse', textAlign: 'left' },
  tableHead: { background: '#fafafa', borderBottom: '0.5px solid #e0e0e0' },
  th: { padding: '8px', fontSize: '11px', fontWeight: 600, color: '#666', textTransform: 'uppercase' },
};
