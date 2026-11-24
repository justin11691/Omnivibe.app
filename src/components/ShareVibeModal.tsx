import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { VibePreset } from '../types';
import { encodeVibeToUrlHash } from '../utils/storage';
import { X, QrCode, Copy, Check, Share2, ThumbsUp } from 'lucide-react';

interface ShareVibeModalProps {
  isOpen: boolean;
  onClose: () => void;
  preset: VibePreset;
  allPresets: VibePreset[];
  onSelectPreset: (p: VibePreset) => void;
}

export const ShareVibeModal: React.FC<ShareVibeModalProps> = ({
  isOpen,
  onClose,
  preset,
  allPresets,
  onSelectPreset,
}) => {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [guestVotes, setGuestVotes] = useState<Record<string, number>>({
    'deep-focus': 3,
    'late-night-lounge': 8,
    'bass-drop': 12,
    'rainy-cyberpunk': 6,
  });

  const base64Code = encodeVibeToUrlHash(preset);
  const shareableUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/#vibe=${base64Code}`
    : `https://omnivibe.app/#vibe=${base64Code}`;

  useEffect(() => {
    if (!isOpen) return;

    QRCode.toDataURL(shareableUrl, {
      width: 240,
      margin: 1.5,
      color: {
        dark: '#08090d',
        light: '#f1f5f9',
      },
    })
      .then((url) => setQrDataUrl(url))
      .catch((err) => console.error('QR code generation failed:', err));
  }, [isOpen, shareableUrl]);

  if (!isOpen) return null;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(shareableUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(base64Code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleVote = (presetId: string) => {
    setGuestVotes((prev) => ({
      ...prev,
      [presetId]: (prev[presetId] || 0) + 1,
    }));
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Share Vibe Code and Party Guest QR"
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 select-none"
    >
      <div className="hardware-panel max-w-xl w-full p-6 rounded-2xl flex flex-col gap-5 border border-studio-border max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-studio-borderSubtle pb-3">
          <div className="flex items-center gap-2.5">
            <Share2 className="w-5 h-5 text-studio-accent" />
            <div>
              <h3 className="text-sm font-mono font-bold text-studio-text">
                Share Vibe Code & Party Guest QR
              </h3>
              <p className="text-[11px] text-studio-textMuted font-mono">
                100% client-side zero-database URL encoding & live guest voting
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-studio-textMuted hover:text-studio-text hover:bg-studio-surface"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* QR Code & Share URL */}
        <div className="flex flex-col sm:flex-row items-center gap-5 hardware-card p-4 rounded-xl">
          {qrDataUrl && (
            <div className="bg-white p-2 rounded-xl shadow-lg border border-white/20 flex-shrink-0">
              <img src={qrDataUrl} alt="Party Guest Vibe QR" className="w-36 h-36" />
            </div>
          )}

          <div className="flex-1 flex flex-col gap-2.5 w-full">
            <div className="text-xs font-mono font-bold text-studio-text">
              Active Atmosphere: {preset.name}
            </div>
            <p className="text-[11px] text-studio-textMuted">
              Anyone with this link or QR code can instantly launch your custom light, color, and soundscape presets in their own browser.
            </p>

            {/* Copy Link Button */}
            <button
              onClick={handleCopyLink}
              className="flex items-center justify-center gap-1.5 w-full py-2 rounded-xl bg-studio-accent text-black font-mono font-bold text-xs shadow-md transition-all hover:opacity-90"
            >
              {copiedLink ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              <span>{copiedLink ? 'Link Copied to Clipboard!' : 'Copy Shareable Link'}</span>
            </button>

            {/* Compact Base64 Code */}
            <div className="flex items-center gap-1.5 bg-black/50 p-1.5 rounded-lg border border-studio-borderSubtle">
              <input
                type="text"
                readOnly
                value={base64Code}
                className="w-full bg-transparent text-[10px] font-mono text-studio-textMuted truncate focus:outline-none"
              />
              <button
                onClick={handleCopyCode}
                className="text-xs font-mono text-studio-accent hover:underline flex-shrink-0 px-1"
              >
                {copiedCode ? 'Copied' : 'Copy Code'}
              </button>
            </div>
          </div>
        </div>

        {/* Party Guest Live Voting Simulator */}
        <div className="hardware-card p-4 rounded-xl flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <QrCode className="w-4 h-4 text-studio-accent" />
              <span className="text-xs font-mono font-bold text-studio-text">
                Live Party Guest Vibe Vote
              </span>
            </div>
            <span className="text-[10px] font-mono text-studio-accent bg-studio-accent/10 px-2 py-0.5 rounded-full">
              Simulated Room Votes
            </span>
          </div>

          <p className="text-[11px] text-studio-textMuted font-mono">
            Guests on the same Wi-Fi can scan the QR code to vote for the next room vibe or trigger the next atmosphere:
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {allPresets.slice(0, 4).map((p) => {
              const votes = guestVotes[p.id] || 0;
              const isCurrent = p.id === preset.id;

              return (
                <div
                  key={p.id}
                  className={`p-2.5 rounded-lg border flex items-center justify-between text-xs font-mono ${
                    isCurrent
                      ? 'bg-studio-surface border-studio-accent'
                      : 'bg-black/30 border-studio-borderSubtle'
                  }`}
                >
                  <div className="truncate mr-2">
                    <span className="font-bold text-studio-text">{p.name}</span>
                    {isCurrent && <span className="text-[10px] text-studio-accent block">CURRENT</span>}
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-studio-textMuted font-bold">{votes}</span>
                    <button
                      onClick={() => handleVote(p.id)}
                      className="p-1.5 rounded-md bg-studio-elevated hover:bg-studio-border text-studio-accent"
                      title="Vote for this vibe"
                    >
                      <ThumbsUp className="w-3 h-3" />
                    </button>
                    {!isCurrent && (
                      <button
                        onClick={() => onSelectPreset(p)}
                        className="px-2 py-1 rounded-md bg-studio-accent text-black text-[10px] font-bold"
                      >
                        Play
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-studio-borderSubtle pt-2 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-studio-surface border border-studio-border text-studio-text font-mono text-xs hover:border-studio-accent"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
