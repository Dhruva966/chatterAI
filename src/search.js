'use strict';

const Exa = require('exa-js').default;
const axios = require('axios');
const logger = require('./logger');

const exa = new Exa(process.env.EXA_API_KEY);

/**
 * Find a business and its phone number given a description + optional location.
 * Returns { businessName, phoneNumber, address, sourceUrl } or null.
 */
async function findBusiness(description, location) {
  const locationPart = location ? ` near ${location}` : '';
  const query = `${description}${locationPart} phone number`;

  logger.info({ query, description, location }, 'Searching for business phone number');

  let results;
  try {
    const res = await exa.searchAndContents(query, {
      type: 'fast',
      numResults: 5,
      text: { maxCharacters: 2000 },
      highlights: { numSentences: 5, highlightsPerUrl: 3 },
    });
    results = res.results || [];
  } catch (err) {
    logger.error({ err: err.message }, 'Exa search failed in findBusiness');
    return null;
  }

  if (results.length === 0) return null;

  // Try to extract a phone number from each result's text/highlights
  for (const r of results) {
    const text = [
      r.text || '',
      ...(r.highlights || []),
      r.title || '',
    ].join(' ');

    const phone = extractPhone(text);
    if (phone) {
      logger.info({ businessName: r.title, phone, url: r.url }, 'Found business phone');
      return {
        businessName: r.title || description,
        phoneNumber: phone,
        address: null,
        sourceUrl: r.url,
      };
    }
  }

  // No phone found in text — ask Gemini to extract from the combined content
  return await extractPhoneWithGemini(description, location, results);
}

/**
 * Regex-based phone extraction. Handles US formats and international +1 prefix.
 * Returns E.164 format or null.
 */
function extractPhone(text) {
  // Match common US phone patterns
  const patterns = [
    /(\+1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}/g,
    /\+1\d{10}/g,
  ];

  for (const pattern of patterns) {
    const matches = text.match(pattern);
    if (matches) {
      for (const match of matches) {
        const digits = match.replace(/\D/g, '');
        if (digits.length === 10) return `+1${digits}`;
        if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
      }
    }
  }
  return null;
}

/**
 * Fallback: use Gemini to extract business info from Exa results.
 */
async function extractPhoneWithGemini(description, location, results) {
  if (!process.env.GEMINI_API_KEY) return null;

  const content = results.slice(0, 3).map(r =>
    `Source: ${r.url}\nTitle: ${r.title}\n${(r.highlights || []).join(' ')}\n${(r.text || '').slice(0, 500)}`
  ).join('\n\n---\n\n');

  const prompt = `I'm looking for a "${description}"${location ? ` near ${location}` : ''}.
Extract from the search results below:
- business_name: the most relevant business name
- phone_number: US phone number in E.164 format (+1XXXXXXXXXX), or null if not found
- address: street address if present, or null

Return valid JSON only, no explanation:
{"business_name": "...", "phone_number": "...", "address": "..."}

Search results:
${content}`;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;
    const response = await axios.post(url, {
      contents: [{ parts: [{ text: prompt }] }],
    }, { timeout: 10000 });

    const raw = response.data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    const parsed = JSON.parse(cleaned);

    if (parsed.phone_number && parsed.phone_number !== 'null') {
      logger.info({ businessName: parsed.business_name, phone: parsed.phone_number }, 'Gemini extracted phone from search');
      return {
        businessName: parsed.business_name || description,
        phoneNumber: parsed.phone_number,
        address: parsed.address || null,
        sourceUrl: results[0]?.url || null,
      };
    }
  } catch (err) {
    logger.warn({ err: err.message }, 'Gemini phone extraction failed');
  }

  return null;
}

module.exports = { findBusiness };
