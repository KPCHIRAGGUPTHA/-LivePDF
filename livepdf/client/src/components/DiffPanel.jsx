import React, { useState } from 'react';
import ChangeBadge from './ChangeBadge';
import AiSummaryCard from './AiSummaryCard';
import ChatPanel from './ChatPanel';

export default function DiffPanel({
  changeMap,
  diffStats,
  summary,
  summaryLoading,
  visible,
  onChangeClick,
  token,
  onPageClick,
}) {
  const [activeTab, setActiveTab] = useState('diff');

  if (!visible) return null;

  return (
    <div style={styles.panel}>
      <div style={styles.tabs}>
        <button
          style={{ ...styles.tab, ...(activeTab === 'diff' ? styles.activeTab : {}) }}
          onClick={() => setActiveTab('diff')}
        >
          Changes {diffStats ? `(${diffStats.total})` : ''}
        </button>
        <button
          style={{ ...styles.tab, ...(activeTab === 'chat' ? styles.activeTab : {}) }}
          onClick={() => setActiveTab('chat')}
        >
          Ask AI
        </button>
      </div>

      {activeTab === 'diff' && (
        <>
          <AiSummaryCard summary={summary} loading={summaryLoading} />
          {changeMap.length === 0 ? (
            <p style={styles.empty}>No changes detected or diff not yet computed.</p>
          ) : (
            <ul style={styles.list}>
              {changeMap.map((change, i) => (
                <li
                  key={i}
                  style={styles.item}
                  onClick={() => onChangeClick(change)}
                >
                  <div style={styles.itemHeader}>
                    <ChangeBadge type={change.type} />
                    <ChangeBadge importance={change.importance} />
                    <span style={styles.page}>p.{change.page + 1}</span>
                  </div>
                  {change.importance_reason && (
                    <p style={styles.reason} title={change.importance_reason}>
                      {change.importance_reason}
                    </p>
                  )}
                  <p style={styles.excerpt}>
                    {(change.new_text || change.old_text || '').slice(0, 80)}
                    {(change.new_text || change.old_text || '').length > 80 ? '…' : ''}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {activeTab === 'chat' && (
        <ChatPanel
          token={token}
          visible={true}
          onPageClick={onPageClick}
        />
      )}
    </div>
  );
}

const styles = {
  panel: { width: 300, borderLeft: '0.5px solid #e0e0e0', background: '#fff', display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  tabs: { display: 'flex', borderBottom: '0.5px solid #e0e0e0', background: '#fafafa' },
  tab: { flex: 1, padding: '10px', fontSize: 13, background: 'none', border: 'none', cursor: 'pointer', color: '#888', outline: 'none', fontWeight: 500 },
  activeTab: { color: '#1a1a1a', fontWeight: 600, borderBottom: '2px solid #1a1a1a', background: '#fff' },
  list: { listStyle: 'none', overflow: 'auto', flex: 1, padding: '6px 0', margin: 0 },
  item: { padding: '10px 14px', cursor: 'pointer', borderBottom: '0.5px solid #f0f0f0', transition: 'background 0.2s' },
  itemHeader: { display: 'flex', gap: 5, alignItems: 'center', marginBottom: 4 },
  page: { fontSize: 11, color: '#aaa', marginLeft: 'auto' },
  reason: { fontSize: 11, color: '#e67e22', margin: '3px 0', fontStyle: 'italic', lineHeight: 1.4, fontWeight: 500 },
  excerpt: { fontSize: 12, color: '#555', lineHeight: 1.4, margin: 0 },
  empty: { padding: '2rem 1rem', fontSize: 13, color: '#aaa', textAlign: 'center' },
};
