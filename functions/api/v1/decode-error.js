export async function onRequestPost(context) {
  try {
    const { request, env } = context;
    const body = await request.json();
    const { errorCode, deviceContext } = body;

    if (!errorCode) {
      return new Response(JSON.stringify({ error: 'Error code is required' }), { status: 400 });
    }

    const apiKey = env.GEMINI_API_KEY ? env.GEMINI_API_KEY.trim() : null;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'GEMINI_API_KEY is not configured' }), { status: 500 });
    }

    const prompt = `You are an expert diagnostic technician. The user has encountered an error code.
Error Code: ${errorCode}
Context (Optional): ${deviceContext || 'Unknown'}

Provide a very brief (1-2 sentences) explanation of what this error code typically means.
Then, provide a highly specific search prompt that the user can use in our AI repair guide generator to fix it (e.g., "[Year Make Model] replace [specific part]").
Do not use markdown formatting. Return plain JSON with the following structure:
{
  "explanation": "Brief explanation here...",
  "suggestedPrompt": "Specific vehicle/appliance and repair action"
}`;

    const geminiBaseUrl = env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com";
    const geminiRes = await fetch(`${geminiBaseUrl}/v1beta/models/gemini-3.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: "application/json"
        }
      })
    });

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.error('Gemini API Error:', errText);
      return new Response(JSON.stringify({ error: 'Failed to decode error code.' }), { status: 500 });
    }

    const geminiData = await geminiRes.json();
    const resultText = geminiData.candidates[0].content.parts[0].text;
    const result = JSON.parse(resultText);

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error in decode-error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500 });
  }
}
