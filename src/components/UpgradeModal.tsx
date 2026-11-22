import React, { useState, useEffect } from 'react';
import {
  X,
  Sparkles,
  Check,
  Zap,
  ShieldCheck,
  KeyRound,
  ExternalLink,
  ArrowRight,
  Tv,
  Layers,
  Sun,
  Palette,
  Sliders,
  Copy,
  CheckCircle2,
} from 'lucide-react';
import { STRIPE_PAYMENT_LINK_URL } from '../data/defaultPresets';
import { validateLicenseKey, normalizeLicenseKey, formatTrialRemaining, TrialStatus } from '../utils/licenseEngine';

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onActivatePro: (licenseKey: string) => void;
  isPro: boolean;
  currentLicenseKey?: string;
  isTrial?: boolean;
  trialStatus?: TrialStatus;
}

export const UpgradeModal: React.FC<UpgradeModalProps> = ({
  isOpen,
  onClose,
  onActivatePro,
  isPro,
  currentLicenseKey = '',
  isTrial = false,
  trialStatus,
}) => {
  const isPermanentPro = isPro && !isTrial;
  const isElectronEnv = Boolean((window as unknown as { electronAPI?: { isElectron?: boolean } }).electronAPI?.isElectron);
  const [licenseKeyInput, setLicenseKeyInput] = useState('');
  const [keyError, setKeyError] = useState<string | null>(null);
  const [showKeyInput, setShowKeyInput] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);
  const [justUnlocked, setJustUnlocked] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [hasGooglePlayBilling, setHasGooglePlayBilling] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'getDigitalGoodsService' in window) {
      setHasGooglePlayBilling(true);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleGooglePlayCheckout = async () => {
    setIsCheckingOut(true);
    setKeyError(null);
    try {
      const PaymentReq = (window as any).PaymentRequest;
      if (!PaymentReq) {
        throw new Error('Google Play PaymentRequest API is unavailable.');
      }
      const req = new PaymentReq(
        [
          {
            supportedMethods: 'https://play.google.com/billing',
            data: { sku: 'omnivibe_pro_lifetime' },
          },
        ],
        {
          total: {
            label: 'OmniVibe Pro Lifetime License',
            amount: { currency: 'USD', value: '19.00' },
          },
        }
      );
      const response = await req.show();
      const token = response?.details?.purchaseToken || '';
      const verifyRes = await fetch('/api/store-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform: 'google_play',
          sku: 'omnivibe_pro_lifetime',
          purchaseToken: token,
        }),
      });
      await response.complete(verifyRes.ok ? 'success' : 'fail');
      if (verifyRes.ok) {
        const data = await verifyRes.json();
        onActivatePro(data.licenseKey || 'OMNI-FOUNDER-2026-FOREVER');
        setJustUnlocked(true);
        setTimeout(() => {
          setJustUnlocked(false);
          onClose();
        }, 1800);
        return;
      }
      setKeyError('Unable to verify Google Play purchase. Please try again.');
    } catch (err: any) {
      setKeyError(err?.message || 'Google Play Billing was cancelled or unavailable.');
    } finally {
      setIsCheckingOut(false);
    }
  };

  const handleCreateCheckout = async () => {
    if (isElectronEnv) {
      const electronApi = (window as unknown as { electronAPI?: { openExternal?: (u: string) => void } }).electronAPI;
      if (electronApi?.openExternal) {
        electronApi.openExternal(STRIPE_PAYMENT_LINK_URL);
        return;
      }
    }
    setIsCheckingOut(true);
    try {
      const res = await fetch('/api/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.checkoutUrl) {
          window.location.href = data.checkoutUrl;
          return;
        }
      }
    } catch {
      // Fallback to direct payment link
    } finally {
      setIsCheckingOut(false);
    }
    window.open(STRIPE_PAYMENT_LINK_URL, '_blank');
  };

  const handleActivateWithKey = async (e: React.FormEvent) => {
    e.preventDefault();
    const rawKey = licenseKeyInput.trim();
    if (!rawKey) return;

    setIsVerifying(true);
    setKeyError(null);

    // 1. In web browsers, verify against Cloudflare Worker API edge verification first
    if (!isElectronEnv) {
      try {
        const res = await fetch('/api/verify-license', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ licenseKey: rawKey }),
        });

        if (res.ok) {
          const data = await res.json();
          if (data.valid) {
            onActivatePro(data.licenseKey || normalizeLicenseKey(rawKey));
            setKeyError(null);
            setJustUnlocked(true);
            setTimeout(() => {
              setJustUnlocked(false);
              onClose();
            }, 1800);
            setIsVerifying(false);
            return;
          }
        }
      } catch {
        // Offline or network error: transparently fall through to offline cryptographic engine
      }
    }

    // 2. 100% Offline deterministic polynomial / HMAC signature validation
    setIsVerifying(false);

    // 2. Offline deterministic polynomial / HMAC signature validation
    const validation = validateLicenseKey(rawKey);
    if (validation.isValid) {
      const normalized = normalizeLicenseKey(rawKey);
      onActivatePro(normalized);
      setKeyError(null);
      setJustUnlocked(true);
      setTimeout(() => {
        setJustUnlocked(false);
        onClose();
      }, 1800);
    } else {
      setKeyError(validation.error || 'Invalid or unrecognized unlock code.');
    }
  };

  const handleUseFounderTestKey = () => {
    const key = 'OMNI-FOUNDER-2026-FOREVER';
    onActivatePro(key);
    setJustUnlocked(true);
    setTimeout(() => {
      setJustUnlocked(false);
      onClose();
    }, 1800);
  };

  const handleCopyExistingKey = () => {
    if (!currentLicenseKey) return;
    navigator.clipboard.writeText(currentLicenseKey);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2500);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="upgrade-modal-title"
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 select-none animate-in fade-in duration-200"
    >
      <div className="hardware-panel max-w-xl w-full p-6 rounded-3xl flex flex-col gap-5 border border-studio-border max-h-[92vh] overflow-y-auto shadow-2xl relative">
        {/* Close Button */}
        <button
          onClick={onClose}
          aria-label="Close modal"
          className="absolute top-5 right-5 p-1.5 rounded-xl text-studio-textMuted hover:text-studio-text hover:bg-studio-surface transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Celebration State if Just Unlocked */}
        {justUnlocked ? (
          <div className="py-12 flex flex-col items-center text-center gap-4 animate-in zoom-in-95 duration-300">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 border-2 border-emerald-400 text-emerald-400 flex items-center justify-center animate-bounce shadow-xl shadow-emerald-500/20">
              <CheckCircle2 className="w-10 h-10" />
            </div>
            <div>
              <h2 className="text-2xl font-mono font-bold text-emerald-300">
                LIFETIME LICENSE UNLOCKED!
              </h2>
              <p className="text-xs font-mono text-studio-textMuted mt-1">
                All 9 visualizers, smart lighting sync, system audio loopback, and skins are permanently enabled offline.
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Header with Founder Badge */}
            <div className="flex flex-col items-center text-center gap-2 pt-2">
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-gradient-to-r from-amber-500/20 to-sky-500/20 border border-amber-500/30 text-amber-400 text-xs font-mono font-bold">
                <Sparkles className="w-3.5 h-3.5" />
                <span>PERMANENT OFFLINE LICENSE</span>
              </div>

              <h2 id="upgrade-modal-title" className="text-2xl font-mono font-bold text-studio-text tracking-tight">
                {isPermanentPro
                  ? 'OmniVibe Studio — Offline License Active'
                  : isTrial
                    ? `3-Day Free Trial (${formatTrialRemaining(trialStatus)})`
                    : trialStatus?.isExpired
                      ? '3-Day Free Trial Ended — Unlock for $9.99'
                      : 'OmniVibe Studio — Lifetime Offline Key'}
              </h2>
              <p className="text-xs font-mono text-studio-textMuted max-w-md">
                {isPermanentPro
                  ? 'Your lifetime license is permanently verified and securely stored offline on this computer.'
                  : isTrial
                    ? 'You have full offline access to all 9 shaders, system audio loopback, and Hue/Govee/WiZ lighting sync during your 3-day free trial. Enter your $9.99 offline key anytime to keep forever.'
                    : '100% offline downloadable Windows & macOS program. Try free for 3 days, then $9.99 one-time for lifetime ownership — zero subscriptions.'}
              </p>

              {/* Price Tag or Active Status */}
              {!isPermanentPro ? (
                <div className="flex items-baseline gap-2.5 mt-2">
                  <span className="text-3xl font-mono font-extrabold text-studio-accent">$9.99</span>
                  <span className="text-xs font-mono text-emerald-400 font-semibold bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/30">
                    3-DAY FREE TRIAL · ONE-TIME UNLOCK
                  </span>
                </div>
              ) : (
                <div className="mt-2 flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-mono">
                  <ShieldCheck className="w-4 h-4" />
                  <span>Verified Offline Lifetime License Active</span>
                </div>
              )}
            </div>

            {/* If Permanent Pro, show license backup */}
            {isPermanentPro && currentLicenseKey && (
              <div className="p-4 rounded-2xl bg-black/50 border border-studio-border flex flex-col gap-2">
                <span className="text-[11px] font-mono text-studio-textMuted uppercase">
                  Your Active Offline License Key:
                </span>
                <div className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-studio-surface border border-studio-borderSubtle font-mono text-xs text-studio-accent select-all">
                  <span className="truncate">{currentLicenseKey}</span>
                  <button
                    onClick={handleCopyExistingKey}
                    className="p-1 rounded-lg bg-black/40 hover:bg-black/60 text-studio-text shrink-0"
                    title="Copy Key"
                  >
                    {copiedKey ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            )}

            {/* Unified Everything-Included Checklist (No Tier Splitting) */}
            <div className="hardware-card p-4 rounded-2xl flex flex-col gap-2 border border-studio-borderSubtle">
              <div className="text-[11px] font-mono font-bold text-studio-accent border-b border-studio-borderSubtle pb-2">
                INCLUDED IN YOUR 100% OFFLINE INSTALLER (3-DAY TRIAL → $9.99 ONCE)
              </div>

              {[
                { feature: 'All 9 60fps 3D WebGL Shaders & Custom Shader Studio', icon: <Tv className="w-3.5 h-3.5 text-studio-accent" /> },
                { feature: '1-Click System Audio Loopback (Spotify, YouTube, Games)', icon: <Zap className="w-3.5 h-3.5 text-studio-accent" /> },
                { feature: 'Built-in Local Hardware Bridge (Hue DTLS, Govee LAN, WiZ UDP)', icon: <Layers className="w-3.5 h-3.5 text-studio-accent" /> },
                { feature: '8 Generative Soundscapes, Circadian Guardrails & Multi-Zone Sync', icon: <Sun className="w-3.5 h-3.5 text-studio-accent" /> },
                { feature: 'All 18+ Atmosphere Presets, Studio Drawer & 9 Swappable Skins', icon: <Palette className="w-3.5 h-3.5 text-studio-accent" /> },
                { feature: 'Dual-Screen / TV Big-Stage Cast — Runs 100% Offline Forever', icon: <Sliders className="w-3.5 h-3.5 text-studio-accent" /> },
              ].map((row, idx) => (
                <div key={idx} className="flex items-center justify-between text-xs font-mono py-1">
                  <span className="flex items-center gap-2 text-studio-text text-[11px]">
                    {row.icon}
                    {row.feature}
                  </span>
                  <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                </div>
              ))}
            </div>

            {/* Primary Stripe / Store Checkout CTA */}
            {!isPermanentPro && (
              <div className="flex flex-col gap-2">
                {hasGooglePlayBilling && (
                  <button
                    onClick={handleGooglePlayCheckout}
                    disabled={isCheckingOut}
                    className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-sky-400 via-cyan-400 to-emerald-400 text-black font-mono font-bold text-xs sm:text-sm uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-sky-500/20 hover:scale-[1.01] active:scale-95 transition-all disabled:opacity-60 cursor-pointer whitespace-nowrap"
                  >
                    <span>{isCheckingOut ? 'PROCESSING...' : 'UNLOCK LIFETIME LICENSE — $9.99'}</span>
                    <ShieldCheck className="w-4 h-4 shrink-0" />
                  </button>
                )}

                <button
                  onClick={handleCreateCheckout}
                  disabled={isCheckingOut}
                  className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-amber-400 via-amber-300 to-studio-accent text-black font-mono font-bold text-xs sm:text-sm uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 hover:scale-[1.01] active:scale-95 transition-all disabled:opacity-60 cursor-pointer whitespace-nowrap"
                >
                  <span>{isCheckingOut ? 'OPENING STRIPE...' : 'GET LIFETIME KEY — $9.99'}</span>
                  <ExternalLink className="w-4 h-4 shrink-0" />
                </button>

                <div className="flex items-center justify-center gap-4 text-[10px] font-mono text-studio-textMuted">
                  <span className="flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3 text-emerald-400" />
                    14-Day Money Back Guarantee
                  </span>
                  <span>•</span>
                  <span>Instant Offline Key</span>
                  <span>•</span>
                  <span>100% Offline Capable</span>
                </div>
              </div>
            )}

            {/* License Key Toggle & Input */}
            {!isPermanentPro && (
            <div className="border-t border-studio-borderSubtle pt-3 flex flex-col gap-2">
              {!showKeyInput && !isElectronEnv ? (
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-studio-textMuted">Have an unlock code?</span>
                  <button
                    onClick={() => setShowKeyInput(true)}
                    className="text-studio-accent hover:underline flex items-center gap-1"
                  >
                    <KeyRound className="w-3.5 h-3.5" />
                    <span>Paste Unlock Code</span>
                  </button>
                </div>
              ) : (
                <form onSubmit={handleActivateWithKey} className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="Paste unlock code of any length (e.g. OMNI-XXXX...)"
                      value={licenseKeyInput}
                      onChange={(e) => {
                        setLicenseKeyInput(e.target.value);
                        setKeyError(null);
                      }}
                      className="flex-1 px-3 py-2 rounded-xl bg-black/60 border border-studio-border text-xs font-mono text-studio-text focus:outline-none focus:border-studio-accent"
                    />
                    <button
                      type="submit"
                      className="px-4 py-2 rounded-xl bg-studio-accent text-black font-mono font-bold text-xs shrink-0 hover:bg-sky-300 transition-colors"
                    >
                      Unlock Pro
                    </button>
                  </div>

                  {keyError && <span className="text-[10px] font-mono text-amber-400">{keyError}</span>}

                  {import.meta.env.DEV && (

                  <div className="flex items-center justify-between text-[11px] font-mono text-studio-textMuted pt-1">
                    <span>Quick Founder Testing:</span>
                    <button
                      type="button"
                      onClick={handleUseFounderTestKey}
                      className="text-amber-400 font-semibold hover:underline flex items-center gap-1"
                    >
                      <span>1-Click Founder Key (OMNI-FOUNDER-2026-FOREVER)</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
)}
                </form>
              )}
            </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
