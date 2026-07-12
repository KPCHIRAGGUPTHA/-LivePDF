import React from 'react';
import { useNavigate } from 'react-router-dom';

export default function PrivacyPolicy() {
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
        <h1 style={styles.title}>Privacy Policy</h1>
        <p style={styles.meta}>Last Updated: July 12, 2026</p>

        <section style={styles.section}>
          <h2 style={styles.subtitle}>1. Information We Collect</h2>
          <p style={styles.text}>
            We collect information you provide directly to us when creating an account, uploading PDF documents, and interacting with our AI chatbot. This includes your email, name, and document contents.
          </p>
        </section>

        <section style={styles.section}>
          <h2 style={styles.subtitle}>2. How We Use Your Information</h2>
          <p style={styles.text}>
            We use your information to operate and improve the Service, including:
          </p>
          <ul style={{ ...styles.text, marginTop: '8px', paddingLeft: '20px' }}>
            <li>Processing and analyzing your uploaded PDF documents.</li>
            <li>Providing accurate answers to your questions via the AI assistant.</li>
            <li>Sending critical account status updates and OTP verification codes.</li>
          </ul>
        </section>

        <section style={styles.section}>
          <h2 style={styles.subtitle}>3. Data Security & Storage</h2>
          <p style={styles.text}>
            All document uploads are processed and stored securely using private AWS cloud storage buckets. We implement strict encryption standards (SSL/HTTPS) for all data in transit to prevent unauthorized access.
          </p>
        </section>

        <section style={styles.section}>
          <h2 style={styles.subtitle}>4. Third-Party Services</h2>
          <p style={styles.text}>
            We integrate with trusted third-party APIs (such as AWS for storage, Stripe for payment processing, and Google Gemini / HuggingFace for embedding and AI text analysis). These services process data strictly in accordance with their privacy policies.
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
