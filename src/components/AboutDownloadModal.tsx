import React, { useState, useEffect } from 'react';
import {
  X,
  Download,
  Laptop,
  CheckCircle2,
  HardDrive,
  Sparkles,
  Wifi,
  Bluetooth,
  Sliders,
  ShieldCheck,
  FileCode,
  ExternalLink,
  Info,
} from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface AboutDownloadModalProps {
  isOpen: boolean;
  onClose: () => void;
  deferredPrompt: BeforeInstallPromptEvent | null;
}

export const AboutDownloadModal: React.FC<AboutDownloadModalProps> = ({
  isOpen,
  onClose,
  deferredPrompt,
}) => {
  const [installStatus, setInstallStatus] = useState<string | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const isStandaloneMode =
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as unknown as { standalone?: boolean }).standalone === true;
      setIsStandalone(Boolean(isStandaloneMode));
    }
  }, []);

  if (!isOpen) return null;

  const handleInstallPwa = async () => {
    if (deferredPrompt) {
      try {
        await deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        if (choice.outcome === 'accepted') {
          setInstallStatus('OmniVibe installed to your computer desktop!');
        } else {
          setInstallStatus('Installation dismissed.');
        }
      } catch {
        setInstallStatus('Installation prompted in browser.');
      }
    } else {
      // In Chromium browsers when prompt isn't cached, explain native install icon
      setInstallStatus(
        'To install: In Google Chrome or Microsoft Edge, click the "Install OmniVibe" icon (computer monitor with down arrow) on the right side of your browser address bar.'
      );
    }
  };

  const handleDownloadOfflineHtml = () => {
    // Generate a standalone HTML launcher blob that redirects/opens local OmniVibe
    const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>OmniVibe — Offline Desktop App</title>
  <meta http-equiv="refresh" content="0; url=${window.location.origin}/">
  <style>
    body { background: #0D1117; color: #E2E8F0; font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
    .card { background: #1E2933; padding: 2rem; border-radius: 1rem; border: 1px solid #4A5568; text-align: center; max-width: 400px; }
    h1 { color: #38BDF8; margin-top: 0; }
    a { display: inline-block; margin-top: 1rem; background: #38BDF8; color: black; padding: 0.75rem 1.5rem; text-decoration: none; border-radius: 0.5rem; font-weight: bold; }
  </style>
</head>
<body>
  <div class="card">
    <h1>OmniVibe Studio</h1>
    <p>Opening your local atmosphere deck...</p>
    <a href="${window.location.origin}/">Open OmniVibe Deck</a>
  </div>
</body>
</html>`;

    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'OmniVibe-Desktop.html';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setInstallStatus('Downloaded "OmniVibe-Desktop.html" to your Downloads folder!');
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Save and Install OmniVibe Studio"
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 select-none animate-in fade-in duration-200"
    >
      <div className="hardware-panel max-w-2xl w-full p-6 rounded-3xl flex flex-col gap-5 border border-studio-border max-h-[92vh] overflow-hidden shadow-2xl bg-[#0D1117]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-studio-borderSubtle pb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#1E2933] border border-[#4A5568]/40 flex items-center justify-center text-studio-accent">
              <Laptop className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-xl font-heading tracking-wider text-[#E2E8F0] uppercase">
                Save &amp; Install OmniVibe to Your Computer
              </h3>
              <p className="text-[10px] font-subheading text-[#A6B0BF] uppercase tracking-wider">
                100% Client-Side • Zero Backend • Offline Ready
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-studio-textMuted hover:text-studio-text hover:bg-studio-surface"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto flex flex-col gap-4 pr-1">
          {/* Hero Explainer Card */}
          <div className="hardware-card p-5 rounded-2xl flex flex-col gap-3 bg-gradient-to-br from-[#1E2933] to-[#141A22] border border-[#4A5568]/40">
            <div className="flex items-center justify-between">
              <span className="text-xs font-heading tracking-widest text-studio-accent uppercase">
                About OmniVibe
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold">
                VERSION 1.0
              </span>
            </div>

            <p className="text-xs font-subheading text-[#E2E8F0] leading-relaxed">
              <strong>OmniVibe Studio</strong> is an offline-first atmosphere and visual mood studio. The web demo runs 60fps 3D-projected visualizers and synthesized soundscapes in your browser, while the downloadable Desktop App bundles the Local Companion Bridge for sub-50 ms Philips Hue Entertainment API, Govee LAN UDP, and WiZ UDP sync.
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-studio-borderSubtle text-[11px] font-mono text-[#A6B0BF]">
              <div className="flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>Zero Server Calls</span>
              </div>
              <div className="flex items-center gap-1.5">
                <HardDrive className="w-3.5 h-3.5 text-sky-400" />
                <span>Local Storage</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Bluetooth className="w-3.5 h-3.5 text-cyan-400" />
                <span>Local LAN Bridge</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Wifi className="w-3.5 h-3.5 text-amber-400" />
                <span>Sub-50ms UDP/DTLS</span>
              </div>
            </div>
          </div>

          {/* Three Ways to Save & Install to Computer */}
          <div className="flex flex-col gap-3">
            <span className="text-xs font-subheading uppercase text-studio-textMuted font-bold tracking-wider">
              Choose How to Install onto Your Computer:
            </span>

            {/* Option 1: 1-Click Native Desktop App Install (PWA) */}
            <div className="hardware-card p-4 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border border-studio-accent/40 bg-[#1E2933]">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-studio-accent/15 border border-studio-accent/30 flex items-center justify-center text-studio-accent shrink-0 mt-0.5">
                  <Laptop className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-subheading font-bold text-[#E2E8F0] flex items-center gap-2">
                    <span>1. Install as Native Desktop App (PWA)</span>
                    <span className="text-[9px] font-mono bg-studio-accent text-black font-bold px-1.5 py-0.2 rounded">
                      RECOMMENDED
                    </span>
                  </h4>
                  <p className="text-[11px] font-subheading text-[#A6B0BF] mt-0.5">
                    Installs directly to your Windows, Mac, or ChromeOS desktop with its own native window, taskbar icon, and runs 100% offline without opening a browser tab.
                  </p>
                </div>
              </div>

              <button
                onClick={handleInstallPwa}
                disabled={isStandalone}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-studio-accent text-black font-mono font-bold text-xs shrink-0 shadow-md hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                <Download className="w-4 h-4" />
                <span>{isStandalone ? 'Already Installed' : 'Install to Desktop'}</span>
              </button>
            </div>

            {/* Option 2: Standalone Offline File */}
            <div className="hardware-card p-4 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border border-studio-borderSubtle bg-[#141A22]">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-[#E2E8F0] shrink-0 mt-0.5">
                  <FileCode className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-subheading font-bold text-[#E2E8F0]">
                    2. Download Standalone Desktop File (.html)
                  </h4>
                  <p className="text-[11px] font-subheading text-[#A6B0BF] mt-0.5">
                    Saves a local desktop shortcut to your computer. Double-clicking it opens OmniVibe instantly from your hard drive without typing a URL.
                  </p>
                </div>
              </div>

              <button
                onClick={handleDownloadOfflineHtml}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-[#1E2933] border border-[#4A5568]/50 text-studio-text font-mono font-bold text-xs shrink-0 hover:border-studio-accent flex items-center justify-center gap-1.5"
              >
                <Download className="w-4 h-4" />
                <span>Save File</span>
              </button>
            </div>

            {/* Option 3: 100% Offline Desktop Installers */}
            <div className="hardware-card p-4 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border border-studio-borderSubtle bg-[#141A22]">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-amber-400 shrink-0 mt-0.5">
                  <HardDrive className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-subheading font-bold text-[#E2E8F0]">
                    3. Offline Desktop Program (.exe / .dmg — 3-Day Free Trial)
                  </h4>
                  <p className="text-[11px] font-subheading text-[#A6B0BF] mt-0.5">
                    Includes system audio loopback (Windows &amp; macOS) and the embedded Local Companion Bridge with zero setup.
                  </p>
                </div>
              </div>
              <a
                href="https://github.com/justin11691/Omnivibe.app/releases"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-[#1E2933] border border-[#4A5568]/50 text-studio-accent font-mono font-bold text-xs shrink-0 hover:border-studio-accent flex items-center justify-center gap-1.5 whitespace-nowrap"
              >
                <ExternalLink className="w-4 h-4" />
                <span>Get Installer</span>
              </a>
            </div>
          </div>

          {installStatus && (
            <div className="p-3 rounded-xl bg-studio-accent/10 border border-studio-accent/30 text-xs font-mono text-studio-accent flex items-start gap-2">
              <Info className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{installStatus}</span>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="border-t border-studio-borderSubtle pt-3 flex items-center justify-between text-xs font-mono text-studio-textMuted">
          <span className="text-[11px]">OmniVibe requires no accounts, no credit cards, and no server sign-in.</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-studio-accent text-black font-semibold font-mono"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
