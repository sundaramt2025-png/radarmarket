/**
 * RadarMarket - HTML5 Canvas 60 FPS Real-time Radar Engine & Audio Sonar
 */

class RadarEngine {
  constructor(canvasElement, options = {}) {
    this.canvas = canvasElement;
    this.ctx = canvasElement.getContext("2d");
    this.options = Object.assign(
      {
        rpm: 24, // Rotations per minute
        rings: 4, // Number of concentric distance rings
        maxRadiusMeters: 1500,
        audioEnabled: false,
        onSelectTarget: null,
        onHoverTarget: null
      },
      options
    );

    // State
    this.angle = 0; // Sweep angle in radians (0 = North)
    this.targets = []; // List of evaluated items
    this.blipStates = new Map(); // itemId -> { lastSwept: timestamp, pingWaveRadius: 0 }
    this.hoveredTarget = null;
    this.selectedTargetId = null;
    this.isRunning = false;
    this.lastFrameTime = performance.now();

    // Audio context (lazy init on user interaction)
    this.audioCtx = null;

    // View dimensions
    this.width = 0;
    this.height = 0;
    this.centerX = 0;
    this.centerY = 0;
    this.radius = 0;

    this.initCanvas();
    this.setupListeners();
    this.start();
  }

  initCanvas() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.width = rect.width;
    this.height = rect.height;
    
    this.canvas.width = this.width * dpr;
    this.canvas.height = this.height * dpr;
    this.ctx.scale(dpr, dpr);

