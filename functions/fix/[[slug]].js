/**
 * Cloudflare Pages catch-all function for /fix/[slug] programmatic SEO routes.
 *
 * URL formats supported:
 *   /fix/2015-honda-civic-brake-pads
 *   /fix/whirlpool-washer-ul-error
 *   /fix/ge-dishwasher-not-draining
 *   /fix/samsung-dryer-he-error
 *
 * The function server-renders a complete, SEO-optimized HTML page with:
 *  - Canonical URL, Open Graph, Twitter Card, JSON-LD structured data
 *  - Pre-calculated difficulty, estimated time, and common tools from slug heuristics
 *  - A pre-populated search prompt that the client-side app can auto-execute
 *  - Related guide links for internal linking / crawlability
 */

// ── SLUG PARSER ──────────────────────────────────────────────────────────────

const KNOWN_MAKES = new Set([
    'honda','toyota','ford','chevy','chevrolet','gmc','dodge','jeep','nissan',
    'subaru','hyundai','kia','mazda','bmw','mercedes','audi','volkswagen','vw',
    'lexus','acura','infiniti','volvo','ram','chrysler','buick','cadillac',
    'lincoln','tesla','mitsubishi','fiat','alfa','mini','porsche','genesis',
]);

const KNOWN_APPLIANCES = new Set([
    'whirlpool','samsung','lg','ge','maytag','kenmore','frigidaire','bosch',
    'kitchenaid','amana','electrolux','miele','speed-queen','roper','hotpoint',
    'haier','danby','insignia','fisher-paykel','bertazzoni',
]);

const APPLIANCE_TYPES = new Set([
    'washer','dryer','dishwasher','fridge','refrigerator','oven','range',
    'microwave','freezer','ice-maker','garbage-disposal','disposal',
    'water-heater','hvac','furnace','ac','air-conditioner','heat-pump',
    'stove','cooktop','hood','vent',
]);

const TOOL_MAP = {
    'brake':        ['Floor Jack & Jack Stands','Socket Set (14–19mm)','C-Clamp','Torque Wrench','Brake Cleaner','Wire Brush'],
    'rotor':        ['Floor Jack & Jack Stands','Socket Set','Slide Hammer','Torque Wrench','Brake Cleaner'],
    'oil':          ['Oil Drain Pan','Oil Filter Wrench','Funnel','Ratchet & Socket Set'],
    'spark-plug':   ['Spark Plug Socket (5/8")','Ratchet & Extension','Torque Wrench','Feeler Gauge'],
    'alternator':   ['Socket Set','Serpentine Belt Tool','Multimeter','Floor Jack'],
    'tie-rod':      ['Tie Rod End Puller','Socket Set','Torque Wrench','Alignment Gauge'],
    'coolant':      ['Drain Pan','Funnel','Pliers','Radiator Hose Tool'],
    'transmission': ['Drain Pan','Torque Wrench','Filter Puller','Transmission Jack'],
    'washer':       ['Multimeter','Nut Driver Set','Pliers','Putty Knife'],
    'dryer':        ['Multimeter','Nut Driver','Putty Knife','Vacuum'],
    'dishwasher':   ['Multimeter','Nut Driver Set','Pliers','Bucket'],
    'fridge':       ['Multimeter','Nut Driver','Condenser Brush','Putty Knife'],
    'oven':         ['Multimeter','Nut Driver Set','Pliers','Wire Stripper'],
    'faucet':       ['Adjustable Wrench','Pipe Wrench','Teflon Tape','Basin Wrench'],
    'toilet':       ['Adjustable Wrench','Sponge & Bucket','Wax Ring Tool','Pliers'],
    'default':      ['Ratchet & Socket Set','Flathead Screwdriver','Phillips Screwdriver','Needle-Nose Pliers','Safety Gloves'],
};

/**
 * @param {string[]} parts - Slug segments split on '-'
 * @returns {{ difficulty: string, estimatedTime: string, category: string, tools: string[] }}
 */
