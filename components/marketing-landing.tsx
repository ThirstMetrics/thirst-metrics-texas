/**
 * Marketing Landing Page
 * Served at whiskeyrivertx.com — public-facing, no auth required
 */

'use client';

const APP_URL = 'https://app.whiskeyrivertx.com';

export default function MarketingLanding() {
  return (
    <div style={styles.page}>
      {/* Nav */}
      <nav style={styles.nav}>
        <div style={styles.navInner}>
          <span style={styles.logo}>🥃 Whiskey River TX</span>
          <div style={styles.navLinks}>
            <a href="#features" style={styles.navLink}>Features</a>
            <a href="#pricing" style={styles.navLink}>Pricing</a>
            <a href={`${APP_URL}/login`} style={styles.navLink}>Sign In</a>
            <a href={`${APP_URL}/signup`} style={styles.ctaSmall}>Start Free Trial</a>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section style={styles.hero}>
        <div style={styles.heroInner}>
          <div style={styles.badge}>Built for Texas Beverage Distributors</div>
          <h1 style={styles.heroTitle}>
            Know Your Market.<br />Work Your Territory.
          </h1>
          <p style={styles.heroSubtitle}>
            Whiskey River TX combines Texas liquor license revenue data with field-ready CRM tools —
            so your sales team knows exactly which accounts to prioritize and can prove they were there.
          </p>
          <div style={styles.heroCtas}>
            <a href={`${APP_URL}/signup`} style={styles.ctaPrimary}>
              Start Free Trial
            </a>
            <a href="#features" style={styles.ctaSecondary}>
              See How It Works
            </a>
          </div>
          <p style={styles.heroNote}>No credit card required · Free 30-day trial</p>
        </div>
      </section>

      {/* Social proof bar */}
      <div style={styles.proofBar}>
        <span style={styles.proofItem}>3.6M+ Texas beverage locations tracked</span>
        <span style={styles.proofDivider}>·</span>
        <span style={styles.proofItem}>GPS-verified field visits</span>
        <span style={styles.proofDivider}>·</span>
        <span style={styles.proofItem}>Real revenue data, not estimates</span>
      </div>

      {/* Features */}
      <section id="features" style={styles.features}>
        <div style={styles.sectionInner}>
          <h2 style={styles.sectionTitle}>Everything your field team needs</h2>
          <p style={styles.sectionSubtitle}>
            Stop guessing which bars and restaurants are worth your time. We pull monthly revenue data
            directly from the Texas Comptroller so you can rank every account in your territory.
          </p>

          <div style={styles.featureGrid}>
            <FeatureCard
              icon="📊"
              title="Revenue Intelligence"
              desc="See actual monthly liquor, wine, and beer receipts for every Texas mixed beverage permit holder. Sort, filter, and rank 23,000+ new records added monthly."
            />
            <FeatureCard
              icon="📍"
              title="GPS Field Verification"
              desc="Log visits, calls, and notes with automatic GPS capture. Managers can verify reps were on-site. No more wondering if the work got done."
            />
            <FeatureCard
              icon="🗺️"
              title="Territory Management"
              desc="Carve territories by county or zip code. Assign accounts to reps, set goals, and see who's covering their ground on an interactive map."
            />
            <FeatureCard
              icon="📈"
              title="Growth Analytics"
              desc="Spot trending accounts before competitors do. Track month-over-month revenue growth, segment by account type, and find underserved markets."
            />
            <FeatureCard
              icon="🏢"
              title="Chain & Ownership View"
              desc="See all locations for a chain or ownership group in one view — aggregate revenue, growth trends, and a single place to log enterprise-level activity."
            />
            <FeatureCard
              icon="🎯"
              title="Goals & Accountability"
              desc="Set revenue, growth, and visit goals for each rep. Track progress in real time. Dashboard widgets keep everyone aligned without a weekly meeting."
            />
          </div>
        </div>
      </section>

      {/* How it works */}
      <section style={styles.howItWorks}>
        <div style={styles.sectionInner}>
          <h2 style={styles.sectionTitle}>How it works</h2>
          <div style={styles.steps}>
            <Step number="1" title="Your accounts are already in the system" desc="Texas Comptroller data is loaded and updated monthly. Every bar, restaurant, and venue with a mixed beverage permit is already there — with real revenue history." />
            <Step number="2" title="Your rep opens the app in the field" desc="Pull up a customer on their phone. See their revenue trend, last visit date, and any open follow-ups. Log the visit with one tap — GPS captures location automatically." />
            <Step number="3" title="You see the whole picture" desc="Manager dashboard shows team activity, territory coverage, goal progress, and which high-value accounts haven't been touched in 30+ days." />
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" style={styles.pricing}>
        <div style={styles.sectionInner}>
          <h2 style={styles.sectionTitle}>Simple pricing</h2>
          <p style={styles.sectionSubtitle}>One plan, everything included. Cancel anytime.</p>
          <div style={styles.pricingCard}>
            <div style={styles.pricingBadge}>Most Popular</div>
            <div style={styles.pricingAmount}>
              <span style={styles.pricingDollar}>$</span>
              <span style={styles.pricingNumber}>99</span>
              <span style={styles.pricingPer}>/mo per rep</span>
            </div>
            <ul style={styles.pricingList}>
              {[
                'Full access to all 3.6M+ TX accounts',
                'Unlimited activity logging',
                'GPS verification on every visit',
                'Territory & goal management',
                'Chain/ownership analytics',
                'Manager dashboard & reporting',
                'Mobile-first design',
                'Dedicated onboarding support',
              ].map((item) => (
                <li key={item} style={styles.pricingItem}>
                  <span style={styles.checkmark}>✓</span> {item}
                </li>
              ))}
            </ul>
            <a href={`${APP_URL}/signup`} style={styles.ctaPrimary}>
              Start Free 30-Day Trial
            </a>
            <p style={styles.pricingNote}>No credit card required to start</p>
          </div>
        </div>
      </section>

      {/* CTA banner */}
      <section style={styles.ctaBanner}>
        <div style={styles.sectionInner}>
          <h2 style={styles.ctaBannerTitle}>Ready to know your market?</h2>
          <p style={styles.ctaBannerSub}>
            Join Texas beverage distributors who use real data to outwork the competition.
          </p>
          <a href={`${APP_URL}/signup`} style={{ ...styles.ctaPrimary, fontSize: '18px', padding: '16px 40px' }}>
            Start Free Trial
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer style={styles.footer}>
        <div style={styles.footerInner}>
          <span style={styles.logo}>🥃 Whiskey River TX</span>
          <div style={styles.footerLinks}>
            <a href={`${APP_URL}/login`} style={styles.footerLink}>Sign In</a>
            <a href={`${APP_URL}/signup`} style={styles.footerLink}>Sign Up</a>
          </div>
          <p style={styles.footerCopy}>© {new Date().getFullYear()} Whiskey River TX. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <div style={styles.featureCard}>
      <div style={styles.featureIcon}>{icon}</div>
      <h3 style={styles.featureTitle}>{title}</h3>
      <p style={styles.featureDesc}>{desc}</p>
    </div>
  );
}

