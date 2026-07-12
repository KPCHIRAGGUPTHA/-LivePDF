import React from 'react';
import { useNavigate } from 'react-router-dom';

export default function Landing() {
  const navigate = useNavigate();

  const handleGetStarted = () => {
    navigate('/signup');
  };

  const handleLogin = () => {
    navigate('/login');
  };

  return (
    <div style={styles.container}>
      {/* Navbar */}
      <nav style={styles.navbar}>
        <div style={styles.navLogo} onClick={() => navigate('/')}>
          <svg style={styles.logoIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
            <polyline points="10 9 9 9 8 9" />
          </svg>
          <span style={styles.logoText}>LivePDF</span>
        </div>
        <div style={styles.navLinks}>
          <a href="#features" style={styles.navLink}>Features</a>
          <a href="#pricing" style={styles.navLink}>Pricing</a>
          <button onClick={handleLogin} style={styles.navLoginBtn}>Log In</button>
          <button onClick={handleGetStarted} style={styles.navSignupBtn}>Get Started</button>
        </div>
      </nav>

      {/* Hero Section */}
      <header style={styles.hero}>
        <div style={styles.gridOverlay}></div>
        <div style={styles.heroContent}>
          <div style={styles.badge}>🚀 Transforming Document Workflows</div>
          <h1 style={styles.heroTitle}>
            Interact, Compare, and Chat with <span style={styles.highlightText}>PDFs</span> in Real-Time
          </h1>
          <p style={styles.heroSub}>
            The ultimate workspace for students and professionals. Ask questions to your documents, extract structured text instantly, and find side-by-side differences with AI.
          </p>
          <div style={styles.ctaGroup}>
            <button onClick={handleGetStarted} style={styles.primaryCta}>Start Free Now</button>
            <a href="#features" style={styles.secondaryCta}>Explore Features</a>
          </div>
        </div>
      </header>

      {/* Features Section */}
      <section id="features" style={styles.featuresSection}>
        <div style={styles.sectionHeader}>
          <h2 style={styles.sectionTitle}>Everything you need to master your documents</h2>
          <p style={styles.sectionSub}>Say goodbye to manual copy-pasting. Power your learning and extraction workflows with built-in AI tools.</p>
        </div>
        <div style={styles.featuresGrid}>
          <div style={styles.featureCard}>
            <div style={{ ...styles.featureIconContainer, backgroundColor: '#eff6ff', color: '#2563eb' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <h3 style={styles.featureCardTitle}>Interactive AI Chat</h3>
            <p style={styles.featureCardDesc}>
              Ask questions, summarize chapters, or translate paragraphs directly from the sidebar. Your AI study assistant is always ready.
            </p>
          </div>

          <div style={styles.featureCard}>
            <div style={{ ...styles.featureIconContainer, backgroundColor: '#f0fdf4', color: '#16a34a' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
              </svg>
            </div>
            <h3 style={styles.featureCardTitle}>Structured Extraction</h3>
            <p style={styles.featureCardDesc}>
              Extract text, headings, and clean tabular data from scanned or complex PDFs with high-accuracy extraction pipelines.
            </p>
          </div>

          <div style={styles.featureCard}>
            <div style={{ ...styles.featureIconContainer, backgroundColor: '#faf5ff', color: '#9333ea' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M16 3h5v5M8 3H3v5M12 12V3m0 9l4 4m-4-4l-4 4" />
                <path d="M16 21H8a2 2 0 0 1-2-2v-4h12v4a2 2 0 0 1-2 2z" />
              </svg>
            </div>
            <h3 style={styles.featureCardTitle}>Side-by-Side Comparison</h3>
            <p style={styles.featureCardDesc}>
              Compare document variations side-by-side. Highlight text insertions, deletions, and layout changes instantly.
            </p>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" style={styles.pricingSection}>
        <div style={styles.sectionHeader}>
          <h2 style={styles.sectionTitle}>Simple, transparent pricing</h2>
          <p style={styles.sectionSub}>Start for free, upgrade when you need advanced capabilities.</p>
        </div>
        <div style={styles.pricingGrid}>
          <div style={styles.pricingCard}>
            <h3 style={styles.priceTier}>Free Plan</h3>
            <div style={styles.priceContainer}>
              <span style={styles.priceSymbol}>$</span>
              <span style={styles.priceValue}>0</span>
              <span style={styles.pricePeriod}>/month</span>
            </div>
            <p style={styles.priceDesc}>Perfect for testing and lightweight personal use.</p>
            <ul style={styles.pricingFeatures}>
              <li style={styles.pricingFeature}><span style={styles.checkIcon}>✓</span> Upload files up to 10MB</li>
              <li style={styles.pricingFeature}><span style={styles.checkIcon}>✓</span> 5 PDF Extractions / month</li>
              <li style={styles.pricingFeature}><span style={styles.checkIcon}>✓</span> Basic Q&A assistant</li>
              <li style={styles.pricingFeature}><span style={styles.checkIcon}>✓</span> Standard document viewer</li>
            </ul>
            <button onClick={handleGetStarted} style={styles.pricingCardBtn}>Start Free</button>
          </div>

          <div style={{ ...styles.pricingCard, border: '2px solid #2563eb', position: 'relative' }}>
            <div style={styles.popularBadge}>POPULAR</div>
            <h3 style={styles.priceTier}>Pro Tier</h3>
            <div style={styles.priceContainer}>
              <span style={styles.priceSymbol}>$</span>
              <span style={styles.priceValue}>9</span>
              <span style={styles.pricePeriod}>/month</span>
            </div>
            <p style={styles.priceDesc}>Ideal for students and high-volume professionals.</p>
            <ul style={styles.pricingFeatures}>
              <li style={styles.pricingFeature}><span style={styles.checkIcon}>✓</span> Upload files up to 50MB</li>
              <li style={styles.pricingFeature}><span style={styles.checkIcon}>✓</span> Unlimited PDF Extractions</li>
              <li style={styles.pricingFeature}><span style={styles.checkIcon}>✓</span> Side-by-Side comparisons</li>
              <li style={styles.pricingFeature}><span style={styles.checkIcon}>✓</span> Priority AI Chat helper</li>
              <li style={styles.pricingFeature}><span style={styles.checkIcon}>✓</span> Faster processing speeds</li>
            </ul>
            <button onClick={handleGetStarted} style={{ ...styles.pricingCardBtn, backgroundColor: '#2563eb', color: '#fff' }}>Go Pro</button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer style={styles.footer}>
        <div style={styles.footerBrand}>
          <span style={styles.logoText}>LivePDF</span>
          <p style={styles.footerDesc}>Streamline your research and document workflows in the cloud.</p>
        </div>
        <div style={styles.footerLinksGrid}>
          <div style={styles.footerCol}>
            <span style={styles.footerColTitle}>Product</span>
            <a href="#features" style={styles.footerLinkItem}>Features</a>
            <a href="#pricing" style={styles.footerLinkItem}>Pricing</a>
          </div>
          <div style={styles.footerCol}>
            <span style={styles.footerColTitle}>Legal</span>
            <span onClick={() => navigate('/terms')} style={{ ...styles.footerLinkItem, cursor: 'pointer' }}>Terms of Service</span>
            <span onClick={() => navigate('/privacy')} style={{ ...styles.footerLinkItem, cursor: 'pointer' }}>Privacy Policy</span>
          </div>
          <div style={styles.footerCol}>
            <span style={styles.footerColTitle}>Support</span>
            <a href="mailto:support@livepdf.in" style={styles.footerLinkItem}>Contact Us</a>
            <span style={styles.footerLinkItem}>Status: Up</span>
          </div>
        </div>
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
    scrollBehavior: 'smooth',
  },
  navbar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '20px 8%',
    borderBottom: '1px solid #f3f4f6',
    backgroundColor: '#ffffff',
    position: 'sticky',
    top: 0,
    zIndex: 100,
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
  navLinks: {
    display: 'flex',
    alignItems: 'center',
    gap: '24px',
  },
  navLink: {
    color: '#4b5563',
    textDecoration: 'none',
    fontSize: '15px',
    fontWeight: '500',
  },
  navLoginBtn: {
    backgroundColor: 'transparent',
    border: 'none',
    color: '#4b5563',
    fontWeight: '500',
    fontSize: '15px',
    cursor: 'pointer',
    padding: '8px 16px',
  },
  navSignupBtn: {
    backgroundColor: '#2563eb',
    color: '#ffffff',
    border: 'none',
    borderRadius: '6px',
    padding: '10px 18px',
    fontWeight: '500',
    fontSize: '15px',
    cursor: 'pointer',
  },
  hero: {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
    padding: '100px 8%',
    backgroundColor: '#f8fafc',
    overflow: 'hidden',
  },
  gridOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundImage: 'radial-gradient(#e2e8f0 1.5px, transparent 1.5px)',
    backgroundSize: '30px 30px',
    opacity: 0.5,
  },
  heroContent: {
    position: 'relative',
    zIndex: 1,
    maxWidth: '800px',
  },
  badge: {
    display: 'inline-block',
    backgroundColor: '#eff6ff',
    color: '#2563eb',
    fontSize: '13px',
    fontWeight: '600',
    padding: '6px 14px',
    borderRadius: '9999px',
    marginBottom: '24px',
  },
  heroTitle: {
    fontSize: '48px',
    fontWeight: '800',
    lineHeight: '1.2',
    color: '#0f172a',
    margin: '0 0 20px 0',
  },
  highlightText: {
    color: '#2563eb',
  },
  heroSub: {
    fontSize: '18px',
    color: '#475569',
    lineHeight: '1.6',
    margin: '0 auto 36px auto',
    maxWidth: '650px',
  },
  ctaGroup: {
    display: 'flex',
    justifyContent: 'center',
    gap: '16px',
  },
  primaryCta: {
    backgroundColor: '#2563eb',
    color: '#ffffff',
    border: 'none',
    borderRadius: '6px',
    padding: '14px 28px',
    fontWeight: '600',
    fontSize: '16px',
    cursor: 'pointer',
    boxShadow: '0 4px 6px -1px rgba(37, 99, 235, 0.2)',
  },
  secondaryCta: {
    backgroundColor: '#ffffff',
    color: '#475569',
    border: '1px solid #e2e8f0',
    borderRadius: '6px',
    padding: '14px 28px',
    fontWeight: '600',
    fontSize: '16px',
    textDecoration: 'none',
    cursor: 'pointer',
  },
  featuresSection: {
    padding: '100px 8%',
    backgroundColor: '#ffffff',
  },
  sectionHeader: {
    textAlign: 'center',
    maxWidth: '650px',
    margin: '0 auto 60px auto',
  },
  sectionTitle: {
    fontSize: '32px',
    fontWeight: '700',
    color: '#0f172a',
    margin: '0 0 16px 0',
  },
  sectionSub: {
    fontSize: '16px',
    color: '#64748b',
    lineHeight: '1.5',
    margin: 0,
  },
  featuresGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: '30px',
  },
  featureCard: {
    padding: '30px',
    borderRadius: '12px',
    border: '1px solid #f1f5f9',
    backgroundColor: '#ffffff',
    transition: 'transform 0.2s',
  },
  featureIconContainer: {
    width: '48px',
    height: '48px',
    borderRadius: '8px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '20px',
  },
  featureCardTitle: {
    fontSize: '20px',
    fontWeight: '600',
    color: '#0f172a',
    margin: '0 0 12px 0',
  },
  featureCardDesc: {
    fontSize: '15px',
    color: '#475569',
    lineHeight: '1.6',
    margin: 0,
  },
  pricingSection: {
    padding: '100px 8%',
    backgroundColor: '#f8fafc',
  },
  pricingGrid: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'stretch',
    flexWrap: 'wrap',
    gap: '30px',
    maxWidth: '900px',
    margin: '0 auto',
  },
  pricingCard: {
    flex: '1 1 350px',
    backgroundColor: '#ffffff',
    borderRadius: '12px',
    border: '1px solid #e2e8f0',
    padding: '40px 30px',
    display: 'flex',
    flexDirection: 'column',
  },
  priceTier: {
    fontSize: '18px',
    fontWeight: '600',
    color: '#475569',
    margin: '0 0 12px 0',
  },
  priceContainer: {
    display: 'flex',
    alignItems: 'baseline',
    marginBottom: '16px',
  },
  priceSymbol: {
    fontSize: '28px',
    fontWeight: '700',
    color: '#0f172a',
  },
  priceValue: {
    fontSize: '48px',
    fontWeight: '800',
    color: '#0f172a',
  },
  pricePeriod: {
    color: '#64748b',
    fontSize: '16px',
    marginLeft: '4px',
  },
  priceDesc: {
    fontSize: '15px',
    color: '#475569',
    margin: '0 0 30px 0',
  },
  pricingFeatures: {
    listStyle: 'none',
    padding: 0,
    margin: '0 0 40px 0',
    flexGrow: 1,
  },
  pricingFeature: {
    fontSize: '15px',
    color: '#334155',
    marginBottom: '14px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  checkIcon: {
    color: '#16a34a',
    fontWeight: 'bold',
  },
  pricingCardBtn: {
    width: '100%',
    backgroundColor: '#ffffff',
    color: '#0f172a',
    border: '1px solid #cbd5e1',
    borderRadius: '6px',
    padding: '12px 20px',
    fontWeight: '600',
    fontSize: '15px',
    cursor: 'pointer',
  },
  popularBadge: {
    position: 'absolute',
    top: '16px',
    right: '16px',
    backgroundColor: '#dbeafe',
    color: '#2563eb',
    fontSize: '11px',
    fontWeight: '700',
    padding: '4px 10px',
    borderRadius: '9999px',
  },
  footer: {
    padding: '60px 8%',
    backgroundColor: '#0f172a',
    color: '#94a3b8',
    display: 'flex',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: '40px',
  },
  footerBrand: {
    maxWidth: '300px',
  },
  footerDesc: {
    fontSize: '14px',
    marginTop: '12px',
    lineHeight: '1.5',
  },
  footerLinksGrid: {
    display: 'flex',
    gap: '80px',
  },
  footerCol: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  footerColTitle: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: '14px',
    marginBottom: '8px',
  },
  footerLinkItem: {
    color: '#94a3b8',
    textDecoration: 'none',
    fontSize: '14px',
  },
};
