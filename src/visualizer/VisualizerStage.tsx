import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  VisualizerMode,
  VibePreset,
  AudioTelemetry,
  VisualizerSettings,
  StageBroadcastMessage,
} from '../types';
import { globalAudioEngine } from '../audio/AudioEngine';
import {
  Maximize2,
  Minimize2,
  Sparkles,
  Activity,
  Layers,
  Radio,
  Lock,
  Zap,
  Box,
  Flame,
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

interface VisualizerStageProps {
  mode: VisualizerMode;
  preset: VibePreset;
  telemetry: AudioTelemetry;
  settings: VisualizerSettings;
  isStageWindow?: boolean;
  isPro?: boolean;
  isBlackout?: boolean;
  onModeChange?: (mode: VisualizerMode) => void;
  onOpenUpgradeModal?: () => void;
  onOpenCustomBuilder?: () => void;
}

export const VisualizerStage: React.FC<VisualizerStageProps> = ({
  mode,
  preset,
  telemetry,
  settings,
  isStageWindow = false,
  isPro = false,
  isBlackout = false,
  onModeChange,
  onOpenUpgradeModal,
  onOpenCustomBuilder,
}) => {
  const modeRef = useRef(mode);
  const presetRef = useRef(preset);
  const telemetryRef = useRef(telemetry);
  const settingsRef = useRef(settings);
  const isBlackoutRef = useRef(isBlackout);

  modeRef.current = mode;
  presetRef.current = preset;
  telemetryRef.current = telemetry;
  settingsRef.current = settings;
  isBlackoutRef.current = isBlackout;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const hideControlsTimerRef = useRef<number | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  const handleScrollModes = (direction: 'left' | 'right') => {
    if (scrollContainerRef.current) {
      const offset = direction === 'left' ? -220 : 220;
      scrollContainerRef.current.scrollBy({ left: offset, behavior: 'smooth' });
    }
  };

  // OLED pixel shift offsets
  const pixelShiftRef = useRef({ x: 0, y: 0 });

  // Broadcast channel for sync
  const channelRef = useRef<BroadcastChannel | null>(null);

  // Particles state for geometric mode
  const particlesRef = useRef<
    Array<{
      x: number;
      y: number;
      vx: number;
      vy: number;
      size: number;
      color: string;
      baseAngle: number;
      dist: number;
    }>
  >([]);

  // 3D Bars peak memory
  const peaksRef = useRef<number[]>(new Array(48).fill(0));

  // Initialize broadcast channel
  useEffect(() => {
    try {
      const channel = new BroadcastChannel('omnivibe-stage-channel');
      channelRef.current = channel;

      return () => {
        channel.close();
      };
    } catch {
      // Fallback if BroadcastChannel unsupported
    }
  }, []);

  // Broadcast live state to external stage windows if this is the main window
  useEffect(() => {
    if (!isStageWindow && channelRef.current) {
      const msg: StageBroadcastMessage = {
        type: 'STAGE_SYNC',
        preset,
        telemetry,
        visualizerMode: mode,
        visualizerSettings: settings,
        activeZones: [],
        timestamp: Date.now(),
      };
      channelRef.current.postMessage(msg);
    }
  }, [preset, telemetry, mode, settings, isStageWindow]);

  // Periodic OLED pixel shift (every 30s)
  useEffect(() => {
    if (!settings.oledBurnInProtection) return;

    const interval = window.setInterval(() => {
      pixelShiftRef.current = {
        x: (Math.random() - 0.5) * 4,
        y: (Math.random() - 0.5) * 4,
      };
    }, 30000);

    return () => clearInterval(interval);
  }, [settings.oledBurnInProtection]);

  // Auto-hide controls after 3 seconds of inactivity
  const handleMouseMove = () => {
    setShowControls(true);
    if (hideControlsTimerRef.current) clearTimeout(hideControlsTimerRef.current);
    hideControlsTimerRef.current = window.setTimeout(() => {
      setShowControls(false);
    }, 3200);
  };

  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  }, []);

  // Initialize particles once
  useEffect(() => {
    const count = Math.floor(160 * settings.particleDensity);
    const colors = preset.colors;
    const particles = [];
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 50 + Math.random() * 450;
      particles.push({
        x: 0,
        y: 0,
        vx: (Math.random() - 0.5) * 0.8,
        vy: (Math.random() - 0.5) * 0.8,
        size: 1.5 + Math.random() * 3,
        color: colors[i % colors.length] || '#38bdf8',
        baseAngle: angle,
        dist,
      });
    }
    particlesRef.current = particles;
  }, [preset.colors, settings.particleDensity]);

  // Main Canvas Render Loop (Continuous 60 FPS — reads live refs so telemetry updates never reset animation clock)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId = 0;
    let time = 0;

    const render = () => {
      const curMode = modeRef.current;
      const curPreset = presetRef.current;
      const curTelemetry = telemetryRef.current;
      const curSettings = settingsRef.current;

      time += 0.015 * (curSettings.cameraDriftSpeed || 1);

      const dpr = window.devicePixelRatio || 1;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;

      if (width > 0 && height > 0 && (canvas.width !== width * dpr || canvas.height !== height * dpr)) {
        canvas.width = width * dpr;
        canvas.height = height * dpr;
      }

      if (width === 0 || height === 0) {
        animId = requestAnimationFrame(render);
        return;
      }

      ctx.save();
      ctx.scale(dpr, dpr);

      // Instant Blackout / Panic Standby Screen
      if (isBlackoutRef.current) {
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, width, height);
        ctx.fillStyle = 'rgba(226, 232, 240, 0.28)';
        ctx.font = '12px JetBrains Mono';
        ctx.textAlign = 'center';
        ctx.fillText('BLACKOUT ACTIVE • PRESS X OR CLICK BLACKOUT TO RESUME', width / 2, height / 2);
        ctx.restore();
        animId = requestAnimationFrame(render);
        return;
      }

      // OLED Pixel Shift
      ctx.translate(pixelShiftRef.current.x, pixelShiftRef.current.y);

      // Raw FFT data
      const rawFft = globalAudioEngine.getRawFrequencyData();
      const bassEnergy = curTelemetry.bass / 100;
      const midEnergy = curTelemetry.mids / 100;
      const trebleEnergy = curTelemetry.treble / 100;
      const colors = curPreset.colors;

      // OLED Silence Screensaver
      if (curTelemetry.isSilent && curSettings.oledBurnInProtection) {
        ctx.fillStyle = '#050608';
        ctx.fillRect(0, 0, width, height);

        const cx = width / 2;
        const cy = height / 2;
        const glowRad = 40 + Math.sin(time * 0.5) * 15;
        const grad = ctx.createRadialGradient(cx, cy, 2, cx, cy, glowRad);
        grad.addColorStop(0, 'rgba(34, 211, 238, 0.16)');
        grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, cy, glowRad, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = 'rgba(255, 255, 255, 0.24)';
        ctx.font = '12px JetBrains Mono';
        ctx.textAlign = 'center';
        ctx.fillText('OLED STANDBY • AUDIO QUIET', cx, cy + 80);

        ctx.restore();
        animId = requestAnimationFrame(render);
        return;
      }

      ctx.fillStyle = curMode === 'liquid_waveforms' ? 'rgba(8, 9, 13, 0.24)' : 'rgba(8, 9, 13, 0.35)';
      ctx.fillRect(0, 0, width, height);

      switch (curMode) {
        case 'liquid_waveforms':
          renderLiquidWaveforms(ctx, width, height, rawFft, bassEnergy, trebleEnergy, colors, time, curSettings);
          break;
        case 'spectrum_3d':
          render3dSpectrum(ctx, width, height, rawFft, colors, time, peaksRef.current, curSettings);
          break;
        case 'geometric_particles':
          renderGeometricParticles(
            ctx,
            width,
            height,
            rawFft,
            bassEnergy,
            midEnergy,
            colors,
            time,
            particlesRef.current,
            curSettings
          );
          break;
        case 'harmonic_nebula':
          renderHarmonicNebula(ctx, width, height, bassEnergy, midEnergy, trebleEnergy, colors, time, curSettings);
          break;
        case 'winamp_milkdrop':
          renderWinampMilkdrop(
            ctx,
            width,
            height,
            rawFft,
            bassEnergy,
            midEnergy,
            trebleEnergy,
            colors,
            time,
            peaksRef.current,
            curSettings
          );
          break;
        case 'cyber_tunnel_3d':
          renderCyberTunnel3d(ctx, width, height, bassEnergy, midEnergy, trebleEnergy, colors, time, curSettings);
          break;
        case 'cube_matrix_3d':
          renderCubeMatrix3d(ctx, width, height, rawFft, bassEnergy, midEnergy, colors, time, curSettings);
          break;
        case 'lava_blobs_3d':
          renderLavaBlobs3d(ctx, width, height, bassEnergy, midEnergy, colors, time, curSettings);
          break;
        case 'custom_user':
          renderCustomUserVisualizer(
            ctx,
            width,
            height,
            rawFft,
            bassEnergy,
            midEnergy,
            trebleEnergy,
            colors,
            time,
            curSettings
          );
          break;
      }

      ctx.restore();
      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, []);

  const renderLiquidWaveforms = (
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    fft: Uint8Array,
    bass: number,
    treble: number,
    colors: string[],
    time: number,
    settings: VisualizerSettings
  ) => {
    ctx.globalCompositeOperation = 'screen';
    const centerY = h * 0.52;
    const waveCount = 4;

    for (let layer = 0; layer < waveCount; layer++) {
      ctx.beginPath();
      const color = colors[layer % colors.length] || '#38bdf8';
      ctx.strokeStyle = color;
      ctx.lineWidth = settings.waveThickness + layer * 0.8;
      ctx.shadowColor = color;
      ctx.shadowBlur = 12 * settings.bloomIntensity;

      const segments = 120;
      const step = w / segments;
      const speedOffset = time * (0.8 + layer * 0.3);

      for (let i = 0; i <= segments; i++) {
        const x = i * step;
        const norm = i / segments;
        const envelope = Math.sin(norm * Math.PI);

        const fftIndex = Math.floor(norm * 128);
        const freqAmp = (fft[fftIndex] || 0) / 255;

        const baseSine = Math.sin(norm * 8 + speedOffset) * 25;
        const harmonicSine = Math.cos(norm * 16 - speedOffset * 0.8) * 15;
        const bassMod = Math.sin(norm * 4 + time * 2) * bass * 60;
        const audioDisplacement = (baseSine + harmonicSine + bassMod) * envelope * (1 + freqAmp * 1.8);

        const y = centerY + audioDisplacement * (layer % 2 === 0 ? 1 : -0.85);

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.shadowBlur = 0;
  };

  const render3dSpectrum = (
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    fft: Uint8Array,
    colors: string[],
    time: number,
    peaks: number[],
    settings: VisualizerSettings
  ) => {
    const barCount = 44;
    const barWidth = Math.max(6, (w * 0.75) / barCount - 4);
    const startX = (w - barCount * (barWidth + 4)) / 2;
    const groundY = h * 0.68;

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 60) {
      ctx.beginPath();
      ctx.moveTo(w / 2, groundY * 0.6);
      ctx.lineTo(x, h);
      ctx.stroke();
    }

    for (let i = 0; i < barCount; i++) {
      const fftIdx = Math.floor((i / barCount) * 140);
      const val = (fft[fftIdx] || 0) / 255;
      const barHeight = Math.max(4, val * (h * 0.42));

      if (barHeight > peaks[i]) {
        peaks[i] = barHeight;
      } else {
        peaks[i] = Math.max(0, peaks[i] - 2.5);
      }

      const x = startX + i * (barWidth + 4);
      const y = groundY - barHeight;

      const grad = ctx.createLinearGradient(x, groundY, x, y);
      const primaryCol = colors[i % colors.length] || '#f59e0b';
      grad.addColorStop(0, primaryCol);
      grad.addColorStop(1, colors[(i + 1) % colors.length] || '#38bdf8');

      ctx.fillStyle = grad;
      ctx.shadowColor = primaryCol;
      ctx.shadowBlur = 8 * settings.bloomIntensity;
      ctx.fillRect(x, y, barWidth, barHeight);

      ctx.fillStyle = primaryCol;
      ctx.globalAlpha = 0.18;
      ctx.fillRect(x, groundY + 2, barWidth, barHeight * 0.35);
      ctx.globalAlpha = 1.0;

      const peakY = groundY - peaks[i] - 4;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x, peakY, barWidth, 2);
    }
    ctx.shadowBlur = 0;
  };

  const renderGeometricParticles = (
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    fft: Uint8Array,
    bass: number,
    mid: number,
    colors: string[],
    time: number,
    particles: Array<{
      x: number;
      y: number;
      vx: number;
      vy: number;
      size: number;
      color: string;
      baseAngle: number;
      dist: number;
    }>,
    settings: VisualizerSettings
  ) => {
    ctx.globalCompositeOperation = 'lighter';
    const cx = w / 2;
    const cy = h / 2;

    const coreRadius = 35 + bass * 70;
    const coreGrad = ctx.createRadialGradient(cx, cy, 5, cx, cy, coreRadius);
    coreGrad.addColorStop(0, colors[0] || '#38bdf8');
    coreGrad.addColorStop(0.6, colors[1] || '#818cf8');
    coreGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = coreGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, coreRadius, 0, Math.PI * 2);
    ctx.fill();

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      const angle = p.baseAngle + time * 0.3 + mid * 0.5;
      const currentDist = p.dist * (1 + bass * 0.45);

      p.x = cx + Math.cos(angle) * currentDist;
      p.y = cy + Math.sin(angle) * currentDist;

      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 6 * settings.bloomIntensity;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (1 + bass * 0.8), 0, Math.PI * 2);
      ctx.fill();

      if (i % 6 === 0) {
        ctx.strokeStyle = p.color;
        ctx.globalAlpha = 0.25;
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
        ctx.globalAlpha = 1.0;
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.shadowBlur = 0;
  };

  const renderHarmonicNebula = (
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    bass: number,
    mid: number,
    treble: number,
    colors: string[],
    time: number,
    settings: VisualizerSettings
  ) => {
    ctx.globalCompositeOperation = 'screen';
    const cx = w / 2;
    const cy = h / 2;
    const maxRadius = Math.max(w, h) * 0.6;

    const clouds = 3;
    for (let c = 0; c < clouds; c++) {
      const angle = time * (0.2 + c * 0.1) + c * (Math.PI / 1.5);
      const orbitX = cx + Math.cos(angle) * (60 + bass * 120);
      const orbitY = cy + Math.sin(angle * 1.2) * (50 + mid * 100);
      const radius = maxRadius * (0.35 + c * 0.15) * (1 + bass * 0.3);

      const color = colors[c % colors.length] || '#38bdf8';
      const grad = ctx.createRadialGradient(orbitX, orbitY, 10, orbitX, orbitY, radius);
      grad.addColorStop(0, color);
      grad.addColorStop(0.4, colors[(c + 1) % colors.length] || '#818cf8');
      grad.addColorStop(1, 'rgba(0,0,0,0)');

      ctx.fillStyle = grad;
      ctx.globalAlpha = (0.45 + treble * 0.3) * settings.bloomIntensity;
      ctx.beginPath();
      ctx.arc(orbitX, orbitY, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalAlpha = 1.0;
    ctx.globalCompositeOperation = 'source-over';
  };

  // 1999 Winamp & MilkDrop 3D Warp + Discrete 16-Band Peak Equalizer + CRT Scanlines
  const renderWinampMilkdrop = (
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    fft: Uint8Array,
    bass: number,
    mid: number,
    treble: number,
    colors: string[],
    time: number,
    peaks: number[],
    settings: VisualizerSettings
  ) => {
    const cx = w / 2;
    const cy = h / 2;

    // 1. MilkDrop Psychedelic Fluid Warp Tunnel
    ctx.globalCompositeOperation = 'lighter';
    const rings = 8;
    for (let r = 0; r < rings; r++) {
      const ringProgress = (r / rings + time * 0.15) % 1.0;
      const radius = Math.pow(ringProgress, 1.8) * Math.max(w, h) * 0.75 * (1 + bass * 0.35);
      const ringColor = colors[r % colors.length] || '#00ff66';

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(time * 0.2 * (r % 2 === 0 ? 1 : -1) + mid * 0.6);

      ctx.beginPath();
      const points = 12;
      for (let p = 0; p <= points; p++) {
        const theta = (p / points) * Math.PI * 2;
        const waveMod = Math.sin(theta * 4 + time * 3) * (15 + bass * 35);
        const rad = Math.max(4, radius + waveMod);
        const px = Math.cos(theta) * rad;
        const py = Math.sin(theta) * rad;
        if (p === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();

      ctx.strokeStyle = ringColor;
      ctx.lineWidth = Math.max(1.5, (1 - ringProgress) * 4);
      ctx.shadowColor = ringColor;
      ctx.shadowBlur = 10 * settings.bloomIntensity;
      ctx.globalAlpha = (1 - ringProgress) * 0.85;
      ctx.stroke();
      ctx.restore();
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1.0;

    // 2. Classic Winamp 16-Band Segmented Equalizer (Bottom Center)
    const bandCount = 16;
    const barW = Math.min(24, Math.max(10, (w * 0.5) / bandCount - 4));
    const totalEqW = bandCount * (barW + 3);
    const startX = cx - totalEqW / 2;
    const eqBaseY = h - 55;
    const maxBarH = h * 0.28;
    const segmentsPerBar = 14;

    for (let b = 0; b < bandCount; b++) {
      const fftIdx = Math.floor((b / bandCount) * 80);
      const amp = (fft[fftIdx] || 0) / 255;
      const barHeight = amp * maxBarH;

      if (barHeight > (peaks[b] || 0)) {
        peaks[b] = barHeight;
      } else {
        peaks[b] = Math.max(0, (peaks[b] || 0) - 1.8);
      }

      const bx = startX + b * (barW + 3);

      // Draw discrete segmented LEDs (Green -> Yellow -> Red)
      const litSegments = Math.floor((barHeight / maxBarH) * segmentsPerBar);
      const segH = Math.max(2, (maxBarH / segmentsPerBar) - 2);

      for (let s = 0; s < segmentsPerBar; s++) {
        const sy = eqBaseY - (s + 1) * (segH + 2);
        const isLit = s < litSegments;

        // Color based on height (classic Winamp: green on bottom, yellow in mid, red on top)
        let ledColor = '#00ff66'; // Green
        if (s >= segmentsPerBar * 0.75) {
          ledColor = '#ff3344'; // Red
        } else if (s >= segmentsPerBar * 0.5) {
          ledColor = '#ffbb00'; // Yellow
        }

        ctx.fillStyle = isLit ? ledColor : 'rgba(255, 255, 255, 0.05)';
        if (isLit) {
          ctx.shadowColor = ledColor;
          ctx.shadowBlur = 4;
        } else {
          ctx.shadowBlur = 0;
        }
        ctx.fillRect(bx, sy, barW, segH);
      }

      // Draw classic falling white peak indicator cap
      const peakY = eqBaseY - peaks[b] - 3;
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur = 4;
      ctx.fillRect(bx, Math.max(eqBaseY - maxBarH - 5, peakY), barW, 2);
      ctx.shadowBlur = 0;
    }

    // 3. Subtle CRT Scanlines
    ctx.fillStyle = 'rgba(0, 0, 0, 0.16)';
    for (let y = 0; y < h; y += 3) {
      ctx.fillRect(0, y, w, 1);
    }
  };

  // 4. 3D RETRO NEON CYBER TUNNEL
  const renderCyberTunnel3d = (
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    bass: number,
    mid: number,
    treble: number,
    colors: string[],
    time: number,
    settings: VisualizerSettings
  ) => {
    ctx.globalCompositeOperation = 'screen';
    const cx = w / 2;
    const cy = h / 2;
    const rings = Math.floor(10 * settings.particleDensity);

    // Radiating polygon rings
    for (let i = 0; i < rings; i++) {
      const progress = (i / rings + time * 0.25 * settings.cameraDriftSpeed) % 1.0;
      const radius = Math.pow(progress, 2.2) * (Math.max(w, h) * 0.7) * (1 + bass * 0.3);
      const ringColor = colors[i % colors.length] || '#00e5ff';

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(time * 0.15 + i * 0.1 + mid * 0.4);

      ctx.beginPath();
      const sides = 6;
      for (let s = 0; s <= sides; s++) {
        const angle = (s / sides) * Math.PI * 2;
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;
        if (s === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();

      ctx.strokeStyle = ringColor;
      ctx.lineWidth = Math.max(1, progress * 4);
      ctx.shadowColor = ringColor;
      ctx.shadowBlur = 10 * settings.bloomIntensity;
      ctx.globalAlpha = Math.min(1.0, progress * 1.5) * settings.bloomIntensity;
      ctx.stroke();
      ctx.restore();
    }

    // Perspective horizon rays radiating from center
    ctx.strokeStyle = colors[0] || '#38bdf8';
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.25;
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * w, cy + Math.sin(a) * h);
      ctx.stroke();
    }
    ctx.globalAlpha = 1.0;
    ctx.globalCompositeOperation = 'source-over';
  };

  // 5. 3D TESSERACT & CUBE MATRIX
  const renderCubeMatrix3d = (
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    fft: Uint8Array,
    bass: number,
    mid: number,
    colors: string[],
    time: number,
    settings: VisualizerSettings
  ) => {
    ctx.globalCompositeOperation = 'screen';
    const cx = w / 2;
    const cy = h / 2;
    const cubeCount = 5;

    for (let c = 0; c < cubeCount; c++) {
      const size = (40 + c * 38) * (1 + bass * 0.4);
      const col = colors[c % colors.length] || '#f59e0b';
      const rot = time * (0.3 + c * 0.1) * settings.cameraDriftSpeed + mid * 0.5;

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rot);

      // Front Face
      ctx.strokeStyle = col;
      ctx.lineWidth = 2;
      ctx.shadowColor = col;
      ctx.shadowBlur = 8 * settings.bloomIntensity;
      ctx.strokeRect(-size / 2, -size / 2, size, size);

      // 3D Offset Face (Isometric projection)
      const offset = (size * 0.35);
      ctx.strokeRect(-size / 2 + offset, -size / 2 - offset, size, size);

      // 3D Connecting Edges
      ctx.beginPath();
      ctx.moveTo(-size / 2, -size / 2);
      ctx.lineTo(-size / 2 + offset, -size / 2 - offset);

      ctx.moveTo(size / 2, -size / 2);
      ctx.lineTo(size / 2 + offset, -size / 2 - offset);

      ctx.moveTo(-size / 2, size / 2);
      ctx.lineTo(-size / 2 + offset, size / 2 - offset);

      ctx.moveTo(size / 2, size / 2);
      ctx.lineTo(size / 2 + offset, size / 2 - offset);
      ctx.stroke();

      ctx.restore();
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.shadowBlur = 0;
  };

  // 6. 3D RAYMARCHED LAVA BLOBS
  const renderLavaBlobs3d = (
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    bass: number,
    mid: number,
    colors: string[],
    time: number,
    settings: VisualizerSettings
  ) => {
    ctx.globalCompositeOperation = 'screen';
    const cx = w / 2;
    const cy = h / 2;
    const blobCount = 7;

    for (let i = 0; i < blobCount; i++) {
      const angle = time * 0.4 + (i * Math.PI * 2) / blobCount;
      const orbit = (60 + Math.sin(time * 0.8 + i) * 40) * (1 + bass * 0.35);
      const bx = cx + Math.cos(angle) * orbit;
      const by = cy + Math.sin(angle * 1.3) * (orbit * 0.85);

      const rad = (35 + Math.sin(time * 1.5 + i * 2) * 15) * (1 + bass * 0.5);
      const col = colors[i % colors.length] || '#ff007f';

      const grad = ctx.createRadialGradient(bx, by, 5, bx, by, rad);
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.3, col);
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');

      ctx.fillStyle = grad;
      ctx.shadowColor = col;
      ctx.shadowBlur = 14 * settings.bloomIntensity;
      ctx.beginPath();
      ctx.arc(bx, by, rad, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.shadowBlur = 0;
  };

  // 7. CUSTOM USER VISUALIZER (Respects all 6 archetypes, density, bloom, rotation & scanlines)
  const renderCustomUserVisualizer = (
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    fft: Uint8Array,
    bass: number,
    mid: number,
    treble: number,
    colors: string[],
    time: number,
    settings: VisualizerSettings
  ) => {
    const cfg = settings.customConfig;
    const effectiveColors = cfg?.colorScheme?.length ? cfg.colorScheme : colors;
    const sens = cfg?.audioSensitivity || 1.0;
    const spd = cfg?.speed || 1.0;
    const customSettings: VisualizerSettings = {
      ...settings,
      particleDensity: cfg?.density ?? settings.particleDensity,
      bloomIntensity: cfg?.bloom ?? settings.bloomIntensity,
      cameraDriftSpeed: cfg?.rotationSpeed ?? settings.cameraDriftSpeed,
    };

    const effectiveTime = time * spd;
    if (cfg?.baseStyle === 'tunnel') {
      renderCyberTunnel3d(ctx, w, h, bass * sens, mid * sens, treble * sens, effectiveColors, effectiveTime, customSettings);
    } else if (cfg?.baseStyle === 'cubes') {
      renderCubeMatrix3d(ctx, w, h, fft, bass * sens, mid * sens, effectiveColors, effectiveTime, customSettings);
    } else if (cfg?.baseStyle === 'lava') {
      renderLavaBlobs3d(ctx, w, h, bass * sens, mid * sens, effectiveColors, effectiveTime, customSettings);
    } else if (cfg?.baseStyle === 'waves') {
      renderLiquidWaveforms(ctx, w, h, fft, bass * sens, treble * sens, effectiveColors, effectiveTime, customSettings);
    } else if (cfg?.baseStyle === 'particles') {
      renderGeometricParticles(
        ctx,
        w,
        h,
        fft,
        bass * sens,
        mid * sens,
        effectiveColors,
        effectiveTime,
        particlesRef.current,
        customSettings
      );
    } else if (cfg?.baseStyle === 'equalizer') {
      render3dSpectrum(ctx, w, h, fft, effectiveColors, effectiveTime, peaksRef.current, customSettings);
    } else {
      renderWinampMilkdrop(
        ctx,
        w,
        h,
        fft,
        bass * sens,
        mid * sens,
        treble * sens,
        effectiveColors,
        effectiveTime,
        peaksRef.current,
        customSettings
      );
    }

    if (cfg?.crtScanlines) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.16)';
      for (let y = 0; y < h; y += 3) {
        ctx.fillRect(0, y, w, 1);
      }
    }
  };

  const modes: Array<{ id: VisualizerMode; label: string; icon: React.ReactNode; isPro: boolean }> = [
    { id: 'winamp_milkdrop', label: "Winamp '99", icon: <Zap className="w-3.5 h-3.5" />, isPro: false },
    { id: 'cyber_tunnel_3d', label: '3D Cyber Tunnel', icon: <Box className="w-3.5 h-3.5" />, isPro: false },
    { id: 'cube_matrix_3d', label: '3D Tesseract', icon: <Layers className="w-3.5 h-3.5" />, isPro: false },
    { id: 'lava_blobs_3d', label: '3D Lava Blobs', icon: <Flame className="w-3.5 h-3.5" />, isPro: false },
    { id: 'spectrum_3d', label: '3D Equalizer', icon: <Layers className="w-3.5 h-3.5" />, isPro: false },
    { id: 'liquid_waveforms', label: 'Liquid Waves', icon: <Activity className="w-3.5 h-3.5" />, isPro: false },
    { id: 'geometric_particles', label: 'Particles', icon: <Sparkles className="w-3.5 h-3.5" />, isPro: true },
    { id: 'harmonic_nebula', label: 'Nebula', icon: <Radio className="w-3.5 h-3.5" />, isPro: true },
    { id: 'custom_user', label: 'Custom Studio', icon: <SlidersHorizontal className="w-3.5 h-3.5" />, isPro: false },
  ];

  const handleModeClick = (targetMode: VisualizerMode, requiresPro: boolean) => {
    if (requiresPro && !isPro) {
      if (onOpenUpgradeModal) onOpenUpgradeModal();
      return;
    }
    if (onModeChange) onModeChange(targetMode);
  };

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      className={`relative w-full h-full overflow-hidden bg-black select-none ${
        isFullscreen ? 'fixed inset-0 z-50' : 'rounded-2xl border border-studio-border'
      }`}
    >
      <canvas ref={canvasRef} className="w-full h-full block" />

      {/* Floating HUD & Scrollable Mode Switcher */}
      <div
        className={`absolute bottom-3 left-1/2 -translate-x-1/2 max-w-[96%] w-auto flex items-center gap-1.5 p-1.5 rounded-2xl sm:rounded-full bg-studio-surface/95 backdrop-blur-md border border-studio-border shadow-2xl transition-all duration-300 z-30 ${
          showControls ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'
        }`}
      >
        {/* Scroll Left Button */}
        <button
          onClick={() => handleScrollModes('left')}
          title="Scroll modes left"
          className="p-1.5 rounded-full text-studio-textMuted hover:text-studio-text hover:bg-studio-card shrink-0 transition-all hidden xs:flex items-center justify-center"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>

        {/* Horizontal Scrollable Modes Strip with Mouse Wheel & Touch Support */}
        <div
          ref={scrollContainerRef}
          onWheel={(e) => {
            if (scrollContainerRef.current) {
              e.stopPropagation();
              scrollContainerRef.current.scrollLeft += e.deltaY;
            }
          }}
          className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-0.5 px-0.5 scroll-smooth max-w-[70vw] sm:max-w-[550px]"
        >
          {modes.map((m) => {
            const isSelected = mode === m.id;
            const isLocked = m.isPro && !isPro;

            return (
              <button
                key={m.id}
                onClick={() => handleModeClick(m.id, m.isPro)}
                className={`shrink-0 whitespace-nowrap flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-mono font-medium transition-all ${
                  isSelected
                    ? 'bg-studio-accent text-black shadow-lg shadow-studio-accent/30 font-semibold'
                    : isLocked
                    ? 'text-studio-textMuted/70 hover:text-amber-400 hover:bg-studio-card/80'
                    : 'text-studio-textMuted hover:text-studio-text hover:bg-studio-card/80'
                }`}
              >
                {m.icon}
                <span>{m.label}</span>
                {isLocked && <Lock className="w-2.5 h-2.5 text-amber-400" />}
              </button>
            );
          })}
        </div>

        {/* Scroll Right Button */}
        <button
          onClick={() => handleScrollModes('right')}
          title="Scroll modes right"
          className="p-1.5 rounded-full text-studio-textMuted hover:text-studio-text hover:bg-studio-card shrink-0 transition-all hidden xs:flex items-center justify-center"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>

        <div className="h-4 w-px bg-studio-border mx-0.5 shrink-0" />

        {/* Make Your Own Custom Visualizer Button */}
        {onOpenCustomBuilder && (
          <button
            onClick={onOpenCustomBuilder}
            title="Make Your Own 3D Visualizer (Geometry & Physics)"
            className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-mono font-bold bg-studio-card hover:bg-studio-accent hover:text-black border border-studio-border transition-all text-studio-accent"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Make Your Own</span>
          </button>
        )}

        {/* Fullscreen Button */}
        <button
          onClick={toggleFullscreen}
          title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
          className="p-1.5 rounded-full text-studio-textMuted hover:text-studio-text hover:bg-studio-card shrink-0"
        >
          {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </button>
      </div>

      {/* Top Left Live Status Pill */}
      <div
        className={`absolute top-4 left-4 flex items-center gap-2 px-3 py-1.5 rounded-full bg-studio-surface/80 backdrop-blur-md border border-studio-border text-xs font-mono transition-opacity duration-300 ${
          showControls ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
        <span className="text-studio-text font-medium">{preset.name}</span>
        <span className="text-studio-textMuted">•</span>
        <span className="text-studio-textMuted">{mode.replace('_', ' ').toUpperCase()}</span>
      </div>
    </div>
  );
};
