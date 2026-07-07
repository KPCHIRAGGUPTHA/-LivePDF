import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../utils/api';
import PasswordGate from '../components/PasswordGate';
import PdfViewer from '../components/PdfViewer';
import useSocket from '../hooks/useSocket';
import useSignedUrlRefresh from '../hooks/useSignedUrlRefresh';
import ConnectionStatus from '../components/ConnectionStatus';
import ViewerToast from '../components/ViewerToast';

export default function Viewer() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [state, setState] = useState('loading'); // loading | pdf | password | error
  
  // Versions and URL states
  const [pdfUrlA, setPdfUrlA] = useState(null);
  const [pdfUrlB, setPdfUrlB] = useState(null);
  const [versionA, setVersionA] = useState(null);
  const [versionB, setVersionB] = useState(null);
  const [versions, setVersions] = useState([]);
  const [compareMode, setCompareMode] = useState(false);
  const [unlockedPassword, setUnlockedPassword] = useState('');
  const [loadingA, setLoadingA] = useState(false);
  const [loadingB, setLoadingB] = useState(false);
  const [activeDiff, setActiveDiff] = useState(null);

  const [title, setTitle] = useState('');
  const [allowDownload, setAllowDownload] = useState(false);
  const [showWatermark, setShowWatermark] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [docId, setDocId] = useState(null);
  const [versionNumber, setVersionNumber] = useState(null);
  const [toastMessage, setToastMessage] = useState('');
  const [linkType, setLinkType] = useState('public');

  const fetchVersionUrl = async (versionNum) => {
    try {
      if (unlockedPassword) {
        const res = await api.post(`/share/${token}/unlock`, { 
          password: unlockedPassword, 
          versionNumber: versionNum 
        }, { skipAuthRedirect: true });
        return { signedUrl: res.data.signedUrl, diff: res.data.diff };
      } else {
        const res = await api.get(`/share/${token}?version=${versionNum}`, { 
          skipAuthRedirect: true 
        });
        return { signedUrl: res.data.signedUrl, diff: res.data.diff };
      }
    } catch (err) {
      console.error('Failed to fetch version URL:', err);
      alert('Failed to load version: ' + (err.response?.data?.error || err.message));
      return null;
    }
  };

  const handleRetryA = async () => {
    const result = await fetchVersionUrl(versionA);
    if (result) {
      setPdfUrlA(result.signedUrl);
      setActiveDiff(result.diff || null);
    }
  };

  const handleRetryB = async () => {
    const result = await fetchVersionUrl(versionB);
    if (result) setPdfUrlB(result.signedUrl);
  };

  useEffect(() => {
    async function resolve() {
      try {
        const res = await api.get(`/share/${token}`, { skipAuthRedirect: true });
        setPdfUrlA(res.data.signedUrl);
        setTitle(res.data.title);
        setAllowDownload(res.data.allowDownload);
        setShowWatermark(res.data.showWatermark || false);
        setVersions(res.data.versions || []);
        setDocId(res.data.documentId);
        setVersionNumber(res.data.versionNumber);
        setLinkType(res.data.linkType || 'public');
        if (res.data.versions && res.data.versions.length > 0) {
          setVersionA(res.data.versions[0].versionNumber);
        }
        setActiveDiff(res.data.diff || null);
        setState('pdf');
      } catch (err) {
        const data = err.response?.data;
        if (data?.requiresPassword) {
          setTitle(data.title);
          setAllowDownload(data.allowDownload);
          setShowWatermark(data.showWatermark || false);
          setState('password');
        } else if (data?.requiresLogin) {
          setState('error');
          setErrorMsg('This link is private. Please log in to access it.');
        } else if (err.response?.status === 410) {
          setState('error');
          setErrorMsg('This link has expired.');
        } else if (err.response?.status === 403) {
          setState('error');
          setErrorMsg('You do not have access to this document.');
        } else {
          setState('error');
          setErrorMsg('Link not found or invalid.');
        }
      }
    }
    resolve();
  }, [token]);

  const handleVersionChange = async (pane, versionNum) => {
    const num = parseInt(versionNum, 10);
    if (pane === 'A') {
      setLoadingA(true);
      setVersionA(num);
      const result = await fetchVersionUrl(num);
      if (result) {
        setPdfUrlA(result.signedUrl);
        setActiveDiff(result.diff || null);
      } else {
        setActiveDiff(null);
      }
      setLoadingA(false);
    } else {
      setLoadingB(true);
      setVersionB(num);
      const result = await fetchVersionUrl(num);
      if (result) setPdfUrlB(result.signedUrl);
      setLoadingB(false);
    }
  };

  const toggleCompareMode = async () => {
    const nextMode = !compareMode;
    setCompareMode(nextMode);
    if (nextMode) {
      if (versions.length > 1 && !pdfUrlB) {
        const defaultB = versions[1].versionNumber;
        setVersionB(defaultB);
        setLoadingB(true);
        const result = await fetchVersionUrl(defaultB);
        if (result?.signedUrl) setPdfUrlB(result.signedUrl);
        setLoadingB(false);
      } else if (versions.length === 1 && !pdfUrlB) {
        setVersionB(versions[0].versionNumber);
        setPdfUrlB(pdfUrlA);
      }
    }
  };

  const handleDocUpdated = useCallback((payload) => {
    if (!payload || !payload.signedUrl) return;
    setPdfUrlA(payload.signedUrl);
    setVersionNumber(payload.versionNumber);
    setToastMessage(`Document updated to version ${payload.versionNumber}`);
    setVersions(prev => {
      if (prev.some(v => v.versionNumber === payload.versionNumber)) return prev;
      const newVer = {
        versionNumber: payload.versionNumber,
        fileSize: payload.fileSize || null,
        uploadedAt: payload.updatedAt || new Date().toISOString()
      };
      return [newVer, ...prev];
    });
    setVersionA(payload.versionNumber);
  }, []);

  const { connected, reconnecting, viewerCount, socket } = useSocket({
    docId,
    linkType,
    currentVersion: versionNumber,
    onDocUpdated: handleDocUpdated,
  });

  useSignedUrlRefresh({
    token,
    active: state === 'pdf',
    onRefresh: (newUrl) => setPdfUrlA(newUrl),
  });

  if (state === 'loading') return <div style={styles.center}>Loading document…</div>;

  if (state === 'error') return (
    <div style={styles.center}>
      <h2 style={{ color: '#b91c1c' }}>Cannot open document</h2>
      <p style={{ color: '#555', marginTop: 8 }}>{errorMsg}</p>
      {errorMsg.includes('Please log in') && (
        <button
          onClick={() => navigate(`/login?redirectTo=/view/${token}`)}
          style={styles.loginBtn}
        >
          Log In
        </button>
      )}
    </div>
  );

  if (state === 'password') return (
    <PasswordGate
      token={token}
      onUnlock={(url, dl, pass, versionsData, documentId, verNum, diff, sw) => { 
        setPdfUrlA(url); 
        setAllowDownload(dl); 
        setShowWatermark(sw || false);
        setUnlockedPassword(pass);
        setVersions(versionsData || []);
        if (versionsData && versionsData.length > 0) {
          setVersionA(versionsData[0].versionNumber);
        }
        setDocId(documentId);
        setVersionNumber(verNum);
        setLinkType('protected');
        setActiveDiff(diff || null);
        setState('pdf'); 
      }}
    />
  );

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <span style={styles.title}>{title}</span>
          <ConnectionStatus connected={connected} reconnecting={reconnecting} />
          {viewerCount > 1 && (
            <span style={styles.viewerCount}>({viewerCount} viewing)</span>
          )}
        </div>
        
        <div style={styles.headerRight}>
          {versions.length > 1 && (
            <button 
              onClick={toggleCompareMode} 
              style={{
                ...styles.compareToggleBtn,
                ...(compareMode ? styles.compareToggleBtnActive : {})
              }}
            >
              ⚖️ Compare Versions
            </button>
          )}

          {!compareMode && versions.length > 0 && (
            <div style={styles.versionSelector}>
              <span style={styles.versionLabel}>Version: </span>
              <select
                style={styles.select}
                value={versionA || ''}
                onChange={(e) => handleVersionChange('A', e.target.value)}
                disabled={loadingA}
              >
                {versions.map(v => (
                  <option key={v.versionNumber} value={v.versionNumber}>
                    v{v.versionNumber} ({new Date(v.uploadedAt).toLocaleDateString()})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {compareMode ? (
        <div style={styles.compareContainer}>
          <div style={styles.comparePane}>
            <div style={styles.paneHeader}>
              <div style={styles.paneInfo}>
                <span style={styles.paneLabel}>Version A:</span>
                <select
                  style={styles.paneSelect}
                  value={versionA || ''}
                  onChange={(e) => handleVersionChange('A', e.target.value)}
                  disabled={loadingA}
                >
                  {versions.map(v => (
                    <option key={v.versionNumber} value={v.versionNumber}>v{v.versionNumber}</option>
                  ))}
                </select>
              </div>
            </div>
            {loadingA ? (
              <div style={styles.paneLoading}>Loading Version A...</div>
            ) : (
              <PdfViewer
                url={pdfUrlA}
                title={`Version A (v${versionA})`}
                allowDownload={allowDownload}
                showWatermark={showWatermark}
                onRetry={handleRetryA}
                socket={socket}
                initialDiff={activeDiff}
                token={token}
              />
            )}
          </div>

          <div style={styles.comparePane}>
            <div style={styles.paneHeader}>
              <div style={styles.paneInfo}>
                <span style={styles.paneLabel}>Version B:</span>
                <select
                  style={styles.paneSelect}
                  value={versionB || ''}
                  onChange={(e) => handleVersionChange('B', e.target.value)}
                  disabled={loadingB}
                >
                  {versions.map(v => (
                    <option key={v.versionNumber} value={v.versionNumber}>v{v.versionNumber}</option>
                  ))}
                </select>
              </div>
            </div>
            {loadingB ? (
              <div style={styles.paneLoading}>Loading Version B...</div>
            ) : (
              <PdfViewer
                url={pdfUrlB}
                title={`Version B (v${versionB})`}
                allowDownload={allowDownload}
                onRetry={handleRetryB}
                token={token}
              />
            )}
          </div>
        </div>
      ) : (
        <PdfViewer
          url={pdfUrlA}
          title={title}
          allowDownload={allowDownload}
          showWatermark={showWatermark}
          onRetry={handleRetryA}
          socket={socket}
          initialDiff={activeDiff}
          token={token}
        />
      )}
      <ViewerToast
        message={toastMessage}
        onDismiss={() => setToastMessage('')}
      />
    </div>
  );
}

const styles = {
  page: { display: 'flex', flexDirection: 'column', height: '100vh', background: '#f0f0f0' },
  header: { background: '#fff', borderBottom: '0.5px solid #e0e0e0', padding: '0 1.5rem', height: 52, display: 'flex', alignItems: 'center', justifyContent: 'space-between', zIndex: 10 },
  headerLeft: { display: 'flex', alignItems: 'center', gap: 12 },
  viewerCount: { fontSize: 12, background: '#f1f5f9', padding: '2px 8px', borderRadius: 12, color: '#475569', fontWeight: 500, marginLeft: 8 },
  title: { fontSize: 15, fontWeight: 500, color: '#1a1a1a' },
  downloadBtn: { fontSize: 13, padding: '6px 14px', background: '#1a1a1a', color: '#fff', borderRadius: 6, textDecoration: 'none', fontWeight: 500 },
  iframe: { flex: 1, border: 'none', width: '100%', height: '100%' },
  center: { minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' },
  loginBtn: { marginTop: 12, padding: '8px 16px', background: '#1a1a1a', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: 'pointer' },
  
  // Custom Styles for comparison & version selection
  headerRight: { display: 'flex', alignItems: 'center', gap: 12 },
  versionSelector: { display: 'flex', alignItems: 'center', gap: 6 },
  versionLabel: { fontSize: 13, color: '#555', fontWeight: 500 },
  select: { padding: '5px 10px', borderRadius: 6, border: '0.5px solid #d0d0d0', fontSize: 13, color: '#333', outline: 'none', background: '#fff', cursor: 'pointer' },
  compareToggleBtn: { fontSize: 13, padding: '6px 12px', background: '#f0f0ed', color: '#1a1a1a', border: '0.5px solid #d0d0d0', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 500 },
  compareToggleBtnActive: { background: '#1a1a1a', color: '#fff', borderColor: '#1a1a1a' },
  
  compareContainer: { display: 'flex', flex: 1, overflow: 'hidden', background: '#e0e0e0', gap: 12, padding: 12 },
  comparePane: { display: 'flex', flexDirection: 'column', flex: 1, background: '#fff', borderRadius: 8, overflow: 'hidden', border: '0.5px solid #d0d0d0' },
  paneHeader: { background: '#fafafa', borderBottom: '0.5px solid #e0e0e0', padding: '8px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13, fontWeight: 500, color: '#333' },
  paneInfo: { display: 'flex', alignItems: 'center', gap: 6 },
  paneLabel: { fontSize: 12, fontWeight: 600, color: '#555' },
  paneSelect: { padding: '3px 6px', borderRadius: 4, border: '0.5px solid #d0d0d0', outline: 'none', fontSize: 12, background: '#fff', cursor: 'pointer' },
  paneDownloadBtn: { fontSize: 11, padding: '4px 10px', background: '#f0f0ed', color: '#1a1a1a', borderRadius: 4, textDecoration: 'none', border: '0.5px solid #d0d0d0', fontWeight: 500 },
  paneLoading: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, color: '#666', background: '#fcfcfc' }
};
