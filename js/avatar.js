/**
 * AvatarEngine - Canvas 2D animated avatar with male/female variants
 * States: idle, scanning, speaking, thinking
 */

class AvatarEngine {
  constructor() {
    this.canvas = null;
    this.ctx = null;
    this.width = 0;
    this.height = 0;
    this.gender = 'female';
    this.state = 'idle';
    this.mouthOpen = 0;
    this.targetMouth = 0;

    // Animation state
    this.time = 0;
    this.blinkTimer = Math.random() * 3 + 2;
    this.blinkAmount = 0;
    this.blinkPhase = 'open';
    this.breathPhase = 0;
    this.floatPhase = 0;
    this.headTilt = 0;
    this.scanAngle = 0;
    this.scanProgress = 0;
    this.glowPulse = 0;
    this.eyeTarget = { x: 0, y: 0 };

    // Particles
    this.particles = [];
    for (let i = 0; i < 25; i++) {
      this.particles.push({
        x: Math.random(),
        y: Math.random(),
        r: Math.random() * 2 + 0.5,
        speed: Math.random() * 0.2 + 0.05,
        phase: Math.random() * Math.PI * 2,
        alpha: Math.random() * 0.4 + 0.1
      });
    }

    this.animFrame = null;
    this.lastTime = 0;
    this.resizeObserver = null;

    // Color palettes per gender
    this.palettes = {
      female: {
        hair: '#6B3FA0',
        hairHighlight: '#9B6FD0',
        iris: '#7C4DFF',
        blush: 'rgba(255, 100, 130, 0.25)',
        top: '#B388FF',
        topShadow: '#9A6FE0',
        aura: 'rgba(124, 77, 255, 0.12)',
        particle: '#B388FF'
      },
      male: {
        hair: '#2A3A6B',
        hairHighlight: '#4A5A9B',
        iris: '#448AFF',
        blush: 'rgba(255, 130, 100, 0.12)',
        top: '#82B1FF',
        topShadow: '#5C8FE0',
        aura: 'rgba(68, 138, 255, 0.12)',
        particle: '#82B1FF'
      }
    };

    this.skin = '#FFDAB9';
    this.skinShadow = '#F0C8A0';
  }