function deriveMetadata(parts) {
    const text = parts.join(' ').toLowerCase();

    // Difficulty heuristics
    let difficulty = 'Medium';
    let estimatedTime = '1–2 Hours';
    let category = 'General Repair';

    if (/error|code|reset|bulb|filter|wiper|battery|fuse|sensor/i.test(text)) {
        difficulty = 'Easy'; estimatedTime = '15–60 Minutes';
    } else if (/transmission|head.gasket|engine|timing.belt|differential|evaporator|cvt/i.test(text)) {
        difficulty = 'Hard'; estimatedTime = '4–8+ Hours';
    }

    if (parts.some(p => KNOWN_MAKES.has(p))) category = 'Auto Repair';
    if (parts.some(p => KNOWN_APPLIANCES.has(p))) category = 'Appliance Repair';
    if (/faucet|toilet|pipe|sink|plumb/i.test(text)) category = 'Home Plumbing';
    if (/hvac|furnace|ac|heat/i.test(text)) category = 'HVAC Repair';

    // Tool selection
    let tools = TOOL_MAP['default'];
    for (const [key, list] of Object.entries(TOOL_MAP)) {
        if (key !== 'default' && text.includes(key.replace('-', ' '))) {
            tools = list;
            break;
        }
    }

    return { difficulty, estimatedTime, category, tools };
}

/**
 * Convert a slug string to a human-readable title.
 * e.g. "2015-honda-civic-brake-pads" → "2015 Honda Civic Brake Pads"
 * @param {string} slug
 * @returns {string}
 */
function slugToTitle(slug) {
    return slug
        .split('-')
        .map(word => {
            // Keep pure numbers (years) as-is; capitalize others
            if (/^\d+$/.test(word)) return word;
            // Keep short error codes as uppercase
            if (word.length <= 3 && /[a-z]\d|[ef]\d{2}/i.test(word)) return word.toUpperCase();
            return word.charAt(0).toUpperCase() + word.slice(1);
        })
        .join(' ');
}

/**
 * Build the auto-fill prompt from the slug.
 * e.g. "2015-honda-civic-brake-pads" → "2015 Honda Civic replace brake pads"
 */
function slugToPrompt(slug) {
    const title = slugToTitle(slug);
    // If it looks like an error code slug, phrase it as a fix
    if (/error|code|[ef]\d{2,}/i.test(slug)) return `Fix ${title}`;
    return title;
}

// ── RELATED GUIDES ───────────────────────────────────────────────────────────

const RELATED_GUIDE_POOL = [
    { slug: '2015-honda-civic-brake-pads',    label: 'Honda Civic Brakes' },
    { slug: 'whirlpool-washer-ul-error',       label: 'Whirlpool Washer uL' },
    { slug: 'ford-f150-spark-plugs',           label: 'F-150 Spark Plugs' },
    { slug: 'samsung-dryer-he-error',          label: 'Samsung Dryer HE' },
    { slug: 'toyota-camry-p0420',              label: 'Camry P0420' },
    { slug: 'lg-washer-oe-error',              label: 'LG Washer OE' },
    { slug: 'honda-civic-alternator-replacement', label: 'Civic Alternator' },
    { slug: 'bosch-dishwasher-e24-error',      label: 'Bosch Dishwasher E24' },
    { slug: 'toyota-rav4-check-engine-vsc-4wd', label: 'RAV4 VSC Light' },
    { slug: 'ge-profile-fridge-not-freezing',  label: 'GE Fridge Not Freezing' },
    { slug: 'jeep-wrangler-death-wobble',      label: 'Jeep Death Wobble' },
    { slug: 'ford-f250-6-0-diesel-hard-start', label: 'F250 6.0 Diesel' },
];

// ── HTML RENDERER ────────────────────────────────────────────────────────────

/**
 * Render the full SSR HTML page for a /fix/[slug] route.
 * @param {string} slug
 * @returns {string} Complete HTML document string
 */
