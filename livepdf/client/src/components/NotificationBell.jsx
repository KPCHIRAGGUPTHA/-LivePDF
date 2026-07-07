import { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';

export default function NotificationBell() {
  const [count, setCount] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef(null);
  const navigate = useNavigate();

  // Fetch count
  const fetchCount = useCallback(async () => {
    try {
      const res = await api.get('/notifications/count');
      setCount(res.data.count);
    } catch (err) {
      console.error('Failed to fetch unread notification count:', err);
    }
  }, []);

  // Fetch list
  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/notifications');
      setNotifications(res.data);
    } catch (err) {
      console.error('Failed to fetch notifications list:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Poll count every 30 seconds
  useEffect(() => {
    fetchCount();
    const interval = setInterval(fetchCount, 30000);
    return () => clearInterval(interval);
  }, [fetchCount]);

  // Handle dropdown toggle
  const handleToggle = async () => {
    const nextOpen = !isOpen;
    setIsOpen(nextOpen);
    if (nextOpen) {
      // Fetch full list
      await fetchNotifications();
      // Mark all read automatically on open
      try {
        await api.patch('/notifications/read-all');
        setCount(0);
      } catch (err) {
        console.error('Failed to mark notifications read-all:', err);
      }
    }
  };

  // Mark all read button handler
  const handleMarkAllRead = async () => {
    try {
      await api.patch('/notifications/read-all');
      setCount(0);
      // Update local state to show all read
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    } catch (err) {
      console.error('Failed to mark all read:', err);
    }
  };

  // Click single notification
  const handleNotificationClick = async (notif) => {
    try {
      if (!notif.is_read) {
        await api.patch(`/notifications/${notif.id}/read`);
      }
      setIsOpen(false);
      fetchCount();

      // Navigate to the document share link
      if (notif.metadata && notif.metadata.token) {
        navigate(`/view/${notif.metadata.token}`);
      }
    } catch (err) {
      console.error('Failed to mark notification as read:', err);
    }
  };

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div style={styles.container} ref={dropdownRef}>
      <button onClick={handleToggle} style={styles.bellButton} title="Notifications">
        <span style={styles.bellIcon}>🔔</span>
        {count > 0 && (
          <span style={styles.badge}>{count}</span>
        )}
      </button>

      {isOpen && (
        <div style={styles.dropdown}>
          {/* Panel Header */}
          <div style={styles.dropdownHeader}>
            <span style={styles.dropdownTitle}>Notifications</span>
            {notifications.some(n => !n.is_read) && (
              <button onClick={handleMarkAllRead} style={styles.markReadBtn}>
                Mark all as read
              </button>
            )}
          </div>

          {/* Panel Content */}
          <div style={styles.listContainer}>
            {loading ? (
              <div style={styles.loading}>Loading notifications...</div>
            ) : notifications.length === 0 ? (
              <div style={styles.empty}>No notifications yet.</div>
            ) : (
              notifications.map((notif) => (
                <div
                  key={notif.id}
                  onClick={() => handleNotificationClick(notif)}
                  style={{
                    ...styles.item,
                    background: notif.is_read ? '#ffffff' : '#f8fafc',
                    borderLeftColor: notif.is_read ? 'transparent' : '#0f172a'
                  }}
                >
                  <div style={styles.itemTitle}>
                    {notif.document_title || 'Document Update'}
                  </div>
                  <div style={styles.itemMsg}>{notif.message}</div>
                  <div style={styles.itemTime}>
                    {new Date(notif.created_at).toLocaleDateString()} {new Date(notif.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                  {!notif.is_read && (
                    <span style={styles.unreadDot} />
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    position: 'relative',
    display: 'inline-block',
  },
  bellButton: {
    background: 'none',
    border: 'none',
    position: 'relative',
    cursor: 'pointer',
    padding: '8px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'background 0.2s',
    outline: 'none',
    ':hover': { background: '#f1f5f9' }
  },
  bellIcon: {
    fontSize: '20px',
  },
  badge: {
    position: 'absolute',
    top: '2px',
    right: '2px',
    background: '#ef4444',
    color: '#ffffff',
    fontSize: '10px',
    fontWeight: 700,
    borderRadius: '50%',
    minWidth: '16px',
    height: '16px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0 4px',
    boxShadow: '0 0 0 2px #ffffff',
  },
  dropdown: {
    position: 'absolute',
    top: '100%',
    right: 0,
    marginTop: '8px',
    width: '320px',
    background: '#ffffff',
    borderRadius: '12px',
    border: '1px solid #e2e8f0',
    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
    zIndex: 999,
    overflow: 'hidden',
  },
  dropdownHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 16px',
    borderBottom: '1px solid #e2e8f0',
    background: '#f8fafc',
  },
  dropdownTitle: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#0f172a',
  },
  markReadBtn: {
    background: 'none',
    border: 'none',
    color: '#0f172a',
    fontSize: '11px',
    fontWeight: 500,
    cursor: 'pointer',
    textDecoration: 'underline',
    padding: 0,
  },
  listContainer: {
    maxHeight: '360px',
    overflowY: 'auto',
  },
  loading: {
    padding: '24px',
    textAlign: 'center',
    fontSize: '13px',
    color: '#64748b',
  },
  empty: {
    padding: '32px 24px',
    textAlign: 'center',
    fontSize: '13px',
    color: '#94a3b8',
  },
  item: {
    padding: '12px 16px',
    borderBottom: '1px solid #f1f5f9',
    borderLeft: '3px solid transparent',
    cursor: 'pointer',
    position: 'relative',
    transition: 'background 0.2s',
    ':hover': { background: '#f8fafc' },
  },
  itemTitle: {
    fontSize: '13px',
    fontWeight: 600,
    color: '#1e293b',
    marginBottom: '2px',
  },
  itemMsg: {
    fontSize: '12px',
    color: '#475569',
    lineHeight: '1.4',
    marginBottom: '4px',
  },
  itemTime: {
    fontSize: '10px',
    color: '#94a3b8',
  },
  unreadDot: {
    position: 'absolute',
    top: '12px',
    right: '16px',
    width: '6px',
    height: '6px',
    background: '#3b82f6',
    borderRadius: '50%',
  },
};
