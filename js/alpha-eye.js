/**
 * AlphaEye Profiler - Maps Mini 2 engine outputs to 10 AlphaEye parameters
 * Each parameter is normalized to 0-100 scale
 */

class AlphaEye {

  /**
   * Compute 10-parameter AlphaEye profile from engine results
   * @param {Object} threat - ThreatEngine.fullAnalysis() result
   * @param {Object} deception - DeceptionEngine.fullAnalysis() result
   * @param {Object} neuro - NeuroAnalyzer.analyze() result
   * @param {Object} vsa - VoiceStressEngine.fullAnalysis() result
   * @returns {Object} AlphaEye profile
   */
  static compute(threat, deception, neuro, vsa) {
    const m = threat?.metrics || {};
    const bio = neuro?.biometrics || {};
    const dec = deception || {};

    const aggression = AlphaEye.clamp(m.aggression || 30);
    const stress = AlphaEye.clamp(m.stress || 25);
    const tension = AlphaEye.clamp(m.tension || 20);
    const suspect = AlphaEye.clamp(m.badIntent || 25);
    const balance = AlphaEye.clamp(m.stability || 60);
    const expressionRange = AlphaEye.clamp(bio.expressionRange || 50);
    const truthfulness = AlphaEye.clamp(dec.truthfulnessIndex || 70);
    const charm = AlphaEye.clamp(Math.round(truthfulness * 0.6 + expressionRange * 0.4));
    const energy = AlphaEye.clamp(bio.psychomotorIndex || 50);
    const selfRegulation = AlphaEye.clamp(Math.round((balance + charm) / 2));
    const gazeStability = AlphaEye.clamp(bio.gazeStability || 60);
    const inhibition = AlphaEye.clamp(Math.round(100 - gazeStability));
    const neuroticism = AlphaEye.clamp(bio.microTremorScore || 20);

    const params = {
      aggression,
      stress,
      tension,
      suspect,
      balance,
      charm,
      energy,
      selfRegulation,
      inhibition,
      neuroticism
    };

    // Additional data overlays
    const voiceStress = AlphaEye.clamp(vsa?.voiceStressScore || 0);
    const deceptionProb = AlphaEye.clamp(dec.deceptionProbability || 0);
    const conditions = neuro?.conditions || [];
    const microExpressions = dec.microExpressions || [];
    const deceptionTimeline = dec.deceptionTimeline || [];

    // Derived metrics
    const emotionalVariation = AlphaEye.computeEmotionalVariation(params);
    const vitalityIndex = AlphaEye.computeVitality(energy, stress, neuroticism);
    const concentrationIndex = AlphaEye.computeConcentration(gazeStability, inhibition, stress);
    const stateOfMind = AlphaEye.classifyStateOfMind(params);

    return {
      params,
      voiceStress,
      deceptionProb,
      conditions,
      microExpressions,
      deceptionTimeline,
      emotionalVariation,
      vitalityIndex,
      concentrationIndex,
      stateOfMind,
      timestamp: Date.now()
    };
  }

  static clamp(v) {
    return Math.max(0, Math.min(100, Math.round(v)));
  }

  /**
   * Emotional Variation: how spread out the negative parameters are
   * Low spread = stable, high spread = unstable
   */
  static computeEmotionalVariation(p) {
    const neg = [p.aggression, p.stress, p.tension, p.neuroticism];
    const avg = neg.reduce((a, b) => a + b, 0) / neg.length;
    const variance = neg.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / neg.length;
    const stdDev = Math.sqrt(variance);
    const score = Math.round(stdDev * 2);
    return {
      score: AlphaEye.clamp(score),
      label: score > 30 ? 'Unstable' : score > 15 ? 'Moderate' : 'Stable'
    };
  }

  /**
   * Vitality Index: brain fatigue sigmoid (-100 to +100)
   * Positive = alert/vital, negative = fatigued
   */
  static computeVitality(energy, stress, neuroticism) {
    const raw = energy - (stress * 0.4 + neuroticism * 0.3);
    // Sigmoid mapping to -100..+100
    const sigmoid = (2 / (1 + Math.exp(-raw / 20))) - 1;
    return Math.round(sigmoid * 100);
  }

  /**
   * Concentration Index: 0-100
   */
  static computeConcentration(gazeStability, inhibition, stress) {
    return AlphaEye.clamp(Math.round(
      gazeStability * 0.5 + (100 - inhibition) * 0.3 + (100 - stress) * 0.2
    ));
  }

  /**
   * State of Mind: 4-quadrant classification
   * X-axis: Stability (balance), Y-axis: Pleasure (inverse of stress+tension)
   */
  static classifyStateOfMind(p) {
    const stability = p.balance;
    const pleasure = Math.round(100 - (p.stress + p.tension) / 2);
    let quadrant;
    if (stability >= 50 && pleasure >= 50) quadrant = 'Calm & Content';
    else if (stability < 50 && pleasure >= 50) quadrant = 'Excited & Active';
    else if (stability >= 50 && pleasure < 50) quadrant = 'Bored & Low';
    else quadrant = 'Distressed & Anxious';

    return { stability, pleasure, quadrant };
  }

  /**
   * Get the dominant mental state for therapy direction
   */
  static getDominantState(params) {
    const p = params;
    const states = [
      { key: 'high-stress', score: p.stress },
      { key: 'high-tension', score: p.tension },
      { key: 'high-aggression', score: p.aggression },
      { key: 'low-energy', score: 100 - p.energy },
      { key: 'low-balance', score: 100 - p.balance },
    ];
    states.sort((a, b) => b.score - a.score);
    const top = states[0];
    if (top.score < 40) return 'balanced';
    return top.key;
  }
}
