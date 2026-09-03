/**
 * Guest Generate — /api/v1/guest-generate
 * Allows one unauthenticated guide generation per IP per 24 hours.
 * Returns the same shape as the authenticated generate-guide endpoint.
 * Videos and diagram are omitted to reduce cost.
 */

// In-memory rate limiter (per Cloudflare Worker isolate)
// Resets on worker restart — acceptable for abuse prevention
const guestRateLimit = new Map();
const GUEST_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

function cleanGuestRateLimit() {
  const now = Date.now();
  for (const [ip, ts] of guestRateLimit) {
    if (now - ts > GUEST_WINDOW_MS) guestRateLimit.delete(ip);
  }
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': 'https://www.omnivibe.app',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
  }

  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  cleanGuestRateLimit();

  // Check rate limit
  const lastUsed = guestRateLimit.get(ip);
  if (lastUsed && Date.now() - lastUsed < GUEST_WINDOW_MS) {
    const hoursLeft = Math.ceil((GUEST_WINDOW_MS - (Date.now() - lastUsed)) / (1000 * 60 * 60));
    return new Response(
      JSON.stringify({ error: `You have already used your free guide today. Create a free account or try again in ${hoursLeft} hour${hoursLeft !== 1 ? 's' : ''}.` }),
      { status: 429, headers: { 'Content-Type': 'application/json' } }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body.' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  const prompt = (body.prompt || '').trim();
  if (!prompt) {
    return new Response(JSON.stringify({ error: 'Please describe your repair or project.' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
  if (prompt.length > 500) {
    return new Response(JSON.stringify({ error: 'Description too long. Please keep it under 500 characters.' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  const geminiKey = (env.GEMINI_API_KEY || '').trim();
  if (!geminiKey) {
    return new Response(JSON.stringify({ error: 'Service temporarily unavailable.' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
  }

  const geminiBaseUrl = env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com';
  const GEMINI_URL = `${geminiBaseUrl}/v1beta/models/gemini-3.5-flash:generateContent?key=${geminiKey}`;

  const guidePrompt = `
You are an expert master mechanic, builder, and DIY instructor with encyclopedic knowledge of auto repair, home improvement, electronics, and all trades.
The user task: "${prompt}"

Return ONLY a raw JSON object (no markdown, no code fences) with this EXACT structure:
{
  "title": "Concise descriptive title",
  "difficulty": "Easy",
  "estimatedTime": "2-3 hours",
  "safetyChecklist": [
    "Specific pre-repair safety action (e.g. 'Disconnect the negative 12V battery terminal before beginning.')"
  ],
  "tools": [
    { "name": "Tool name", "search_term": "tool search term", "category": "tool" }
  ],
  "parts": [
    { "name": "Part name", "search_term": "part search term", "category": "auto_part" }
  ],
  "steps": ["Step 1: ...", "Step 2: ..."],
  "stepTimestamps": [
    {"step": 1, "startSeconds": 30, "endSeconds": 90}
  ]
}

Rules:
- difficulty: Easy | Medium | Hard only
- safetyChecklist: 3-6 items specific to this repair. Auto = battery/jack safety. Electrical = unplug/breaker. Microwave = discharge capacitor. Gas = shut off gas.
- tools & parts: Accurate and specific to the task
- steps: 8-15 detailed steps
- stepTimestamps length MUST equal steps length
- Return ONLY the JSON. Nothing else.
`;

  try {
    const guideRes = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: guidePrompt }] }],
        generationConfig: { temperature: 0.2, topP: 0.9, maxOutputTokens: 3000 }
      })
    });

    if (!guideRes.ok) {
      throw new Error(`AI service error (${guideRes.status}).`);
    }

    const guideGeminiData = await guideRes.json();
    if (!guideGeminiData.candidates?.length) {
      throw new Error('AI did not return a valid response.');
    }

    let guideJsonStr = guideGeminiData.candidates[0].content.parts[0].text.trim();
    guideJsonStr = guideJsonStr.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
    let guideData;
    try {
      guideData = JSON.parse(guideJsonStr);
    } catch (err) {
      throw new Error(`AI returned an invalid format.`);
    }

    // Record this IP as having used their free run
    guestRateLimit.set(ip, Date.now());

    // Build store links using the same categories as the authenticated endpoint
    function buildStoreLinks(item, isPartsList) {
      const q = encodeURIComponent(item.search_term || item.name);
      const cat = (item.category || '').toLowerCase();
      const links = [];

      if (isPartsList) {
        if (cat === 'auto_part') {
          links.push({ store: 'Amazon', url: `https://www.amazon.com/s?k=${q}`, note: '' });
          links.push({ store: 'RockAuto', url: `https://www.rockauto.com/en/searchresult/?sterm=${q}`, note: 'OEM Parts' });
        } else if (cat === 'home_part' || cat === 'hardware') {
          links.push({ store: 'Amazon', url: `https://www.amazon.com/s?k=${q}`, note: '' });
          links.push({ store: 'ApplianceParts', url: `https://www.appliancepartspros.com/search/?model=&q=${q}`, note: 'Appliance Specialist' });
        } else {
          links.push({ store: 'Amazon', url: `https://www.amazon.com/s?k=${q}`, note: '' });
        }
      } else {
        // Tools
        if (cat === 'tool' || cat === 'tool_specialty') {
          links.push({ store: 'Harbor Freight', url: `https://www.harborfreight.com/catalogsearch/result?q=${q}`, note: 'Budget-friendly' });
          links.push({ store: 'Amazon', url: `https://www.amazon.com/s?k=${q}`, note: '' });
        } else {
          links.push({ store: 'Amazon', url: `https://www.amazon.com/s?k=${q}`, note: '' });
        }
      }
      return links;
    }

    const tools = (guideData.tools || []).map(t => ({ ...t, storeLinks: buildStoreLinks(t, false) }));
    const parts = (guideData.parts || []).map(p => ({ ...p, storeLinks: buildStoreLinks(p, true) }));

    const guide = {
      title: guideData.title || 'Repair Guide',
      difficulty: guideData.difficulty || 'Medium',
      estimatedTime: guideData.estimatedTime || 'Unknown',
      safetyChecklist: guideData.safetyChecklist || [],
      steps: guideData.steps || [],
      stepTimestamps: guideData.stepTimestamps || [],
      tools,
      parts,
      videos: [],          // Not fetched for guest runs
      diagramBase64: null, // Not generated for guest runs
      isGuestRun: true,
    };

    return new Response(JSON.stringify({ guide, creditsRemaining: 0 }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('Guest generate error:', err);
    return new Response(
      JSON.stringify({ error: err.message || 'Failed to generate guide. Please try again.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
