/**
 * Charts - SVG chart generators for AlphaEye results
 * Radar, Quadrant, Histogram, Gauges, Timeline, Condition Alerts
 */

const Charts = {

  PARAM_LABELS: [
    { key: 'aggression', label: 'Aggression', short: 'AGG', color: '#ff5252' },
    { key: 'stress', label: 'Stress', short: 'STR', color: '#ff4081' },
    { key: 'tension', label: 'Tension', short: 'TEN', color: '#ffab40' },
    { key: 'suspect', label: 'Suspect', short: 'SUS', color: '#ff6e40' },
    { key: 'balance', label: 'Balance', short: 'BAL', color: '#00e676' },
    { key: 'charm', label: 'Charm', short: 'CHR', color: '#7c4dff' },
    { key: 'energy', label: 'Energy', short: 'ENR', color: '#ffd740' },
    { key: 'selfRegulation', label: 'Self-Reg', short: 'S-R', color: '#448aff' },
    { key: 'inhibition', label: 'Inhibition', short: 'INH', color: '#00e5ff' },
    { key: 'neuroticism', label: 'Neuroticism', short: 'NEU', color: '#ea80fc' },
  ],

  /**
   * 10-axis radar chart with healthy zone overlay
   */
  renderRadar(params) {
    const cx = 160, cy = 160, maxR = 130;
    const n = this.PARAM_LABELS.length;
    const angleStep = (2 * Math.PI) / n;

    function polarToXY(angle, r) {
      return {
        x: (cx + r * Math.cos(angle - Math.PI / 2)).toFixed(1),
        y: (cy + r * Math.sin(angle - Math.PI / 2)).toFixed(1)
      };
    }

    // Grid rings
    let gridLines = '';
    [0.25, 0.5, 0.75, 1.0].forEach(pct => {
      const r = maxR * pct;
      let pts = [];
      for (let i = 0; i < n; i++) {
        const p = polarToXY(i * angleStep, r);
        pts.push(`${p.x},${p.y}`);
      }
      gridLines += `<polygon points="${pts.join(' ')}" fill="none" stroke="var(--border-color)" stroke-width="0.5"/>`;
    });

    // Axis lines
    let axes = '';
    for (let i = 0; i < n; i++) {
      const p = polarToXY(i * angleStep, maxR);
      axes += `<line x1="${cx}" y1="${cy}" x2="${p.x}" y2="${p.y}" stroke="var(--border-color)" stroke-width="0.5"/>`;
    }

    // Healthy zone (50-70 range) as green overlay
    let healthyPts = [];
    for (let i = 0; i < n; i++) {
      const key = this.PARAM_LABELS[i].key;
      const isPositive = ['balance', 'charm', 'selfRegulation', 'energy'].includes(key);
      const healthyVal = isPositive ? 65 : 30;
      const p = polarToXY(i * angleStep, maxR * (healthyVal / 100));
      healthyPts.push(`${p.x},${p.y}`);
    }

    // User data polygon
    let dataPts = [];
    for (let i = 0; i < n; i++) {
      const key = this.PARAM_LABELS[i].key;
      const val = params[key] || 0;
      const p = polarToXY(i * angleStep, maxR * (val / 100));
      dataPts.push(`${p.x},${p.y}`);
    }

    // Labels
    let labels = '';
    for (let i = 0; i < n; i++) {
      const meta = this.PARAM_LABELS[i];
      const val = params[meta.key] || 0;
      const p = polarToXY(i * angleStep, maxR + 24);
      const anchor = parseFloat(p.x) < cx - 10 ? 'end' : parseFloat(p.x) > cx + 10 ? 'start' : 'middle';
      labels += `<text x="${p.x}" y="${p.y}" text-anchor="${anchor}" font-size="10" font-weight="600" fill="${meta.color}">${meta.short}</text>`;
      labels += `<text x="${p.x}" y="${parseFloat(p.y) + 12}" text-anchor="${anchor}" font-size="9" fill="var(--text-muted)">${val}</text>`;
    }

    return `<div class="radar-wrap">
      <svg viewBox="0 0 320 320" xmlns="http://www.w3.org/2000/svg">
        ${gridLines}
        ${axes}
        <polygon points="${healthyPts.join(' ')}" fill="rgba(0,230,118,0.08)" stroke="rgba(0,230,118,0.3)" stroke-width="1" stroke-dasharray="4,2"/>
        <polygon points="${dataPts.join(' ')}" fill="rgba(124,77,255,0.15)" stroke="#7c4dff" stroke-width="2"/>
        ${labels}
      </svg>
    </div>`;
  },

  /**
   * State of Mind quadrant (Stability vs Pleasure)
   */
  renderQuadrant(stateOfMind) {
    const s = stateOfMind.stability;
    const p = stateOfMind.pleasure;
    // Map 0-100 to SVG coordinates (20-280 range)
    const dotX = (20 + s * 2.6).toFixed(0);
    const dotY = (280 - p * 2.6).toFixed(0);

    return `<div class="quadrant-wrap">
      <svg viewBox="0 0 300 300" xmlns="http://www.w3.org/2000/svg">
        <!-- Quadrant backgrounds -->
        <rect x="0" y="0" width="150" height="150" fill="rgba(255,82,82,0.08)" rx="4"/>
        <rect x="150" y="0" width="150" height="150" fill="rgba(0,230,118,0.08)" rx="4"/>
        <rect x="0" y="150" width="150" height="150" fill="rgba(255,171,64,0.08)" rx="4"/>
        <rect x="150" y="150" width="150" height="150" fill="rgba(68,138,255,0.08)" rx="4"/>

        <!-- Axes -->
        <line x1="150" y1="0" x2="150" y2="300" stroke="var(--border-color)" stroke-width="1"/>
        <line x1="0" y1="150" x2="300" y2="150" stroke="var(--border-color)" stroke-width="1"/>

        <!-- Labels -->
        <text x="75" y="30" text-anchor="middle" font-size="10" font-weight="600" fill="var(--accent-red)" opacity="0.7">Distressed</text>
        <text x="225" y="30" text-anchor="middle" font-size="10" font-weight="600" fill="var(--accent-green)" opacity="0.7">Calm</text>
        <text x="75" y="285" text-anchor="middle" font-size="10" font-weight="600" fill="var(--accent-orange)" opacity="0.7">Bored</text>
        <text x="225" y="285" text-anchor="middle" font-size="10" font-weight="600" fill="var(--accent-blue)" opacity="0.7">Excited</text>

        <!-- Axis labels -->
        <text x="150" y="296" text-anchor="middle" font-size="9" fill="var(--text-muted)">Stability &rarr;</text>
        <text x="6" y="150" text-anchor="middle" font-size="9" fill="var(--text-muted)" transform="rotate(-90,6,150)">Pleasure &rarr;</text>

        <!-- User dot -->
        <circle cx="${dotX}" cy="${dotY}" r="8" fill="#7c4dff" opacity="0.3"/>
        <circle cx="${dotX}" cy="${dotY}" r="5" fill="#7c4dff"/>
        <circle cx="${dotX}" cy="${dotY}" r="2" fill="#fff"/>
      </svg>
      <div style="text-align:center;margin-top:8px;font-size:13px;font-weight:600;color:var(--accent-purple)">${stateOfMind.quadrant}</div>
    </div>`;
  },

  /**
   * Parameter histogram (sorted bar chart)
   */
  renderHistogram(params) {
    const sorted = [...this.PARAM_LABELS]
      .map(m => ({ ...m, value: params[m.key] || 0 }))
      .sort((a, b) => b.value - a.value);

    const maxVal = Math.max(...sorted.map(s => s.value), 1);

    let bars = '';
    sorted.forEach(item => {
      const pct = Math.max((item.value / 100) * 100, 3);
      bars += `<div class="histogram-bar-col">
        <div class="histogram-bar-wrap">
          <div class="histogram-bar" style="height:${pct}%;background:${item.color}"></div>
        </div>
        <div class="histogram-label">${item.short}<br>${item.value}</div>
      </div>`;
    });

    return `<div class="histogram-bars">${bars}</div>`;
  },

  /**
   * Semicircular gauge (0-100)
   */
  renderGauge(value, label, icon) {
    const v = Math.max(0, Math.min(100, value));
    // Arc from 180 to 0 degrees
    const angle = Math.PI * (1 - v / 100);
    const r = 40;
    const cx = 50, cy = 50;
    const x = cx + r * Math.cos(angle);
    const y = cy - r * Math.sin(angle);
    const largeArc = v > 50 ? 1 : 0;

    // Color gradient
    let color;
    if (v < 30) color = '#ff5252';
    else if (v < 60) color = '#ffab40';
    else color = '#00e676';

    return `<div class="gauge-card">
      <svg viewBox="0 0 100 60" xmlns="http://www.w3.org/2000/svg">
        <path d="M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}" fill="none" stroke="var(--bg-input)" stroke-width="6" stroke-linecap="round"/>
        <path d="M ${cx - r} ${cy} A ${r} ${r} 0 ${largeArc} 1 ${x.toFixed(1)} ${y.toFixed(1)}" fill="none" stroke="${color}" stroke-width="6" stroke-linecap="round"/>
      </svg>
      <div class="gauge-value" style="color:${color}">${icon || ''} ${value}</div>
      <div class="gauge-label">${label}</div>
    </div>`;
  },

  /**
   * I-E Correlation Timeline (dual sparkline)
   */
  renderTimeline(deceptionTimeline) {
    if (!deceptionTimeline || deceptionTimeline.length < 2) {
      return '<div style="text-align:center;color:var(--text-muted);font-size:12px;padding:20px">Insufficient timeline data</div>';
    }

    const w = 300, h = 70;
    const n = deceptionTimeline.length;
    const stepX = w / (n - 1);

    // Extract internal (deception probability) and external (expressed emotion)
    const internal = deceptionTimeline.map(d => d.deceptionProb || d.internal || 50);
    const external = deceptionTimeline.map(d => d.expressedEmotion || d.external || 50);

    function toPoints(values) {
      const min = 0, max = 100;
      return values.map((v, i) => {
        const x = (i * stepX).toFixed(1);
        const y = (h - 5 - ((v - min) / (max - min)) * (h - 10)).toFixed(1);
        return `${x},${y}`;
      }).join(' ');
    }

    return `<div class="timeline-chart">
      <svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
        <polyline points="${toPoints(internal)}" fill="none" stroke="#ff5252" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.8"/>
        <polyline points="${toPoints(external)}" fill="none" stroke="#7c4dff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.8"/>
      </svg>
      <div style="display:flex;gap:16px;justify-content:center;margin-top:6px;font-size:11px">
        <span style="color:#ff5252">&#9644; Internal</span>
        <span style="color:#7c4dff">&#9644; External</span>
      </div>
    </div>`;
  },

  /**
   * Condition alerts from NeuroAnalyzer
   */
  renderConditions(conditions) {
    if (!conditions || conditions.length === 0) {
      return '<div style="text-align:center;color:var(--text-muted);font-size:12px;padding:16px">No significant conditions detected</div>';
    }

    const levelColors = {
      'high': '#ff5252',
      'moderate': '#ffab40',
      'elevated': '#ffab40',
      'low': '#00e676',
      'minimal': '#00e676',
    };

    let html = '<div class="condition-list">';
    conditions.forEach(c => {
      const color = levelColors[c.level?.toLowerCase()] || '#448aff';
      const likelihood = typeof c.likelihood === 'number' ? c.likelihood : 0;
      html += `<div class="condition-item">
        <div class="condition-dot" style="background:${color}"></div>
        <div class="condition-info">
          <div class="condition-name">${c.condition || c.category || 'Unknown'}</div>
          <div class="condition-detail">${c.level || ''} ${c.indicators ? '- ' + c.indicators.slice(0, 2).join(', ') : ''}</div>
        </div>
        <div class="condition-likelihood" style="color:${color}">${Math.round(likelihood)}%</div>
      </div>`;
    });
    html += '</div>';
    return html;
  },

  /**
   * Render the full results page
   */
  renderAllResults(profile, container) {
    const p = profile.params;
    let html = '<div class="results-grid">';

    // 1. Radar Chart
    html += `<div class="result-card">
      <div class="result-card-title"><span class="card-icon">&#128302;</span> AlphaEye Profile</div>
      ${this.renderRadar(p)}
    </div>`;

    // 2. State of Mind Quadrant
    html += `<div class="result-card">
      <div class="result-card-title"><span class="card-icon">&#129504;</span> State of Mind</div>
      ${this.renderQuadrant(profile.stateOfMind)}
    </div>`;

    // 3. Gauges Row (Vitality + Concentration)
    html += `<div class="result-card">
      <div class="result-card-title"><span class="card-icon">&#9889;</span> Vital Indicators</div>
      <div class="gauge-row">
        ${this.renderGauge(Math.round((profile.vitalityIndex + 100) / 2), 'Vitality', '&#128171;')}
        ${this.renderGauge(profile.concentrationIndex, 'Concentration', '&#127919;')}
      </div>
    </div>`;

    // 4. Mind Distribution Histogram
    html += `<div class="result-card">
      <div class="result-card-title"><span class="card-icon">&#128202;</span> Mind Distribution</div>
      ${this.renderHistogram(p)}
      <div style="text-align:center;margin-top:8px;font-size:12px;color:var(--text-secondary)">
        Emotional Stability: <strong>${profile.emotionalVariation.label}</strong> (${profile.emotionalVariation.score}/100)
      </div>
    </div>`;

    // 5. I-E Correlation Timeline
    html += `<div class="result-card">
      <div class="result-card-title"><span class="card-icon">&#128200;</span> Internal-External Correlation</div>
      ${this.renderTimeline(profile.deceptionTimeline)}
    </div>`;

    // 6. Condition Alerts
    html += `<div class="result-card">
      <div class="result-card-title"><span class="card-icon">&#128276;</span> Condition Screening</div>
      ${this.renderConditions(profile.conditions)}
    </div>`;

    // 7. Voice Stress Overlay
    if (profile.voiceStress > 0) {
      html += `<div class="result-card">
        <div class="result-card-title"><span class="card-icon">&#127908;</span> Voice Analysis</div>
        <div class="gauge-row">
          ${this.renderGauge(profile.voiceStress, 'Voice Stress', '&#128483;')}
          ${this.renderGauge(100 - profile.deceptionProb, 'Truthfulness', '&#9989;')}
        </div>
      </div>`;
    }

    html += '</div>';

    // Chat CTA
    html += `<button class="chat-cta" id="chatCta">&#128172; Chat About Your Results</button>`;

    container.innerHTML = html;

    // Wire CTA
    const cta = document.getElementById('chatCta');
    if (cta) {
      cta.addEventListener('click', () => {
        document.querySelector('[data-tab="panelChat"]')?.click();
      });
    }
  }
};
