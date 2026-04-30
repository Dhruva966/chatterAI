'use strict';

const axios = require('axios');
const logger = require('./logger');

/**
 * Orchestrator: takes a parsed task description and classifies it into
 * agent_type + agent_mode using a separate Gemini call.
 *
 * This is intentionally a separate LLM call from the initial parse so
 * routing logic can evolve independently.
 */
async function routeToAgent(description) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;

  const prompt = `Classify this phone task into the most appropriate agent type and mode.

Task description: "${description}"

Agent types and when to use them:
- food_ordering: placing food/drink orders at restaurants, cafes, fast food. Mode: null.
- appointment_booking: booking appointments at salons, clinics, doctors, vets, spas, any service provider. Mode: null.
- general_customer_service: complaints, refunds, returns, account issues, billing disputes, order status, escalations. Mode: null.
- insurance_calls: anything involving insurance. Mode must be one of:
    file_claim (reporting a new incident/loss),
    dispute_denial (disputing a denied claim or unexpected charge),
    get_quote (requesting a rate quote),
    check_status (checking status of an existing claim).
- generic: anything that doesn't clearly fit the above categories.

Return valid JSON only, no explanation, no markdown:
{"agent_type": "<type>", "agent_mode": "<mode or null>"}`;

  try {
    const response = await axios.post(url, {
      contents: [{ parts: [{ text: prompt }] }],
    }, { timeout: 10000 });

    const raw = response.data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    const result = JSON.parse(cleaned);

    const validTypes = ['food_ordering', 'appointment_booking', 'general_customer_service', 'insurance_calls', 'generic'];
    const agentType = validTypes.includes(result.agent_type) ? result.agent_type : 'generic';

    const validModes = ['file_claim', 'dispute_denial', 'get_quote', 'check_status', null];
    const agentMode = validModes.includes(result.agent_mode) ? result.agent_mode : null;

    logger.info({ description, agentType, agentMode }, 'Agent routing decision');
    return { agentType, agentMode };

  } catch (err) {
    logger.warn({ err: err.message, description }, 'Agent routing failed — falling back to generic');
    return { agentType: 'generic', agentMode: null };
  }
}

module.exports = { routeToAgent };