    this.centerX = this.width / 2;
    this.centerY = this.height / 2;
    // Keep 20px padding for edge ticks and labels
    this.radius = Math.min(this.centerX, this.centerY) - 20;
  }

  setupListeners() {
    window.addEventListener("resize", () => {
      this.initCanvas();
    });

    this.canvas.addEventListener("mousemove", (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      let found = null;
      for (const target of this.targets) {
        if (!target.inRadarRange) continue;
        const pos = this.getScreenCoords(target);
        const dist = Math.hypot(mouseX - pos.x, mouseY - pos.y);
        if (dist <= 16) {
          found = target;
          break;
        }
      }

      this.hoveredTarget = found;
      this.canvas.style.cursor = found ? "pointer" : "crosshair";
      if (this.options.onHoverTarget) {
        this.options.onHoverTarget(found);
      }
    });

    this.canvas.addEventListener("mouseleave", () => {
      this.hoveredTarget = null;
      if (this.options.onHoverTarget) {
        this.options.onHoverTarget(null);
      }
    });

    this.canvas.addEventListener("click", (e) => {
      // Audio unlock on click
      this.ensureAudioContext();

      if (this.hoveredTarget) {
        this.selectedTargetId = this.hoveredTarget.item.id;
        if (this.options.onSelectTarget) {
          this.options.onSelectTarget(this.hoveredTarget);
        }
      }
    });
  }

  ensureAudioContext() {
    if (!this.audioCtx) {
      const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
      if (AudioCtxClass) {
        this.audioCtx = new AudioCtxClass();
      }
    }
    if (this.audioCtx && this.audioCtx.state === "suspended") {
      this.audioCtx.resume();
    }
  }

  playSonarPing(frequency = 980, volume = 0.08) {
    if (!this.options.audioEnabled) return;
    try {
      this.ensureAudioContext();
      if (!this.audioCtx) return;

      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(frequency, this.audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(frequency * 0.5, this.audioCtx.currentTime + 0.15);

      gain.gain.setValueAtTime(volume, this.audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, this.audioCtx.currentTime + 0.18);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      osc.start();
      osc.stop(this.audioCtx.currentTime + 0.2);
    } catch (err) {
      console.warn("Sonar audio error:", err);
    }
  }

  setAudioEnabled(enabled) {
    this.options.audioEnabled = enabled;
    if (enabled) {
      this.ensureAudioContext();
      this.playSonarPing(880, 0.05); // test ping
    }
  }

  setTargets(targets, maxRadiusMeters) {
    this.targets = targets;
    if (maxRadiusMeters) {
      this.options.maxRadiusMeters = maxRadiusMeters;
    }
  }

  setSelectedTarget(itemId) {
    this.selectedTargetId = itemId;
  }

  setMaxRadius(radiusMeters) {
    this.options.maxRadiusMeters = radiusMeters;
  }

  getScreenCoords(target) {
    const effectiveBearing = (target.bearing + (target.radarBearingOffset || 0)) % 360;
    const effectiveDistance = target.distance + (target.radarDistanceOffset || 0);

    // Bearing 0 is North (up), 90 is East (right)
    // In canvas: 0 rad is East, -PI/2 is North.
    const rad = ((effectiveBearing - 90) * Math.PI) / 180;
    const normDist = Math.min(1.0, effectiveDistance / this.options.maxRadiusMeters);
    const r = normDist * this.radius;

    return {
      x: this.centerX + r * Math.cos(rad),
      y: this.centerY + r * Math.sin(rad),
      normDist,
      r
    };
  }

  start() {
    this.isRunning = true;
    const loop = (now) => {
      if (!this.isRunning) return;
      const delta = (now - this.lastFrameTime) / 1000;
      this.lastFrameTime = now;

      this.update(delta);
      this.draw();

      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  stop() {
    this.isRunning = false;
  }

  update(delta) {
    // Angular velocity: RPM to rad/s
    const angularSpeed = (this.options.rpm * 2 * Math.PI) / 60;
    const prevAngle = this.angle;
    this.angle = (this.angle + angularSpeed * delta) % (2 * Math.PI);

    // Sweep angle in degrees (0 to 360, where 0 is North / top)
    const sweepDeg = (this.angle * 180) / Math.PI;
    const prevSweepDeg = (prevAngle * 180) / Math.PI;

    // Check target sweep intersection
    for (const target of this.targets) {
      if (!target.inRadarRange) continue;
      const targetDeg = (target.bearing + (target.radarBearingOffset || 0) + 360) % 360;

      let swept = false;
      if (prevSweepDeg <= sweepDeg) {
        swept = targetDeg >= prevSweepDeg && targetDeg <= sweepDeg;
      } else {
        // Wrapped around 360/0
        swept = targetDeg >= prevSweepDeg || targetDeg <= sweepDeg;
      }

      if (swept) {
        let state = this.blipStates.get(target.item.id) || { lastSwept: 0, pingWaveRadius: 0 };
        state.lastSwept = performance.now();
        state.pingWaveRadius = 1;
        this.blipStates.set(target.item.id, state);

        // Sound trigger if high match
        const pitch = 700 + (target.algorithmScore / 100) * 500;
        this.playSonarPing(pitch, 0.05);

        // Mobile haptic vibration on strong radar sweep
        if (target.algorithmScore >= 75 && window.navigator && window.navigator.vibrate) {
          try { window.navigator.vibrate(15); } catch (e) {}
        }
      }
    }
  }

  draw() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);

    this.drawBackgroundScope();
    this.drawSweepTrail();
    this.drawTargets();
    this.drawCenterUser();
    this.drawOverlayTelemetry();
  }

  drawBackgroundScope() {
    const ctx = this.ctx;
    const cx = this.centerX;
    const cy = this.centerY;
    const maxR = this.radius;

    // Outer ring border
    ctx.save();
    ctx.strokeStyle = "rgba(0, 229, 255, 0.4)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, maxR, 0, Math.PI * 2);
    ctx.stroke();

    // Concentric range rings
    const numRings = this.options.rings;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);

    for (let i = 1; i <= numRings; i++) {
      const ringR = (maxR / numRings) * i;
      ctx.strokeStyle = i === numRings ? "rgba(0, 229, 255, 0.4)" : "rgba(0, 229, 255, 0.18)";
      ctx.beginPath();
      ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
      ctx.stroke();

      // Ring distance labels along East axis
      const ringDistMeters = Math.round((this.options.maxRadiusMeters / numRings) * i);
      const labelText = ringDistMeters >= 1000 ? `${(ringDistMeters / 1000).toFixed(1)}km` : `${ringDistMeters}m`;
      ctx.font = "9px 'JetBrains Mono', monospace";
      ctx.fillStyle = "rgba(0, 229, 255, 0.6)";
      ctx.fillText(labelText, cx + ringR - 22, cy - 4);
    }
    ctx.setLineDash([]);

    // Crosshairs (N-S, E-W)
    ctx.strokeStyle = "rgba(0, 229, 255, 0.25)";
    ctx.beginPath();
    ctx.moveTo(cx - maxR, cy);
    ctx.lineTo(cx + maxR, cy);
    ctx.moveTo(cx, cy - maxR);
    ctx.lineTo(cx, cy + maxR);
    ctx.stroke();

    // 30-degree subtle radial rays
    ctx.strokeStyle = "rgba(0, 229, 255, 0.08)";
    for (let deg = 30; deg < 360; deg += 30) {
      if (deg % 90 === 0) continue;
      const rad = (deg * Math.PI) / 180;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + maxR * Math.cos(rad), cy + maxR * Math.sin(rad));
      ctx.stroke();
    }

    // Outer border tick marks
    ctx.strokeStyle = "rgba(0, 229, 255, 0.5)";
    for (let deg = 0; deg < 360; deg += 10) {
      const rad = (deg * Math.PI) / 180;
      const isMajor = deg % 30 === 0;
      const tickLen = isMajor ? 8 : 4;
      const x1 = cx + (maxR - tickLen) * Math.cos(rad);
      const y1 = cy + (maxR - tickLen) * Math.sin(rad);
      const x2 = cx + maxR * Math.cos(rad);
      const y2 = cy + maxR * Math.sin(rad);

      ctx.lineWidth = isMajor ? 1.5 : 0.8;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }

    // Compass Cardinal Labels (N, E, S, W)
    ctx.font = "bold 11px 'JetBrains Mono', monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    ctx.fillStyle = "#00ff9d";
    ctx.fillText("N (000°)", cx, cy - maxR + 14);

    ctx.fillStyle = "rgba(0, 229, 255, 0.8)";
    ctx.fillText("E (090°)", cx + maxR - 24, cy);
    ctx.fillText("S (180°)", cx, cy + maxR - 14);
    ctx.fillText("W (270°)", cx - maxR + 24, cy);

    ctx.restore();
  }

  drawSweepTrail() {
    const ctx = this.ctx;
    const cx = this.centerX;
    const cy = this.centerY;
    const maxR = this.radius;

    ctx.save();

    // Clip to radar circle
    ctx.beginPath();
    ctx.arc(cx, cy, maxR, 0, Math.PI * 2);
    ctx.clip();

    // Canvas 0 rad is East. Sweep angle 0 is North. So canvas angle = angle - PI/2
    const currentCanvasAngle = this.angle - Math.PI / 2;
    const trailSpan = (42 * Math.PI) / 180; // 42-degree phosphor trail

    // Phosphor sweep trail gradient
    const steps = 24;
    for (let i = 0; i < steps; i++) {
      const stepAngleStart = currentCanvasAngle - (trailSpan / steps) * (i + 1);
      const stepAngleEnd = currentCanvasAngle - (trailSpan / steps) * i;
      const alpha = (1 - i / steps) * 0.16;

      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, maxR, stepAngleStart, stepAngleEnd);
      ctx.closePath();
      ctx.fillStyle = `rgba(0, 255, 157, ${alpha})`;
      ctx.fill();
    }

    // Primary Sweep Line
    ctx.strokeStyle = "rgba(0, 255, 157, 0.9)";
    ctx.lineWidth = 2;
    ctx.shadowColor = "#00ff9d";
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(
      cx + maxR * Math.cos(currentCanvasAngle),
      cy + maxR * Math.sin(currentCanvasAngle)
    );
    ctx.stroke();

    ctx.restore();
  }

  drawTargets() {
    const ctx = this.ctx;
    const now = performance.now();

    for (const target of this.targets) {
      if (!target.inRadarRange) continue;

      const coords = this.getScreenCoords(target);
      const isHovered = this.hoveredTarget && this.hoveredTarget.item.id === target.item.id;
      const isSelected = this.selectedTargetId === target.item.id;

      const state = this.blipStates.get(target.item.id) || { lastSwept: 0, pingWaveRadius: 0 };
      const timeSinceSwept = (now - state.lastSwept) / 1000; // in seconds

      // Decay luminosity after sweep (stays glowing for ~2.5s)
      const sweepGlow = Math.max(0, 1 - timeSinceSwept / 2.5);

      // Color based on category, beacon type, and algorithm score
      let blipColor = "#00e5ff"; // Cyan for books
      let glowColor = "rgba(0, 229, 255, 0.8)";

      const isWanted = target.item.beacon_type === "wanted";
      const isSold = target.item.status === "sold";

      if (isSold) {
        blipColor = "#64748b"; // Dim slate for completed deals
        glowColor = "rgba(100, 116, 139, 0.4)";
      } else if (isWanted) {
        blipColor = "#ff0077"; // Neon Magenta for "Wanted / Request" beacons
        glowColor = "rgba(255, 0, 119, 0.9)";
      } else if (target.item.category === "stationery") {
        blipColor = "#00ff9d"; // Emerald for stationery
        glowColor = "rgba(0, 255, 157, 0.8)";
      }
      
      if (!isWanted && !isSold && target.algorithmScore >= 85) {
        blipColor = "#ffb700"; // Amber/gold for high-match algorithm picks
        glowColor = "rgba(255, 183, 0, 0.8)";
      }

      ctx.save();

      // Expanding Sonar Ping Ring Wave after sweep
      if (timeSinceSwept < 1.4 && state.lastSwept > 0) {
        const waveRadius = 4 + timeSinceSwept * 28;
        const waveAlpha = Math.max(0, (1 - timeSinceSwept / 1.4) * 0.7);

        ctx.strokeStyle = glowColor.replace(/[\d\.]+\)$/, `${waveAlpha})`);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(coords.x, coords.y, waveRadius, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Blip core circle
      const baseRadius = target.algorithmScore >= 80 ? 5.5 : 4;
      const radius = isHovered || isSelected ? baseRadius + 2.5 : baseRadius;

      ctx.shadowColor = glowColor;
      ctx.shadowBlur = 6 + sweepGlow * 12;

      ctx.fillStyle = blipColor;
      ctx.beginPath();
      ctx.arc(coords.x, coords.y, radius, 0, Math.PI * 2);
      ctx.fill();

      // Inner bright center
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(coords.x, coords.y, radius * 0.45, 0, Math.PI * 2);
      ctx.fill();

      // Verified Campus Student or Google Account Trust Halo
      if (target.item.seller?.campus_verified) {
        ctx.strokeStyle = "rgba(255, 215, 0, 0.85)"; // Bright gold halo for verified campus student
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(coords.x, coords.y, radius + 3, 0, Math.PI * 2);
        ctx.stroke();
      } else if (target.item.seller?.verified) {
        ctx.strokeStyle = "rgba(0, 229, 255, 0.65)"; // Cyan halo for verified Google account
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(coords.x, coords.y, radius + 2.5, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Target Reticle if hovered or selected
      if (isHovered || isSelected) {
        this.drawTargetReticle(coords.x, coords.y, blipColor, isSelected);
      }

      ctx.restore();
    }
  }

  drawTargetReticle(x, y, color, isSelected) {
    const ctx = this.ctx;
    const boxSize = isSelected ? 18 : 14;
    const corner = 4;

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = isSelected ? 2 : 1.5;
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;

    // 4 Corner brackets around blip
    // Top-Left
    ctx.beginPath();
    ctx.moveTo(x - boxSize, y - boxSize + corner);
    ctx.lineTo(x - boxSize, y - boxSize);
    ctx.lineTo(x - boxSize + corner, y - boxSize);
    ctx.stroke();

    // Top-Right
    ctx.beginPath();
    ctx.moveTo(x + boxSize - corner, y - boxSize);
    ctx.lineTo(x + boxSize, y - boxSize);
    ctx.lineTo(x + boxSize, y - boxSize + corner);
    ctx.stroke();

    // Bottom-Left
    ctx.beginPath();
    ctx.moveTo(x - boxSize, y + boxSize - corner);
    ctx.lineTo(x - boxSize, y + boxSize);
    ctx.lineTo(x - boxSize + corner, y + boxSize);
    ctx.stroke();

    // Bottom-Right
    ctx.beginPath();
    ctx.moveTo(x + boxSize - corner, y + boxSize);
    ctx.lineTo(x + boxSize, y + boxSize);
    ctx.lineTo(x + boxSize, y + boxSize - corner);
    ctx.stroke();

    ctx.restore();
  }

  drawCenterUser() {
    const ctx = this.ctx;
    const cx = this.centerX;
    const cy = this.centerY;

    ctx.save();

    // Pulsing user location beacon
    const time = performance.now() / 1000;
    const pulseRadius = 6 + Math.sin(time * 3) * 3;

    ctx.strokeStyle = "rgba(0, 229, 255, 0.5)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, pulseRadius + 6, 0, Math.PI * 2);
    ctx.stroke();

    // Center dot
    ctx.fillStyle = "#00e5ff";
    ctx.shadowColor = "#00e5ff";
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(cx, cy, 4, 0, Math.PI * 2);
    ctx.fill();

    // Origin crosshair mark
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - 8, cy);
    ctx.lineTo(cx + 8, cy);
    ctx.moveTo(cx, cy - 8);
    ctx.lineTo(cx, cy + 8);
    ctx.stroke();

    ctx.restore();
  }

  drawOverlayTelemetry() {
    // Subtle HUD overlay watermark
    const ctx = this.ctx;
    ctx.save();
    ctx.font = "10px 'JetBrains Mono', monospace";
    ctx.fillStyle = "rgba(0, 229, 255, 0.4)";
    ctx.textAlign = "left";
    ctx.fillText(`SCAN RPM: ${this.options.rpm} | ACTIVE BLIPS: ${this.targets.filter(t => t.inRadarRange).length}`, 16, this.height - 12);

    ctx.textAlign = "right";
    ctx.fillText(`RANGE: ${this.options.maxRadiusMeters >= 1000 ? (this.options.maxRadiusMeters / 1000) + ' km' : this.options.maxRadiusMeters + ' m'}`, this.width - 16, this.height - 12);
    ctx.restore();
  }
}

window.RadarEngine = RadarEngine;