function Step({ number, title, desc }: { number: string; title: string; desc: string }) {
  return (
    <div style={styles.step}>
      <div style={styles.stepNumber}>{number}</div>
      <div>
        <h3 style={styles.stepTitle}>{title}</h3>
        <p style={styles.stepDesc}>{desc}</p>
      </div>
    </div>
  );
}

const AMBER = '#d97706';
const AMBER_DARK = '#b45309';
const AMBER_LIGHT = '#fef3c7';
const DARK = '#1c1917';
const GRAY = '#78716c';
const LIGHT_BG = '#fafaf9';

const styles: Record<string, React.CSSProperties> = {
  page: {
    fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
    color: DARK,
    background: '#fff',
    margin: 0,
  },

  // Nav
  nav: {
    position: 'sticky',
    top: 0,
    background: 'rgba(255,255,255,0.95)',
    backdropFilter: 'blur(8px)',
    borderBottom: '1px solid #e7e5e4',
    zIndex: 100,
  },
  navInner: {
    maxWidth: 1100,
    margin: '0 auto',
    padding: '0 24px',
    height: 64,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  logo: {
    fontSize: 20,
    fontWeight: 700,
    color: DARK,
    textDecoration: 'none',
  },
  navLinks: {
    display: 'flex',
    alignItems: 'center',
    gap: 24,
  },
  navLink: {
    fontSize: 15,
    color: GRAY,
    textDecoration: 'none',
    fontWeight: 500,
  },
  ctaSmall: {
    background: AMBER,
    color: '#fff',
    padding: '8px 18px',
    borderRadius: 6,
    fontSize: 14,
    fontWeight: 600,
    textDecoration: 'none',
  },

  // Hero
  hero: {
    background: `linear-gradient(160deg, ${DARK} 0%, #292524 100%)`,
    padding: '96px 24px 80px',
    textAlign: 'center',
  },
  heroInner: {
    maxWidth: 760,
    margin: '0 auto',
  },
  badge: {
    display: 'inline-block',
    background: AMBER_LIGHT,
    color: AMBER_DARK,
    fontSize: 13,
    fontWeight: 600,
    padding: '4px 14px',
    borderRadius: 20,
    marginBottom: 24,
    letterSpacing: '0.02em',
  },
  heroTitle: {
    fontSize: 'clamp(36px, 6vw, 60px)',
    fontWeight: 800,
    color: '#fff',
    lineHeight: 1.15,
    marginBottom: 24,
    letterSpacing: '-0.02em',
  },
  heroSubtitle: {
    fontSize: 18,
    color: '#a8a29e',
    lineHeight: 1.7,
    marginBottom: 40,
    maxWidth: 620,
    margin: '0 auto 40px',
  },
  heroCtas: {
    display: 'flex',
    gap: 16,
    justifyContent: 'center',
    flexWrap: 'wrap',
    marginBottom: 16,
  },
  ctaPrimary: {
    background: AMBER,
    color: '#fff',
    padding: '14px 32px',
    borderRadius: 8,
    fontSize: 16,
    fontWeight: 700,
    textDecoration: 'none',
    display: 'inline-block',
  },
  ctaSecondary: {
    background: 'transparent',
    color: '#e7e5e4',
    padding: '14px 32px',
    borderRadius: 8,
    fontSize: 16,
    fontWeight: 600,
    textDecoration: 'none',
    border: '1px solid #57534e',
    display: 'inline-block',
  },
  heroNote: {
    fontSize: 13,
    color: '#78716c',
    marginTop: 16,
  },

  // Proof bar
  proofBar: {
    background: AMBER_LIGHT,
    padding: '14px 24px',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
    flexWrap: 'wrap',
  },
  proofItem: {
    fontSize: 14,
    fontWeight: 600,
    color: AMBER_DARK,
  },
  proofDivider: {
    color: AMBER,
    fontSize: 18,
  },

  // Sections
  sectionInner: {
    maxWidth: 1100,
    margin: '0 auto',
    padding: '0 24px',
  },
  sectionTitle: {
    fontSize: 'clamp(28px, 4vw, 40px)',
    fontWeight: 800,
    color: DARK,
    textAlign: 'center',
    marginBottom: 16,
    letterSpacing: '-0.02em',
  },
  sectionSubtitle: {
    fontSize: 17,
    color: GRAY,
    textAlign: 'center',
    maxWidth: 600,
    margin: '0 auto 56px',
    lineHeight: 1.7,
  },

  // Features
  features: {
    padding: '80px 0',
    background: '#fff',
  },
  featureGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
    gap: 32,
  },
  featureCard: {
    background: LIGHT_BG,
    borderRadius: 12,
    padding: 32,
    border: '1px solid #e7e5e4',
  },
  featureIcon: {
    fontSize: 32,
    marginBottom: 16,
  },
  featureTitle: {
    fontSize: 18,
    fontWeight: 700,
    marginBottom: 10,
    color: DARK,
  },
  featureDesc: {
    fontSize: 15,
    color: GRAY,
    lineHeight: 1.65,
    margin: 0,
  },

  // How it works
  howItWorks: {
    padding: '80px 0',
    background: LIGHT_BG,
  },
  steps: {
    display: 'flex',
    flexDirection: 'column',
    gap: 40,
    maxWidth: 680,
    margin: '0 auto',
  },
  step: {
    display: 'flex',
    gap: 24,
    alignItems: 'flex-start',
  },
  stepNumber: {
    width: 44,
    height: 44,
    borderRadius: '50%',
    background: AMBER,
    color: '#fff',
    fontWeight: 800,
    fontSize: 20,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  stepTitle: {
    fontSize: 18,
    fontWeight: 700,
    marginBottom: 8,
    color: DARK,
  },
  stepDesc: {
    fontSize: 15,
    color: GRAY,
    lineHeight: 1.65,
    margin: 0,
  },

  // Pricing
  pricing: {
    padding: '80px 0',
    background: '#fff',
  },
  pricingCard: {
    maxWidth: 480,
    margin: '0 auto',
    background: DARK,
    borderRadius: 16,
    padding: '48px 40px',
    textAlign: 'center',
    position: 'relative',
  },
  pricingBadge: {
    position: 'absolute',
    top: -14,
    left: '50%',
    transform: 'translateX(-50%)',
    background: AMBER,
    color: '#fff',
    fontSize: 12,
    fontWeight: 700,
    padding: '4px 16px',
    borderRadius: 20,
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
    whiteSpace: 'nowrap',
  },
  pricingAmount: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    gap: 4,
    marginBottom: 32,
    marginTop: 8,
  },
  pricingDollar: {
    fontSize: 24,
    fontWeight: 700,
    color: '#e7e5e4',
    marginTop: 10,
  },
  pricingNumber: {
    fontSize: 72,
    fontWeight: 800,
    color: '#fff',
    lineHeight: 1,
  },
  pricingPer: {
    fontSize: 16,
    color: '#a8a29e',
    marginTop: 40,
    alignSelf: 'flex-end',
  },
  pricingList: {
    listStyle: 'none',
    padding: 0,
    margin: '0 0 32px',
    textAlign: 'left',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  pricingItem: {
    fontSize: 15,
    color: '#e7e5e4',
    display: 'flex',
    gap: 8,
    alignItems: 'flex-start',
  },
  checkmark: {
    color: AMBER,
    fontWeight: 700,
    flexShrink: 0,
  },
  pricingNote: {
    fontSize: 13,
    color: '#78716c',
    marginTop: 16,
  },

  // CTA banner
  ctaBanner: {
    background: `linear-gradient(160deg, ${DARK} 0%, #292524 100%)`,
    padding: '80px 24px',
    textAlign: 'center',
  },
  ctaBannerTitle: {
    fontSize: 'clamp(28px, 4vw, 40px)',
    fontWeight: 800,
    color: '#fff',
    marginBottom: 16,
    letterSpacing: '-0.02em',
  },
  ctaBannerSub: {
    fontSize: 17,
    color: '#a8a29e',
    marginBottom: 40,
  },

  // Footer
  footer: {
    background: '#1c1917',
    borderTop: '1px solid #292524',
    padding: '32px 24px',
  },
  footerInner: {
    maxWidth: 1100,
    margin: '0 auto',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 16,
  },
  footerLinks: {
    display: 'flex',
    gap: 24,
  },
  footerLink: {
    fontSize: 14,
    color: '#78716c',
    textDecoration: 'none',
  },
  footerCopy: {
    fontSize: 13,
    color: '#57534e',
    margin: 0,
  },
};
