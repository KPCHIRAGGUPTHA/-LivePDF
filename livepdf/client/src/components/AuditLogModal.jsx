import { useEffect, useState, useCallback } from 'react';
import api from '../utils/api';

export default function AuditLogModal({ doc, onClose }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState('');

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const url = actionFilter
        ? `/documents/${doc.id}/audit-logs?action=${actionFilter}`
        : `/documents/${doc.id}/audit-logs`;
      const res = await api.get(url);
      setLogs(res.data);
    } catch (err) {
      console.error('Failed to fetch audit logs:', err);
      alert('Failed to load audit history.');
    } finally {
      setLoading(false);
    }
  }, [doc.id, actionFilter]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const formatAction = (action) => {
    switch (action) {
      case 'view': return '👁️ View';
      case 'download': return '📥 Download';
      case 'upload': return '🔄 Version Upload';
      case 'share': return '🔗 Link Created';
      case 'delete_link': return '🗑️ Link Deleted';
      case 'delete_document': return '❌ Doc Deleted';
      default: return action;
    }
  };

  const getActionBadgeStyle = (action) => {
    let bg = '#f1f5f9', color = '#475569';
    if (action === 'view') { bg = '#e0f2fe'; color = '#0369a1'; }
    else if (action === 'download') { bg = '#dcfce7'; color = '#15803d'; }
    else if (action === 'upload') { bg = '#fef3c7'; color = '#92400e'; }
    else if (action === 'share') { bg = '#f3e8ff'; color = '#6b21a8'; }
    else if (action.startsWith('delete')) { bg = '#fee2e2'; color = '#b91c1c'; }
    return {
      background: bg,
      color: color,
      padding: '2px 8px',
      borderRadius: '12px',
      fontSize: '11px',
      fontWeight: 600,
      display: 'inline-block',
    };
  };

  const renderMetadata = (log) => {
    const meta = log.metadata || {};
    const parts = [];
    if (meta.version) parts.push(`Version: ${meta.version}`);
    if (meta.versionNumber) parts.push(`v${meta.versionNumber}`);
    if (meta.linkType) parts.push(`Type: ${meta.linkType}`);
    if (meta.token) parts.push(`Token: ${meta.token.slice(0, 8)}…`);
    return parts.join(' | ') || '—';
  };

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        {/* Header */}
        <div style={styles.header}>
          <div>
            <h3 style={styles.title}>Document History</h3>
            <p style={styles.sub}>{doc.title}</p>
          </div>
          <button onClick={onClose} style={styles.closeBtn}>✕</button>
        </div>

        {/* Filter Bar */}
        <div style={styles.filterBar}>
          <label style={styles.filterLabel} htmlFor="action-filter">Filter by action:</label>
          <select
            id="action-filter"
            style={styles.select}
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
          >
            <option value="">All Events</option>
            <option value="view">Views</option>
            <option value="download">Downloads</option>
            <option value="upload">Uploads</option>
            <option value="share">Shares</option>
            <option value="delete_link">Delete Link</option>
          </select>
        </div>

        {/* Log List */}
        <div style={styles.content}>
          {loading ? (
            <div style={styles.loading}>Loading audit log...</div>
          ) : logs.length === 0 ? (
            <div style={styles.empty}>No events match this filter.</div>
          ) : (
            <div style={styles.tableWrapper}>
              <table style={styles.table}>
                <thead>
                  <tr style={styles.tableHead}>
                    <th style={styles.th}>Action</th>
                    <th style={styles.th}>User</th>
                    <th style={styles.th}>IP Address</th>
                    <th style={styles.th}>Details</th>
                    <th style={styles.th}>Time</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={log.id} style={styles.row}>
                      <td style={styles.cell}>
                        <span style={getActionBadgeStyle(log.action)}>
                          {formatAction(log.action)}
                        </span>
                      </td>
                      <td style={styles.cell}>
                        <div style={styles.viewerName}>{log.viewer_name}</div>
                        {log.viewer_email && (
                          <div style={styles.viewerEmail}>{log.viewer_email}</div>
                        )}
                      </td>
                      <td style={styles.cell}>
                        <code style={styles.ip}>{log.ip_address || '—'}</code>
                      </td>
                      <td style={styles.cell}>
                        <span style={styles.metaText}>{renderMetadata(log)}</span>
                      </td>
                      <td style={styles.cell}>
                        <span style={styles.time}>
                          {new Date(log.created_at).toLocaleString()}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(15, 23, 42, 0.3)',
    backdropFilter: 'blur(4px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modal: {
    background: '#ffffff',
    borderRadius: '16px',
    border: '1px solid #e2e8f0',
    width: '100%',
    maxWidth: '800px',
    maxHeight: '85vh',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: '20px 24px',
    borderBottom: '1px solid #e2e8f0',
  },
  title: {
    fontSize: '18px',
    fontWeight: 600,
    color: '#0f172a',
    margin: '0 0 4px 0',
  },
  sub: {
    fontSize: '13px',
    color: '#64748b',
    margin: 0,
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    fontSize: '18px',
    color: '#94a3b8',
    cursor: 'pointer',
    padding: 0,
    transition: 'color 0.2s',
    ':hover': { color: '#475569' }
  },
  filterBar: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px 24px',
    background: '#f8fafc',
    borderBottom: '1px solid #e2e8f0',
  },
  filterLabel: {
    fontSize: '13px',
    color: '#475569',
    fontWeight: 500,
  },
  select: {
    padding: '6px 12px',
    borderRadius: '8px',
    border: '1px solid #cbd5e1',
    fontSize: '13px',
    color: '#1e293b',
    background: '#ffffff',
    outline: 'none',
    cursor: 'pointer',
  },
  content: {
    padding: '24px',
    overflowY: 'auto',
    flex: 1,
  },
  loading: {
    textAlign: 'center',
    color: '#64748b',
    fontSize: '14px',
    padding: '40px 0',
  },
  empty: {
    textAlign: 'center',
    color: '#94a3b8',
    fontSize: '14px',
    padding: '40px 0',
  },
  tableWrapper: {
    border: '1px solid #e2e8f0',
    borderRadius: '10px',
    overflow: 'hidden',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    textAlign: 'left',
  },
  tableHead: {
    background: '#f8fafc',
    borderBottom: '1px solid #e2e8f0',
  },
  th: {
    padding: '12px 16px',
    fontSize: '11px',
    fontWeight: 600,
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  row: {
    borderBottom: '1px solid #f1f5f9',
    ':hover': { background: '#f8fafc' },
  },
  cell: {
    padding: '14px 16px',
    fontSize: '13px',
    verticalAlign: 'middle',
  },
  viewerName: {
    fontWeight: 600,
    color: '#1e293b',
  },
  viewerEmail: {
    fontSize: '11px',
    color: '#64748b',
    marginTop: '2px',
  },
  ip: {
    fontFamily: 'Consolas, Monaco, monospace',
    fontSize: '12px',
    color: '#475569',
    background: '#f1f5f9',
    padding: '2px 6px',
    borderRadius: '4px',
  },
  metaText: {
    fontSize: '12px',
    color: '#64748b',
  },
  time: {
    color: '#64748b',
    fontSize: '12px',
  },
};