  init(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.resize();
    this.startAnimation();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas.parentElement);
  }

  resize() {
    const parent = this.canvas.parentElement;
    const dpr = window.devicePixelRatio || 1;
    this.width = parent.clientWidth;
    this.height = parent.clientHeight;
    this.canvas.width = this.width * dpr;
    this.canvas.height = this.height * dpr;
    this.canvas.style.width = this.width + 'px';
    this.canvas.style.height = this.height + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  setGender(g) { this.gender = g; }
  setState(s) { this.state = s; }
  setMouthOpen(v) { this.targetMouth = Math.max(0, Math.min(1, v)); }
  setScanProgress(v) { this.scanProgress = Math.max(0, Math.min(1, v)); }

  startAnimation() {
    this.lastTime = performance.now();
    const loop = (now) => {
      const dt = Math.min((now - this.lastTime) / 1000, 0.05);
      this.lastTime = now;
      this.update(dt);
      this.draw();
      this.animFrame = requestAnimationFrame(loop);
    };
    this.animFrame = requestAnimationFrame(loop);
  }

  stop() {
    if (this.animFrame) cancelAnimationFrame(this.animFrame);
    this.animFrame = null;
    if (this.resizeObserver) this.resizeObserver.disconnect();
  }

  update(dt) {
    this.time += dt;
    this.breathPhase += dt * 1.5;
    this.floatPhase += dt * 0.8;
    this.headTilt = Math.sin(this.time * 0.5) * 0.03;
    this.glowPulse = Math.sin(this.time * 2) * 0.3 + 0.7;
    this.mouthOpen += (this.targetMouth - this.mouthOpen) * dt * 15;

    // Blink
    switch (this.blinkPhase) {
      case 'open':
        this.blinkTimer -= dt;
        if (this.blinkTimer <= 0) this.blinkPhase = 'closing';
        break;
      case 'closing':
        this.blinkAmount = Math.min(1, this.blinkAmount + dt * 12);
        if (this.blinkAmount >= 1) { this.blinkPhase = 'closed'; this.blinkTimer = 0.06; }
        break;
      case 'closed':
        this.blinkTimer -= dt;
        if (this.blinkTimer <= 0) this.blinkPhase = 'opening';
        break;
      case 'opening':
        this.blinkAmount = Math.max(0, this.blinkAmount - dt * 10);
        if (this.blinkAmount <= 0) { this.blinkPhase = 'open'; this.blinkTimer = Math.random() * 3 + 2; }
        break;
    }

    // Scan rotation
    if (this.state === 'scanning') this.scanAngle += dt * 2;

    // Particles
    this.particles.forEach(p => {
      p.y -= p.speed * dt;
      p.x += Math.sin(this.time + p.phase) * 0.001;
      if (p.y < -0.05) { p.y = 1.05; p.x = Math.random(); }
    });
  }

  draw() {
    const { ctx, width: w, height: h } = this;
    ctx.clearRect(0, 0, w, h);
    const pal = this.palettes[this.gender];
    const floatY = Math.sin(this.floatPhase) * 4;
    const cx = w / 2;
    const cy = h * 0.42 + floatY;
    const scale = Math.min(w / 260, h / 320) * 0.85;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);
    ctx.rotate(this.headTilt);

    this.drawAura(ctx, pal);
    this.drawBody(ctx, pal);
    this.drawHairBack(ctx, pal);
    this.drawFace(ctx, pal);
    this.drawHairFront(ctx, pal);

    ctx.restore();

    this.drawParticles(ctx, w, h, pal);

    if (this.state === 'scanning') {
      this.drawScanRing(ctx, cx, cy, scale, pal);
    }
  }

  drawAura(ctx, pal) {
    const r = 95 + this.glowPulse * 12;
    const grad = ctx.createRadialGradient(0, 0, 25, 0, 0, r);
    grad.addColorStop(0, pal.aura);
    grad.addColorStop(1, 'transparent');
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();
  }

  drawBody(ctx, pal) {
    const bOff = Math.sin(this.breathPhase) * 1.5;

    // Neck
    ctx.beginPath();
    ctx.moveTo(-11, 46);
    ctx.lineTo(-11, 68 + bOff);
    ctx.lineTo(11, 68 + bOff);
    ctx.lineTo(11, 46);
    ctx.fillStyle = this.skin;
    ctx.fill();

    // Shoulders
    ctx.beginPath();
    ctx.moveTo(-58, 88 + bOff * 1.3);
    ctx.quadraticCurveTo(-38, 64, -11, 68 + bOff);
    ctx.lineTo(11, 68 + bOff);
    ctx.quadraticCurveTo(38, 64, 58, 88 + bOff * 1.3);
    ctx.lineTo(58, 130);
    ctx.lineTo(-58, 130);
    ctx.closePath();
    ctx.fillStyle = pal.top;
    ctx.fill();

    // Shoulder shadow
    ctx.beginPath();
    ctx.moveTo(-11, 68 + bOff);
    ctx.quadraticCurveTo(-30, 75, -50, 88 + bOff);
    ctx.lineTo(-58, 130);
    ctx.lineTo(-58, 88 + bOff * 1.3);
    ctx.quadraticCurveTo(-38, 64, -11, 68 + bOff);
    ctx.closePath();
    ctx.fillStyle = pal.topShadow;
    ctx.globalAlpha = 0.25;
    ctx.fill();
    ctx.globalAlpha = 1;

    // Collar
    ctx.beginPath();
    ctx.moveTo(-14, 66);
    ctx.quadraticCurveTo(0, 78, 14, 66);
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  drawFace(ctx, pal) {
    const bs = 1 + Math.sin(this.breathPhase) * 0.004;
    ctx.save();
    ctx.scale(bs, bs);

    // Face
    const fw = this.gender === 'female' ? 42 : 44;
    const fh = this.gender === 'female' ? 50 : 48;
    ctx.beginPath();
    ctx.ellipse(0, 5, fw, fh, 0, 0, Math.PI * 2);
    ctx.fillStyle = this.skin;
    ctx.fill();

    // Cheek shadow
    ctx.beginPath();
    ctx.ellipse(0, 20, fw - 5, 32, 0, 0.3, Math.PI - 0.3);
    ctx.fillStyle = this.skinShadow;
    ctx.globalAlpha = 0.12;
    ctx.fill();
    ctx.globalAlpha = 1;

    // Eyes
    const ey = -2, es = 18;
    this.drawEye(ctx, -es, ey, pal);
    this.drawEye(ctx, es, ey, pal);

    // Eyebrows
    ctx.lineWidth = 2;
    ctx.strokeStyle = pal.hair;
    ctx.beginPath();
    ctx.moveTo(-es - 8, ey - 14);
    ctx.quadraticCurveTo(-es, ey - 18, -es + 8, ey - 14);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(es - 8, ey - 14);
    ctx.quadraticCurveTo(es, ey - 18, es + 8, ey - 14);
    ctx.stroke();

    // Nose
    ctx.beginPath();
    ctx.moveTo(-2, 10);
    ctx.quadraticCurveTo(0, 14, 2, 10);
    ctx.strokeStyle = this.skinShadow;
    ctx.lineWidth = 1;
    ctx.stroke();

    // Blush
    ctx.fillStyle = pal.blush;
    ctx.beginPath(); ctx.ellipse(-22, 12, 10, 6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(22, 12, 10, 6, 0, 0, Math.PI * 2); ctx.fill();

    // Mouth
    this.drawMouth(ctx);

    ctx.restore();
  }

  drawEye(ctx, x, y, pal) {
    // White
    ctx.beginPath();
    ctx.ellipse(x, y, 10, 12, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();

    // Iris
    ctx.beginPath();
    ctx.arc(x, y + 1, 7, 0, Math.PI * 2);
    ctx.fillStyle = pal.iris;
    ctx.fill();

    // Pupil
    ctx.beginPath();
    ctx.arc(x, y + 1, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = '#1a1a2e';
    ctx.fill();

    // Reflections
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath(); ctx.arc(x + 2.5, y - 2.5, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.beginPath(); ctx.arc(x - 1.5, y + 3, 1.2, 0, Math.PI * 2); ctx.fill();

    // Upper lid line
    ctx.beginPath();
    ctx.ellipse(x, y - 2, 11, 10, 0, Math.PI + 0.3, -0.3);
    ctx.strokeStyle = pal.hair;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Lower lash hint
    ctx.beginPath();
    ctx.ellipse(x, y + 3, 9, 8, 0, 0.3, Math.PI - 0.3);
    ctx.strokeStyle = pal.hair;
    ctx.lineWidth = 0.5;
    ctx.globalAlpha = 0.3;
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Blink
    if (this.blinkAmount > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(x, y, 12, 14, 0, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = this.skin;
      ctx.fillRect(x - 14, y - 16, 28, 30 * this.blinkAmount);
      ctx.restore();
    }
  }

  drawMouth(ctx) {
    const my = 25;
    if (this.mouthOpen > 0.05) {
      const o = this.mouthOpen;
      ctx.beginPath();
      ctx.ellipse(0, my, 5 + o * 3, 2 + o * 5, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#D85050';
      ctx.fill();
      if (o > 0.3) {
        ctx.beginPath();
        ctx.ellipse(0, my + 1.5, 3.5, o * 2.5, 0, 0, Math.PI);
        ctx.fillStyle = '#C03030';
        ctx.fill();
      }
    } else {
      ctx.beginPath();
      ctx.moveTo(-7, my);
      ctx.quadraticCurveTo(0, my + 5, 7, my);
      ctx.strokeStyle = '#C08080';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  drawHairBack(ctx, pal) {
    ctx.fillStyle = pal.hair;
    if (this.gender === 'female') {
      // Left long hair
      ctx.beginPath();
      ctx.moveTo(-44, -28);
      ctx.quadraticCurveTo(-54, 30, -44, 88);
      ctx.quadraticCurveTo(-30, 93, -24, 68);
      ctx.lineTo(-40, -8);
      ctx.closePath();
      ctx.fill();
      // Right long hair
      ctx.beginPath();
      ctx.moveTo(44, -28);
      ctx.quadraticCurveTo(54, 30, 44, 88);
      ctx.quadraticCurveTo(30, 93, 24, 68);
      ctx.lineTo(40, -8);
      ctx.closePath();
      ctx.fill();
    }
  }

  drawHairFront(ctx, pal) {
    ctx.fillStyle = pal.hair;
    if (this.gender === 'female') {
      // Top volume
      ctx.beginPath();
      ctx.moveTo(-46, -22);
      ctx.quadraticCurveTo(-42, -62, 0, -56);
      ctx.quadraticCurveTo(42, -62, 46, -22);
      ctx.quadraticCurveTo(48, -4, 44, 6);
      ctx.lineTo(42, -8);
      ctx.quadraticCurveTo(36, -48, 0, -46);
      ctx.quadraticCurveTo(-36, -48, -42, -8);
      ctx.lineTo(-44, 6);
      ctx.quadraticCurveTo(-48, -4, -46, -22);
      ctx.closePath();
      ctx.fill();

      // Bangs
      ctx.beginPath();
      ctx.moveTo(-28, -42); ctx.quadraticCurveTo(-18, -28, -14, -14);
      ctx.lineTo(-9, -14); ctx.quadraticCurveTo(-14, -34, -18, -44);
      ctx.closePath(); ctx.fill();

      ctx.beginPath();
      ctx.moveTo(-12, -46); ctx.quadraticCurveTo(-3, -28, 0, -11);
      ctx.lineTo(6, -11); ctx.quadraticCurveTo(1, -30, -3, -48);
      ctx.closePath(); ctx.fill();

      ctx.beginPath();
      ctx.moveTo(6, -48); ctx.quadraticCurveTo(16, -30, 20, -14);
      ctx.lineTo(14, -14); ctx.quadraticCurveTo(10, -34, 6, -48);
      ctx.closePath(); ctx.fill();

      // Highlight
      ctx.beginPath();
      ctx.moveTo(-22, -50); ctx.quadraticCurveTo(-8, -54, 6, -50);
      ctx.strokeStyle = pal.hairHighlight; ctx.lineWidth = 2;
      ctx.globalAlpha = 0.35; ctx.stroke(); ctx.globalAlpha = 1;
    } else {
      // Male short hair
      ctx.beginPath();
      ctx.moveTo(-46, -8);
      ctx.quadraticCurveTo(-46, -54, 0, -54);
      ctx.quadraticCurveTo(46, -54, 46, -8);
      ctx.quadraticCurveTo(47, -18, 44, -4);
      ctx.lineTo(42, -6);
      ctx.quadraticCurveTo(40, -44, 0, -44);
      ctx.quadraticCurveTo(-40, -44, -42, -6);
      ctx.lineTo(-44, -4);
      ctx.quadraticCurveTo(-47, -18, -46, -8);
      ctx.closePath();
      ctx.fill();

      // Sides
      ctx.beginPath();
      ctx.moveTo(-46, -8); ctx.quadraticCurveTo(-48, 6, -44, 12);
      ctx.lineTo(-42, 6); ctx.quadraticCurveTo(-44, -3, -42, -6);
      ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(46, -8); ctx.quadraticCurveTo(48, 6, 44, 12);
      ctx.lineTo(42, 6); ctx.quadraticCurveTo(44, -3, 42, -6);
      ctx.closePath(); ctx.fill();

      // Spiky top
      ctx.beginPath();
      ctx.moveTo(-15, -52); ctx.lineTo(-10, -60); ctx.lineTo(-5, -53);
      ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(0, -54); ctx.lineTo(5, -62); ctx.lineTo(10, -53);
      ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(12, -51); ctx.lineTo(18, -58); ctx.lineTo(22, -49);
      ctx.closePath(); ctx.fill();

      // Highlight
      ctx.beginPath();
      ctx.moveTo(-18, -48); ctx.quadraticCurveTo(0, -52, 18, -48);
      ctx.strokeStyle = pal.hairHighlight; ctx.lineWidth = 2;
      ctx.globalAlpha = 0.3; ctx.stroke(); ctx.globalAlpha = 1;
    }
  }

  drawParticles(ctx, w, h, pal) {
    this.particles.forEach(p => {
      const x = p.x * w;
      const y = p.y * h;
      const a = p.alpha * (0.5 + 0.5 * Math.sin(this.time * 2 + p.phase));
      ctx.beginPath();
      ctx.arc(x, y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = pal.particle;
      ctx.globalAlpha = a;
      ctx.fill();
    });
    ctx.globalAlpha = 1;
  }

  drawScanRing(ctx, cx, cy, scale, pal) {
    const r = 82 * scale;

    // BG ring
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(124, 77, 255, 0.08)';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Progress arc
    const start = -Math.PI / 2;
    const end = start + Math.PI * 2 * this.scanProgress;
    ctx.beginPath();
    ctx.arc(cx, cy, r, start, end);
    ctx.strokeStyle = pal.iris;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.lineCap = 'butt';

    // Rotating dots
    for (let i = 0; i < 3; i++) {
      const a = this.scanAngle + i * Math.PI * 2 / 3;
      ctx.beginPath();
      ctx.arc(cx + r * Math.cos(a), cy + r * Math.sin(a), 2.5, 0, Math.PI * 2);
      ctx.fillStyle = pal.iris;
      ctx.globalAlpha = 0.5;
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}
