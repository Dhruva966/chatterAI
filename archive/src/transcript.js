// Rolling transcript per conference. No summarization (ADR-003).
// Claude Sonnet 200K context handles ~100 min raw. Sliding window at 150K tokens.

const APPROX_TOKENS_PER_WORD = 1.3;
const MAX_TOKENS = 150_000;

class Transcript {
  constructor() {
    this.turns = []; // { speaker: 'PartyA'|'PartyB'|'Chatter', text, timestamp }
    this.tokenCount = 0;
  }

  add(speaker, text) {
    const tokens = Math.ceil(text.split(' ').length * APPROX_TOKENS_PER_WORD);
    this.turns.push({ speaker, text, timestamp: Date.now() });
    this.tokenCount += tokens;
    this._trim();
  }

  // Drop oldest 20% of turns if we're near the limit.
  _trim() {
    if (this.tokenCount <= MAX_TOKENS) return;
    const dropCount = Math.ceil(this.turns.length * 0.2);
    const dropped = this.turns.splice(0, dropCount);
    const droppedTokens = dropped.reduce(
      (sum, t) => sum + Math.ceil(t.text.split(' ').length * APPROX_TOKENS_PER_WORD),
      0
    );
    this.tokenCount -= droppedTokens;
  }

  // Returns transcript formatted for Claude system prompt.
  toPromptString() {
    return this.turns
      .map(t => `[${t.speaker}]: ${t.text}`)
      .join('\n');
  }

  clear() {
    this.turns = [];
    this.tokenCount = 0;
  }
}

module.exports = Transcript;
