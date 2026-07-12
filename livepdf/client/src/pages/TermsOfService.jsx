import React from 'react';
import { useNavigate } from 'react-router-dom';

export default function TermsOfService() {
  const navigate = useNavigate();

  return (
    <div style={styles.container}>
      <nav style={styles.navbar}>
        <div style={styles.navLogo} onClick={() => navigate('/')}>
          <svg style={styles.logoIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
          <span style={styles.logoText}>LivePDF</span>
        </div>
        <button onClick={() => navigate('/')} style={styles.backBtn}>Back to Home</button>
      </nav>

      <main style={styles.content}>
        <h1 style={styles.title}>Terms of Service</h1>
        <p style={styles.meta}>Last Updated: July 12, 2026</p>

        <section style={styles.section}>
          <h2 style={styles.subtitle}>1. Acceptance of Terms</h2>
          <p style={styles.text}>
            By accessing or using LivePDF (the "Service"), you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use the Service.
          </p>
        </section>

        <section style={styles.section}>
          <h2 style={styles.subtitle}>2. Description of Service</h2>
          <p style={styles.text}>
            LivePDF provides a secure, cloud-based platform for document analysis, including side-by-side comparisons, text extraction, and conversational artificial intelligence interfaces for uploaded PDFs.
          </p>
        </section>

        <section style={styles.section}>
          <h2 style={styles.subtitle}>3. User Accounts & Security</h2>
          <p style={styles.text}>
            To access certain features, you must register for an account. You are solely responsible for maintaining the confidentiality of your account credentials and passwords. LivePDF cannot and will not be liable for any loss or damage arising from your failure to protect your login information.
          </p>
        </section>

        <section style={styles.section}>
          <h2 style={styles.subtitle}>4. Acceptable Use Policy</h2>
          <p style={styles.text}>
            You agree not to upload any documents or perform any activities that violate intellectual property laws, contain malicious code, transmit hate speech, or compromise the stability of our servers. We reserve the right to terminate accounts that violate this policy.
          </p>
        </section>

        <section style={styles.section}>
          <h2 style={styles.subtitle5}>5. Limitation of Liability</h2>
          <p style={styles.text}>
            LivePDF is provided "as is" without any warranties of any kind. In no event shall LivePDF be liable for any direct, indirect, incidental, or consequential damages resulting from the use or inability to use the platform.
          </p>
        </section>
      </main>

      <footer style={styles.footer}>
        <p style={styles.footerText}>&copy; 2026 LivePDF. All rights reserved.</p>
      </footer>
    </div>
  );
}

const styles = {
  container: {
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    backgroundColor: '#ffffff',
    color: '#1f2937',
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
  },
  navbar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '20px 8%',
    borderBottom: '1px solid #f3f4f6',
  },
  navLogo: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    cursor: 'pointer',
  },
  logoIcon: {
    width: '26px',
    height: '26px',
    color: '#2563eb',
  },
  logoText: {
    fontWeight: 'bold',
    fontSize: '20px',
    color: '#1f2937',
  },
  backBtn: {
    backgroundColor: 'transparent',
    border: '1px solid #cbd5e1',
    borderRadius: '6px',
    padding: '8px 16px',
    fontWeight: '500',
    fontSize: '14px',
    cursor: 'pointer',
    color: '#475569',
  },
  content: {
    flexGrow: 1,
    maxWidth: '800px',
    margin: '40px auto',
    padding: '0 24px',
  },
  title: {
    fontSize: '36px',
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: '8px',
  },
  meta: {
    fontSize: '14px',
    color: '#64748b',
    marginBottom: '40px',
  },
  section: {
    marginBottom: '32px',
  },
  subtitle: {
    fontSize: '20px',
    fontWeight: '600',
    color: '#0f172a',
    marginBottom: '12px',
  },
  text: {
    fontSize: '15px',
    color: '#475569',
    lineHeight: '1.7',
    margin: 0,
  },
  footer: {
    padding: '30px 8%',
    borderTop: '1px solid #f3f4f6',
    textAlign: 'center',
  },
  footerText: {
    color: '#94a3b8',
    fontSize: '13px',
    margin: 0,
  },
};
