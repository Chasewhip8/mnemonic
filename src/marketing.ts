export const marketingPage = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>deja — persistent memory for agents</title>
    <meta
      name="description"
      content="deja is an open source Cloudflare Worker that gives agents durable recall. Store, query, and inject learnings with precision."
    />
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:ital,wght@0,100..800;1,100..800&family=Spectral+SC:ital,wght@0,200;0,300;0,400;0,500;0,600;0,700;0,800;1,200;1,300;1,400;1,500;1,600;1,700;1,800&family=Spectral:ital,wght@0,200;0,300;0,400;0,500;0,600;0,700;0,800;1,200;1,300;1,400;1,500;1,600;1,700;1,800&display=swap" rel="stylesheet">
    <style>
      :root {
        color-scheme: dark;
        --void: #0a0a0a;
        --void-deep: #050505;
        --steel: #1a1a1a;
        --steel-light: #2a2a2a;
        --chrome: #e8e8e8;
        --chrome-dark: #b8b8b8;
        --brass: #c9a961;
        --brass-dark: #9b7e3c;
        --brass-light: #d4bc87;
        
        --bg: #0a0a0a;
        --bg-elevated: #1a1a1a;
        --text: #e8e8e8;
        --muted: #b8b8b8;
        --accent: #c9a961;
        --accent-strong: #d4bc87;
        --border: rgba(201, 169, 97, 0.2);
        --hairline: rgba(201, 169, 97, 0.1);
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        font-family: "Spectral", Georgia, serif;
        font-weight: 400;
        background: var(--void);
        color: var(--text);
        line-height: 1.6;
        letter-spacing: 0.01em;
        position: relative;
      }
      
      body::before {
        content: "";
        position: fixed;
        inset: 0;
        background: 
          repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.02) 2px, rgba(255,255,255,0.02) 4px),
          radial-gradient(circle at 30% 20%, rgba(201, 169, 97, 0.03), transparent 50%),
          radial-gradient(circle at 70% 80%, rgba(232, 232, 232, 0.02), transparent 50%);
        pointer-events: none;
        z-index: 0;
      }

      a {
        color: inherit;
        text-decoration: none;
      }

      .shell {
        max-width: 1160px;
        margin: 0 auto;
        padding: 0 24px 80px;
      }

      header {
        position: sticky;
        top: 0;
        z-index: 10;
        backdrop-filter: blur(14px) saturate(0.8);
        background: rgba(10, 10, 10, 0.92);
        border-bottom: 1px solid var(--hairline);
        box-shadow: 0 1px 0 rgba(201, 169, 97, 0.1);
      }

      .nav {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 16px 24px;
      }

      .logo {
        font-family: "JetBrains Mono", monospace;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.32em;
        font-size: 11px;
      }

      .nav-links {
        display: flex;
        gap: 18px;
        font-size: 13px;
        color: var(--muted);
      }

      .hero {
        padding: 96px 0 72px;
        position: relative;
      }

      .title-card {
        border: 1px solid var(--border);
        background: linear-gradient(135deg, var(--steel-light), var(--steel));
        border-radius: 2px;
        padding: 48px;
        box-shadow: 
          inset 0 1px 0 rgba(201, 169, 97, 0.15),
          0 2px 0 var(--void-deep),
          0 20px 60px rgba(0, 0, 0, 0.8);
        position: relative;
        overflow: hidden;
      }

      .title-card::before {
        content: "";
        position: absolute;
        inset: 0;
        background: 
          linear-gradient(90deg, transparent, rgba(201, 169, 97, 0.03) 50%, transparent),
          repeating-linear-gradient(90deg, transparent, transparent 100px, rgba(201, 169, 97, 0.02) 100px, rgba(201, 169, 97, 0.02) 101px);
        opacity: 1;
        pointer-events: none;
      }

      .title-card-inner {
        position: relative;
        z-index: 1;
      }

      .title {
        font-family: "Spectral SC", serif;
        font-size: clamp(40px, 5vw, 72px);
        font-weight: 700;
        letter-spacing: -0.02em;
        margin: 0 0 12px;
      }

      .title span {
        color: var(--accent);
      }

      .subtitle {
        font-family: "Spectral", serif;
        font-weight: 300;
        font-size: 18px;
        color: var(--muted);
        max-width: 640px;
        margin-bottom: 32px;
      }

      .cta-row {
        display: flex;
        flex-wrap: wrap;
        gap: 16px;
        align-items: center;
      }

      .button {
        font-family: "JetBrains Mono", monospace;
        padding: 14px 24px;
        border-radius: 1px;
        font-weight: 600;
        font-size: 12px;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        border: 1px solid var(--brass-dark);
        background: linear-gradient(180deg, var(--steel-light), var(--steel));
        box-shadow: 
          inset 0 1px 0 rgba(201, 169, 97, 0.3),
          0 2px 0 var(--void-deep),
          0 4px 16px rgba(0, 0, 0, 0.6);
        position: relative;
        transition: transform 0.15s cubic-bezier(0.4, 0, 0.2, 1);
      }
      
      .button:hover {
        transform: translateY(-1px);
        box-shadow: 
          inset 0 1px 0 rgba(201, 169, 97, 0.4),
          0 3px 0 var(--void-deep),
          0 6px 20px rgba(0, 0, 0, 0.7);
      }
      
      .button:active {
        transform: translateY(1px);
        box-shadow: 
          inset 0 1px 0 rgba(201, 169, 97, 0.2),
          0 1px 0 var(--void-deep),
          0 2px 8px rgba(0, 0, 0, 0.5);
      }

      .button.secondary {
        border-color: var(--hairline);
        background: transparent;
        color: var(--chrome-dark);
        box-shadow: inset 0 0 0 1px var(--hairline);
      }
      
      .button.secondary:hover {
        background: rgba(201, 169, 97, 0.05);
        color: var(--brass);
      }

      section {
        margin-top: 72px;
      }

      .section-title {
        font-family: "JetBrains Mono", monospace;
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.3em;
        color: var(--brass);
        margin-bottom: 24px;
      }

      .grid {
        display: grid;
        gap: 24px;
      }

      .grid.two {
        grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      }

      .grid.three {
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      }

      .card {
        background: var(--bg-elevated);
        border: 1px solid var(--hairline);
        border-radius: 1px;
        padding: 24px;
        box-shadow: 
          inset 0 1px 0 rgba(201, 169, 97, 0.08),
          0 2px 0 var(--void-deep),
          0 8px 24px rgba(0, 0, 0, 0.6);
        position: relative;
      }
      
      .card::before {
        content: "";
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: 1px;
        background: linear-gradient(90deg, transparent, var(--brass) 50%, transparent);
        opacity: 0.3;
      }

      .card h3 {
        font-family: "Spectral", serif;
        font-weight: 600;
        margin: 0 0 12px;
        font-size: 20px;
        letter-spacing: 0.01em;
      }

      .card p {
        font-family: "Spectral", serif;
        font-weight: 300;
        color: var(--muted);
        margin: 0 0 16px;
      }

      .card ul {
        font-family: "Spectral", serif;
        font-weight: 300;
        padding-left: 16px;
        margin: 0;
        color: var(--muted);
      }

      .code-block {
        background: var(--void-deep);
        border: 1px solid var(--hairline);
        border-radius: 1px;
        padding: 16px;
        font-family: "JetBrains Mono", monospace;
        font-size: 13px;
        color: var(--chrome-dark);
        overflow-x: auto;
        white-space: pre-wrap;
        box-shadow: 
          inset 0 1px 3px rgba(0, 0, 0, 0.8),
          inset 0 0 0 1px rgba(201, 169, 97, 0.05);
      }

      .progress {
        display: grid;
        gap: 12px;
      }

      .level {
        display: flex;
        align-items: center;
        gap: 16px;
        padding: 14px 20px;
        border-radius: 1px;
        background: var(--steel);
        border: 1px solid var(--hairline);
        box-shadow: 
          inset 0 1px 0 rgba(201, 169, 97, 0.1),
          0 1px 0 var(--void-deep);
        position: relative;
      }
      
      .level::before {
        content: "";
        position: absolute;
        left: 0;
        top: 0;
        bottom: 0;
        width: 2px;
        background: var(--brass);
        box-shadow: 0 0 8px var(--brass);
      }

      .level span {
        font-family: "JetBrains Mono", monospace;
        font-weight: 700;
        font-size: 11px;
        letter-spacing: 0.1em;
        color: var(--brass-light);
      }

      .progress-bar {
        position: relative;
        height: 2px;
        background: var(--steel);
        border-radius: 0;
        overflow: hidden;
        margin-top: 18px;
        box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.5);
      }

      .progress-bar::after {
        content: "";
        position: absolute;
        inset: 0;
        width: 45%;
        background: linear-gradient(90deg, transparent, var(--brass), var(--brass-light));
        box-shadow: 0 0 12px var(--brass);
        animation: glide 6s cubic-bezier(0.4, 0, 0.2, 1) infinite;
      }

      @keyframes glide {
        0%,
        100% {
          transform: translateX(-40%);
        }
        50% {
          transform: translateX(120%);
        }
      }

      .title-moment {
        text-align: center;
        padding: 64px 24px;
        border-radius: 1px;
        background: linear-gradient(180deg, var(--steel-light), var(--steel));
        border: 1px solid var(--border);
        box-shadow: 
          inset 0 1px 0 rgba(201, 169, 97, 0.2),
          inset 0 -1px 0 rgba(0, 0, 0, 0.5),
          0 4px 0 var(--void-deep),
          0 20px 60px rgba(0, 0, 0, 0.8);
        position: relative;
      }
      
      .title-moment::before {
        content: "";
        position: absolute;
        inset: 0;
        border: 1px solid transparent;
        border-image: linear-gradient(180deg, var(--brass) 0%, transparent 50%, var(--brass) 100%) 1;
        opacity: 0.3;
        pointer-events: none;
      }

      .title-moment h2 {
        font-family: "Spectral SC", serif;
        font-weight: 700;
        margin: 0 0 12px;
        font-size: clamp(32px, 4vw, 52px);
      }
      
      .title-moment .cta-row {
        justify-content: center;
      }
      
      .title-moment .subtitle {
        margin: 0 auto 32px;
      }

      footer {
        margin-top: 80px;
        padding-top: 32px;
        border-top: 1px solid var(--hairline);
        color: var(--chrome-dark);
        font-family: "JetBrains Mono", monospace;
        font-size: 11px;
        font-weight: 500;
        letter-spacing: 0.05em;
        display: flex;
        flex-wrap: wrap;
        gap: 12px 24px;
        justify-content: space-between;
      }

      @media (max-width: 720px) {
        .title-card {
          padding: 32px;
        }

        .cta-row {
          flex-direction: column;
          align-items: flex-start;
        }
      }
    </style>
  </head>
  <body>
    <header>
      <div class="nav shell">
        <div class="logo">deja</div>
        <div class="nav-links">
          <a href="https://github.com/acoyfellow/deja" target="_blank" rel="noreferrer">GitHub</a>
          <a href="https://deploy.workers.cloudflare.com/?url=https://github.com/acoyfellow/deja" target="_blank" rel="noreferrer">Deploy</a>
          <a href="https://alchemy.run" target="_blank" rel="noreferrer">Alchemy</a>
        </div>
      </div>
    </header>

    <main class="shell">
      <section class="hero">
        <div class="title-card">
          <div class="title-card-inner">
            <div style="font-family: 'JetBrains Mono', monospace; font-size: 11px; font-weight: 700; letter-spacing: 0.2em; text-transform: uppercase; color: var(--brass); margin-bottom: 16px;">Persistent memory for agents</div>
            <h1 class="title">deja, the <span>durable recall</span> layer for Cloudflare Workers.</h1>
            <p class="subtitle">
              Open source memory that outlives a single run. Deja captures what mattered, stores it in your Cloudflare
              account, and feeds it back when agents level up. Precision you can audit. Progress you can feel.
            </p>
            <div class="cta-row">
              <a class="button" href="https://deploy.workers.cloudflare.com/?url=https://github.com/acoyfellow/deja" target="_blank" rel="noreferrer">
                Deploy to Cloudflare
              </a>
              <a class="button secondary" href="https://github.com/acoyfellow/deja#usage" target="_blank" rel="noreferrer">
                Read the API
              </a>
            </div>
          </div>
        </div>
      </section>

      <section>
        <div class="section-title">Two perspectives</div>
        <div class="grid two">
          <div class="card">
            <h3>"Hey agent — install deja. What do you think?"</h3>
            <p>Agents want frictionless memory. Deja gives you a single endpoint to learn, inject, and query.</p>
            <div class="code-block">
              curl -X POST $DEJA_URL/learn
              -H "Authorization: Bearer $API_KEY"
              -H "Content-Type: application/json"
              -d '{"trigger":"deploying","learning":"run wrangler deploy --dry-run","confidence":0.9}'
            </div>
            <ul>
              <li>Post-run recall only — no hidden context.</li>
              <li>Scoped memories by agent, session, or shared.</li>
              <li>Vector search tuned for relevance, not noise.</li>
            </ul>
          </div>
          <div class="card">
            <h3>"I'm a human. I want deja on my Cloudflare account."</h3>
            <p>Humans need ownership. Deja deploys into your account with clear rails and auditable storage.</p>
            <div class="code-block">
              npm install -g wrangler
              wrangler login
              wrangler vectorize create deja-embeddings --dimensions 384 --metric cosine
              wrangler secret put API_KEY
              wrangler deploy
            </div>
            <ul>
              <li>Cloudflare Worker + Durable Objects + Vectorize.</li>
              <li>One worker per user, isolation by architecture.</li>
              <li>Bring your own secrets, revoke at will.</li>
            </ul>
          </div>
        </div>
      </section>

      <section>
        <div class="section-title">Use cases</div>
        <div class="grid three">
          <div class="card">
            <h3>Incident response</h3>
            <p>Capture the postmortem as learnings, inject them before the next on-call handoff.</p>
          </div>
          <div class="card">
            <h3>Agent onboarding</h3>
            <p>Give fresh agents the muscle memory of your best runs without flooding them with logs.</p>
          </div>
          <div class="card">
            <h3>Long-running workflows</h3>
            <p>Stitch multi-day work into a single arc. Deja remembers outcomes, not noise.</p>
          </div>
          <div class="card">
            <h3>Tool reliability</h3>
            <p>Teach agents the traps: flaky endpoints, brittle migrations, and safe retries.</p>
          </div>
          <div class="card">
            <h3>Ops playbooks</h3>
            <p>Store the short form. Inject it when the runbook needs to be alive.</p>
          </div>
          <div class="card">
            <h3>Product memory</h3>
            <p>Let agents remember the why, not just the what. Keep decisions tethered.</p>
          </div>
        </div>
      </section>

      <section>
        <div class="section-title">Progress feels like leveling up</div>
        <div class="card">
          <div class="progress">
            <div class="level"><span>Level 01</span> Boot sequence: capture the run.</div>
            <div class="level"><span>Level 02</span> Sync: store what mattered, discard the rest.</div>
            <div class="level"><span>Level 03</span> Inject: unlock recall before the next mission.</div>
          </div>
          <div class="progress-bar"></div>
        </div>
      </section>

      <section>
        <div class="section-title">Stack + deployment story</div>
        <div class="grid two">
          <div class="card">
            <h3>Built for Cloudflare</h3>
            <p>Workers for latency, Durable Objects for isolation, Vectorize + Workers AI for recall.</p>
            <ul>
              <li>Hono for routing.</li>
              <li>Drizzle + SQLite for auditability.</li>
              <li>Runs entirely inside your account.</li>
            </ul>
          </div>
          <div class="card">
            <h3>Deploy like it’s 2026</h3>
            <p>Use Wrangler for control, or ship it with Alchemy when you want a modern workflow.</p>
            <div class="code-block">
              npm install -g wrangler
              wrangler deploy
              # or push with Alchemy
              alchemy deploy
            </div>
            <p class="subtitle" style="margin:12px 0 0;">Completion should feel like unlocking something, not finishing a task.</p>
          </div>
        </div>
      </section>

      <section class="title-moment">
        <h2>Unlock durable recall.</h2>
        <p class="subtitle">
          The peak moment is a title card: a new run begins, and everything it needs is already waiting.
        </p>
        <div class="cta-row">
          <a class="button" href="https://deploy.workers.cloudflare.com/?url=https://github.com/acoyfellow/deja" target="_blank" rel="noreferrer">
            Level up with deja
          </a>
        </div>
      </section>

      <footer>
        <div>Open source. MIT licensed. Built for Cloudflare Workers.</div>
      </footer>
    </main>
  </body>
</html>`;
