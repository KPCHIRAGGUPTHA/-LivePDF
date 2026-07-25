import { useState, useEffect, useRef } from 'react';

export default function CommentPanel({
  isOpen,
  onClose,
  docId,
  currentVersionNumber,
  activeThreads = [],
  previousThreads = [],
  activeCommentId,
  onSelectComment,
  onAddComment,
  onEditComment,
  onDeleteComment,
  onResolveComment,
  onExportReport,
  showResolved,
  onToggleShowResolved,
  currentUser,
  mentionCandidates = [],
}) {
  const [activeTab, setActiveTab] = useState('current'); // 'current' | 'previous'
  const [replyText, setReplyText] = useState({});
  const [editingId, setEditingId] = useState(null);
  const [editContent, setEditContent] = useState('');
  
  // @Mention state
  const [mentionQuery, setMentionQuery] = useState(null); // string query after @
  const [mentionPosition, setMentionPosition] = useState(-1);
  const [selectedThreadId, setSelectedThreadId] = useState(null);
  const inputRefs = useRef({});

  useEffect(() => {
    if (activeCommentId) {
      setSelectedThreadId(activeCommentId);
    }
  }, [activeCommentId]);

  if (!isOpen) return null;

  const threadsToDisplay = activeTab === 'current' ? activeThreads : previousThreads;
  const filteredThreads = threadsToDisplay.filter(t => showResolved || !t.isResolved);

  function handleMentionKeyCheck(threadId, value, target) {
    setReplyText(prev => ({ ...prev, [threadId]: value }));
    const cursor = target.selectionStart;
    const textBeforeCursor = value.slice(0, cursor);
    const lastAtIndex = textBeforeCursor.lastIndexOf('@');

    if (lastAtIndex !== -1 && !textBeforeCursor.slice(lastAtIndex).includes(' ')) {
      const q = textBeforeCursor.slice(lastAtIndex + 1);
      setMentionQuery(q);
      setMentionPosition(lastAtIndex);
    } else {
      setMentionQuery(null);
    }
  }

  function insertMention(threadId, user) {
    const currentVal = replyText[threadId] || '';
    const before = currentVal.slice(0, mentionPosition);
    const after = currentVal.slice(mentionPosition + (mentionQuery?.length || 0) + 1);
    const mentionToken = `@[${user.fullName}](${user.id}) `;
    
    setReplyText(prev => ({ ...prev, [threadId]: before + mentionToken + after }));
    setMentionQuery(null);
  }

  function renderContentWithMentions(content) {
    if (!content) return null;

    // Replace @[Name](id) tokens with highlighted badges
    const mentionRegex = /@\[([^\]]+)\]\(([^)]+)\)|@([a-zA-Z0-9._-]+)/g;
    const parts = [];
    let lastIdx = 0;
    let match;

    while ((match = mentionRegex.exec(content)) !== null) {
      if (match.index > lastIdx) {
        parts.push(content.substring(lastIdx, match.index));
      }
      const name = match[1] || match[3];
      parts.push(
        <span
          key={match.index}
          style={{
            backgroundColor: '#dbeafe',
            color: '#1e40af',
            padding: '1px 5px',
            borderRadius: '4px',
            fontWeight: 600,
            fontSize: '11px',
            marginRight: '2px',
          }}
        >
          @{name}
        </span>
      );
      lastIdx = mentionRegex.lastIndex;
    }
    if (lastIdx < content.length) {
      parts.push(content.substring(lastIdx));
    }
    return parts;
  }

  function submitReply(threadId) {
    const text = replyText[threadId];
    if (!text || !text.trim()) return;

    const parentThread = threadsToDisplay.find(t => t.id === threadId);
    onAddComment({
      content: text.trim(),
      parentCommentId: threadId,
      pageNumber: parentThread ? parentThread.pageNumber : 1,
      x: parentThread ? parentThread.x : 0,
      y: parentThread ? parentThread.y : 0,
      versionId: parentThread ? parentThread.versionId : undefined,
    });

    setReplyText(prev => ({ ...prev, [threadId]: '' }));
    setMentionQuery(null);
  }

  function startEdit(comment) {
    setEditingId(comment.id);
    setEditContent(comment.content);
  }

  function saveEdit(commentId) {
    if (!editContent || !editContent.trim()) return;
    onEditComment(commentId, editContent.trim());
    setEditingId(null);
  }

  const filteredCandidates = mentionQuery !== null
    ? mentionCandidates.filter(u =>
        u.fullName.toLowerCase().includes(mentionQuery.toLowerCase()) ||
        u.email.toLowerCase().includes(mentionQuery.toLowerCase())
      )
    : [];

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        width: '380px',
        height: '100vh',
        backgroundColor: '#ffffff',
        boxShadow: '-4px 0 20px rgba(0, 0, 0, 0.15)',
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'Inter, system-ui, sans-serif',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '16px 20px',
          borderBottom: '1px solid #e2e8f0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: '#f8fafc',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>
            💬 Comments
          </h3>
          <span
            style={{
              backgroundColor: '#e0e7ff',
              color: '#3730a3',
              padding: '2px 8px',
              borderRadius: '12px',
              fontSize: '12px',
              fontWeight: 600,
            }}
          >
            {filteredThreads.length}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={onExportReport}
            title="Export Comments PDF Report"
            style={{
              padding: '6px 10px',
              backgroundColor: '#3b82f6',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              fontSize: '11px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            📥 Export PDF
          </button>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '18px',
              color: '#64748b',
              cursor: 'pointer',
            }}
          >
            ✕
          </button>
        </div>
      </div>

      {/* Tabs & Toolbar */}
      <div style={{ padding: '12px 20px', borderBottom: '1px solid #f1f5f9', backgroundColor: '#ffffff' }}>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
          <button
            onClick={() => setActiveTab('current')}
            style={{
              flex: 1,
              padding: '6px 10px',
              borderRadius: '6px',
              border: 'none',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              backgroundColor: activeTab === 'current' ? '#2563eb' : '#f1f5f9',
              color: activeTab === 'current' ? '#ffffff' : '#64748b',
            }}
          >
            Version {currentVersionNumber} ({activeThreads.length})
          </button>
          <button
            onClick={() => setActiveTab('previous')}
            style={{
              flex: 1,
              padding: '6px 10px',
              borderRadius: '6px',
              border: 'none',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              backgroundColor: activeTab === 'previous' ? '#2563eb' : '#f1f5f9',
              color: activeTab === 'previous' ? '#ffffff' : '#64748b',
            }}
          >
            Previous ({previousThreads.length})
          </button>
        </div>

        {/* Toggle Show Resolved */}
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#475569', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={showResolved}
            onChange={(e) => onToggleShowResolved(e.target.checked)}
            style={{ accentColor: '#2563eb' }}
          />
          Show resolved comments
        </label>
      </div>

      {/* Threads List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {filteredThreads.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#94a3b8', marginTop: '40px', fontSize: '13px' }}>
            {activeTab === 'current'
              ? 'No comments on this version yet. Click anywhere on the PDF to leave a comment!'
              : 'No comments from previous versions.'}
          </div>
        ) : (
          filteredThreads.map((thread, idx) => {
            const isSelected = selectedThreadId === thread.id;
            const isEditing = editingId === thread.id;
            const isAuthor = currentUser && thread.userId === currentUser.id;

            return (
              <div
                key={thread.id}
                onClick={() => onSelectComment(thread)}
                style={{
                  border: `1px solid ${isSelected ? '#3b82f6' : '#e2e8f0'}`,
                  borderRadius: '10px',
                  padding: '14px',
                  backgroundColor: thread.isResolved ? '#f8fafc' : isSelected ? '#eff6ff' : '#ffffff',
                  boxShadow: isSelected ? '0 4px 12px rgba(59, 130, 246, 0.15)' : '0 1px 3px rgba(0,0,0,0.05)',
                  transition: 'all 0.15s ease',
                }}
              >
                {/* Header info */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div
                      style={{
                        width: '28px',
                        height: '28px',
                        borderRadius: '50%',
                        backgroundColor: '#3b82f6',
                        color: '#ffffff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 700,
                        fontSize: '11px',
                      }}
                    >
                      {thread.authorName ? thread.authorName[0].toUpperCase() : 'U'}
                    </div>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b' }}>
                        {thread.authorName}
                      </div>
                      <div style={{ fontSize: '10px', color: '#94a3b8' }}>
                        Page {thread.pageNumber} • v{thread.versionNumber} • {new Date(thread.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        {thread.isEdited && <span style={{ marginLeft: '4px', fontStyle: 'italic' }}>(edited)</span>}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    {/* Resolve toggle button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onResolveComment(thread.id);
                      }}
                      title={thread.isResolved ? 'Re-open thread' : 'Resolve thread'}
                      style={{
                        padding: '3px 7px',
                        fontSize: '10px',
                        fontWeight: 600,
                        borderRadius: '4px',
                        border: 'none',
                        cursor: 'pointer',
                        backgroundColor: thread.isResolved ? '#dcfce7' : '#f1f5f9',
                        color: thread.isResolved ? '#15803d' : '#475569',
                      }}
                    >
                      {thread.isResolved ? '✓ Resolved' : 'Resolve'}
                    </button>

                    {/* Delete button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm('Delete this comment thread?')) onDeleteComment(thread.id);
                      }}
                      title="Delete thread"
                      style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '12px', cursor: 'pointer' }}
                    >
                      🗑️
                    </button>
                  </div>
                </div>

                {/* Content or Edit Input */}
                {isEditing ? (
                  <div style={{ marginTop: '8px' }}>
                    <textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      style={{ width: '100%', padding: '6px', fontSize: '12px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                    />
                    <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', marginTop: '4px' }}>
                      <button onClick={() => setEditingId(null)} style={{ padding: '4px 8px', fontSize: '11px' }}>Cancel</button>
                      <button onClick={() => saveEdit(thread.id)} style={{ padding: '4px 8px', fontSize: '11px', backgroundColor: '#2563eb', color: '#fff', border: 'none', borderRadius: '4px' }}>Save</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ fontSize: '13px', color: '#334155', lineHeight: '1.4', margin: '6px 0 10px 0' }}>
                    {renderContentWithMentions(thread.content)}
                  </div>
                )}

                {/* Edit link if within 15 min */}
                {isAuthor && !isEditing && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      startEdit(thread);
                    }}
                    style={{ background: 'none', border: 'none', color: '#3b82f6', fontSize: '11px', padding: 0, cursor: 'pointer', marginBottom: '8px' }}
                  >
                    Edit comment
                  </button>
                )}

                {/* Thread Replies */}
                {thread.replies && thread.replies.length > 0 && (
                  <div style={{ borderLeft: '2px solid #cbd5e1', paddingLeft: '10px', marginLeft: '6px', display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
                    {thread.replies.map(reply => (
                      <div key={reply.id} style={{ fontSize: '12px', backgroundColor: '#f8fafc', padding: '6px 8px', borderRadius: '6px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', fontWeight: 700, color: '#475569' }}>
                          <span>{reply.authorName}</span>
                          <span style={{ fontWeight: 400, color: '#94a3b8' }}>{new Date(reply.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                        <div style={{ color: '#1e293b', marginTop: '2px' }}>
                          {renderContentWithMentions(reply.content)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Reply Input Box */}
                <div style={{ marginTop: '10px', position: 'relative' }}>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <input
                      type="text"
                      placeholder="Type a reply... (@to mention)"
                      value={replyText[thread.id] || ''}
                      onChange={(e) => handleMentionKeyCheck(thread.id, e.target.value, e.target)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') submitReply(thread.id);
                      }}
                      style={{
                        flex: 1,
                        padding: '6px 10px',
                        borderRadius: '6px',
                        border: '1px solid #cbd5e1',
                        fontSize: '12px',
                      }}
                    />
                    <button
                      onClick={() => submitReply(thread.id)}
                      style={{
                        padding: '6px 12px',
                        backgroundColor: '#2563eb',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      Send
                    </button>
                  </div>

                  {/* @Mention Autocomplete Dropdown Popup */}
                  {mentionQuery !== null && filteredCandidates.length > 0 && (
                    <div
                      style={{
                        position: 'absolute',
                        bottom: '36px',
                        left: 0,
                        right: 0,
                        backgroundColor: '#ffffff',
                        border: '1px solid #cbd5e1',
                        borderRadius: '8px',
                        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                        maxHeight: '140px',
                        overflowY: 'auto',
                        zIndex: 50,
                      }}
                    >
                      {filteredCandidates.map(candidate => (
                        <div
                          key={candidate.id}
                          onClick={() => insertMention(thread.id, candidate)}
                          style={{
                            padding: '8px 12px',
                            cursor: 'pointer',
                            fontSize: '12px',
                            borderBottom: '1px solid #f1f5f9',
                            display: 'flex',
                            justifyContent: 'space-between',
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f1f5f9'}
                          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#ffffff'}
                        >
                          <span style={{ fontWeight: 600, color: '#1e293b' }}>{candidate.fullName}</span>
                          <span style={{ color: '#94a3b8', fontSize: '11px' }}>{candidate.email}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
