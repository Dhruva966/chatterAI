// Consent IVR state machine (ADR-007)
// States: WAITING → ACTIVE → DEPARTED
//
// WAITING: collecting press-1 from both parties within 10s window
// ACTIVE: both consented, Chatter is live
// DEPARTED: one party declined/timed out, or press-2 mid-call — Chatter exits

const CONSENT_TIMEOUT_MS = 10_000;

class ConsentManager {
  constructor(conferenceSid, onActive, onDeparted) {
    this.conferenceSid = conferenceSid;
    this.onActive = onActive;
    this.onDeparted = onDeparted;

    this.state = 'WAITING';
    this.consented = new Set(); // call SIDs of parties who pressed 1
    this.required = new Set(); // call SIDs of parties in the conference
    this._timer = null;
  }

  // Call when a participant joins the conference.
  participantJoined(callSid) {
    if (this.state !== 'WAITING') {
      // Late joiner: ADR-007 — Chatter cannot retroactively consent them
      // departure is triggered by conference.js when it sees this state
      return;
    }
    this.required.add(callSid);
  }

  // Call when a participant presses 1 (consent).
  consent(callSid) {
    if (this.state !== 'WAITING') return;
    this.consented.add(callSid);
    this._checkAllConsented();
  }

  // Call when a participant presses 2 (revoke) — works in any state.
  revoke(callSid) {
    if (this.state === 'DEPARTED') return;
    this._depart(`revoked by ${callSid}`);
  }

  startTimer() {
    this._timer = setTimeout(() => {
      if (this.state === 'WAITING') {
        this._depart('consent timeout');
      }
    }, CONSENT_TIMEOUT_MS);
  }

  _checkAllConsented() {
    if (this.required.size === 0) return;
    const allConsented = [...this.required].every(sid => this.consented.has(sid));
    if (allConsented) {
      clearTimeout(this._timer);
      this.state = 'ACTIVE';
      this.onActive();
    }
  }

  _depart(reason) {
    clearTimeout(this._timer);
    this.state = 'DEPARTED';
    this.onDeparted(reason);
  }

  isActive() {
    return this.state === 'ACTIVE';
  }

  isWaiting() {
    return this.state === 'WAITING';
  }
}

module.exports = ConsentManager;
