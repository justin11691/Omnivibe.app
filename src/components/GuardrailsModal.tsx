import React from 'react';
import { Guardrails } from '../types';
import { X, ShieldAlert, Moon, Activity, Clock } from 'lucide-react';

interface GuardrailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  guardrails: Guardrails;
  onUpdateGuardrails: (guardrails: Guardrails) => void;
}

export const GuardrailsModal: React.FC<GuardrailsModalProps> = ({
  isOpen,
  onClose,
  guardrails,
  onUpdateGuardrails,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 select-none">
      <div className="hardware-panel max-w-lg w-full p-6 rounded-2xl flex flex-col gap-5 border border-studio-border">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-studio-borderSubtle pb-3">
          <div className="flex items-center gap-2.5">
            <ShieldAlert className="w-5 h-5 text-studio-accent" />
            <div>
              <h3 className="text-sm font-mono font-bold text-studio-text">
                Safety & Comfort Guardrails
              </h3>
              <p className="text-[11px] text-studio-textMuted font-mono">
                Photosensitivity protection and scheduled nocturnal quiet mode
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

        {/* Content */}
        <div className="flex flex-col gap-4">
          {/* Photosensitivity Limiter */}
          <div className="hardware-card p-4 rounded-xl flex flex-col gap-2.5">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="flex items-center gap-1.5 text-studio-text font-bold">
                <Activity className="w-4 h-4 text-studio-accent" />
                Photosensitivity Flash Rate Limiter
              </span>
              <span className="text-studio-accent font-bold">
                Max {guardrails.photosensitivityLimit} Hz
              </span>
            </div>
            <p className="text-[11px] text-studio-textMuted font-mono">
              Hard-clamps maximum rapid color strobing frequency to protect eyes and prevent seizure risks.
            </p>
            <input
              type="range"
              min="1"
              max="10"
              step="1"
              value={guardrails.photosensitivityLimit}
              onChange={(e) =>
                onUpdateGuardrails({
                  ...guardrails,
                  photosensitivityLimit: Number(e.target.value),
                })
              }
              className="w-full accent-studio-accent h-1.5 bg-black/60 rounded-lg cursor-pointer"
            />
            <div className="flex items-center justify-between text-[10px] font-mono text-studio-textMuted">
              <span>Ultra Gentle (1 Hz)</span>
              <span>Fast Reactivity (10 Hz)</span>
            </div>
          </div>

          {/* Smooth Transitions Toggle */}
          <div className="hardware-card p-4 rounded-xl flex items-center justify-between">
            <div>
              <span className="text-xs font-mono font-bold text-studio-text block">
                Organic Transition Smoothing
              </span>
              <span className="text-[11px] text-studio-textMuted font-mono">
                Applies non-linear ease curves to all color stops
              </span>
            </div>
            <input
              type="checkbox"
              checked={guardrails.smoothTransitions}
              onChange={(e) =>
                onUpdateGuardrails({
                  ...guardrails,
                  smoothTransitions: e.target.checked,
                })
              }
              className="w-4 h-4 accent-studio-accent cursor-pointer"
            />
          </div>

          {/* Quiet Hours Mode */}
          <div className="hardware-card p-4 rounded-xl flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Moon className="w-4 h-4 text-purple-400" />
                <span className="text-xs font-mono font-bold text-studio-text">
                  Quiet Hours Bedtime Mode
                </span>
              </div>
              <input
                type="checkbox"
                checked={guardrails.quietHoursEnabled}
                onChange={(e) =>
                  onUpdateGuardrails({
                    ...guardrails,
                    quietHoursEnabled: e.target.checked,
                  })
                }
                className="w-4 h-4 accent-purple-400 cursor-pointer"
              />
            </div>

            {guardrails.quietHoursEnabled && (
              <div className="flex flex-col gap-3 pt-2 border-t border-studio-borderSubtle">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-mono text-studio-textMuted block mb-1">
                      Start Time
                    </label>
                    <div className="relative">
                      <input
                        type="time"
                        aria-label="Start Time"
                        value={guardrails.quietHoursStart}
                        onChange={(e) =>
                          onUpdateGuardrails({
                            ...guardrails,
                            quietHoursStart: e.target.value,
                          })
                        }
                        style={{ colorScheme: 'dark' }}
                        className="omni-time-input w-full pl-2.5 pr-8 py-1.5 rounded-lg bg-[#0D1117] border border-studio-border text-xs font-mono text-[#F1F5F9] focus:outline-none focus:border-studio-accent"
                      />
                      <Clock className="w-3.5 h-3.5 text-[#E2E8F0] pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2" />
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-mono text-studio-textMuted block mb-1">
                      End Time
                    </label>
                    <div className="relative">
                      <input
                        type="time"
                        aria-label="End Time"
                        value={guardrails.quietHoursEnd}
                        onChange={(e) =>
                          onUpdateGuardrails({
                            ...guardrails,
                            quietHoursEnd: e.target.value,
                          })
                        }
                        style={{ colorScheme: 'dark' }}
                        className="omni-time-input w-full pl-2.5 pr-8 py-1.5 rounded-lg bg-[#0D1117] border border-studio-border text-xs font-mono text-[#F1F5F9] focus:outline-none focus:border-studio-accent"
                      />
                      <Clock className="w-3.5 h-3.5 text-[#E2E8F0] pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2" />
                    </div>
                  </div>
                </div>

                {/* Quiet Hours Max Brightness */}
                <div className="flex flex-col gap-1">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-studio-textMuted">Bedtime Max Brightness Cap</span>
                    <span className="text-purple-400 font-bold">{guardrails.quietHoursMaxBrightness}%</span>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="60"
                    value={guardrails.quietHoursMaxBrightness}
                    onChange={(e) =>
                      onUpdateGuardrails({
                        ...guardrails,
                        quietHoursMaxBrightness: Number(e.target.value),
                      })
                    }
                    className="w-full accent-purple-400 h-1.5 bg-black/60 rounded-lg cursor-pointer"
                  />
                </div>

                {/* Bass Damping */}
                <div className="flex flex-col gap-1">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-studio-textMuted">Sub-Bass Vibration Damping</span>
                    <span className="text-purple-400 font-bold">
                      {Math.round(guardrails.quietHoursBassDamping * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0.1"
                    max="0.8"
                    step="0.05"
                    value={guardrails.quietHoursBassDamping}
                    onChange={(e) =>
                      onUpdateGuardrails({
                        ...guardrails,
                        quietHoursBassDamping: Number(e.target.value),
                      })
                    }
                    className="w-full accent-purple-400 h-1.5 bg-black/60 rounded-lg cursor-pointer"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="border-t border-studio-borderSubtle pt-3 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-studio-accent text-black font-mono font-semibold text-xs"
          >
            Save Guardrails
          </button>
        </div>
      </div>
    </div>
  );
};
