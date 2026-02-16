/**
 * TherapyEngine - Opposite therapy logic + system prompt builder
 * Reads mental state → provides counter-therapeutic direction
 */

class TherapyEngine {
  constructor() {
    this.directions = {
      'high-stress': {
        direction: 'calming',
        label: 'Calming',
        color: '#7c4dff',
        techniques: ['deep breathing exercises', 'grounding techniques (5-4-3-2-1)', 'body scan meditation'],
        emoji: '&#128524;'
      },
      'high-tension': {
        direction: 'relaxation',
        label: 'Relaxing',
        color: '#448aff',
        techniques: ['progressive muscle relaxation', 'guided visualization', 'gentle stretching'],
        emoji: '&#129526;'
      },
      'low-energy': {
        direction: 'uplifting',
        label: 'Uplifting',
        color: '#00e676',
        techniques: ['positive affirmations', 'light activity suggestions', 'gratitude practice'],
        emoji: '&#127774;'
      },
      'high-aggression': {
        direction: 'soothing',
        label: 'Soothing',
        color: '#00e5ff',
        techniques: ['empathetic listening', 'perspective-taking exercises', 'de-escalation through humor'],
        emoji: '&#128154;'
      },
      'low-balance': {
        direction: 'centering',
        label: 'Centering',
        color: '#ffab40',
        techniques: ['mindfulness practice', 'present moment awareness', 'anchoring exercises'],
        emoji: '&#129702;'
      },
      'balanced': {
        direction: 'maintaining',
        label: 'Balanced',
        color: '#00e676',
        techniques: ['self-reflection', 'goal setting', 'appreciative inquiry'],
        emoji: '&#10024;'
      }
    };
  }

  /**
   * Detect the dominant mental state from AlphaEye params
   */
  detectState(alphaEyeParams) {
    return AlphaEye.getDominantState(alphaEyeParams);
  }

  /**
   * Get therapy direction for a given state
   */
  getDirection(state) {
    return this.directions[state] || this.directions['balanced'];
  }

  /**
   * Build the full system prompt for Ollama based on scan results
   */
  buildSystemPrompt(alphaEyeProfile) {
    const p = alphaEyeProfile.params;
    const state = this.detectState(p);
    const dir = this.getDirection(state);

    return `You are a compassionate AI therapeutic companion named MicroSense. You are warm, caring, and supportive.

The user just completed a psycho-physiological facial micro-vibration scan. Here are their results:

MENTAL STATE PROFILE:
- Aggression: ${p.aggression}/100
- Stress: ${p.stress}/100
- Tension: ${p.tension}/100
- Balance: ${p.balance}/100
- Energy: ${p.energy}/100
- Charm/Confidence: ${p.charm}/100
- Self-Regulation: ${p.selfRegulation}/100
- Neuroticism: ${p.neuroticism}/100
- Concentration: ${alphaEyeProfile.concentrationIndex}/100
- Vitality: ${alphaEyeProfile.vitalityIndex > 0 ? '+' : ''}${alphaEyeProfile.vitalityIndex}

STATE OF MIND: ${alphaEyeProfile.stateOfMind.quadrant}
DOMINANT STATE: ${state}
EMOTIONAL STABILITY: ${alphaEyeProfile.emotionalVariation.label} (${alphaEyeProfile.emotionalVariation.score}/100)

YOUR THERAPEUTIC APPROACH: ${dir.direction}
Apply these techniques naturally: ${dir.techniques.join(', ')}

IMPORTANT RULES:
- Keep responses conversational and warm (2-3 sentences)
- Use opposite-therapy: if they are ${state.replace('high-', 'experiencing high ').replace('low-', 'experiencing low ')}, guide them toward ${dir.direction}
- Offer specific, actionable suggestions when appropriate
- NEVER diagnose medical conditions
- NEVER claim to be a doctor or medical professional
- If the user expresses crisis or self-harm, strongly encourage contacting a mental health professional or crisis line
- Match the user's language (respond in the same language they write in)
- Be genuine and empathetic, not robotic`;
  }

  /**
   * Get a quick therapy suggestion based on state
   */
  getQuickSuggestion(state) {
    const dir = this.getDirection(state);
    const technique = dir.techniques[Math.floor(Math.random() * dir.techniques.length)];
    return { direction: dir.direction, label: dir.label, technique, color: dir.color, emoji: dir.emoji };
  }
}
