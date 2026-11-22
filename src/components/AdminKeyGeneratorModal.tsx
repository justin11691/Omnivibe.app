import React, { useState } from 'react';
import {
  X,
  Key,
  ShieldCheck,
  Copy,
  Check,
  Lock,
  Sparkles,
  Download,
  Terminal,
  UserCheck,
} from 'lucide-react';
import {
  generateCustomerLicenseKey,
  validateLicenseKey,
  OWNER_PIN,
} from '../utils/licenseEngine';

interface AdminKeyGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApplyKeyToCurrentSession?: (key: string) => void;
}

export const AdminKeyGeneratorModal: React.FC<AdminKeyGeneratorModalProps> = ({
  isOpen,
  onClose,
  onApplyKeyToCurrentSession,
}) => {
  const [pinInput, setPinInput] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);

  // Key Generation State
  const [keyType, setKeyType] = useState<'standard_4' | 'long_6' | 'signed_token'>('standard_4');
  const [buyerName, setBuyerName] = useState('Valued Customer');
  const [generatedKey, setGeneratedKey] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [batchCount, setBatchCount] = useState<number>(1);
  const [batchKeys, setBatchKeys] = useState<string[]>([]);

  if (!isOpen) return null;

  const handleVerifyPin = (e: React.FormEvent) => {
    e.preventDefault();
    if (pinInput.trim() === OWNER_PIN) {
      setIsAuthenticated(true);
      setPinError(null);
      // Auto-generate first key
      const key = generateCustomerLicenseKey(keyType, buyerName);
      setGeneratedKey(key);
    } else {
      setPinError('Incorrect Owner PIN.');
    }
  };

  const handleGenerate = () => {
    if (batchCount > 1) {
      const keys: string[] = [];
      for (let i = 0; i < batchCount; i++) {
        keys.push(generateCustomerLicenseKey(keyType, `${buyerName} #${i + 1}`));
      }
      setBatchKeys(keys);
      setGeneratedKey(keys[0]);
    } else {
      setBatchKeys([]);
      const key = generateCustomerLicenseKey(keyType, buyerName);
      setGeneratedKey(key);
    }
    setCopied(false);
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleExportBatch = () => {
    if (batchKeys.length === 0) return;
    const blob = new Blob([batchKeys.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `omnivibe_license_keys_${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Immediate offline validation check of the generated key
  const validationStatus = generatedKey ? validateLicenseKey(generatedKey) : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200 select-none"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-xl bg-[#090b12] border border-studio-border rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-studio-border bg-studio-surface/50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-400">
              <Key className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-heading tracking-widest text-[#E2E8F0] uppercase">
                  Owner License Key Generator
                </h2>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/30 uppercase font-bold">
                  ADMIN ONLY
                </span>
              </div>
              <p className="text-xs font-mono text-studio-textMuted">
                Cryptographically generates offline-valid customer unlock codes
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-studio-textMuted hover:text-studio-text hover:bg-studio-surface transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5">
          {!isAuthenticated ? (
            <form onSubmit={handleVerifyPin} className="space-y-4 py-4">
              <div className="text-center space-y-2">
                <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center mx-auto">
                  <Lock className="w-6 h-6" />
                </div>
                <h3 className="text-base font-subheading font-bold text-studio-text uppercase tracking-wider">
                  Admin Authorization Required
                </h3>
                <p className="text-xs font-mono text-studio-textMuted max-w-sm mx-auto">
                  Enter the owner security PIN to generate offline customer unlock codes.
                </p>
              </div>

              <div className="max-w-xs mx-auto space-y-2">
                <input
                  type="password"
                  placeholder="Enter Owner PIN"
                  value={pinInput}
                  onChange={(e) => setPinInput(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-black/60 border border-studio-border text-center font-mono text-sm tracking-widest text-studio-text focus:outline-none focus:border-amber-400"
                  autoFocus
                />
                {pinError && <p className="text-xs font-mono text-red-400 text-center">{pinError}</p>}
                <button
                  type="submit"
                  className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-mono font-bold text-xs uppercase tracking-wider transition-all shadow-md shadow-amber-500/20"
                >
                  Unlock Generator
                </button>
              </div>
            </form>
          ) : (
            <div className="space-y-4">
              {/* Key Config Options */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-mono text-studio-textMuted uppercase block mb-1">
                    Key Format & Length:
                  </label>
                  <select
                    value={keyType}
                    onChange={(e: any) => setKeyType(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-black/50 border border-studio-border text-xs font-mono text-studio-text focus:border-amber-400 focus:outline-none"
                  >
                    <option value="standard_4">Standard (OMNI-XXXX-XXXX-XXXX-CSUM)</option>
                    <option value="long_6">Long 6-Block (Enterprise Length)</option>
                    <option value="signed_token">Signed Metadata Token (Base64)</option>
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-mono text-studio-textMuted uppercase block mb-1">
                    Batch Count:
                  </label>
                  <select
                    value={batchCount}
                    onChange={(e) => setBatchCount(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl bg-black/50 border border-studio-border text-xs font-mono text-studio-text focus:border-amber-400 focus:outline-none"
                  >
                    <option value={1}>1 Single Key</option>
                    <option value={5}>5 Keys (Batch)</option>
                    <option value={10}>10 Keys (Fulfillment Batch)</option>
                  </select>
                </div>
              </div>

              {keyType === 'signed_token' && (
                <div>
                  <label className="text-[11px] font-mono text-studio-textMuted uppercase block mb-1">
                    Customer / Buyer Name:
                  </label>
                  <input
                    type="text"
                    value={buyerName}
                    onChange={(e) => setBuyerName(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-black/50 border border-studio-border text-xs font-mono text-studio-text focus:border-amber-400 focus:outline-none"
                    placeholder="Customer Name or Email"
                  />
                </div>
              )}

              {/* Generate Button */}
              <button
                onClick={handleGenerate}
                className="w-full py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-black font-mono font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 transition-all"
              >
                <Sparkles className="w-4 h-4" />
                <span>Generate {batchCount > 1 ? `${batchCount} Valid Keys` : 'New Valid License Key'}</span>
              </button>

              {/* Generated Output */}
              {generatedKey && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[11px] font-mono">
                    <span className="text-studio-textMuted uppercase">Generated License Key:</span>
                    {validationStatus?.isValid && (
                      <span className="text-emerald-400 font-bold flex items-center gap-1">
                        <ShieldCheck className="w-3.5 h-3.5" /> 100% Cryptographically Valid (Offline)
                      </span>
                    )}
                  </div>

                  <div className="p-3 rounded-xl bg-black/70 border border-amber-500/40 flex items-center justify-between gap-3 font-mono text-xs text-amber-300 break-all select-all">
                    <span>{generatedKey}</span>
                    <button
                      onClick={() => handleCopy(generatedKey)}
                      className="p-1.5 rounded-lg bg-studio-surface hover:bg-studio-card border border-studio-border text-studio-text shrink-0 transition-all"
                      title="Copy Key"
                    >
                      {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>

                  {/* Actions for current session */}
                  <div className="flex items-center justify-between pt-1 text-xs font-mono">
                    {onApplyKeyToCurrentSession && (
                      <button
                        onClick={() => {
                          onApplyKeyToCurrentSession(generatedKey);
                          onClose();
                        }}
                        className="text-studio-accent hover:underline flex items-center gap-1"
                      >
                        <UserCheck className="w-3.5 h-3.5" />
                        <span>Unlock Current App Session with this Key</span>
                      </button>
                    )}

                    {batchKeys.length > 0 && (
                      <button
                        onClick={handleExportBatch}
                        className="text-amber-400 hover:underline flex items-center gap-1 ml-auto"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Export {batchKeys.length} Keys to .txt</span>
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Founder Master Keys Quick Reference */}
              <div className="p-3 rounded-xl bg-studio-card/60 border border-studio-borderSubtle text-[11px] font-mono space-y-1">
                <span className="text-studio-textMuted font-bold uppercase block">
                  Built-In Master &amp; Founder Keys (Offline):
                </span>
                <div className="flex items-center justify-between text-studio-accent">
                  <code>OMNI-FOUNDER-2026-FOREVER</code>
                  <button
                    onClick={() => handleCopy('OMNI-FOUNDER-2026-FOREVER')}
                    className="hover:underline text-[10px] text-studio-textMuted"
                  >
                    Copy
                  </button>
                </div>
                <div className="flex items-center justify-between text-studio-accent">
                  <code>OMNI-PRO-UNLIMITED-VIP</code>
                  <button
                    onClick={() => handleCopy('OMNI-PRO-UNLIMITED-VIP')}
                    className="hover:underline text-[10px] text-studio-textMuted"
                  >
                    Copy
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-studio-border bg-studio-surface/30 flex items-center justify-between text-[11px] font-mono text-studio-textMuted">
          <div className="flex items-center gap-1.5">
            <Terminal className="w-3.5 h-3.5 text-studio-accent" />
            <span>Shortcut: Ctrl+Shift+K / Cmd+Shift+K</span>
          </div>
          <span>PIN: 2026</span>
        </div>
      </div>
    </div>
  );
};