function renderFixPage(slug) {
    const title       = slugToTitle(slug);
    const prompt      = slugToPrompt(slug);
    const meta        = deriveMetadata(slug.split('-'));
    const encodedPrompt = encodeURIComponent(prompt);
    const canonical   = `https://www.omnivibe.app/fix/${slug}`;

    const toolsHtml = meta.tools
        .map(t => `<span class="fix-tool-chip">${t}</span>`)
        .join('\n                    ');

    const relatedHtml = RELATED_GUIDE_POOL
        .filter(r => r.slug !== slug)
        .slice(0, 8)
        .map(r => `<a href="/fix/${r.slug}" class="fix-related-link">${r.label}</a>`)
        .join('\n            ');

    const difficultyColor = {
        Easy:   '#065f46',
        Medium: '#92400e',
        Hard:   '#991b1b',
    }[meta.difficulty] || '#374151';

    const difficultyBg = {
        Easy:   '#d1fae5',
        Medium: '#fef3c7',
        Hard:   '#fee2e2',
    }[meta.difficulty] || '#f3f4f6';

    const jsonLd = JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'HowTo',
        'name': `How to Fix: ${title}`,
        'description': `Step-by-step repair guide for ${title}. Includes difficulty rating, required tools, parts list, and curated video tutorials.`,
        'url': canonical,
        'tool': meta.tools.map(t => ({ '@type': 'HowToTool', 'name': t })),
        'estimatedCost': { '@type': 'MonetaryAmount', 'currency': 'USD', 'value': '0' },
        'provider': { '@type': 'Organization', 'name': 'Omnivibe Guide', 'url': 'https://www.omnivibe.app' },
    });

    const breadcrumbLd = JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        'itemListElement': [
            { '@type': 'ListItem', 'position': 1, 'name': 'Omnivibe Guide', 'item': 'https://www.omnivibe.app' },
            { '@type': 'ListItem', 'position': 2, 'name': 'Repair Guides', 'item': 'https://www.omnivibe.app/fix/' },
            { '@type': 'ListItem', 'position': 3, 'name': title, 'item': canonical },
        ],
    });

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">

    <!-- Primary SEO -->
    <title>How to Fix: ${title} | Omnivibe Guide DIY Repair</title>
    <meta name="description" content="Complete DIY repair guide for ${title}. Difficulty: ${meta.difficulty}. Est. time: ${meta.estimatedTime}. Includes tools list, step-by-step instructions, and curated video tutorials.">
    <meta name="keywords" content="${title}, how to fix ${title}, ${meta.category}, repair guide, DIY, Omnivibe Guide">
    <meta name="robots" content="index, follow">
    <link rel="canonical" href="${canonical}">
    <meta name="theme-color" content="#0F172A">

    <!-- Open Graph -->
    <meta property="og:type" content="article">
    <meta property="og:site_name" content="Omnivibe Guide">
    <meta property="og:url" content="${canonical}">
    <meta property="og:title" content="How to Fix: ${title}">
    <meta property="og:description" content="${meta.difficulty} difficulty · ${meta.estimatedTime} · Complete tool list and step-by-step instructions generated by AI.">
    <meta property="og:image" content="https://www.omnivibe.app/og-image.png">
    <meta property="og:locale" content="en_US">

    <!-- Twitter Card -->
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="How to Fix: ${title} | Omnivibe Guide">
    <meta name="twitter:description" content="${meta.difficulty} difficulty · ${meta.estimatedTime}. Get the full AI-generated guide for free.">
    <meta name="twitter:image" content="https://www.omnivibe.app/og-image.png">

    <!-- Structured Data -->
    <script type="application/ld+json">${jsonLd}</script>
    <script type="application/ld+json">${breadcrumbLd}</script>

    <!-- Favicon -->
    <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🔧</text></svg>">

    <!-- Fonts & Icons -->
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,600;1,400&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="/index.css">
    <script src="https://cdn.jsdelivr.net/npm/lucide@0.344.0/dist/umd/lucide.min.js" defer></script>
    <!-- AdSense -->
    <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-4763238667156624" crossorigin="anonymous"></script>
