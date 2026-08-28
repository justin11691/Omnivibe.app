const http = require('http');

const server = http.createServer((req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const path = parsedUrl.pathname;

  res.setHeader('Content-Type', 'application/json');

  // Healthcheck endpoint for Playwright
  if (path === '/' || path === '/healthcheck') {
    res.writeHead(200);
    res.end(JSON.stringify({ status: "ok" }));
    return;
  }

  // 1. Mock Gemini Endpoint
  if (path.includes('gemini-3.5-flash:generateContent')) {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        const promptText = payload.contents[0].parts[0].text;

        if (promptText.includes('You are an expert diagnostic technician')) {
          // Decode Error Response
          res.writeHead(200);
          res.end(JSON.stringify({
            candidates: [{
              content: {
                parts: [{
                  text: JSON.stringify({
                    explanation: "This is a mock error explanation from Gemini.",
                    suggestedPrompt: "2015 Honda Civic replace outer tie rod end"
                  })
                }]
              }
            }]
          }));
        } else {
          // Guide Generation Response
          res.writeHead(200);
          res.end(JSON.stringify({
            candidates: [{
              content: {
                parts: [{
                  text: JSON.stringify({
                    title: "Mock Guide: Outer Tie Rod End Replacement",
                    difficulty: "Medium",
                    estimatedTime: "2 hours",
                    youtubeQueries: [
                      "2015 Honda Civic outer tie rod replacement how to",
                      "replace outer tie rod end step by step"
                    ],
                    diagramPrompt: "A cutaway diagram of a car steering outer tie rod end.",
                    tools: [
                      { name: "21mm combination wrench", search_term: "21mm combination wrench", category: "tool" }
                    ],
                    parts: [
                      { name: "Front Outer Tie Rod End", search_term: "2015 Honda Civic front outer tie rod end", category: "auto_part" }
                    ],
                    steps: [
                      "Step 1: Raise the vehicle and secure it on jack stands.",
                      "Step 2: Remove the front wheel.",
                      "Step 3: Loosen the outer tie rod lock nut.",
                      "Step 4: Remove the cotter pin and castle nut from the outer tie rod stud.",
                      "Step 5: Separate outer tie rod from the steering knuckle.",
                      "Step 6: Unthread the old outer tie rod end, counting the turns.",
                      "Step 7: Install the new outer tie rod end with the same number of turns.",
                      "Step 8: Reinstall castle nut, new cotter pin, and tighten lock nut.",
                      "Step 9: Reinstall wheel and lower vehicle. Get a professional wheel alignment."
                    ]
                  })
                }]
              }
            }]
          }));
        }
      } catch (err) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: "Invalid JSON body" }));
      }
    });
    return;
  }

  // 2. Mock YouTube Endpoint
  if (path.includes('/youtube/v3/search')) {
    res.writeHead(200);
    res.end(JSON.stringify({
      items: [
        {
          id: { videoId: "mock_vid_1" },
          snippet: {
            title: "How to Replace Outer Tie Rod End - Mock Video 1",
            channelTitle: "Mock Mechanic Channel",
            thumbnails: { high: { url: "https://i.ytimg.com/vi/mock_vid_1/hqdefault.jpg" } }
          }
        }
      ]
    }));
    return;
  }

  // 3. Mock Stripe Session Verification
  if (path.includes('/v1/checkout/sessions/')) {
    const sessionId = path.split('/').pop();
    res.writeHead(200);
    res.end(JSON.stringify({
      id: sessionId,
      customer_details: { email: "test-user@example.com" },
      customer_email: "test-user@example.com"
    }));
    return;
  }

  // 4. Mock MailChannels Send Endpoint
  if (path.includes('/tx/v1/send')) {
    res.writeHead(200);
    res.end(JSON.stringify({ success: true }));
    return;
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: "Not found" }));
});

const PORT = 8789;
const HOST = '127.0.0.1';
server.listen(PORT, HOST, () => {
  console.log(`Mock server running at http://${HOST}:${PORT}/`);
});
