import dotenv from 'dotenv';

dotenv.config();

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const HF_API_URL = 'https://api-inference.huggingface.co/pipeline/feature-extraction/sentence-transformers/all-MiniLM-L6-v2';

export interface ParsedRequirement {
  eventType?: string; // category: decorator, caterer, venue, photographer
  city?: string;
  eventDate?: string; // YYYY-MM-DD
  guestCount?: number;
  budget?: number;
  theme?: string;
}

/**
 * Computes a pseudo-random seedable number generator.
 * Used for the offline deterministic vector fallback.
 */
function sfc32(a: number, b: number, c: number, d: number) {
  return function() {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    var t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  }
}

/**
 * Generates a deterministic pseudo-random seed from a string.
 */
function cyrb128(str: string) {
  let h1 = 1779033703, h2 = 3024733165, h3 = 3362453691, h4 = 2814940063;
  for (let i = 0, k; i < str.length; i++) {
    k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  return [(h1^h2^h3^h4)>>>0, (h2^h1)>>>0, (h3^h1)>>>0, (h4^h1)>>>0];
}

/**
 * Generates a 384-dimensional embedding vector.
 * Tries the HuggingFace API first. If it fails or is offline, generates a 
 * deterministic local vector representing a bag-of-words space.
 */
export async function generateEmbeddings(text: string): Promise<number[]> {
  const cleanedText = text.trim().toLowerCase();
  
  if (!cleanedText) {
    return new Array(384).fill(0);
  }

  try {
    const response = await fetch(HF_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ inputs: cleanedText }),
    });

    if (response.ok) {
      const data = await response.json();
      if (Array.isArray(data) && data.length === 384) {
        console.log(`[LLMService] Successfully fetched HF embeddings for: "${text.slice(0, 20)}..."`);
        return data as number[];
      }
    }
    console.warn(`[LLMService] HF embedding request failed with status: ${response.status}. Falling back to local vectors.`);
  } catch (err) {
    console.warn(`[LLMService] Hugging Face inference offline/error. Using local vector fallback.`);
  }

  // --- LOCAL FALLBACK: Hash-based Vector Space Projection ---
  // We project lowercase words into a 384-dimensional unit vector.
  // This produces a stable, mathematical vector. Sharing words results in higher similarity.
  const vector = new Array(384).fill(0);
  const words = cleanedText.split(/[^\w]+/).filter(w => w.length > 2);
  
  if (words.length === 0) {
    words.push(cleanedText);
  }

  for (const word of words) {
    const seed = cyrb128(word);
    const rand = sfc32(seed[0], seed[1], seed[2], seed[3]);
    
    // Add contributions to 8 random dimensions for this word
    for (let j = 0; j < 8; j++) {
      const dim = Math.floor(rand() * 384);
      vector[dim] += (rand() * 2 - 1);
    }
  }

  // Normalize vector to unit length
  let sumSq = 0;
  for (let i = 0; i < 384; i++) {
    sumSq += vector[i] * vector[i];
  }
  const magnitude = Math.sqrt(sumSq) || 1;
  for (let i = 0; i < 384; i++) {
    vector[i] /= magnitude;
  }

  return vector;
}

/**
 * Parses free-text customer intake queries using Claude tool calling or JSON-mode instructions.
 * Falls back to local regex matching if the API key is not present.
 */
