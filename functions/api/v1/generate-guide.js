export async function onRequest(context) {
  const { request, env } = context;

  // Handle CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "https://www.omnivibe.app",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { "Content-Type": "application/json" }
    });
  }

  let user = null;
  let creditDeducted = false;
  let creditsRemaining = 0;

  try {
    // ─── AUTH ────────────────────────────────────────────────
    const cookieHeader = request.headers.get("Cookie");
    if (!cookieHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized." }), {
        status: 401, headers: { "Content-Type": "application/json" }
      });
    }
    const tokenPair = cookieHeader.split(";").map(c => c.trim()).find(c => c.startsWith("omni_session="));
    const token = tokenPair ? tokenPair.substring("omni_session=".length) : null;
    if (!token) {
      return new Response(JSON.stringify({ error: "Unauthorized." }), {
        status: 401, headers: { "Content-Type": "application/json" }
      });
    }
    const session = await env.DB.prepare(
      "SELECT user_id FROM sessions WHERE token = ? AND expires_at > datetime('now')"
    ).bind(token).first();
    if (!session) {
      return new Response(JSON.stringify({ error: "Session expired. Please login again." }), {
        status: 401, headers: { "Content-Type": "application/json" }
      });
    }
    user = await env.DB.prepare("SELECT id, email, credits FROM users WHERE id = ?")
      .bind(session.user_id).first();
    if (!user) {
      return new Response(JSON.stringify({ error: "User not found." }), {
        status: 401, headers: { "Content-Type": "application/json" }
      });
    }

    const body = await request.json();
    const { prompt } = body;
    if (!prompt || prompt.trim().length < 5) {
      return new Response(JSON.stringify({ error: "Please provide a more detailed task description." }), {
        status: 400, headers: { "Content-Type": "application/json" }
      });
    }
    const trimmedPrompt = prompt.trim();

    const isBeta = (env.BETA_MODE === "true");
    creditsRemaining = user.credits;

    if (!isBeta) {
      // Atomically reserve a credit by updating and returning the new balance
      const updatedUser = await env.DB.prepare(
        "UPDATE users SET credits = credits - 1 WHERE id = ? AND credits >= 1 RETURNING credits"
      ).bind(user.id).first();

      if (!updatedUser) {
        return new Response(JSON.stringify({ error: "Out of credits. Please purchase more runs." }), {
          status: 403, headers: { "Content-Type": "application/json" }
        });
      }
      creditsRemaining = updatedUser.credits;
      creditDeducted = true;
    }

    const geminiKey = (env.GEMINI_API_KEY || "").trim();
    const ytKey = (env.YOUTUBE_API_KEY || "").trim();

    const geminiBaseUrl = env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com";
    const GEMINI_URL = `${geminiBaseUrl}/v1beta/models/gemini-3.5-flash:generateContent?key=${geminiKey}`;

    // ─── STEP 1: Gemini — generate guide data ─────────────────
    const guidePrompt = `
You are an expert master mechanic, builder, and DIY instructor with encyclopedic knowledge of auto repair, home improvement, electronics, and all trades.
The user task: "${trimmedPrompt}"

Return ONLY a raw JSON object (no markdown, no code fences) with this EXACT structure:
{
  "title": "Concise descriptive title",
  "difficulty": "Easy",
  "estimatedTime": "2-3 hours",
  "safetyChecklist": [
    "Specific safety action relevant to this repair type (e.g. 'Disconnect the negative 12V battery terminal before beginning.')",
    "Second safety item (e.g. 'Secure the vehicle on rated jack stands — never work under a vehicle on a floor jack alone.')"
  ],
  "youtubeQueries": [
    "Highly specific query WITH year/make/model if automotive (e.g. '2003 Ford Expedition 4.6L front tie rod end replacement how to')",
    "Broader query (e.g. 'how to replace outer tie rod end step by step')",
    "Third variation for tutorials (e.g. 'tie rod end replacement DIY complete guide')"
  ],
  "diagramPrompt": "A photorealistic technical cutaway diagram with labeled callout arrows showing: [list exact component names and their spatial relationship]. White background, clean engineering drawing style, professional labeling.",
  "tools": [
    {
      "name": "Tool name e.g. 21mm Combination Wrench",
      "search_term": "21mm combination wrench",
      "category": "tool"
    }
  ],
  "parts": [
    {
      "name": "Part name e.g. Outer Tie Rod End",
      "search_term": "2003 Ford Expedition outer tie rod end",
      "category": "auto_part"
    }
  ],
  "steps": ["Step 1: ...", "Step 2: ..."],
  "stepTimestamps": [
    {"step": 1, "startSeconds": 30, "endSeconds": 90}
  ]
}

Rules:
- difficulty: Easy | Medium | Hard only
- safetyChecklist: 3-6 items specific to this repair category. Auto = battery/jack safety. Electrical/appliance = unplug/breaker. Microwave/capacitor = discharge warning. Computer = static discharge (ESD). Gas appliances = shut off gas line.
- youtubeQueries: 3 distinct queries, most specific first
- tools category: "tool" for hand tools, "tool_specialty" for specialty, "consumable" for fluids/tape/etc
- parts category: "auto_part" | "home_part" | "hardware" based on the task type
- parts list accuracy: Must list the exact replacement parts required for the user's specific vehicle/task. Do not include generic or placeholder parts.
- Part naming & search_term: For automotive tasks, extract the exact year, make, and model from the user's request (e.g. "2003 Ford Expedition") and prefix it to the "search_term" (e.g. "2003 Ford Expedition Front Outer Tie Rod End"). Use standard auto parts industry terminology (like "Front Outer Tie Rod End" instead of just "Tie Rod") to ensure store catalog matching is accurate. For general tools, keep search_term simple. For vehicle-specific specialty tools (e.g. specific socket sizes or oil filter wrenches), prefix with the year, make, and model.
- diagramPrompt creation: The generated diagramPrompt must start by explicitly naming the primary target object/device (e.g., "A laptop computer", "A home HVAC unit", "A car steering system") as the subject. Never write a generic prompt that could confuse the image generator (e.g., if the task is a laptop motherboard, explicitly specify "laptop computer motherboard" so it does not draw a mobile phone motherboard).
- steps: 8-15 detailed steps
- stepTimestamps: One object per step. Estimate start/end seconds based on typical tutorial pacing (intro ~30s, each step 30-120s depending on complexity). The array length MUST equal the steps array length.
- Return ONLY the JSON. Nothing else.
`;

    const guideRes = await fetch(GEMINI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: guidePrompt }] }],
        generationConfig: { temperature: 0.2, topP: 0.9, maxOutputTokens: 3500 }
      })
    });

    if (!guideRes.ok) {
      const errText = await guideRes.text();
      throw new Error(`AI service error (${guideRes.status}).`);
    }
    const guideGeminiData = await guideRes.json();
    if (!guideGeminiData.candidates?.length) {
      throw new Error("AI did not return a valid response. Please try again.");
    }

    let guideJsonStr = guideGeminiData.candidates[0].content.parts[0].text.trim();
    guideJsonStr = guideJsonStr.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
    let guideData;
    try {
      guideData = JSON.parse(guideJsonStr);
    } catch (err) {
      throw new Error(`AI returned an invalid format: ${err.message}. Raw string: ${guideJsonStr.slice(0, 300)}`);
    }

    // ─── STEP 2: YouTube search (Data API v3) ─────────────────
    let videos = [];
    let ytErrors = [];
    const ytQueries = (guideData.youtubeQueries || []).slice(0, 3);

    // Try the YouTube Data API first (works when key has YouTube enabled)
    if (ytKey && ytQueries.length > 0) {
      try {
        const ytSearches = ytQueries.map(q => {
          const ytBaseUrl = env.YOUTUBE_BASE_URL || "https://www.googleapis.com";
          const ytUrl = `${ytBaseUrl}/youtube/v3/search?part=snippet&q=${encodeURIComponent(q)}&type=video&maxResults=3&videoEmbeddable=true&relevanceLanguage=en&key=${ytKey}`;
          return fetch(ytUrl, {
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
            }
          }).then(async r => {
            const text = await r.text();
            try {
              return JSON.parse(text);
            } catch (err) {
              return { error: { message: `${err.message} (status: ${r.status}, body: ${text.slice(0, 300)})` } };
            }
          }).catch(err => ({ error: { message: err.message } }));
        });
        const results = await Promise.all(ytSearches);
        const seenIds = new Set();
        for (const ytData of results) {
          if (!ytData) continue;
          if (ytData.error) {
            ytErrors.push(ytData.error);
            continue;
          }
          if (!ytData.items) continue;
          for (const item of ytData.items) {
            const videoId = item.id?.videoId;
            if (!videoId || seenIds.has(videoId)) continue;
            seenIds.add(videoId);
            videos.push({
              title: item.snippet.title,
              channelName: item.snippet.channelTitle,
              videoId,
              thumbnail: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.medium?.url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
            });
          }
        }
        videos = videos.slice(0, 6);
      } catch (ytErr) {
        console.error("YouTube API error:", ytErr.message);
        ytErrors.push({ message: ytErr.message });
      }
    }

    // Fallback: if no videos, embed YouTube search links the user can click
    const youtubeSearchLinks = ytQueries.map(q => ({
      query: q,
      searchUrl: `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`
    }));

    // ─── STEP 3: Imagen — generate custom diagram (Skipped per user request) ───
    let diagramBase64 = null;
    let diagramMime = "image/png";

    // ─── STEP 4: Build multi-store shopping links ──────────────
    function buildStoreLinks(item) {
      const q = encodeURIComponent(item.search_term || item.name);
      const cat = item.category || '';
      const links = [];

      if (cat === 'auto_part') {
        links.push({ store: 'RockAuto', url: `https://www.rockauto.com/en/searchresult/?sterm=${q}`, note: 'Often cheapest' });
        links.push({ store: 'AutoZone', url: `https://www.autozone.com/searchresult?searchText=${q}` });
        links.push({ store: "O'Reilly", url: `https://www.oreillyauto.com/search?q=${q}` });
        links.push({ store: 'NAPA', url: `https://www.napaonline.com/en/search?query=${q}` });
        links.push({ store: 'Amazon', url: `https://www.amazon.com/s?k=${q}` });
      } else if (cat === 'tool' || cat === 'tool_specialty') {
        links.push({ store: 'Harbor Freight', url: `https://www.harborfreight.com/catalogsearch/result?q=${q}`, note: 'Budget-friendly' });
        links.push({ store: 'Amazon', url: `https://www.amazon.com/s?k=${q}` });
        links.push({ store: 'Home Depot', url: `https://www.homedepot.com/s/${q}` });
        links.push({ store: "Lowe's", url: `https://www.lowes.com/search?searchTerm=${q}` });
      } else if (cat === 'consumable') {
        links.push({ store: 'Amazon', url: `https://www.amazon.com/s?k=${q}` });
        links.push({ store: 'AutoZone', url: `https://www.autozone.com/searchresult?searchText=${q}` });
        links.push({ store: 'Walmart', url: `https://www.walmart.com/search?q=${q}` });
      } else {
        // hardware / home_part / default
        links.push({ store: 'Amazon', url: `https://www.amazon.com/s?k=${q}` });
        links.push({ store: 'ApplianceParts', url: `https://www.appliancepartspros.com/search/?model=&q=${q}`, note: 'Appliance Specialist' });
        links.push({ store: 'Home Depot', url: `https://www.homedepot.com/s/${q}` });
        links.push({ store: "Lowe's", url: `https://www.lowes.com/search?searchTerm=${q}` });
      }
      return links;
    }

    const toolsWithLinks = (guideData.tools || []).map(t => ({ ...t, storeLinks: buildStoreLinks(t) }));
    const partsWithLinks = (guideData.parts || []).map(p => ({ ...p, storeLinks: buildStoreLinks(p) }));

    // ─── STEP 5: Assemble + save + respond ────────────────────
    const finalResponse = {
      title: guideData.title,
      difficulty: guideData.difficulty,
      estimatedTime: guideData.estimatedTime,
      safetyChecklist: guideData.safetyChecklist || [],
      tools: toolsWithLinks,
      parts: partsWithLinks,
      steps: guideData.steps,
      stepTimestamps: guideData.stepTimestamps || [],
      videos,
      youtubeSearchLinks,
      ytErrors,
      diagramBase64,
      diagramMime,
      betaMode: isBeta
    };

    // Save to D1 (non-fatal)
    try {
      await env.DB.prepare(
        "INSERT INTO saved_guides (user_id, prompt, content) VALUES (?, ?, ?)"
      ).bind(user.id, trimmedPrompt, JSON.stringify({ ...finalResponse, diagramBase64: '[omitted]' })).run();
    } catch {}

    return new Response(JSON.stringify({ guide: finalResponse, creditsRemaining }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });

  } catch (err) {
    if (creditDeducted && user) {
      try {
        await env.DB.prepare("UPDATE users SET credits = credits + 1 WHERE id = ?").bind(user.id).run();
      } catch (refundErr) {
        console.error("Failed to refund credit on error:", refundErr);
      }
    }
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
