// ============================================================
//  OmniGuide App — Production Client
//  Components: Auth, Nav, Generate, Teaser, Checklist, Toast
// ============================================================

/** @type {string} Amazon Associates tag — replace with your real tag */
const AMAZON_AFFILIATE_TAG = 'omniguide-20';

// ── UTILITY: Escape HTML ─────────────────────────────────────
function esc(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// ── UTILITY: Amazon Affiliate Link ───────────────────────────
/**
 * Generate an Amazon search URL with affiliate tracking.
 * @param {string} itemName - The specific item (e.g. "Front Brake Pads")
 * @param {string} projectContext - The user's task context (e.g. "2015 Honda Civic")
 * @returns {string} Fully qualified affiliate Amazon search URL
 */
function generateAffiliateLink(itemName, projectContext) {
    const compound = projectContext
        ? `${projectContext} ${itemName}`.trim()
        : itemName.trim();
    const encoded = encodeURIComponent(compound);
    return `https://www.amazon.com/s?k=${encoded}&tag=${AMAZON_AFFILIATE_TAG}`;
}

// ── UTILITY: Toast Notifications ────────────────────────────
const TOAST_ICONS = {
    success: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`,
    error:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`,
    info:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="8"></line><line x1="12" y1="12" x2="12" y2="16"></line></svg>`,
};

/**
 * Display a toast notification.
 * @param {string} title - Bold headline text
 * @param {string} message - Body copy (optional)
 * @param {'success'|'error'|'info'} type
 * @param {number} durationMs - Auto-dismiss after this duration (default 4500)
 */
function showToast(title, message = '', type = 'info', durationMs = 4500) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.setAttribute('role', 'alert');
    toast.innerHTML = `
        <span class="toast-icon">${TOAST_ICONS[type] || TOAST_ICONS.info}</span>
        <div class="toast-body">
            <span class="toast-title">${esc(title)}</span>
            ${message ? `<span class="toast-msg">${esc(message)}</span>` : ''}
        </div>
        <button class="toast-close" aria-label="Dismiss notification">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>`;

    const dismiss = () => {
        toast.classList.add('dismissing');
        toast.addEventListener('animationend', () => toast.remove(), { once: true });
        setTimeout(() => toast.remove(), 350); // safety net
    };

    toast.querySelector('.toast-close').addEventListener('click', dismiss);
    container.appendChild(toast);
    const timer = setTimeout(dismiss, durationMs);
    toast.querySelector('.toast-close').addEventListener('click', () => clearTimeout(timer), { once: true });
}

// ── UTILITY: Session Storage Persistence ────────────────────
const ChecklistState = {
    key: (sessionKey, index) => `omni_check_${sessionKey}_${index}`,
    save(sessionKey, index, checked) {
        try { sessionStorage.setItem(this.key(sessionKey, index), checked ? '1' : '0'); } catch {}
    },
    load(sessionKey, index) {
        try { return sessionStorage.getItem(this.key(sessionKey, index)) === '1'; } catch { return false; }
    },
    clear(sessionKey) {
        try {
            const toRemove = [];
            for (let i = 0; i < sessionStorage.length; i++) {
                const k = sessionStorage.key(i);
                if (k && k.startsWith(`omni_check_${sessionKey}_`)) toRemove.push(k);
            }
            toRemove.forEach(k => sessionStorage.removeItem(k));
        } catch {}
    }
};

// ── TEASER: Heuristic partial-guide generator ────────────────
/**
 * Derive a plausible partial guide preview from the raw prompt string.
 * No API call is made — purely deterministic heuristics.
 * @param {string} prompt
 * @returns {{ title: string, difficulty: string, estimatedTime: string, tools: string[], parts: string[] }}
 */
function deriveTeaserContent(prompt) {
    const p = prompt.toLowerCase();
    let difficulty = 'Medium';
    let estimatedTime = '1–2 Hours';
    let tools = ['Socket Set', 'Flathead Screwdriver', 'Safety Gloves'];
    let parts = [];

    // Difficulty heuristics
    if (/easy|simple|basic|bulb|air filter|wiper|battery/i.test(p)) {
        difficulty = 'Easy'; estimatedTime = '15–45 Minutes';
    } else if (/transmission|head gasket|engine|timing belt|differential|hvac|evaporator/i.test(p)) {
        difficulty = 'Hard'; estimatedTime = '4–8 Hours';
    }

    // Tool heuristics
    if (/brake|rotor|caliper/i.test(p))         tools = ['Floor Jack & Jack Stands', 'Socket Set', 'C-Clamp', 'Brake Cleaner', 'Torque Wrench'];
    else if (/oil|filter/i.test(p))             tools = ['Oil Drain Pan', 'Oil Filter Wrench', 'Funnel', 'Socket Set'];
    else if (/spark plug/i.test(p))             tools = ['Spark Plug Socket', 'Ratchet & Extension', 'Torque Wrench', 'Gap Gauge'];
    else if (/washer|dryer|dishwasher/i.test(p)) tools = ['Multimeter', 'Nut Driver Set', 'Pliers', 'Putty Knife'];
    else if (/faucet|sink|toilet|pipe/i.test(p)) tools = ['Adjustable Wrench', 'Pipe Wrench', 'Teflon Tape', 'Basin Wrench'];
    else if (/fridge|refrigerator/i.test(p))    tools = ['Multimeter', 'Nut Driver', 'Condenser Coil Brush', 'Putty Knife'];

    // Parts heuristics
    if (/brake/i.test(p))        parts = ['Brake Pads', 'Brake Rotors (if worn)', 'Brake Lubricant'];
    else if (/oil/i.test(p))     parts = ['Engine Oil (correct viscosity)', 'Oil Filter'];
    else if (/spark plug/i.test(p)) parts = ['Spark Plugs (OEM spec)', 'Dielectric Grease'];
    else if (/washer/i.test(p))  parts = ['Lid Switch Assembly', 'Drive Belt (if applicable)'];
    else if (/faucet/i.test(p))  parts = ['Faucet Cartridge or Seats & Springs', 'O-Rings'];

    // Title generation: capitalize prompt intelligently
    const title = prompt.trim()
        .replace(/\b(\w)/g, c => c.toUpperCase())
        .replace(/\s+/g, ' ')
        .slice(0, 72);

    return { title, difficulty, estimatedTime, tools, parts };
}

// ═══════════════════════════════════════════════════════════════
//  MAIN APP OBJECT
// ═══════════════════════════════════════════════════════════════
window.OmniGuideApp = {
    state: {
        isAuthenticated: false,
        user: null,
        pendingGenerate: false,
        betaMode: false,
        /** Stores the current guide's project context string for affiliate links */
        currentPrompt: '',
        /** Tracks if we're in teaser mode */
        teaserActive: false,
    },

    // ── INIT ──────────────────────────────────────────────────
    async init() {
        // Show skeleton immediately — before any async work
        this._showSkeleton();

        await this.checkSession();

        const urlParams = new URLSearchParams(window.location.search);
        const promptParam = urlParams.get('prompt');
        if (promptParam) {
            const promptInput = document.getElementById('prompt-input');
            if (promptInput) promptInput.value = decodeURIComponent(promptParam);

            // Auto-generate if ?auto=true is set (used by ad landing pages and SEO CTAs)
            if (urlParams.get('auto') === 'true') {
                // Small delay to let the UI render first
                setTimeout(() => this.generate(), 300);
            }
        }

        // Auto-open the symptom triage widget if ?triage=open is set
        if (urlParams.get('triage') === 'open') {
            setTimeout(() => this.toggleTriage(), 200);
        }
    },

    _showSkeleton() {
        const skeleton = document.getElementById('nav-skeleton');
        const loggedOut = document.getElementById('nav-logged-out');
        const loggedIn  = document.getElementById('nav-logged-in');
        if (skeleton)   skeleton.style.display   = 'flex';
        if (loggedOut)  loggedOut.style.display  = 'none';
        if (loggedIn)   loggedIn.style.display   = 'none';
    },

    _hideSkeleton() {
        const skeleton = document.getElementById('nav-skeleton');
        if (skeleton) skeleton.style.display = 'none';
    },

    // ── SESSION CHECK ─────────────────────────────────────────
    async checkSession() {
        try {
            const res = await fetch('/api/v1/auth/me');
            if (res.ok) {
                const data = await res.json();
                if (data.authenticated) {
                    this.state.isAuthenticated = true;
                    this.state.user = data.user;
                    this.state.betaMode = data.betaMode || false;
                } else {
                    this.state.isAuthenticated = false;
                    this.state.user = null;
                    this.state.betaMode = false;
                }
            }
        } catch (e) {}
        this._hideSkeleton();
        this.renderNav();
    },

    // ── RENDER NAV ────────────────────────────────────────────
    renderNav() {
        const loggedOutNav = document.getElementById('nav-logged-out');
        const loggedInNav  = document.getElementById('nav-logged-in');
        const hintEl       = document.getElementById('search-hint');
        const titleEl      = document.getElementById('hero-title');
        const subtitleEl   = document.getElementById('hero-subtitle');

        if (this.state.isAuthenticated && this.state.user) {
            if (loggedOutNav) loggedOutNav.style.display = 'none';
            if (loggedInNav)  loggedInNav.style.display  = 'flex';

            const emailEl       = document.getElementById('user-email-display');
            const countEl       = document.getElementById('credit-count');
            const betaBadge     = document.getElementById('beta-badge');
            const buyCreditsBtn = document.getElementById('btn-buy-credits');

            if (emailEl) emailEl.innerText = this.state.user.email;

            if (this.state.betaMode) {
                if (countEl)       countEl.innerText           = '∞';
                if (buyCreditsBtn) buyCreditsBtn.style.display = 'none';
                if (betaBadge)     betaBadge.style.display     = 'inline-flex';
            } else {
                const credits = this.state.user.credits;
                if (countEl)       countEl.innerText           = credits >= 9999 ? '∞' : credits;
                if (buyCreditsBtn) buyCreditsBtn.style.display = 'inline-block';
                if (betaBadge)     betaBadge.style.display     = 'none';
            }

            if (hintEl)    hintEl.style.display = 'none';
            if (titleEl)   titleEl.innerText = 'What project are we tackling?';
            if (subtitleEl) subtitleEl.innerText = 'Enter your exact vehicle model, appliance, or DIY task below.';

        } else {
            if (loggedOutNav) loggedOutNav.style.display = 'flex';
            if (loggedInNav)  loggedInNav.style.display  = 'none';

            // Free-run badge logic
            const badge = document.getElementById('free-run-badge');
            if (badge) {
                const hasUsedFreeRun = localStorage.getItem('has_used_free_run') === 'true';
                badge.style.display = hasUsedFreeRun ? 'none' : 'inline-flex';
            }

            if (hintEl)    hintEl.style.display = 'block';
            if (titleEl)   titleEl.innerText = 'Master any repair in minutes.';
            if (subtitleEl) subtitleEl.innerText = 'Tell OmniGuide your exact project or vehicle model. We generate a complete curriculum with step-by-step videos, exact tools, and the right parts.';
        }

        if (typeof lucide !== 'undefined') lucide.createIcons();
    },

    toggleDropdown() {
        const menu = document.getElementById('user-menu');
        if (menu) menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
        const btn = document.getElementById('btn-user-menu');
        if (btn) btn.setAttribute('aria-expanded', menu?.style.display !== 'none' ? 'true' : 'false');
    },

    // ── AUTH ──────────────────────────────────────────────────
    showAuthModal(type) {
        const modal = document.getElementById('auth-modal');
        if (modal) modal.style.display = 'flex';
        ['login-error', 'register-error'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerText = '';
        });
        ['login-password', 'register-password'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });

        const authTitle = document.getElementById('auth-title');
        const loginForm = document.getElementById('auth-login-form');
        const regForm   = document.getElementById('auth-register-form');

        if (type === 'login') {
            if (authTitle) authTitle.innerText = 'Sign in to OmniGuide';
            if (loginForm) loginForm.style.display = 'block';
            if (regForm)   regForm.style.display   = 'none';
        } else {
            if (authTitle) authTitle.innerText = 'Create an Account';
            if (loginForm) loginForm.style.display = 'none';
            if (regForm)   regForm.style.display   = 'block';
        }
    },

    closeModals() {
        ['auth-modal', 'billing-modal'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });
        this.state.pendingGenerate = false;
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
        }
    },

    async login() {
        const email    = document.getElementById('login-email')?.value.trim() || '';
        const password = document.getElementById('login-password')?.value || '';
        const err = document.getElementById('login-error');
        const btn = document.getElementById('btn-login');
        if (!email || !password) { if (err) err.innerText = 'Please enter both email and password.'; return; }
        if (btn) { btn.disabled = true; btn.innerText = 'Signing in…'; }
        if (err) err.innerText = '';
        try {
            const res  = await fetch('/api/v1/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Login failed.');
            this.state.isAuthenticated = true;
            this.state.user = data.user;
            this.state.betaMode = data.betaMode || false;
            this.renderNav();
            const wasPending = this.state.pendingGenerate;
            const wasTeaser  = this.state.teaserActive;
            this.closeModals();
            if (wasTeaser) {
                this._clearTeaser();
                this.state.pendingGenerate = false;
                this.generate();
            } else if (wasPending) {
                const errBanner = document.getElementById('error-state');
                if (errBanner) errBanner.style.display = 'none';
                this.state.pendingGenerate = false;
                this.generate();
            }
        } catch (e) {
            if (err) err.innerText = e.message;
        } finally {
            if (btn) { btn.disabled = false; btn.innerText = 'Sign In'; }
        }
    },

    async register() {
        const email    = document.getElementById('register-email')?.value.trim() || '';
        const password = document.getElementById('register-password')?.value || '';
        const err = document.getElementById('register-error');
        const btn = document.getElementById('btn-register');
        if (!email || !email.includes('@')) { if (err) err.innerText = 'Please enter a valid email address.'; return; }
        if (!password || password.length < 6) { if (err) err.innerText = 'Password must be at least 6 characters.'; return; }
        if (btn) { btn.disabled = true; btn.innerText = 'Creating…'; }
        if (err) err.innerText = '';
        try {
            const res  = await fetch('/api/v1/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Registration failed.');
            this.state.isAuthenticated = true;
            this.state.user = data.user;
            this.state.betaMode = data.betaMode || false;
            this.renderNav();
            const wasPending = this.state.pendingGenerate;
            const wasTeaser  = this.state.teaserActive;
            this.closeModals();
            if (wasTeaser) {
                this._clearTeaser();
                this.state.pendingGenerate = false;
                this.generate();
            } else if (wasPending) {
                const errBanner = document.getElementById('error-state');
                if (errBanner) errBanner.style.display = 'none';
                this.state.pendingGenerate = false;
                this.generate();
            }
        } catch (e) {
            if (err) err.innerText = e.message;
        } finally {
            if (btn) { btn.disabled = false; btn.innerText = 'Create Account — It\'s Free'; }
        }
    },

    async logout() {
        try { await fetch('/api/v1/auth/logout'); } catch {}
        this.state.isAuthenticated = false;
        this.state.user = null;
        this.renderNav();
        const menu = document.getElementById('user-menu');
        if (menu) menu.style.display = 'none';
        const results = document.getElementById('results-section');
        if (results) results.style.display = 'none';
        this._clearTeaser();
    },

    // ── BUY CREDITS ───────────────────────────────────────────
    buyCredits() {
        if (!this.state.isAuthenticated) {
            this.state.pendingGenerate = true;
            this.showAuthModal('register');
            const regErr = document.getElementById('register-error');
            if (regErr) regErr.innerText = 'Please sign in or register to buy credits.';
            return;
        }

        const checkoutBtn = document.getElementById('btn-stripe-checkout');
        if (checkoutBtn && this.state.user?.email) {
            checkoutBtn.href = `https://buy.stripe.com/dRmfZj3VRbAI2LXgRB08g0l?prefilled_email=${encodeURIComponent(this.state.user.email)}`;
        }

        const modal = document.getElementById('billing-modal');
        if (modal) modal.style.display = 'flex';

        if (this.pollInterval) clearInterval(this.pollInterval);

        const initialCredits = this.state.user?.credits || 0;

        this.pollInterval = setInterval(async () => {
            // Stop polling if modal is closed
            if (modal && modal.style.display === 'none') {
                clearInterval(this.pollInterval);
                this.pollInterval = null;
                return;
            }
            try {
                const res = await fetch('/api/v1/auth/me');
                if (res.ok) {
                    const data = await res.json();
                    if (data.authenticated && data.user) {
                        this.state.isAuthenticated = true;
                        this.state.user = data.user;
                        this.state.betaMode = data.betaMode || false;

                        if (this.state.user.credits > initialCredits) {
                            clearInterval(this.pollInterval);
                            this.pollInterval = null;
                            const added = this.state.user.credits - initialCredits;
                            const wasPending = this.state.pendingGenerate;
                            this.closeModals();
                            this.renderNav();

                            // ✅ Toast instead of alert()
                            showToast(
                                'Payment verified!',
                                `${added} credit${added !== 1 ? 's' : ''} have been added to your account.`,
                                'success',
                                5500
                            );

                            if (wasPending) {
                                this.state.pendingGenerate = false;
                                this.generate();
                            }
                        }
                    }
                }
            } catch (e) {
                console.error('Error polling for credits:', e);
            }
        }, 3000);
    },

    // ── TEASER FLOW ───────────────────────────────────────────
    /** Called when user clicks a teaser CTA button */
    unlockFromTeaser(type) {
        this.state.pendingGenerate = true;
        this.state.teaserActive   = true;
        this.showAuthModal(type);
        if (type === 'register') {
            const regErr = document.getElementById('register-error');
            if (regErr) regErr.innerText = 'Create a free account to generate your first guide.';
        }
    },

    _clearTeaser() {
        this.state.teaserActive = false;
        const sheet = document.getElementById('teaser-sheet');
        if (sheet) sheet.classList.remove('visible');
        // Remove blurring
        const mainCol = document.getElementById('teaser-blurred-main');
        if (mainCol) mainCol.classList.remove('content-blurred');
        // Hide the partial results section
        const results = document.getElementById('results-section');
        if (results) results.style.display = 'none';
    },

    /**
     * Run the 3-stage animated teaser for unauthenticated visitors.
     * Shows a simulated loading sequence, then renders a partial guide.
     * @param {string} prompt - The raw user prompt
     */
    async _runTeaserFlow(prompt) {
        this.state.teaserActive = true;
        this.state.currentPrompt = prompt;

        const loading    = document.getElementById('loading-state');
        const results    = document.getElementById('results-section');
        const errState   = document.getElementById('error-state');
        const stageText  = loading?.querySelector('.stage-text');

        if (errState) errState.style.display = 'none';
        if (results)  results.style.display  = 'none';
        if (loading)  loading.style.display  = 'block';

        // Mark the free run as "consumed" in localStorage (UX: hide badge)
        localStorage.setItem('has_used_free_run', 'true');
        this.renderNav();

        // Stage 1: Analyzing
        if (stageText) stageText.textContent = 'Analyzing task and identifying components…';
        await new Promise(r => setTimeout(r, 1100));

        // Stage 2: Curating
        if (stageText) stageText.textContent = 'Curating tools checklist and difficulty rating…';
        await new Promise(r => setTimeout(r, 1000));

        // Stage 3: Finalizing
        if (stageText) stageText.textContent = 'Finalizing your custom guide…';
        await new Promise(r => setTimeout(r, 900));

        if (loading) loading.style.display = 'none';

        // Generate partial content from heuristics (no API call)
        const partial = deriveTeaserContent(prompt);

        // Render the visible preview (title + difficulty + tools checklist)
        this._renderTeaserPartial(partial);

        // Show signup sheet
        const sheet = document.getElementById('teaser-sheet');
        if (sheet) {
            sheet.classList.add('visible');
            sheet.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }

        if (typeof lucide !== 'undefined') lucide.createIcons();
    },

    /**
     * Render the partial (blurred) teaser result UI.
     */
    _renderTeaserPartial(partial) {
        const results = document.getElementById('results-section');
        if (!results) return;

        // Set visible header info
        const titleEl = document.getElementById('res-title');
        const diffEl  = document.getElementById('res-diff');
        const timeEl  = document.getElementById('res-time');
        if (titleEl) titleEl.innerText = partial.title;
        if (diffEl)  diffEl.innerText  = partial.difficulty;
        if (timeEl)  timeEl.innerText  = partial.estimatedTime;

        // Render tools checklist (visible)
        const toolsEl = document.getElementById('res-tools');
        if (toolsEl) {
            toolsEl.innerHTML = '';
            partial.tools.forEach((toolName, i) => {
                const li  = document.createElement('li');
                li.className = 'checklist-item';
                const cb  = document.createElement('input');
                cb.type  = 'checkbox';
                cb.className = 'checklist-checkbox';
                cb.checked = ChecklistState.load('res-tools', i);
                if (cb.checked) li.classList.add('item-checked');
                cb.addEventListener('change', () => {
                    li.classList.toggle('item-checked', cb.checked);
                    ChecklistState.save('res-tools', i, cb.checked);
                });
                const content = document.createElement('div');
                content.className = 'checklist-item-content';
                const nameEl = document.createElement('span');
                nameEl.className = 'item-name';
                nameEl.innerText = toolName;
                content.appendChild(nameEl);
                li.appendChild(cb);
                li.appendChild(content);
                toolsEl.appendChild(li);
            });
        }

        // Render parts checklist (visible)
        const partsEl = document.getElementById('res-parts');
        if (partsEl) {
            partsEl.innerHTML = '';
            if (partial.parts.length === 0) {
                partsEl.innerHTML = '<li class="checklist-item"><span class="item-name muted small">Unlock to see exact parts required.</span></li>';
            } else {
                partial.parts.forEach((partName, i) => {
                    const li = document.createElement('li');
                    li.className = 'checklist-item';
                    const cb = document.createElement('input');
                    cb.type = 'checkbox';
                    cb.className = 'checklist-checkbox';
                    cb.checked = ChecklistState.load('res-parts', i);
                    if (cb.checked) li.classList.add('item-checked');
                    cb.addEventListener('change', () => {
                        li.classList.toggle('item-checked', cb.checked);
                        ChecklistState.save('res-parts', i, cb.checked);
                    });
                    const content = document.createElement('div');
                    content.className = 'checklist-item-content';
                    const nameEl = document.createElement('span');
                    nameEl.className = 'item-name';
                    nameEl.innerText = partName;
                    content.appendChild(nameEl);
                    li.appendChild(cb);
                    li.appendChild(content);
                    partsEl.appendChild(li);
                });
            }
        }

        // Blur the main column (videos + steps)
        const mainCol = document.querySelector('#results-section .main-column');
        if (mainCol) {
            mainCol.id = 'teaser-blurred-main';
            mainCol.classList.add('content-blurred');
        }

        // Clear steps — show placeholder text (blurred)
        const stepsEl = document.getElementById('res-steps');
        if (stepsEl) {
            stepsEl.innerHTML = [
                'Start by gathering all required tools listed in the checklist.',
                'Safely disconnect power or lift the vehicle before beginning.',
                'Locate the primary component and inspect for visible wear.',
                'Remove the old part following manufacturer torque specifications.',
                'Install the replacement and test before final reassembly.',
            ].map((s, i) => `<li class="step-item"><span class="step-number">${i + 1}</span><span class="step-text">${esc(s)}</span></li>`).join('');
        }

        // Clear videos — show placeholder (blurred)
        const vidEl = document.getElementById('res-videos');
        if (vidEl) {
            vidEl.innerHTML = `
                <div class="preview-video-placeholder" style="grid-column:1/-1;aspect-ratio:16/9;background:#161B22;border-radius:6px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:0.75rem;">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="#FF0000" aria-hidden="true"><path d="M23.495 6.205a3.007 3.007 0 0 0-2.088-2.088c-1.87-.501-9.396-.501-9.396-.501s-7.507-.01-9.396.501A3.007 3.007 0 0 0 .527 6.205a31.247 31.247 0 0 0-.522 5.805 31.247 31.247 0 0 0 .522 5.783 3.007 3.007 0 0 0 2.088 2.088c1.868.502 9.396.502 9.396.502s7.506 0 9.396-.502a3.007 3.007 0 0 0 2.088-2.088 31.247 31.247 0 0 0 .5-5.783 31.247 31.247 0 0 0-.5-5.805zM9.609 15.601V8.408l6.264 3.602z"/></svg>
                    <span style="color:#E2E8F0;font-size:0.9rem;opacity:0.8;">Curated tutorial videos will appear here.</span>
                </div>`;
        }

        const diagramCard = document.getElementById('diagram-card');
        if (diagramCard) diagramCard.style.display = 'none';

        results.style.display = 'block';
        results.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },

    // ── GENERATE ─────────────────────────────────────────────
    async generate() {
        const prompt = document.getElementById('prompt-input')?.value.trim() || '';
        if (!prompt) { showToast('Empty input', 'Please describe your repair or project.', 'error'); return; }

        // ── UNAUTHENTICATED PATH ──────────────────────────────
        if (!this.state.isAuthenticated) {
            const hasUsedFreeRun = localStorage.getItem('has_used_free_run') === 'true';

            if (hasUsedFreeRun) {
                // Already used their free run — prompt signup
                this.state.pendingGenerate = true;
                this.showAuthModal('register');
                const regErr = document.getElementById('register-error');
                if (regErr) regErr.innerText = 'You\'ve used your free run! Create a free account to generate more guides.';
                return;
            }

            // First run: call guest-generate for a full real guide
            await this._runGuestGenerate(prompt);
            return;
        }

        // Authenticated: real generation
        this.state.currentPrompt = prompt;
        this._clearTeaser();

        const btn      = document.getElementById('generate-btn');
        const loading  = document.getElementById('loading-state');
        const results  = document.getElementById('results-section');
        const errState = document.getElementById('error-state');

        if (btn)     btn.disabled          = true;
        if (loading) loading.style.display = 'block';
        if (results) results.style.display = 'none';
        if (errState) errState.style.display = 'none';

        // Clear any old sessionStorage state for this new guide
        ChecklistState.clear('res-tools');
        ChecklistState.clear('res-parts');
        ChecklistState.clear('res-steps');

        try {
            const res  = await fetch('/api/v1/generate-guide', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt })
            });
            const data = await res.json();

            if (!res.ok) {
                if (res.status === 403) {
                    this.state.pendingGenerate = true;
                    this.buyCredits();
                    throw new Error('You are out of credits. Please purchase more.');
                }
                if (res.status === 401) {
                    this.state.isAuthenticated = false;
                    this.state.user = null;
                    this.state.pendingGenerate = true;
                    this.renderNav();
                    this.showAuthModal('login');
                    const loginErr = document.getElementById('login-error');
                    if (loginErr) loginErr.innerText = 'Your session has expired. Please sign in again.';
                    throw new Error('Your session has expired. Please sign in again.');
                }
                throw new Error(data.error || 'Failed to generate guide. Please try again.');
            }

            if (this.state.user) this.state.user.credits = data.creditsRemaining;
            this.state.betaMode = data.guide.betaMode || false;
            this.renderNav();

            this.renderResults(data.guide);
            if (loading) loading.style.display = 'none';
            if (results) {
                results.style.display = 'block';
                results.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }

        } catch (e) {
            if (loading) loading.style.display = 'none';
            if (errState) { errState.style.display = 'block'; errState.innerText = e.message; }
        } finally {
            if (btn) btn.disabled = false;
        }
    },


    // ── GUEST GENERATE (#2 — True Free Run) ──────────────────
    async _runGuestGenerate(prompt) {
        this.state.currentPrompt = prompt;
        this._clearTeaser();

        const btn      = document.getElementById('generate-btn');
        const loading  = document.getElementById('loading-state');
        const results  = document.getElementById('results-section');
        const errState = document.getElementById('error-state');
        const stageText = loading?.querySelector('.stage-text');

        if (btn)     btn.disabled          = true;
        if (loading) loading.style.display = 'block';
        if (results) results.style.display = 'none';
        if (errState) errState.style.display = 'none';

        if (stageText) stageText.textContent = 'Generating your free guide — this takes 10–20 seconds…';

        ChecklistState.clear('res-tools');
        ChecklistState.clear('res-parts');
        ChecklistState.clear('res-steps');

        try {
            const res  = await fetch('/api/v1/guest-generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt })
            });
            const data = await res.json();

            if (!res.ok) {
                if (res.status === 429) {
                    // Already used free run (server-side enforcement)
                    localStorage.setItem('has_used_free_run', 'true');
                    this.renderNav();
                    this.state.pendingGenerate = true;
                    this.showAuthModal('register');
                    const regErr = document.getElementById('register-error');
                    if (regErr) regErr.innerText = data.error || 'Please create a free account to generate more guides.';
                    throw new Error(data.error || 'Free run limit reached.');
                }
                throw new Error(data.error || 'Failed to generate guide. Please try again.');
            }

            // Mark free run as used
            localStorage.setItem('has_used_free_run', 'true');
            this.renderNav();

            this.renderResults(data.guide);
            if (loading) loading.style.display = 'none';
            if (results) {
                results.style.display = 'block';
                results.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }

        } catch (e) {
            if (loading) loading.style.display = 'none';
            if (errState && !this.state.pendingGenerate) {
                errState.style.display = 'block';
                errState.innerText = e.message;
            }
        } finally {
            if (btn) btn.disabled = false;
            if (stageText) stageText.textContent = 'This usually takes 10–20 seconds.';
        }
    },

    // ── RENDER RESULTS (updated with safety + timestamps) ────
    renderResults(data) {
        const set = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val || ''; };
        set('res-title', data.title);
        set('res-diff',  data.difficulty);
        set('res-time',  data.estimatedTime);

        // Remove any teaser blur from main column
        const mainCol = document.getElementById('teaser-blurred-main');
        if (mainCol) {
            mainCol.classList.remove('content-blurred');
            mainCol.removeAttribute('id');
        }

        // ── SAFETY CHECKLIST (#5) ─────────────────────────────
        const mainColumn = document.querySelector('#results-section .main-column');
        const existingSafetyCard = document.getElementById('safety-card');
        if (existingSafetyCard) existingSafetyCard.remove();

        const safetyItems = data.safetyChecklist || [];
        if (safetyItems.length > 0 && mainColumn) {
            const safetyCard = document.createElement('div');
            safetyCard.id = 'safety-card';
            safetyCard.className = 'safety-card';
            safetyCard.innerHTML = `
                <div class="safety-card-header">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                    Pre-Repair Safety Checklist
                </div>
                <ul class="safety-list" role="list" aria-label="Safety items to complete before starting">
                    ${safetyItems.map(item => `<li>${esc(item)}</li>`).join('')}
                </ul>`;
            mainColumn.insertBefore(safetyCard, mainColumn.firstChild);
        }

        // ── GUEST RUN BANNER (#2) ─────────────────────────────
        const existingBanner = document.getElementById('guest-run-banner');
        if (existingBanner) existingBanner.remove();
        if (data.isGuestRun) {
            const banner = document.createElement('div');
            banner.id = 'guest-run-banner';
            banner.className = 'guest-run-banner';
            banner.innerHTML = `
                <p><strong>This was your free guide run.</strong> Create a free account to generate unlimited guides, save your progress, and get video tutorials.</p>
                <button class="btn primary small" onclick="OmniGuideApp.showAuthModal('register')">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14" height="14"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
                    Create Free Account
                </button>`;
            if (mainColumn) mainColumn.insertBefore(banner, mainColumn.firstChild);
        }

        // ── STEPS with Timestamps (#7) ────────────────────────
        // Store the first video ID for timestamp deep-links
        this._currentVideoId = (data.videos && data.videos[0]) ? data.videos[0].videoId : null;
        const timestamps = data.stepTimestamps || [];

        const stepsEl = document.getElementById('res-steps');
        if (stepsEl) {
            stepsEl.innerHTML = '';
            (data.steps || []).forEach((step, i) => {
                const li     = document.createElement('li');
                li.className = 'step-item';
                const saved  = ChecklistState.load('res-steps', i);
                if (saved) li.classList.add('step-completed');

                const numEl  = document.createElement('span');
                numEl.className = 'step-number';
                numEl.textContent = String(i + 1);

                const textEl = document.createElement('span');
                textEl.className = 'step-text';
                textEl.textContent = step;

                li.appendChild(numEl);
                li.appendChild(textEl);

                // Add video timestamp link if we have a video and timestamp data
                const ts = timestamps[i];
                if (ts && this._currentVideoId) {
                    const startFmt = this._formatSeconds(ts.startSeconds);
                    const endFmt   = this._formatSeconds(ts.endSeconds);
                    const tsLink   = document.createElement('a');
                    tsLink.className = 'step-timestamp-link';
                    tsLink.href      = `https://www.youtube.com/watch?v=${this._currentVideoId}&t=${ts.startSeconds}`;
                    tsLink.target    = '_blank';
                    tsLink.rel       = 'noopener noreferrer';
                    tsLink.innerHTML = `<svg viewBox="0 0 24 24" fill="#FF0000" width="12" height="12"><path d="M23.495 6.205a3.007 3.007 0 0 0-2.088-2.088c-1.87-.501-9.396-.501-9.396-.501s-7.507-.01-9.396.501A3.007 3.007 0 0 0 .527 6.205a31.247 31.247 0 0 0-.522 5.805 31.247 31.247 0 0 0 .522 5.783 3.007 3.007 0 0 0 2.088 2.088c1.868.502 9.396.502 9.396.502s7.506 0 9.396-.502a3.007 3.007 0 0 0 2.088-2.088 31.247 31.247 0 0 0 .5-5.783 31.247 31.247 0 0 0-.5-5.805zM9.609 15.601V8.408l6.264 3.602z"/></svg> Watch ${startFmt}–${endFmt}`;
                    li.appendChild(tsLink);
                }

                li.addEventListener('click', (e) => {
                    if (e.target.closest('a')) return; // Don't toggle when clicking links
                    li.classList.toggle('step-completed');
                    ChecklistState.save('res-steps', i, li.classList.contains('step-completed'));
                });

                stepsEl.appendChild(li);
            });

            // Add Garage Mode button after steps
            const existingGarageBtn = document.getElementById('garage-mode-trigger');
            if (existingGarageBtn) existingGarageBtn.remove();
            if ((data.steps || []).length > 0) {
                const garageBtn = document.createElement('button');
                garageBtn.id = 'garage-mode-trigger';
                garageBtn.className = 'garage-mode-btn';
                garageBtn.onclick = () => OmniGuideApp.enterGarageMode();
                garageBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="15" height="15"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> Start Garage Mode — One Step at a Time`;
                stepsEl.parentNode.appendChild(garageBtn);
            }
        }

        // ── TOOLS & PARTS Checklists ──────────────────────────
        this.renderChecklist('res-tools', data.tools || [], data.title);
        this.renderChecklist('res-parts', data.parts || [], data.title);

        // ── VIDEOS ────────────────────────────────────────────
        const vidContainer = document.getElementById('res-videos');
        if (vidContainer) {
            vidContainer.innerHTML = '';
            const vids = data.videos || [];
            if (vids.length > 0) {
                vids.forEach(vid => {
                    const a = document.createElement('a');
                    a.href      = `https://www.youtube.com/watch?v=${vid.videoId}`;
                    a.target    = '_blank';
                    a.rel       = 'noopener noreferrer';
                    a.className = 'video-card';
                    a.innerHTML = `
                        <img src="${vid.thumbnail}" alt="${esc(vid.title)}" loading="lazy" onerror="this.src='https://i.ytimg.com/vi/${vid.videoId}/mqdefault.jpg'">
                        <div class="vid-title">
                            <span class="vid-channel">${esc(vid.channelName || '')}</span>
                            ${esc(vid.title)}
                        </div>`;
                    vidContainer.appendChild(a);
                });
            } else if (data.isGuestRun) {
                vidContainer.innerHTML = `<p class="muted small">Create a free account to get AI-curated tutorial videos for this repair.</p>`;
            } else {
                const searchLinks = data.youtubeSearchLinks || [];
                if (searchLinks.length > 0) {
                    const wrapper = document.createElement('div');
                    wrapper.className = 'yt-search-fallback';
                    wrapper.innerHTML = '<p class="muted small" style="margin-bottom:0.75rem;">Click a search below to find the best tutorials on YouTube:</p>';
                    searchLinks.forEach(link => {
                        const a = document.createElement('a');
                        a.href = link.searchUrl; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.className = 'yt-search-btn';
                        a.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="#FF0000"><path d="M23.495 6.205a3.007 3.007 0 0 0-2.088-2.088c-1.87-.501-9.396-.501-9.396-.501s-7.507-.01-9.396.501A3.007 3.007 0 0 0 .527 6.205a31.247 31.247 0 0 0-.522 5.805 31.247 31.247 0 0 0 .522 5.783 3.007 3.007 0 0 0 2.088 2.088c1.868.502 9.396.502 9.396.502s7.506 0 9.396-.502a3.007 3.007 0 0 0 2.088-2.088 31.247 31.247 0 0 0 .5-5.783 31.247 31.247 0 0 0-.5-5.805zM9.609 15.601V8.408l6.264 3.602z"/></svg> ${esc(link.query)}`;
                        wrapper.appendChild(a);
                    });
                    vidContainer.appendChild(wrapper);
                } else {
                    vidContainer.innerHTML = '<p class="muted small">No videos found. Try adding more detail to your task description.</p>';
                }
            }
        }

        // ── DIAGRAM ───────────────────────────────────────────
        const diagramCard      = document.getElementById('diagram-card');
        const diagramContainer = document.getElementById('res-diagram');
        if (diagramContainer && data.diagramBase64) {
            const mime = data.diagramMime || 'image/png';
            diagramContainer.innerHTML = `<img src="data:${mime};base64,${data.diagramBase64}" alt="AI-generated parts diagram for ${esc(data.title)}" style="width:100%;height:auto;display:block;border-radius:6px;" loading="lazy">`;
            if (diagramCard) diagramCard.style.display = 'block';
        } else {
            if (diagramCard) diagramCard.style.display = 'none';
        }

        // Store steps for garage mode
        this._garageSteps = data.steps || [];
        this._garageTimestamps = data.stepTimestamps || [];

        if (typeof lucide !== 'undefined') lucide.createIcons();
    },

    // ── FORMAT SECONDS to mm:ss ───────────────────────────────
    _formatSeconds(secs) {
        const m = Math.floor(secs / 60);
        const s = String(secs % 60).padStart(2, '0');
        return `${m}:${s}`;
    },

    // ── RENDER CHECKLIST ─────────────────────────────────────
    /**
     * Render an interactive checklist with affiliate links (#6 — RockAuto + ApplianceParts added).
     */
    renderChecklist(containerId, items, projectContext = '') {
        const container = document.getElementById(containerId);
        if (!container) return;
        container.innerHTML = '';

        items.forEach((item, i) => {
            const li = document.createElement('li');
            li.className = 'checklist-item';

            const saved = ChecklistState.load(containerId, i);
            if (saved) li.classList.add('item-checked');

            const cb = document.createElement('input');
            cb.type      = 'checkbox';
            cb.className = 'checklist-checkbox';
            cb.checked   = saved;
            cb.setAttribute('aria-label', `Mark ${item.name} as acquired`);
            cb.addEventListener('change', () => {
                li.classList.toggle('item-checked', cb.checked);
                ChecklistState.save(containerId, i, cb.checked);
            });

            const content = document.createElement('div');
            content.className = 'checklist-item-content';

            const nameEl = document.createElement('span');
            nameEl.className = 'item-name';
            nameEl.innerText = item.name;

            // OEM part number badge if present
            if (item.oem_part_number) {
                const oemBadge = document.createElement('span');
                oemBadge.className = 'store-note-badge';
                oemBadge.style.cssText = 'margin-left:0.4rem;font-size:0.72rem;font-family:monospace;';
                oemBadge.textContent = `OEM: ${item.oem_part_number}`;
                nameEl.appendChild(oemBadge);
            }

            content.appendChild(nameEl);

            // Store links
            if (item.storeLinks && item.storeLinks.length > 0) {
                const linksEl = document.createElement('div');
                linksEl.className = 'store-links';

                item.storeLinks.forEach(link => {
                    const a = document.createElement('a');
                    if (link.store === 'Amazon') {
                        a.href = generateAffiliateLink(item.search_term || item.name, projectContext);
                    } else {
                        a.href = link.url;
                    }
                    a.target    = '_blank';
                    a.rel       = 'noopener noreferrer';
                    a.className = 'store-btn';
                    a.title     = link.note ? `${link.store} — ${link.note}` : link.store;

                    let badgeHtml = '';
                    if (link.note) {
                        const noteLower = link.note.toLowerCase();
                        const badgeClass = noteLower.includes('oem') ? 'cheapest' : noteLower.includes('specialist') ? 'budget' : '';
                        badgeHtml = `<span class="store-note-badge ${badgeClass}">${esc(link.note)}</span>`;
                    }
                    a.innerHTML = `${esc(link.store)}${badgeHtml}`;
                    linksEl.appendChild(a);
                });

                content.appendChild(linksEl);
            }

            li.appendChild(cb);
            li.appendChild(content);
            container.appendChild(li);
        });
    },

    // ── PRINT / PDF EXPORT (#9) ───────────────────────────────
    printGuide() {
        window.print();
    },

    // ── GARAGE MODE (#4) ──────────────────────────────────────
    _garageSteps: [],
    _garageTimestamps: [],
    _garageCurrentStep: 0,
    _wakeLock: null,
    _currentVideoId: null,

    async enterGarageMode() {
        if (!this._garageSteps.length) {
            showToast('No guide loaded', 'Please generate a guide first.', 'error');
            return;
        }

        this._garageCurrentStep = 0;
        this._renderGarageStep();

        const overlay = document.getElementById('garage-overlay');
        if (overlay) overlay.classList.add('active');
        document.body.style.overflow = 'hidden';

        // Request Screen Wake Lock to prevent sleep
        try {
            if ('wakeLock' in navigator) {
                this._wakeLock = await navigator.wakeLock.request('screen');
                const indicator = document.getElementById('garage-wake-indicator');
                if (indicator) indicator.style.display = 'flex';
            }
        } catch (e) {
            // Wake lock not available — silently skip
            const indicator = document.getElementById('garage-wake-indicator');
            if (indicator) indicator.style.display = 'none';
        }
    },

    exitGarageMode() {
        const overlay = document.getElementById('garage-overlay');
        if (overlay) overlay.classList.remove('active');
        document.body.style.overflow = '';

        // Release wake lock
        if (this._wakeLock) {
            this._wakeLock.release().catch(() => {});
            this._wakeLock = null;
        }
    },

    _renderGarageStep() {
        const i    = this._garageCurrentStep;
        const step = this._garageSteps[i];
        const total = this._garageSteps.length;

        const numEl  = document.getElementById('garage-step-num');
        const textEl = document.getElementById('garage-step-text');
        const progEl = document.getElementById('garage-progress');
        const prevBtn = document.getElementById('garage-prev');
        const nextBtn = document.getElementById('garage-next');
        const tsEl   = document.getElementById('garage-timestamp');
        const tsLink = document.getElementById('garage-video-link');

        if (numEl)  numEl.textContent  = String(i + 1);
        if (textEl) textEl.textContent = step;
        if (progEl) progEl.textContent = `Step ${i + 1} of ${total}`;
        if (prevBtn) prevBtn.disabled  = i === 0;
        if (nextBtn) {
            nextBtn.textContent = i === total - 1 ? '✓ Done' : 'Next →';
            nextBtn.disabled    = false;
        }

        // Video timestamp
        const ts = this._garageTimestamps[i];
        if (ts && this._currentVideoId && tsEl && tsLink) {
            tsEl.style.display = 'flex';
            const startFmt = this._formatSeconds(ts.startSeconds);
            const endFmt   = this._formatSeconds(ts.endSeconds);
            tsLink.href      = `https://www.youtube.com/watch?v=${this._currentVideoId}&t=${ts.startSeconds}`;
            tsLink.textContent = `Watch ${startFmt}–${endFmt} →`;
        } else if (tsEl) {
            tsEl.style.display = 'none';
        }
    },

    garageNext() {
        if (this._garageCurrentStep >= this._garageSteps.length - 1) {
            showToast('Repair Complete! 🎉', 'You\'ve finished all steps. Great work!', 'success', 6000);
            this.exitGarageMode();
            return;
        }
        this._garageCurrentStep++;
        this._renderGarageStep();
    },

    garagePrev() {
        if (this._garageCurrentStep > 0) {
            this._garageCurrentStep--;
            this._renderGarageStep();
        }
    },

    // ── SYMPTOM TRIAGE (#8) ───────────────────────────────────
    _triageAnswers: {},

    toggleTriage() {
        const toggle = document.getElementById('triage-toggle');
        const body   = document.getElementById('triage-body');
        const isOpen = body?.classList.contains('open');
        toggle?.classList.toggle('open', !isOpen);
        body?.classList.toggle('open', !isOpen);
        toggle?.setAttribute('aria-expanded', String(!isOpen));
    },

    selectTriageOption(btn) {
        const q = btn.dataset.q;
        const val = btn.dataset.val;

        // Deselect siblings
        btn.closest('.triage-options')?.querySelectorAll('.triage-opt-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');

        this._triageAnswers[q] = val;

        // Advance to next question
        if (q === '1') {
            document.getElementById('triage-q2').style.display = 'block';
        } else if (q === '2') {
            document.getElementById('triage-q3').style.display = 'block';
        } else if (q === '3') {
            const composeBtn = document.getElementById('triage-compose-btn');
            if (composeBtn) composeBtn.disabled = false;
        }
    },

    composeFromTriage() {
        const a = this._triageAnswers;
        if (!a['1'] || !a['2'] || !a['3']) {
            showToast('Incomplete', 'Please answer all three questions first.', 'error');
            return;
        }

        const composed = `My ${a['1']} ${a['2']} ${a['3']}`;
        const input = document.getElementById('prompt-input');
        if (input) {
            input.value = composed;
            input.focus();
        }

        // Close triage widget
        this.toggleTriage();
        this._triageAnswers = {};

        // Scroll to search box smoothly
        document.querySelector('.search-box')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        showToast('Search composed!', 'Review your description and click Generate to continue.', 'success', 3500);
    },
};


// ── DOM READY ────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    // Close modal on overlay click
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', function(e) {
            if (e.target === this) OmniGuideApp.closeModals();
        });
    });

    // Enter key shortcuts
    document.getElementById('login-password')?.addEventListener('keydown',   e => { if (e.key === 'Enter') OmniGuideApp.login(); });
    document.getElementById('register-password')?.addEventListener('keydown', e => { if (e.key === 'Enter') OmniGuideApp.register(); });
    document.getElementById('prompt-input')?.addEventListener('keydown',      e => { if (e.key === 'Enter') OmniGuideApp.generate(); });

    // Close dropdown when clicking outside
    document.addEventListener('click', e => {
        const menu = document.getElementById('user-menu');
        const btn  = document.getElementById('btn-user-menu');
        if (menu && !menu.contains(e.target) && e.target !== btn && !btn?.contains(e.target)) {
            menu.style.display = 'none';
            btn?.setAttribute('aria-expanded', 'false');
        }
    });

    // Add stage-text to loading state if not already present
    const loadingState = document.getElementById('loading-state');
    if (loadingState && !loadingState.querySelector('.stage-text')) {
        const stageEl = document.createElement('p');
        stageEl.className = 'stage-text muted';
        stageEl.textContent = 'This usually takes 10–20 seconds.';
        // Replace the static p with a dynamic one
        const staticP = loadingState.querySelector('p.muted');
        if (staticP) staticP.replaceWith(stageEl);
        else loadingState.appendChild(stageEl);
    }

    OmniGuideApp.init();
});