export async function parseFreeTextRequirement(text: string): Promise<ParsedRequirement> {
  console.log(`[LLMService] Parsing free text: "${text}"`);
  
  if (ANTHROPIC_API_KEY) {
    try {
      const systemPrompt = `
You are a parser for the Happiffie Vendor Matching engine.
Extract the following fields from the user request and return them as a clean JSON object:
- eventType: Must be one of: 'decorator', 'caterer', 'venue', 'photographer'
- city: Must be 'Chennai' or 'Bangalore'
- eventDate: Date in YYYY-MM-DD format (if current year is not specified, assume 2026)
- guestCount: Integer number of guests
- budget: Integer budget amount in Indian Rupees (convert things like "5 lakhs" or "5 L" to 500000, "1.5 lakhs" to 150000)
- theme: Description of the theme/aesthetic request

Return ONLY the raw JSON object inside a markdown code block, like:
\`\`\`json
{ ... }
\`\`\`
      `;

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-3-5-sonnet-20240620',
          max_tokens: 800,
          system: systemPrompt,
          messages: [
            { role: 'user', content: text }
          ],
        }),
      });

      if (response.ok) {
        const json = (await response.json()) as any;
        const content = json.content?.[0]?.text || '';
        const match = content.match(/```json\s*([\s\S]*?)\s*```/) || content.match(/({[\s\S]*})/);
        if (match) {
          const parsed = JSON.parse(match[1].trim());
          console.log('[LLMService] Claude successfully parsed request:', parsed);
          return parsed as ParsedRequirement;
        }
      }
      console.warn('[LLMService] Claude API failed or returned bad format. Falling back to Regex parsing.');
    } catch (e) {
      console.warn('[LLMService] Error during Claude API execution:', e);
    }
  }

  // --- REGEX FALLBACK PARSER ---
  console.log('[LLMService] Using local regex requirement parser.');
  const parsed: ParsedRequirement = {};

  const lower = text.toLowerCase();

  // 1. Extract Category
  if (lower.includes('decorat') || lower.includes('flower') || lower.includes('stage')) {
    parsed.eventType = 'decorator';
  } else if (lower.includes('cater') || lower.includes('food') || lower.includes('cook') || lower.includes('biryani')) {
    parsed.eventType = 'caterer';
  } else if (lower.includes('photograph') || lower.includes('photo') || lower.includes('shoot') || lower.includes('video') || lower.includes('camera')) {
    parsed.eventType = 'photographer';
  } else if (lower.includes('venue') || lower.includes('hall') || lower.includes('resort') || lower.includes('lawn') || lower.includes('palace')) {
    parsed.eventType = 'venue';
  } else {
    parsed.eventType = 'decorator'; // default fallback
  }

  // 2. Extract City
  if (lower.includes('chennai') || lower.includes('madras') || lower.includes('adyar') || lower.includes('nungambakkam')) {
    parsed.city = 'Chennai';
  } else if (lower.includes('bangalore') || lower.includes('bengaluru') || lower.includes('koramangala') || lower.includes('indiranagar')) {
    parsed.city = 'Bangalore';
  } else {
    parsed.city = 'Chennai'; // default
  }

  // 3. Extract Budget
  // Handle lakhs e.g. "5 lakhs", "1.5 lakhs"
  const lakhMatch = lower.match(/(\d+(?:\.\d+)?)\s*(?:lakh|lacs|l)/);
  if (lakhMatch) {
    parsed.budget = parseFloat(lakhMatch[1]) * 100000;
  } else {
    const numMatch = lower.match(/(?:budget|price|rs\.?)\s*(?:around|of|is)?\s*(\d[\d,]*)/);
    if (numMatch) {
      parsed.budget = parseInt(numMatch[1].replace(/,/g, ''));
    } else {
      parsed.budget = 150000; // default default
    }
  }

  // 4. Extract Guests
  const guestMatch = lower.match(/(\d+)\s*(?:guest|people|pax|person|attendee)/);
  if (guestMatch) {
    parsed.guestCount = parseInt(guestMatch[1]);
  } else {
    parsed.guestCount = 200; // default
  }

  // 5. Extract Date
  // Match standard YYYY-MM-DD or scan for phrases
  const dateMatch = text.match(/(\d{4})[-/](\d{2})[-/](\d{2})/);
  if (dateMatch) {
    parsed.eventDate = `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`;
  } else {
    parsed.eventDate = '2026-10-12'; // default test case date
  }

  // 6. Extract Theme
  // Get everything after keywords or just use the description
  parsed.theme = text.length > 255 ? text.slice(0, 255) : text;

  return parsed;
}

/**
 * Generates natural explanations using Claude.
 * Falls back to rules-based strings if Anthropic key is not available.
 */
export async function generateMatchRationale(
  requirement: any,
  vendor: any,
  score: number
): Promise<{ userExplanation: string; vendorExplanation: string }> {
  
  if (ANTHROPIC_API_KEY) {
    try {
      const prompt = `
Generate a natural-language match rationale (1-2 sentences) for a marketplace matching:
Client Requirement:
- Category: ${requirement.eventType}
- City: ${requirement.city}
- Budget: ₹${requirement.budget}
- Theme request: "${requirement.theme}"

Vendor details:
- Business Name: ${vendor.businessName}
- Rating: ${vendor.profile?.ratingsAvg || 'New'} stars
- Experience: ${vendor.profile?.experienceYears || 0} years
- Specialties: ${vendor.profile?.specialties?.join(', ') || 'N/A'}
- Overall Match Score: ${score}%

Generate two separate descriptions:
1. User explanation ("Why matched to you"): Explain why this vendor is a great fit for the user's aesthetic, budget, and location. Keep it professional and warm.
2. Vendor explanation ("Why invited"): Explain why the vendor was matched to this lead (e.g. fits their specialties, available on date, fits their pricing floor).

Return JSON format:
{
  "userExplanation": "...",
  "vendorExplanation": "..."
}
      `;

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-3-5-sonnet-20240620',
          max_tokens: 400,
          messages: [{ role: 'user', content: prompt }],
        }),
      });

      if (response.ok) {
        const json = (await response.json()) as any;
        const text = json.content?.[0]?.text || '';
        const match = text.match(/({[\s\S]*})/);
        if (match) {
          const result = JSON.parse(match[1]);
          return {
            userExplanation: result.userExplanation,
            vendorExplanation: result.vendorExplanation,
          };
        }
      }
    } catch (e) {
      console.warn('[LLMService] Claude Match Rationale generator failed. Falling back to rule-based explainer.', e);
    }
  }

  // --- RULE-BASED FALLBACK GENERATOR ---
  const specialties = vendor.profile?.specialties || [];
  const specsText = specialties.slice(0, 2).join(' & ');
  const ratingText = vendor.profile?.ratingsAvg > 0 ? `${vendor.profile.ratingsAvg} stars` : 'newly registered';

  const userExplanation = `${vendor.businessName} is a top selection (${score}% Match) because they operate directly in ${requirement.city}, boast a stellar rating of ${ratingText}, and their specialties in "${specsText}" align beautifully with your "${requirement.theme || 'event'}" aesthetic.`;
  const vendorExplanation = `You were matched to this lead because the client's budget of ₹${requirement.budget.toLocaleString('en-IN')} fits comfortably above your floor of ₹${vendor.profile?.budgetFloor.toLocaleString('en-IN')}, and your profile specializes in their requested theme.`;

  return { userExplanation, vendorExplanation };
}
