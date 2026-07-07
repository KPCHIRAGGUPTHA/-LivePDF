import { useState } from 'react';
import { copyToClipboard } from '../utils/clipboard';

export default function ShareLinkRow({ link, onDelete }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const success = await copyToClipboard(link.url);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const formatExpiry = (expiresAt) => {
    if (!expiresAt) return 'No expiry';
    const date = new Date(expiresAt);
    if (date < new Date()) return 'Expired';
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const isExpired = link.expires_at && new Date(link.expires_at) < new Date();

  return (
    <tr style={styles.row}>
      <td style={styles.cell}>
        <span style={{ ...styles.badge, ...styles[link.link_type] }}>
          {link.link_type}
        </span>
      </td>
      <td style={styles.cell}>
        <span style={isExpired ? styles.expiredText : styles.expiryText}>
          {formatExpiry(link.expires_at)}
        </span>
      </td>
      <td style={styles.cell}>
        <span style={styles.views}>{link.view_count || 0} views</span>
      </td>
      <td style={{ ...styles.cell, textAlign: 'right' }}>
        <div style={styles.btnGroup}>
          <button onClick={handleCopy} style={styles.iconBtn} title="Copy URL">
            {copied ? 'Copied!' : '📋 Copy'}
          </button>
          <button onClick={() => onDelete(link.id)} style={styles.deleteBtn} title="Delete Link">
            ✕
          </button>
        </div>
      </td>
    </tr>
  );
}

const styles = {
  row: {
    borderBottom: '0.5px solid #f0f0ed',
  },
  cell: {
    padding: '10px 8px',
    fontSize: '13px',
    color: '#333',
    verticalAlign: 'middle',
  },
  badge: {
    fontSize: '11px',
    fontWeight: 600,
    padding: '2px 8px',
    borderRadius: '12px',
    textTransform: 'capitalize',
    display: 'inline-block',
  },
  public: {
    background: '#e0f2fe',
    color: '#0369a1',
  },
  private: {
    background: '#f3e8ff',
    color: '#6b21a8',
  },
  protected: {
    background: '#fef3c7',
    color: '#92400e',
  },
  expiryText: {
    color: '#555',
  },
  expiredText: {
    color: '#b91c1c',
    fontWeight: 500,
  },
  views: {
    color: '#666',
  },
  btnGroup: {
    display: 'flex',
    gap: '12px',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  iconBtn: {
    background: '#fafafa',
    border: '0.5px solid #ccc',
    borderRadius: '4px',
    cursor: 'pointer',
    padding: '3px 8px',
    fontSize: '11px',
  },
  deleteBtn: {
    background: 'none',
    border: 'none',
    color: '#b91c1c',
    cursor: 'pointer',
    padding: '4px 8px',
    fontSize: '14px',
    fontWeight: 'bold',
  },
};