</head>
<body>
    <!-- Toast container for auth/post-purchase notifications -->
    <div id="toast-container" aria-live="polite" aria-atomic="false"></div>

    <!-- Nav (client-hydrated) -->
    <header class="nav-header" role="banner">
        <div class="container nav-container">
            <a href="/" class="wordmark" style="text-decoration:none;">Omnivibe Guide.</a>
            <div class="nav-skeleton" id="nav-skeleton" aria-hidden="true">
                <div class="nav-skeleton-pill"></div>
                <div class="nav-skeleton-pill"></div>
                <div class="nav-skeleton-pill"></div>
            </div>
            <nav class="nav-controls" id="nav-logged-out" style="display:none;" aria-label="Main navigation">
                <a href="/error-decoder" class="btn ghost small" style="text-decoration:none;">
                    <i data-lucide="search" style="width:16px;height:16px;margin-right:4px;vertical-align:middle;"></i>Free Error Decoder
                </a>
                <span id="free-run-badge" class="free-run-badge" style="display:none;" aria-label="1 free run available">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg>
                    1 Free Run Available
                </span>
                <button class="btn ghost" onclick="OmniGuideApp.showAuthModal('login')">Sign In</button>
                <button class="btn primary" onclick="OmniGuideApp.showAuthModal('register')">Get Started Free</button>
            </nav>
            <div class="nav-controls" id="nav-logged-in" style="display:none;" aria-label="User navigation">
                <div class="credit-pill" id="credit-display" aria-label="Credits remaining">
                    <i data-lucide="zap" aria-hidden="true"></i>
                    <span id="credit-count">—</span> Runs Left
                </div>
                <button class="btn outline small" id="btn-buy-credits" onclick="OmniGuideApp.buyCredits()">Buy Credits</button>
                <div class="dropdown">
                    <button class="btn ghost small icon-only" id="btn-user-menu" onclick="OmniGuideApp.toggleDropdown()" aria-label="User menu" aria-expanded="false">
                        <i data-lucide="user" aria-hidden="true"></i>
                    </button>
                    <div class="dropdown-menu" id="user-menu" style="display:none;" role="menu">
                        <p id="user-email-display" class="muted small" role="menuitem"></p>
                        <hr>
                        <button class="menu-item text-danger" onclick="OmniGuideApp.logout()" role="menuitem">Sign Out</button>
                    </div>
                </div>
            </div>
        </div>
    </header>

    <main class="container" style="padding-top:3rem;padding-bottom:5rem;max-width:860px;">
        <!-- Breadcrumb -->
        <nav class="fix-breadcrumb" aria-label="Breadcrumb">
            <a href="/">Omnivibe Guide</a>
            <span aria-hidden="true">›</span>
            <a href="/">Repair Guides</a>
            <span aria-hidden="true">›</span>
            <span aria-current="page">${title}</span>
        </nav>

        <!-- Page Header -->
        <h1 style="font-family:'Playfair Display',Georgia,serif;font-size:clamp(1.75rem,4vw,2.6rem);line-height:1.15;margin-bottom:0.5rem;">${title}</h1>

        <div class="fix-meta-row">
            <span class="tag"><i data-lucide="gauge" aria-hidden="true" style="width:14px;height:14px;"></i> Difficulty:
                <strong style="color:${difficultyColor};background:${difficultyBg};padding:0.1rem 0.4rem;border-radius:4px;margin-left:3px;">${meta.difficulty}</strong>
            </span>
            <span class="tag"><i data-lucide="clock" aria-hidden="true" style="width:14px;height:14px;"></i> Est. Time: <strong>${meta.estimatedTime}</strong></span>
            <span class="tag"><i data-lucide="tag" aria-hidden="true" style="width:14px;height:14px;"></i> ${meta.category}</span>
        </div>

        <!-- Stats Grid -->
        <div class="fix-stats-grid">
            <div class="fix-stat-card">
                <span class="fix-stat-label">Difficulty</span>
                <span class="fix-stat-value">${meta.difficulty}</span>
            </div>
            <div class="fix-stat-card">
                <span class="fix-stat-label">Est. Time</span>
                <span class="fix-stat-value">${meta.estimatedTime}</span>
            </div>
            <div class="fix-stat-card">
                <span class="fix-stat-label">Guide Type</span>
                <span class="fix-stat-value">${meta.category}</span>
            </div>
            <div class="fix-stat-card">
                <span class="fix-stat-label">Video Tutorials</span>
                <span class="fix-stat-value">Included</span>
            </div>
        </div>

        <!-- Tools Preview -->
        <div class="fix-tools-preview">
            <h3>🔧 Common Tools Required</h3>
            <div class="fix-tools-list">
                ${toolsHtml}
            </div>
        </div>

        <!-- What You'll Learn -->
        <div class="glass-card" style="margin-bottom:2rem;">
            <h2 style="font-family:'Playfair Display',Georgia,serif;font-size:1.35rem;margin-bottom:1rem;">What You'll Learn</h2>
            <ul style="list-style:none;padding:0;display:flex;flex-direction:column;gap:0.65rem;">
                <li style="display:flex;align-items:flex-start;gap:0.6rem;font-size:0.95rem;">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#15803D" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;margin-top:2px;" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg>
                    The exact root causes behind <strong>${title}</strong>
                </li>
                <li style="display:flex;align-items:flex-start;gap:0.6rem;font-size:0.95rem;">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#15803D" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;margin-top:2px;" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg>
                    A complete, step-by-step repair procedure with safety checkpoints
                </li>
                <li style="display:flex;align-items:flex-start;gap:0.6rem;font-size:0.95rem;">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#15803D" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;margin-top:2px;" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg>
                    Exact tools and parts with shopping links to get the best price
                </li>
                <li style="display:flex;align-items:flex-start;gap:0.6rem;font-size:0.95rem;">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#15803D" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;margin-top:2px;" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg>
                    Curated YouTube video tutorials matched to your exact task
                </li>
            </ul>
        </div>

        <!-- Generate CTA -->
        <div class="fix-generate-cta">
            <h2>Generate Your Complete Repair Guide — Free</h2>
            <p>AI-powered, personalized to your exact make, model, and error code. No credit card required for your first guide.</p>
            <div class="fix-cta-search">
                <input type="text" id="fix-prompt-input" value="${prompt.replace(/"/g, '&quot;')}" aria-label="Repair task description" autocomplete="off">
                <button class="btn primary" onclick="OmniGuideApp.fixPageGenerate()" style="white-space:nowrap;">
                    <i data-lucide="sparkles" aria-hidden="true"></i> Generate Free Guide
                </button>
            </div>
        </div>

        <!-- Loading / Results from main app -->
        <div id="loading-state" class="state-container" style="display:none;" role="status" aria-live="polite">
            <i data-lucide="loader-2" class="spin icon-large text-accent" aria-hidden="true"></i>
            <h3>Analyzing task and curating videos…</h3>
            <p class="stage-text muted">This usually takes 10–20 seconds.</p>
        </div>
        <div id="error-state" class="alert error" style="display:none;" role="alert" aria-live="assertive"></div>

        <section id="results-section" style="display:none;" aria-labelledby="res-title">
            <div class="results-header">
                <h2 id="res-title"></h2>
                <div class="meta-tags">
                    <span class="tag"><i data-lucide="gauge" aria-hidden="true"></i> Difficulty: <span id="res-diff"></span></span>
                    <span class="tag"><i data-lucide="clock" aria-hidden="true"></i> Est. Time: <span id="res-time"></span></span>
                </div>
            </div>
            <div class="results-grid">
                <div class="main-column">
                    <div class="glass-card">
                        <h3 class="card-title"><i data-lucide="youtube" aria-hidden="true"></i> Tutorial Videos</h3>
                        <div id="res-videos" class="video-grid"></div>
                    </div>
                    <div class="glass-card" id="diagram-card" style="display:none;">
                        <h3 class="card-title"><i data-lucide="image" aria-hidden="true"></i> Parts Diagram</h3>
                        <div id="res-diagram" class="diagram-container"></div>
                    </div>
                    <div class="glass-card">
                        <h3 class="card-title"><i data-lucide="list-ordered" aria-hidden="true"></i> Step-by-Step Instructions</h3>
                        <ol id="res-steps" class="steps-list"></ol>
                    </div>
                </div>
                <div class="side-column">
                    <div class="glass-card">
                        <h3 class="card-title"><i data-lucide="hammer" aria-hidden="true"></i> Tools Checklist</h3>
                        <ul id="res-tools" class="checklist"></ul>
                    </div>
                    <div class="glass-card">
                        <h3 class="card-title"><i data-lucide="shopping-cart" aria-hidden="true"></i> Parts Required</h3>
                        <ul id="res-parts" class="checklist"></ul>
                    </div>
                </div>
            </div>
        </section>

        <!-- Teaser sheet for unauth users -->
        <div id="teaser-sheet" role="region" aria-label="Unlock your full guide">
            <div class="teaser-sheet-inner">
                <div class="teaser-sheet-eyebrow">⚡ Almost there</div>
                <h3>You are one click away from your custom guide.</h3>
                <p>Create your free account to instantly unlock the step-by-step instructions and curated video tutorials — no credit card required.</p>
                <div class="teaser-actions">
                    <button class="btn primary large" onclick="OmniGuideApp.unlockFromTeaser('register')">
                        <i data-lucide="user-plus" aria-hidden="true"></i> Create Free Account
                    </button>
                    <button class="btn outline" onclick="OmniGuideApp.unlockFromTeaser('login')">Sign In</button>
                </div>
                <p class="teaser-trust">🔒 No credit card required &nbsp;·&nbsp; First guide is always free</p>
            </div>
        </div>

        <!-- FAQ -->
        <div class="fix-faq">
            <h2 style="font-family:'Playfair Display',Georgia,serif;font-size:1.75rem;margin-bottom:1.5rem;">Frequently Asked Questions</h2>
            <div class="faq-accordion">
                <details class="faq-item">
                    <summary class="faq-question">How accurate is the AI-generated guide for ${title}?</summary>
                    <div class="faq-answer">
                        <p>Omnivibe Guide uses Gemini AI trained on vast repair and technical documentation databases. The guides are tailored to your specific make, model, and error code. For critical safety repairs (brakes, suspension, airbags), we always recommend consulting a certified mechanic as a final verification step.</p>
                    </div>
                </details>
                <details class="faq-item">
                    <summary class="faq-question">Is the guide really free?</summary>
                    <div class="faq-answer">
                        <p>Yes — your first complete guide generation is 100% free with no credit card required. Simply create an account and generate. Additional guides are available in packs of 25 for a one-time \$5.00 payment.</p>
                    </div>
                </details>
                <details class="faq-item">
                    <summary class="faq-question">What does the guide include?</summary>
                    <div class="faq-answer">
                        <p>Each guide includes: a difficulty rating and estimated time, a complete tools checklist with shopping links (Amazon, AutoZone, RockAuto, Harbor Freight), a parts list with best-price links, 8–15 detailed step-by-step instructions, and up to 6 curated YouTube tutorial videos matched to your exact task.</p>
                    </div>
                </details>
                <details class="faq-item">
                    <summary class="faq-question">Can I save my guide and come back to it?</summary>
                    <div class="faq-answer">
                        <p>Yes. Guides are automatically saved to your account when you generate them. Your tool and step completion progress is preserved in your browser session so you won't lose your place even if the page refreshes.</p>
                    </div>
                </details>
            </div>
        </div>

        <!-- Related Guides -->
        <div class="fix-footer-nav">
            <h3>Related Repair Guides</h3>
            <div class="fix-related-links">
                ${relatedHtml}
            </div>
        </div>
    </main>

    <!-- Auth Modal -->
    <div id="auth-modal" class="modal-overlay" style="display:none;" role="dialog" aria-modal="true" aria-labelledby="auth-title">
        <div class="modal">
            <div class="modal-header">
                <h3 id="auth-title">Sign in to Omnivibe Guide</h3>
                <button class="close-btn" onclick="OmniGuideApp.closeModals()" aria-label="Close dialog">
                    <i data-lucide="x" aria-hidden="true"></i>
                </button>
            </div>
            <div class="modal-body" id="auth-login-form">
                <div class="input-group">
                    <label for="login-email">Email Address</label>
                    <input type="email" id="login-email" name="email" placeholder="you@example.com" autocomplete="email">
                </div>
                <div class="input-group">
                    <label for="login-password">Password</label>
                    <input type="password" id="login-password" name="password" placeholder="••••••••" autocomplete="current-password">
                </div>
                <button class="btn primary full-width" id="btn-login" onclick="OmniGuideApp.login()">Sign In</button>
                <div id="login-error" class="text-danger small mt-2" role="alert" aria-live="polite"></div>
                <p class="small text-center mt-4">Don't have an account? <a href="#" onclick="OmniGuideApp.showAuthModal('register'); return false;">Create one free</a></p>
            </div>
            <div class="modal-body" id="auth-register-form" style="display:none;">
                <p class="muted">Create an account to claim your free guide run. No credit card needed.</p>
                <div class="input-group">
                    <label for="register-email">Email Address</label>
                    <input type="email" id="register-email" name="email" placeholder="you@example.com" autocomplete="email">
                </div>
                <div class="input-group">
                    <label for="register-password">Password</label>
                    <input type="password" id="register-password" name="password" placeholder="At least 6 characters" autocomplete="new-password">
                </div>
                <button class="btn primary full-width" id="btn-register" onclick="OmniGuideApp.register()">Create Account — It's Free</button>
                <div id="register-error" class="text-danger small mt-2" role="alert" aria-live="polite"></div>
                <p class="small text-center mt-4">Already have an account? <a href="#" onclick="OmniGuideApp.showAuthModal('login'); return false;">Sign in</a></p>
            </div>
        </div>
    </div>

    <!-- Buy Credits Modal -->
    <div id="billing-modal" class="modal-overlay" style="display:none;" role="dialog" aria-modal="true" aria-labelledby="billing-title">
        <div class="modal">
            <div class="modal-header">
                <h3 id="billing-title">Purchase Runs</h3>
                <button class="close-btn" onclick="OmniGuideApp.closeModals()" aria-label="Close dialog">
                    <i data-lucide="x" aria-hidden="true"></i>
                </button>
            </div>
            <div class="modal-body text-center">
                <h2 class="price">$5.00</h2>
                <p class="muted">Get 25 additional course generations.</p>
                <ul class="feature-list">
                    <li><i data-lucide="check" class="text-success" aria-hidden="true"></i> Instant delivery to your account</li>
                    <li><i data-lucide="check" class="text-success" aria-hidden="true"></i> Credits never expire</li>
                    <li><i data-lucide="check" class="text-success" aria-hidden="true"></i> Full video embedding</li>
                    <li><i data-lucide="check" class="text-success" aria-hidden="true"></i> Amazon parts &amp; tools links</li>
                </ul>
                <a href="https://buy.stripe.com/dRmfZj3VRbAI2LXgRB08g0l" target="_blank" rel="noopener noreferrer" class="btn primary full-width mt-4" id="btn-stripe-checkout">
                    <i data-lucide="credit-card" aria-hidden="true"></i> Checkout with Stripe
                </a>
                <p class="small muted mt-2">Secure payment via Stripe. Keep this tab open — credits appear automatically.</p>
            </div>
        </div>
    </div>

    <script src="/app.js"></script>
    <script>
        // Override generate() on fix pages to read from the fix-specific input
        document.addEventListener('DOMContentLoaded', () => {
            const origInit = OmniGuideApp.init.bind(OmniGuideApp);
            OmniGuideApp.init = async function() {
                await origInit();
                // Don't auto-populate from ?prompt= on fix pages — already pre-filled
            };

            // fixPageGenerate: reads from the /fix/ page CTA input
            OmniGuideApp.fixPageGenerate = function() {
                const input = document.getElementById('fix-prompt-input');
                const mainInput = document.getElementById('prompt-input');
                if (input) {
                    const val = input.value.trim();
                    if (mainInput) mainInput.value = val;
                    // Temporarily set state.currentPrompt
                    OmniGuideApp.state.currentPrompt = val;
                    // Override prompt-input reading in generate()
                    const fakeInput = document.getElementById('prompt-input');
                    if (!fakeInput) {
                        // Inject a hidden real prompt-input if this page doesn't have one
                        const hidden = document.createElement('input');
                        hidden.type = 'hidden';
                        hidden.id = 'prompt-input';
                        hidden.value = val;
                        document.body.appendChild(hidden);
                    } else {
                        fakeInput.value = val;
                    }
                }
                Omnivibe GuideApp.generate();
            };

            if (typeof lucide !== 'undefined') lucide.createIcons();
        });
    </script>
</body>
</html>`;
}

// ── CLOUDFLARE PAGES FUNCTION HANDLER ───────────────────────────────────────

export async function onRequest(context) {
    const url = new URL(context.request.url);

    // Extract slug from /fix/some-slug-here
    const pathParts = url.pathname.replace(/^\/fix\/?/, '').split('/').filter(Boolean);
    const slug = pathParts.join('-').toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');

    if (!slug) {
        // /fix/ with no slug — redirect to home
        return Response.redirect('https://www.omnivibe.app/', 301);
    }

    const html = renderFixPage(slug);

    return new Response(html, {
        status: 200,
        headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
            'X-Robots-Tag': 'index, follow',
        },
    });
}
