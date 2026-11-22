import React from 'react';
import { CircadianRule } from '../types';
import { X, Sun, Moon, Clock } from 'lucide-react';

interface CircadianModalProps {
  isOpen: boolean;
  onClose: () => void;
  circadian: CircadianRule;
  onUpdateCircadian: (c: CircadianRule) => void;
}

export const CircadianModal: React.FC<CircadianModalProps> = ({
  isOpen,
  onClose,
  circadian,
  onUpdateCircadian,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 select-none">
      <div className="hardware-panel max-w-lg w-full p-6 rounded-2xl flex flex-col gap-5 border border-studio-border">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-studio-borderSubtle pb-3">
          <div className="flex items-center gap-2.5">
            <Sun className="w-5 h-5 text-amber-400" />
            <div>
              <h3 className="text-sm font-mono font-bold text-studio-text">
                Circadian &quot;Vibe Shifts&quot; Scheduler
              </h3>
              <p className="text-[11px] text-studio-textMuted font-mono">
                Automated biological clock lighting transitions
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
          {/* Master Enable */}
          <div className="hardware-card p-4 rounded-xl flex items-center justify-between">
            <div>
              <span className="text-xs font-mono font-bold text-studio-text block">
                Enable Circadian Clock Automation
              </span>
              <span className="text-[11px] text-studio-textMuted font-mono">
                Dynamically aligns color temperature and brightness to the sun
              </span>
            </div>
            <input
              type="checkbox"
              checked={circadian.enabled}
              onChange={(e) =>
                onUpdateCircadian({
                  ...circadian,
                  enabled: e.target.checked,
                })
              }
              className="w-4 h-4 accent-amber-400 cursor-pointer"
            />
          </div>

          {circadian.enabled && (
            <div className="flex flex-col gap-3">
              {/* Sunrise & Sunset Time */}
              <div className="grid grid-cols-2 gap-3">
                <div className="hardware-card p-3 rounded-xl flex flex-col gap-1.5">
                  <div className="flex items-center gap-1.5 text-xs font-mono text-amber-400 font-bold">
                    <Sun className="w-3.5 h-3.5" />
                    Sunrise Anchor
                  </div>
                  <div className="relative">
                    <input
                      type="time"
                      aria-label="Sunrise Anchor"
                      value={circadian.sunriseTime}
                      onChange={(e) =>
                        onUpdateCircadian({
                          ...circadian,
                          sunriseTime: e.target.value,
                        })
                      }
                      style={{ colorScheme: 'dark' }}
                      className="omni-time-input w-full pl-2.5 pr-8 py-1.5 rounded-lg bg-[#0D1117] border border-studio-border text-xs font-mono text-[#F1F5F9] focus:outline-none focus:border-studio-accent"
                    />
                    <Clock className="w-3.5 h-3.5 text-[#E2E8F0] pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2" />
                  </div>
                </div>

                <div className="hardware-card p-3 rounded-xl flex flex-col gap-1.5">
                  <div className="flex items-center gap-1.5 text-xs font-mono text-purple-400 font-bold">
                    <Moon className="w-3.5 h-3.5" />
                    Sunset Anchor
                  </div>
                  <div className="relative">
                    <input
                      type="time"
                      aria-label="Sunset Anchor"
                      value={circadian.sunsetTime}
                      onChange={(e) =>
                        onUpdateCircadian({
                          ...circadian,
                          sunsetTime: e.target.value,
                        })
                      }
                      style={{ colorScheme: 'dark' }}
                      className="omni-time-input w-full pl-2.5 pr-8 py-1.5 rounded-lg bg-[#0D1117] border border-studio-border text-xs font-mono text-[#F1F5F9] focus:outline-none focus:border-studio-accent"
                    />
                    <Clock className="w-3.5 h-3.5 text-[#E2E8F0] pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2" />
                  </div>
                </div>
              </div>

              {/* Daytime Color Temperature */}
              <div className="hardware-card p-3 rounded-xl flex flex-col gap-2">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-studio-text">Daytime Temperature (Kelvin)</span>
                  <span className="text-amber-400 font-bold">{circadian.dayTempKelvin}K</span>
                </div>
                <input
                  type="range"
                  min="3500"
                  max="6500"
                  step="100"
                  value={circadian.dayTempKelvin}
                  onChange={(e) =>
                    onUpdateCircadian({
                      ...circadian,
                      dayTempKelvin: Number(e.target.value),
                    })
                  }
                  className="w-full accent-amber-400 h-1.5 bg-black/60 rounded-lg cursor-pointer"
                />
                <div className="flex items-center justify-between text-[10px] font-mono text-studio-textMuted">
                  <span>Warm Daylight (3500K)</span>
                  <span>Cool Focus (6500K)</span>
                </div>
              </div>

              {/* Nighttime Color Temperature */}
              <div className="hardware-card p-3 rounded-xl flex flex-col gap-2">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-studio-text">Nocturnal Sleep Temperature</span>
                  <span className="text-amber-400 font-bold">{circadian.nightTempKelvin}K</span>
                </div>
                <input
                  type="range"
                  min="1800"
                  max="3000"
                  step="50"
                  value={circadian.nightTempKelvin}
                  onChange={(e) =>
                    onUpdateCircadian({
                      ...circadian,
                      nightTempKelvin: Number(e.target.value),
                    })
                  }
                  className="w-full accent-amber-400 h-1.5 bg-black/60 rounded-lg cursor-pointer"
                />
                <div className="flex items-center justify-between text-[10px] font-mono text-studio-textMuted">
                  <span>Candlelight Tungsten (1800K)</span>
                  <span>Soft Warm (3000K)</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="border-t border-studio-borderSubtle pt-3 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-studio-accent text-black font-mono font-semibold text-xs"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
