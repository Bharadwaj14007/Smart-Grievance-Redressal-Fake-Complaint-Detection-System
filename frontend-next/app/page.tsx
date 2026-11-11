import Link from 'next/link'

export default function HomePage() {
  return (
    <main className="landing">
      <header className="topbar landing-bar">
        <Link className="brand" href="/"><span className="brand-mark">NS</span><span>Nagrik Setu<small>Grievance redressal</small></span></Link>
        <div className="button-row"><Link className="button button-quiet" href="/login">Sign in</Link><Link className="button button-primary" href="/register">Create account</Link></div>
      </header>
      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow">A clearer path to resolution</span>
          <h1>Your voice matters.<br /><em>Let’s get it heard.</em></h1>
          <p>Report a civic issue, follow every update, and stay connected with the team working toward a resolution.</p>
          <div className="button-row"><Link className="button button-primary button-large" href="/register">Raise a grievance <span aria-hidden="true">→</span></Link><Link className="text-link" href="/login">Already have an account?</Link></div>
          <div className="trust-line"><span className="trust-dot" />Private by design <span>·</span> Trackable at every step</div>
        </div>
        <div className="hero-card" aria-label="Example grievance status">
          <div className="card-overline">YOUR GRIEVANCE</div>
          <div className="hero-card-title">Streetlight outage</div>
          <div className="tracking-id">GRV-2026-001284</div>
          <div className="progress-list">
            <div className="progress-item complete"><span>✓</span><div><strong>Submitted</strong><small>Today, 9:42 AM</small></div></div>
            <div className="progress-item complete"><span>✓</span><div><strong>Assigned to the right team</strong><small>Today, 10:15 AM</small></div></div>
            <div className="progress-item current"><span>3</span><div><strong>Under investigation</strong><small>Your officer is reviewing the issue</small></div></div>
            <div className="progress-item pending"><span>4</span><div><strong>Resolution</strong><small>We’ll notify you when there’s an update</small></div></div>
          </div>
          <div className="card-foot"><span className="status-pill status-blue">In progress</span><span>Updates are sent to your inbox</span></div>
        </div>
      </section>
      <section className="feature-strip">
        <div><b>01</b><strong>Tell us what happened</strong><span>Share the details and location so your report reaches the right department.</span></div>
        <div><b>02</b><strong>Follow your case</strong><span>See updates, notes, and investigation progress in one secure place.</span></div>
        <div><b>03</b><strong>Get to resolution</strong><span>Stay informed from submission through the final response.</span></div>
      </section>
      <footer className="landing-footer">Nagrik Setu <span>·</span> Built for stronger communities.</footer>
    </main>
  )
}
