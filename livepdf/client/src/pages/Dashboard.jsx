import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import UploadZone from '../components/UploadZone';
import DocumentCard from '../components/DocumentCard';
import ProgressBar from '../components/ProgressBar';
import ShareModal from '../components/ShareModal';
import NotificationBell from '../components/NotificationBell';
import AuditLogModal from '../components/AuditLogModal';

export default function Dashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [documents, setDocuments] = useState([]);
  const [loadingDocs, setLoadingDocs] = useState(true);

  // Upload States
  const [selectedFile, setSelectedFile] = useState(null);
  const [docTitle, setDocTitle] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadPercent, setUploadPercent] = useState(0);

  // Replace States
  const [replacingDoc, setReplacingDoc] = useState(null);

  // Share States
  const [activeShareDoc, setActiveShareDoc] = useState(null);

  // Tab & Custom views
  const [activeTab, setActiveTab] = useState('documents'); // 'documents' | 'settings'
  const [followedDocs, setFollowedDocs] = useState([]);
  const [loadingPrefs, setLoadingPrefs] = useState(false);
  const [activeAuditDoc, setActiveAuditDoc] = useState(null);

  // Phase 9 States
  const [subTab, setSubTab] = useState('notifications'); // 'notifications' | 'billing' | 'organisations' | 'keys'
  const [userPlan, setUserPlan] = useState('FREE');
  
  // Organisations States
  const [orgs, setOrgs] = useState([]);
  const [loadingOrgs, setLoadingOrgs] = useState(false);
  const [newOrgName, setNewOrgName] = useState('');
  const [selectedOrg, setSelectedOrg] = useState(null);
  const [orgMembers, setOrgMembers] = useState([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('viewer');

  // API Keys States
  const [apiKeys, setApiKeys] = useState([]);
  const [loadingKeys, setLoadingKeys] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyScope, setNewKeyScope] = useState('read_write');
  const [generatedKey, setGeneratedKey] = useState(null);

  // Document Upload Organisation Selector
  const [selectedUploadOrg, setSelectedUploadOrg] = useState('');

  const fetchDocuments = async () => {
    setLoadingDocs(true);
    try {
      const res = await api.get('/documents');
      setDocuments(res.data);
    } catch (err) {
      console.error('Failed to fetch documents:', err);
    } finally {
      setLoadingDocs(false);
    }
  };

  const fetchPreferences = async () => {
    setLoadingPrefs(true);
    try {
      const res = await api.get('/notifications/preferences');
      setFollowedDocs(res.data);
    } catch (err) {
      console.error('Failed to fetch notification preferences:', err);
    } finally {
      setLoadingPrefs(false);
    }
  };

  const handleTogglePreference = async (docId) => {
    try {
      const res = await api.patch(`/notifications/preferences/${docId}`);
      setFollowedDocs(prev =>
        prev.map(d =>
          d.documentId === docId ? { ...d, notificationsEnabled: res.data.notificationsEnabled } : d
        )
      );
    } catch (err) {
      console.error('Failed to toggle notification preference:', err);
      alert('Failed to update notification settings.');
    }
  };

  // Organisations API Calls
  const fetchOrgs = async () => {
    setLoadingOrgs(true);
    try {
      const res = await api.get('/organisations');
      setOrgs(res.data);
    } catch (err) {
      console.error('Failed to fetch organisations:', err);
    } finally {
      setLoadingOrgs(false);
    }
  };

  const fetchOrgMembers = async (orgId) => {
    try {
      const res = await api.get(`/organisations/${orgId}/members`);
      setOrgMembers(res.data);
    } catch (err) {
      console.error('Failed to fetch members:', err);
    }
  };

  const handleCreateOrg = async (e) => {
    e.preventDefault();
    if (!newOrgName.trim()) return;
    try {
      await api.post('/organisations', { name: newOrgName });
      setNewOrgName('');
      fetchOrgs();
      alert('Organisation created successfully!');
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to create organisation. Note: Creating organisations requires an Enterprise plan.');
    }
  };

  const handleInviteMember = async (e) => {
    e.preventDefault();
    if (!inviteEmail.trim() || !selectedOrg) return;
    try {
      await api.post(`/organisations/${selectedOrg.id}/invite`, {
        email: inviteEmail,
        role: inviteRole
      });
      setInviteEmail('');
      fetchOrgMembers(selectedOrg.id);
      alert('Member invited successfully!');
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to invite member');
    }
  };

  const handleRemoveMember = async (userId) => {
    if (!selectedOrg || !window.confirm('Are you sure you want to remove this member?')) return;
    try {
      await api.delete(`/organisations/${selectedOrg.id}/members/${userId}`);
      fetchOrgMembers(selectedOrg.id);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to remove member');
    }
  };

  // API Keys API Calls
  const fetchKeys = async () => {
    setLoadingKeys(true);
    try {
      const res = await api.get('/keys');
      setApiKeys(res.data);
    } catch (err) {
      console.error('Failed to fetch API keys:', err);
    } finally {
      setLoadingKeys(false);
    }
  };

  const handleGenerateKey = async (e) => {
    e.preventDefault();
    if (!newKeyName.trim()) return;
    try {
      const res = await api.post('/keys', { name: newKeyName, scope: newKeyScope });
      setNewKeyName('');
      setGeneratedKey(res.data.apiKey);
      fetchKeys();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to generate key. Note: API keys require a Pro or Enterprise plan.');
    }
  };

  const handleRevokeKey = async (keyId) => {
    if (!window.confirm('Are you sure you want to revoke this API key? This cannot be undone.')) return;
    try {
      await api.delete(`/keys/${keyId}`);
      fetchKeys();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to revoke key');
    }
  };

  // Stripe Billing API Calls
  const handleStripeCheckout = async (plan) => {
    try {
      const res = await api.post('/stripe/checkout', { plan });
      if (res.data.url) {
        window.location.href = res.data.url;
      }
    } catch (err) {
      alert(err.response?.data?.error || 'Checkout initialization failed');
    }
  };

  const handleCancelSub = async () => {
    if (!window.confirm('Are you sure you want to cancel your premium subscription? You will lose access to all premium features.')) return;
    try {
      await api.post('/stripe/cancel');
      alert('Subscription canceled. Your account has been downgraded to Free.');
      const profile = await api.get('/auth/me');
      setUserPlan(profile.data.plan);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to cancel subscription');
    }
  };

  // Mount Billing Check & Profile plan loader
  useEffect(() => {
    const checkBillingUrl = async () => {
      const params = new URLSearchParams(window.location.search);
      if (params.get('billing') === 'success') {
        alert('Payment successful! Your subscription plan has been updated.');
        window.history.replaceState({}, document.title, window.location.pathname);
      } else if (params.get('billing') === 'cancel') {
        alert('Payment canceled.');
        window.history.replaceState({}, document.title, window.location.pathname);
      }
      
      try {
        const profile = await api.get('/auth/me');
        setUserPlan(profile.data.plan || 'FREE');
      } catch (err) {
        console.error('Failed to reload profile plan status:', err);
      }
    };
    checkBillingUrl();
  }, []);

  useEffect(() => {
    if (activeTab === 'documents') {
      fetchDocuments();
      fetchOrgs(); // Load organizations to support shared uploads
    }
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'settings') {
      if (subTab === 'notifications') {
        fetchPreferences();
      } else if (subTab === 'organisations') {
        fetchOrgs();
      } else if (subTab === 'keys') {
        fetchKeys();
      }
    }
  }, [activeTab, subTab]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleFileAccepted = (file) => {
    setSelectedFile(file);
    const cleanName = file.name.replace(/\.[^/.]+$/, "");
    setDocTitle(cleanName);
  };

  const handleUploadSubmit = async (e) => {
    e.preventDefault();
    if (!selectedFile) return;

    setUploading(true);
    setUploadPercent(0);

    const formData = new FormData();
    formData.append('pdf', selectedFile);

    if (replacingDoc) {
      // Replace existing document version
      try {
        await api.post(`/documents/${replacingDoc.id}/upload-version`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
          onUploadProgress: (progressEvent) => {
            const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            setUploadPercent(percentCompleted);
          },
        });
        cancelUpload();
        fetchDocuments();
      } catch (err) {
        console.error('Replacement failed:', err);
        alert(err.response?.data?.error || 'Failed to upload replacement version.');
        setUploading(false);
      }
    } else {
      // Upload new document
      formData.append('title', docTitle);
      if (selectedUploadOrg) {
        formData.append('organisationId', selectedUploadOrg);
      }

      try {
        await api.post('/documents/upload', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
          onUploadProgress: (progressEvent) => {
            const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            setUploadPercent(percentCompleted);
          },
        });
        cancelUpload();
        fetchDocuments();
      } catch (err) {
        console.error('Upload failed:', err);
        alert(err.response?.data?.error || 'Failed to upload document.');
        setUploading(false);
      }
    }
  };

  const handleReplaceTrigger = (doc) => {
    setReplacingDoc(doc);
    setSelectedFile(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (docId) => {
    if (!window.confirm('Are you sure you want to delete this document? This will permanently remove all of its versions.')) return;
    try {
      await api.delete(`/documents/${docId}`);
      fetchDocuments();
    } catch (err) {
      console.error('Deletion failed:', err);
      alert(err.response?.data?.error || 'Failed to delete document.');
    }
  };

  const cancelUpload = () => {
    setSelectedFile(null);
    setDocTitle('');
    setUploading(false);
    setUploadPercent(0);
    setReplacingDoc(null);
    setSelectedUploadOrg('');
  };

  return (
    <div style={styles.page}>
      {/* Header bar */}
      <header className="responsive-header" style={styles.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={styles.logo}>📄 LivePDF</span>
          <div style={styles.headerDivider}></div>
          <button
            onClick={() => setActiveTab('documents')}
            style={{
              ...styles.navBtn,
              fontWeight: activeTab === 'documents' ? 600 : 400,
              background: activeTab === 'documents' ? '#f1f5f9' : 'none',
              color: activeTab === 'documents' ? '#0f172a' : '#64748b',
            }}
          >
            Dashboard
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            style={{
              ...styles.navBtn,
              fontWeight: activeTab === 'settings' ? 600 : 400,
              background: activeTab === 'settings' ? '#f1f5f9' : 'none',
              color: activeTab === 'settings' ? '#0f172a' : '#64748b',
            }}
          >
            Settings
          </button>
        </div>

        <div style={styles.headerRight}>
          <NotificationBell />
          <span className="responsive-name" style={styles.name}>{user?.fullName}</span>
          <span style={styles.planBadge}>{userPlan}</span>
          <button onClick={handleLogout} style={styles.logoutBtn}>Logout</button>
        </div>
      </header>

      {/* Main body area */}
      <div className="responsive-body" style={styles.body}>
        {activeTab === 'documents' ? (
          <>
            {/* Header info */}
            <div style={styles.topSection}>
              <h1 style={styles.heading}>My Documents</h1>
              {replacingDoc && (
                <div style={styles.replaceNotice}>
                  <span>Replacing version for <strong>{replacingDoc.title}</strong></span>
                  <button onClick={cancelUpload} style={styles.cancelBtn}>Cancel Replace</button>
                </div>
              )}
            </div>

            {/* Upload Form Area */}
            <div style={styles.uploadArea}>
              {!selectedFile ? (
                <UploadZone onFileAccepted={handleFileAccepted} isUploading={uploading} />
              ) : (
                <form onSubmit={handleUploadSubmit} style={styles.confirmForm}>
                  <div style={styles.fileDetails}>
                    <span style={styles.fileIcon}>📄</span>
                    <div style={styles.fileMeta}>
                      <span style={styles.fileName}>{selectedFile.name}</span>
                      <span style={styles.fileSize}>{(selectedFile.size / (1024 * 1024)).toFixed(2)} MB</span>
                    </div>
                  </div>

                  {!replacingDoc && (
                    <>
                      <div style={styles.inputGroup}>
                        <label style={styles.label}>Document Title</label>
                        <input
                          style={styles.input}
                          type="text"
                          value={docTitle}
                          onChange={(e) => setDocTitle(e.target.value)}
                          required
                          disabled={uploading}
                        />
                      </div>
                      
                      {orgs.length > 0 && (
                        <div style={styles.inputGroup}>
                          <label style={styles.label}>Share with Team / Organisation (Optional)</label>
                          <select
                            style={styles.select}
                            value={selectedUploadOrg}
                            onChange={(e) => setSelectedUploadOrg(e.target.value)}
                            disabled={uploading}
                          >
                            <option value="">Do not share (Keep Personal)</option>
                            {orgs.map(org => (
                              <option key={org.id} value={org.id}>{org.name}</option>
                            ))}
                          </select>
                        </div>
                      )}
                    </>
                  )}

                  {uploading && <ProgressBar percent={uploadPercent} filename={selectedFile.name} />}

                  <div style={styles.formActions}>
                    <button type="button" onClick={cancelUpload} style={styles.btnSecondary} disabled={uploading}>
                      Cancel
                    </button>
                    <button type="submit" style={styles.btnPrimary} disabled={uploading}>
                      {uploading ? 'Uploading...' : replacingDoc ? 'Upload Replacement' : 'Confirm & Upload'}
                    </button>
                  </div>
                </form>
              )}
            </div>

            {/* Grid List of Documents */}
            {loadingDocs ? (
              <div style={styles.loading}>Loading documents...</div>
            ) : documents.length === 0 ? (
              <div style={styles.emptyState}>
                <div style={styles.emptyIcon}>📄</div>
                <p style={styles.emptyText}>No documents uploaded yet</p>
                <p style={styles.emptySub}>Drag and drop a PDF file above to get started.</p>
              </div>
            ) : (
              <div style={styles.grid}>
                {documents.map((doc) => (
                  <DocumentCard
                    key={doc.id}
                    doc={doc}
                    onReplace={handleReplaceTrigger}
                    onDelete={handleDelete}
                    onShare={setActiveShareDoc}
                    onHistory={setActiveAuditDoc}
                  />
                ))}
              </div>
            )}
          </>
        ) : (
          <div style={styles.settingsCard}>
            <div style={styles.settingsNav}>
              <button onClick={() => setSubTab('notifications')} style={subTab === 'notifications' ? styles.subTabActive : styles.subTab}>Notification Prefs</button>
              <button onClick={() => setSubTab('billing')} style={subTab === 'billing' ? styles.subTabActive : styles.subTab}>Subscription & Billing</button>
              <button onClick={() => setSubTab('organisations')} style={subTab === 'organisations' ? styles.subTabActive : styles.subTab}>Team Organisations</button>
              <button onClick={() => setSubTab('keys')} style={subTab === 'keys' ? styles.subTabActive : styles.subTab}>Public API Keys</button>
            </div>

            {/* Settings Tab contents */}
            {subTab === 'notifications' && (
              <>
                <h2 style={styles.heading}>Notification Preferences</h2>
                <p style={styles.subText}>Toggle notifications for shared documents you have viewed in the last 7 days.</p>
                
                {loadingPrefs ? (
                  <div style={styles.loading}>Loading preferences...</div>
                ) : followedDocs.length === 0 ? (
                  <div style={styles.emptyState}>
                    <div style={styles.emptyIcon}>🔔</div>
                    <p style={styles.emptyText}>No shared documents followed</p>
                    <p style={styles.emptySub}>Documents you view via share links will appear here to manage subscriptions.</p>
                  </div>
                ) : (
                  <div style={styles.prefsList}>
                    {followedDocs.map((fdoc) => (
                      <div key={fdoc.documentId} style={styles.prefItem}>
                        <div style={styles.prefInfo}>
                          <span style={styles.prefIcon}>📄</span>
                          <span style={styles.prefDocTitle}>{fdoc.title}</span>
                        </div>
                        <button
                          onClick={() => handleTogglePreference(fdoc.documentId)}
                          style={{
                            ...styles.toggleBtn,
                            background: fdoc.notificationsEnabled ? '#0f172a' : '#f1f5f9',
                            color: fdoc.notificationsEnabled ? '#ffffff' : '#475569',
                            borderColor: fdoc.notificationsEnabled ? '#0f172a' : '#cbd5e1',
                          }}
                        >
                          {fdoc.notificationsEnabled ? '🔔 Subscribed' : '🔕 Muted'}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {subTab === 'billing' && (
              <div style={styles.billingSection}>
                <h2 style={styles.heading}>Subscription Plans</h2>
                <p style={styles.subText}>Manage your active plan features or upgrade tier details.</p>

                <div style={styles.planOverview}>
                  <span>Current Plan Level: <strong>{userPlan}</strong></span>
                  {userPlan !== 'FREE' && (
                    <button onClick={handleCancelSub} style={styles.cancelSubBtn}>Cancel Subscription</button>
                  )}
                </div>

                <div style={styles.plansGrid}>
                  <div style={styles.planCard}>
                    <h3>Free Plan</h3>
                    <p style={styles.price}>$0/month</p>
                    <ul>
                      <li>Max 3 Documents</li>
                      <li>Max 5 Versions per doc</li>
                      <li>10 Share links</li>
                      <li style={styles.strikeFeature}>AI summaries / Claude</li>
                      <li style={styles.strikeFeature}>Public API Keys</li>
                    </ul>
                    <button disabled style={styles.planDisabledBtn}>Current Plan</button>
                  </div>

                  <div style={{ ...styles.planCard, borderColor: userPlan === 'PRO' ? '#0284c7' : '#e0e0e0' }}>
                    <h3>Pro Plan</h3>
                    <p style={styles.price}>$15/month</p>
                    <ul>
                      <li>Unlimited Documents</li>
                      <li>Unlimited Versions</li>
                      <li>Unlimited Share links</li>
                      <li>AI Change Summaries & Risk scorer</li>
                      <li>AI PDF Q&A (Claude chat)</li>
                      <li>Developer API Access keys</li>
                    </ul>
                    {userPlan === 'FREE' ? (
                      <button onClick={() => handleStripeCheckout('PRO')} style={styles.planUpgradeBtn}>Upgrade to Pro</button>
                    ) : userPlan === 'PRO' ? (
                      <button disabled style={styles.planDisabledBtn}>Current Plan</button>
                    ) : (
                      <button onClick={() => handleStripeCheckout('PRO')} style={styles.planUpgradeBtn}>Downgrade to Pro</button>
                    )}
                  </div>

                  <div style={{ ...styles.planCard, borderColor: userPlan === 'ENTERPRISE' ? '#7c3aed' : '#e0e0e0' }}>
                    <h3>Enterprise Plan</h3>
                    <p style={styles.price}>$49/month</p>
                    <ul>
                      <li>Everything in Pro</li>
                      <li>Team Organization accounts</li>
                      <li>Shared team document library</li>
                      <li>Member roles (Admin/Editor/Viewer)</li>
                      <li>Audit logs downloads</li>
                      <li>Custom watermarks</li>
                    </ul>
                    {userPlan !== 'ENTERPRISE' ? (
                      <button onClick={() => handleStripeCheckout('ENTERPRISE')} style={{ ...styles.planUpgradeBtn, background: '#7c3aed' }}>Upgrade to Enterprise</button>
                    ) : (
                      <button disabled style={styles.planDisabledBtn}>Current Plan</button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {subTab === 'organisations' && (
              <div style={styles.orgSection}>
                <h2 style={styles.heading}>Team Organisations</h2>
                <p style={styles.subText}>Collaborate with other editors, admins, or viewers. Shared library support.</p>

                {userPlan !== 'ENTERPRISE' ? (
                  <div style={styles.upgradeNotice}>
                    <strong>Enterprise Tier Required</strong>
                    <p>Organisation accounts and team sharing features require an Enterprise plan subscription.</p>
                    <button onClick={() => setSubTab('billing')} style={styles.upgradeNoticeBtn}>View Pricing Plans</button>
                  </div>
                ) : (
                  <>
                    <form onSubmit={handleCreateOrg} style={styles.formInline}>
                      <input
                        type="text"
                        placeholder="New Organization Name"
                        value={newOrgName}
                        onChange={(e) => setNewOrgName(e.target.value)}
                        style={styles.inputInline}
                        required
                      />
                      <button type="submit" style={styles.btnPrimary}>Create Organisation</button>
                    </form>

                    {loadingOrgs ? (
                      <div style={styles.loading}>Loading teams...</div>
                    ) : orgs.length === 0 ? (
                      <div style={styles.emptyState}>
                        <p style={styles.emptyText}>You do not belong to any organisations yet</p>
                      </div>
                    ) : (
                      <div style={styles.orgContainer}>
                        <div style={styles.orgsList}>
                          <h3>My Organisations</h3>
                          {orgs.map(org => (
                            <div
                              key={org.id}
                              onClick={() => {
                                setSelectedOrg(org);
                                fetchOrgMembers(org.id);
                              }}
                              style={{
                                ...styles.orgItem,
                                background: selectedOrg?.id === org.id ? '#f1f5f9' : '#fafafa',
                                borderLeft: selectedOrg?.id === org.id ? '4px solid #7c3aed' : '1px solid #e2e8f0',
                              }}
                            >
                              <div>
                                <strong style={{ display: 'block' }}>{org.name}</strong>
                                <span style={{ fontSize: 11, color: '#64748b' }}>Role: {org.role.toUpperCase()}</span>
                              </div>
                              <span>❯</span>
                            </div>
                          ))}
                        </div>

                        {selectedOrg && (
                          <div style={styles.membersPanel}>
                            <h3>Members of {selectedOrg.name}</h3>

                            {selectedOrg.role === 'admin' && (
                              <form onSubmit={handleInviteMember} style={{ ...styles.formInline, marginBottom: 16 }}>
                                <input
                                  type="email"
                                  placeholder="Invitee Email Address"
                                  value={inviteEmail}
                                  onChange={(e) => setInviteEmail(e.target.value)}
                                  style={styles.inputInline}
                                  required
                                />
                                <select
                                  value={inviteRole}
                                  onChange={(e) => setInviteRole(e.target.value)}
                                  style={styles.selectInline}
                                >
                                  <option value="viewer">Viewer</option>
                                  <option value="editor">Editor</option>
                                  <option value="admin">Admin</option>
                                </select>
                                <button type="submit" style={styles.btnPrimary}>Invite</button>
                              </form>
                            )}

                            <div style={styles.memberList}>
                              {orgMembers.map(member => (
                                <div key={member.id} style={styles.memberRow}>
                                  <div>
                                    <strong>{member.full_name}</strong>
                                    <span style={{ display: 'block', fontSize: 12, color: '#64748b' }}>{member.email}</span>
                                  </div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span style={styles.roleTag}>{member.role.toUpperCase()}</span>
                                    {selectedOrg.role === 'admin' && member.id !== user.id && (
                                      <button onClick={() => handleRemoveMember(member.id)} style={styles.removeMemberBtn}>×</button>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {subTab === 'keys' && (
              <div style={styles.keysSection}>
                <h2 style={styles.heading}>Developer API Access</h2>
                <p style={styles.subText}>Create key-based tokens to interact with LivePDF programmatically.</p>

                {userPlan === 'FREE' ? (
                  <div style={styles.upgradeNotice}>
                    <strong>Pro/Enterprise Tier Required</strong>
                    <p>API Access and public authentication keys require a Pro or Enterprise plan.</p>
                    <button onClick={() => setSubTab('billing')} style={styles.upgradeNoticeBtn}>View Pricing Plans</button>
                  </div>
                ) : (
                  <>
                    <form onSubmit={handleGenerateKey} style={{ ...styles.formInline, marginBottom: 20 }}>
                      <input
                        type="text"
                        placeholder="API Key Name (e.g. Server Production)"
                        value={newKeyName}
                        onChange={(e) => setNewKeyName(e.target.value)}
                        style={styles.inputInline}
                        required
                      />
                      <select
                        value={newKeyScope}
                        onChange={(e) => setNewKeyScope(e.target.value)}
                        style={styles.selectInline}
                      >
                        <option value="read_write">Read & Write</option>
                        <option value="read_only">Read Only</option>
                      </select>
                      <button type="submit" style={styles.btnPrimary}>Generate Key</button>
                    </form>

                    {generatedKey && (
                      <div style={styles.alertBox}>
                        <strong>⚠️ COPY YOUR API KEY NOW:</strong>
                        <p style={{ margin: '4px 0 10px 0', fontSize: 13, color: '#b45309' }}>This key will never be shown to you again after closing this panel.</p>
                        <div style={styles.keyContainer}>
                          <code style={styles.keyCode}>{generatedKey}</code>
                        </div>
                        <button onClick={() => setGeneratedKey(null)} style={styles.btnPrimary}>I have copied it, close</button>
                      </div>
                    )}

                    {loadingKeys ? (
                      <div style={styles.loading}>Loading API keys...</div>
                    ) : apiKeys.length === 0 ? (
                      <div style={styles.emptyState}>
                        <p style={styles.emptyText}>No API keys generated yet.</p>
                      </div>
                    ) : (
                      <div style={styles.prefsList}>
                        {apiKeys.map(key => (
                          <div key={key.id} style={styles.prefItem}>
                            <div>
                              <strong>{key.name}</strong>
                              <div style={{ display: 'flex', gap: 12, marginTop: 4, fontSize: 12, color: '#64748b' }}>
                                <span>Prefix: <code>{key.key_prefix}****</code></span>
                                <span>Scope: {key.scope}</span>
                                <span>Last Used: {key.last_used_at ? new Date(key.last_used_at).toLocaleDateString() : 'Never'}</span>
                              </div>
                            </div>
                            <button onClick={() => handleRevokeKey(key.id)} style={styles.revokeKeyBtn}>Revoke Key</button>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {activeShareDoc && (
        <ShareModal
          doc={activeShareDoc}
          onClose={() => setActiveShareDoc(null)}
        />
      )}

      {activeAuditDoc && (
        <AuditLogModal
          doc={activeAuditDoc}
          onClose={() => setActiveAuditDoc(null)}
        />
      )}
    </div>
  );
}

const styles = {
  page: { minHeight: '100vh', background: '#f9f9f7' },
  header: { background: '#fff', borderBottom: '0.5px solid #e0e0e0', padding: '0 2rem', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  logo: { fontSize: 18, fontWeight: 600, color: '#1a1a1a' },
  headerRight: { display: 'flex', alignItems: 'center', gap: 12 },
  name: { fontSize: 14, color: '#555' },
  planBadge: { fontSize: 11, background: '#f1f5f9', border: '1px solid #cbd5e1', padding: '3px 8px', borderRadius: 12, fontWeight: 600, color: '#334155' },
  logoutBtn: { fontSize: 13, color: '#888', background: 'none', border: '0.5px solid #d0d0d0', borderRadius: 6, padding: '5px 12px', cursor: 'pointer' },
  navBtn: { fontSize: 13, color: '#64748b', background: 'none', border: 'none', padding: '6px 12px', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, transition: 'all 0.15s' },
  headerDivider: { width: 1, height: 20, background: '#e2e8f0' },
  body: { maxWidth: 900, margin: '0 auto', padding: '3rem 2rem' },
  topSection: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' },
  heading: { fontSize: 22, fontWeight: 500, color: '#1a1a1a', margin: 0 },
  replaceNotice: { display: 'flex', alignItems: 'center', gap: '12px', fontSize: '13px', background: '#fbf0da', border: '0.5px solid #f5d0a9', borderRadius: '8px', padding: '6px 12px', color: '#855118' },
  cancelBtn: { background: 'none', border: 'none', textDecoration: 'underline', color: '#855118', fontWeight: 600, cursor: 'pointer', fontSize: '13px', padding: 0 },
  uploadArea: { marginBottom: '3rem' },
  confirmForm: { background: '#fff', border: '0.5px solid #e0e0e0', borderRadius: '12px', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '16px' },
  fileDetails: { display: 'flex', alignItems: 'center', gap: '12px', background: '#fcfcfc', border: '0.5px solid #eee', borderRadius: '8px', padding: '12px' },
  fileIcon: { fontSize: '24px' },
  fileMeta: { display: 'flex', flexDirection: 'column', gap: '2px' },
  fileName: { fontSize: '14px', fontWeight: 600, color: '#1a1a1a' },
  fileSize: { fontSize: '12px', color: '#888' },
  inputGroup: { display: 'flex', flexDirection: 'column', gap: '6px' },
  label: { fontSize: '13px', color: '#555', fontWeight: 500 },
  input: { padding: '10px 12px', borderRadius: '8px', border: '0.5px solid #d0d0d0', fontSize: 14, outline: 'none' },
  select: { padding: '10px 12px', borderRadius: '8px', border: '0.5px solid #d0d0d0', fontSize: 14, outline: 'none', background: '#fff' },
  formActions: { display: 'flex', justifyContent: 'flex-end', gap: '10px' },
  btnPrimary: { padding: '10px 16px', borderRadius: '8px', background: '#1a1a1a', color: '#fff', border: 'none', fontSize: 13, fontWeight: 500, cursor: 'pointer', transition: 'background 0.2s' },
  btnSecondary: { padding: '10px 16px', borderRadius: '8px', background: '#fff', color: '#555', border: '0.5px solid #d0d0d0', fontSize: 13, fontWeight: 500, cursor: 'pointer' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px' },
  loading: { textAlign: 'center', fontSize: '15px', color: '#666', padding: '3rem' },
  emptyState: { background: '#fff', border: '0.5px solid #e0e0e0', borderRadius: 12, padding: '4rem 2rem', textAlign: 'center' },
  emptyIcon: { fontSize: 44, marginBottom: 12 },
  emptyText: { fontSize: 16, fontWeight: 600, color: '#333', margin: '0 0 4px 0' },
  emptySub: { fontSize: 13, color: '#888', margin: 0 },
  
  // Settings view specific styling
  settingsCard: { background: '#ffffff', border: '0.5px solid #e0e0e0', borderRadius: 12, padding: '2rem', display: 'flex', flexDirection: 'column', gap: 12 },
  subText: { fontSize: 14, color: '#64748b', margin: '0 0 20px 0' },
  prefsList: { display: 'flex', flexDirection: 'column', gap: 12 },
  prefItem: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', border: '0.5px solid #e2e8f0', borderRadius: 8, background: '#fafafa' },
  prefInfo: { display: 'flex', alignItems: 'center', gap: 8 },
  prefIcon: { fontSize: 18 },
  prefDocTitle: { fontSize: 14, fontWeight: 600, color: '#1e293b' },
  toggleBtn: { fontSize: 12, padding: '6px 14px', borderRadius: 6, cursor: 'pointer', border: '0.5px solid #cbd5e1', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4, transition: 'all 0.15s' },

  // Phase 9 Tab Styles
  settingsNav: { display: 'flex', gap: '8px', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px', marginBottom: '20px' },
  subTab: { fontSize: '13px', background: 'none', border: 'none', color: '#64748b', padding: '6px 12px', cursor: 'pointer', borderRadius: '6px', transition: 'all 0.15s' },
  subTabActive: { fontSize: '13px', background: '#f1f5f9', border: 'none', color: '#0f172a', fontWeight: '600', padding: '6px 12px', cursor: 'pointer', borderRadius: '6px' },

  // Billing
  billingSection: { display: 'flex', flexDirection: 'column', gap: 12 },
  planOverview: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, color: '#334155' },
  cancelSubBtn: { background: 'none', border: 'none', color: '#ef4444', textDecoration: 'underline', cursor: 'pointer', fontSize: 13, fontWeight: 600 },
  plansGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 20, marginTop: 12 },
  planCard: { border: '1px solid #e0e0e0', borderRadius: 12, padding: 20, display: 'flex', flexDirection: 'column', gap: 12, background: '#fff' },
  price: { fontSize: 24, fontWeight: 700, color: '#0f172a', margin: '4px 0' },
  strikeFeature: { textDecoration: 'line-through', color: '#94a3b8' },
  planDisabledBtn: { padding: '8px 12px', borderRadius: 6, background: '#e2e8f0', border: 'none', color: '#94a3b8', fontSize: 13, fontWeight: 500, cursor: 'not-allowed' },
  planUpgradeBtn: { padding: '8px 12px', borderRadius: 6, background: '#0284c7', border: 'none', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'background 0.2s' },

  // Organisations
  orgSection: { display: 'flex', flexDirection: 'column', gap: 12 },
  upgradeNotice: { display: 'flex', flexDirection: 'column', gap: 8, padding: '24px', background: '#fafaf9', border: '1px dashed #e0e0e0', borderRadius: 12, textAlign: 'center', alignItems: 'center' },
  upgradeNoticeBtn: { padding: '8px 16px', background: '#0f172a', border: 'none', borderRadius: 6, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  formInline: { display: 'flex', gap: 8 },
  inputInline: { flex: 1, padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 14, outline: 'none' },
  selectInline: { padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 14, background: '#fff', outline: 'none' },
  orgContainer: { display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: 20, marginTop: 12 },
  orgsList: { display: 'flex', flexDirection: 'column', gap: 8 },
  orgItem: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', border: '1px solid #e2e8f0', borderRadius: 8, cursor: 'pointer', transition: 'all 0.15s' },
  membersPanel: { background: '#fafafa', border: '1px solid #e2e8f0', borderRadius: 8, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 },
  memberList: { display: 'flex', flexDirection: 'column', gap: 8 },
  memberRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6 },
  roleTag: { fontSize: 10, background: '#f1f5f9', color: '#475569', padding: '2px 6px', borderRadius: 4, fontWeight: 600 },
  removeMemberBtn: { background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 18, padding: '0 4px' },

  // API Keys
  keysSection: { display: 'flex', flexDirection: 'column', gap: 12 },
  alertBox: { background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 8, padding: 16, display: 'flex', flexDirection: 'column', gap: 8 },
  keyContainer: { background: '#fff', padding: 12, border: '1px solid #fcd34d', borderRadius: 6, wordBreak: 'break-all' },
  keyCode: { fontFamily: 'monospace', fontSize: 14, fontWeight: 600, color: '#b45309' },
  revokeKeyBtn: { fontSize: 12, color: '#ef4444', border: '1px solid #fca5a5', padding: '4px 10px', background: '#fff', borderRadius: 6, cursor: 'pointer', transition: 'all 0.15s' },
};
