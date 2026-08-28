const fs = require('fs');
const path = require('path');
const https = require('https');
const readline = require('readline');

// Load environment variables (for Gemini, Reddit APIs)
function loadEnv() {
    const dotenvPath = path.join(__dirname, '..', '..', '.dev.vars');
    let env = { ...process.env };
    if (fs.existsSync(dotenvPath)) {
        const content = fs.readFileSync(dotenvPath, 'utf8');
        content.split('\n').forEach(line => {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) return;
            const match = trimmed.match(/^\s*([\w.-]+)\s*=\s*(.*)?$/);
            if (match) {
                const key = match[1];
                let val = match[2] || '';
                if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
                if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);
                env[key] = val.trim();
            }
        });
    }
    return env;
}

const env = loadEnv();
const apiKey = env.GEMINI_API_KEY;

// CLI arguments parsing
const isDryRun = process.argv.includes('--dry-run');
const isJsonLog = process.argv.includes('--json');
const autoApprove = process.argv.includes('--yes') || process.argv.includes('--auto-approve') || !process.stdin.isTTY;

let mode = 'mock';
const modeIdx = process.argv.indexOf('--mode');
if (modeIdx !== -1 && modeIdx + 1 < process.argv.length) {
    mode = process.argv[modeIdx + 1].toLowerCase();
}

function logAction(action, details) {
    if (isJsonLog) {
        console.log(JSON.stringify({ timestamp: new Date().toISOString(), action, details }));
    } else {
        console.log(`[${action}] ${typeof details === 'string' ? details : JSON.stringify(details, null, 2)}`);
    }
}

// Ask CLI questions
function askQuestion(query) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    return new Promise(resolve => rl.question(query, ans => {
        rl.close();
        resolve(ans.trim());
    }));
}

// Call Gemini for answering a forum post
async function generateAIAnswer(title, body) {
    if (!apiKey) {
        throw new Error('GEMINI_API_KEY is not defined. Cannot generate AI answers.');
    }

    const prompt = `You are a helpful DIY repair technician assistant.
Review the following forum question:
Title: "${title}"
Detail: "${body}"

Provide a highly informative, accurate, and structured reply to help the user troubleshoot the issue.
At the very end of your response, mention that they can get a complete interactive, step-by-step video guide and tools checklist tailored for their exact issue using OmniGuide (https://www.omnivibe.app). Place this call-to-action naturally.

Return the response in raw JSON format matching this schema:
{
  "commentText": "Your troubleshooting reply..."
}`;

    return new Promise((resolve, reject) => {
        const data = JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: {
                temperature: 0.7,
                responseMimeType: "application/json"
            }
        });

        const req = https.request(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        }, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                if (res.statusCode >= 400) {
                    reject(new Error(`Gemini API Error Status ${res.statusCode}: ${body}`));
                } else {
                    try {
                        const parsed = JSON.parse(body);
                        const rawText = parsed.candidates[0].content.parts[0].text;
                        const cleaned = parseGeminiJson(rawText);
                        resolve(cleaned);
                    } catch (err) {
                        reject(new Error(`Failed to parse Gemini response: ${body}. Error: ${err.message}`));
                    }
                }
            });
        });

        req.on('error', reject);
        req.write(data);
        req.end();
    });
}

function parseGeminiJson(rawText) {
    let cleaned = rawText.trim();
    if (cleaned.startsWith('```json')) {
        cleaned = cleaned.substring(7);
    } else if (cleaned.startsWith('```')) {
        cleaned = cleaned.substring(3);
    }
    if (cleaned.endsWith('```')) {
        cleaned = cleaned.substring(0, cleaned.length - 3);
    }
    return JSON.parse(cleaned.trim());
}

// Reddit Live API functions
async function getRedditToken(env) {
    if (!env.REDDIT_CLIENT_ID || !env.REDDIT_CLIENT_SECRET || !env.REDDIT_USERNAME || !env.REDDIT_PASSWORD) {
        throw new Error('Missing REDDIT_* environment variables required for live Reddit calls.');
    }
    return new Promise((resolve, reject) => {
        const auth = Buffer.from(`${env.REDDIT_CLIENT_ID}:${env.REDDIT_CLIENT_SECRET}`).toString('base64');
        const data = new URLSearchParams({
            grant_type: 'password',
            username: env.REDDIT_USERNAME,
            password: env.REDDIT_PASSWORD
        }).toString();

        const req = https.request('https://www.reddit.com/api/v1/access_token', {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${auth}`,
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': env.REDDIT_USER_AGENT || 'Node:OmniGuideBot:v1.0.0'
            }
        }, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                if (res.statusCode >= 400) {
                    reject(new Error(`Reddit Token Auth failed (${res.statusCode}): ${body}`));
                } else {
                    resolve(JSON.parse(body).access_token);
                }
            });
        });
        req.on('error', reject);
        req.write(data);
        req.end();
    });
}

async function fetchRedditPostsLive(token, query) {
    return new Promise((resolve, reject) => {
        const req = https.request(`https://oauth.reddit.com/r/fixit+DIY+appliances/search.json?q=${encodeURIComponent(query)}&sort=new&limit=5`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'User-Agent': env.REDDIT_USER_AGENT || 'Node:OmniGuideBot:v1.0.0'
            }
        }, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                if (res.statusCode >= 400) {
                    reject(new Error(`Reddit Search failed (${res.statusCode}): ${body}`));
                } else {
                    try {
                        const data = JSON.parse(body);
                        const children = data.data?.children || [];
                        const results = children.map(child => ({
                            id: child.data.name,
                            platform: 'reddit',
                            title: child.data.title,
                            body: child.data.selftext,
                            author: child.data.author,
                            url: `https://old.reddit.com${child.data.permalink}`
                        }));
                        resolve(results);
                    } catch (err) {
                        reject(err);
                    }
                }
            });
        });
        req.on('error', reject);
        req.end();
    });
}

async function postRedditCommentLive(token, parentId, text) {
    return new Promise((resolve, reject) => {
        const data = new URLSearchParams({
            thing_id: parentId,
            text: text
        }).toString();

        const req = https.request('https://oauth.reddit.com/api/comment', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': env.REDDIT_USER_AGENT || 'Node:OmniGuideBot:v1.0.0'
            }
        }, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                if (res.statusCode >= 400) {
                    reject(new Error(`Reddit Comment post failed (${res.statusCode}): ${body}`));
                } else {
                    resolve(JSON.parse(body));
                }
            });
        });
        req.on('error', reject);
        req.write(data);
        req.end();
    });
}

async function main() {
    logAction('BOT_START', { mode, isDryRun, autoApprove });

    if (mode === 'live' && !apiKey) {
        console.error('Error: GEMINI_API_KEY must be set in live mode.');
        process.exit(1);
    }

    let posts = [];

    // Load Posts
    if (mode === 'mock') {
        const fixturePath = path.join(__dirname, 'fixtures', 'mock-reddit-quora.json');
        if (!fs.existsSync(fixturePath)) {
            console.error(`Mock fixture not found at ${fixturePath}`);
            process.exit(1);
        }
        posts = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
    } else if (mode === 'live') {
        try {
            logAction('LIVE_FETCH_START', 'Fetching from Reddit...');
            const redditToken = await getRedditToken(env);
            const redditPosts = await fetchRedditPostsLive(redditToken, 'repair');
            posts.push(...redditPosts);

            logAction('LIVE_FETCH_INFO', 'Quora live fetching is skipped (no custom search API keys).');
        } catch (err) {
            console.error('Failed to fetch live posts:', err.message);
            process.exit(1);
        }
    } else {
        console.error(`Unknown mode: ${mode}`);
        process.exit(1);
    }

    logAction('POSTS_LOADED', { count: posts.length });

    // Process posts
    for (const post of posts) {
        logAction('PROCESSING_POST', { id: post.id, platform: post.platform, title: post.title });
        
        let commentText = "";
        let approved = false;

function generateLocalTroubleshootingReply(title, body) {
    let troubleshooting = "";
    const combined = `${title} ${body}`.toLowerCase();
    
    if (combined.includes('ul') || combined.includes('cabrio')) {
        troubleshooting = "This issue is commonly caused by an unbalanced load (uL). Check if the washer is level, inspect the suspension rods for wear, and make sure the tub spins freely without friction.";
    } else if (combined.includes('p0171') || combined.includes('civic')) {
        troubleshooting = "The P0171 error code indicates a lean fuel mixture. Start by inspecting the vacuum hoses for leaks, cleaning the Mass Airflow (MAF) sensor with contact cleaner, and checking the PCV valve and intake manifold gasket.";
    } else if (combined.includes('spark') || combined.includes('f-150') || combined.includes('f150')) {
        troubleshooting = "Replacing spark plugs on the Ford F-150 (especially Ecoboost models) requires a 5/8-inch spark plug socket, extension bar, and gapping tool. Ensure you gap them precisely to 0.030 in (0.76 mm) to prevent misfires under load.";
    } else {
        troubleshooting = "For DIY troubleshooting: first, check for visible leaks or loose connections, clean any sensors related to the symptom, and inspect key mechanical linkages or fuses.";
    }
    
    return `${troubleshooting} For a complete interactive, step-by-step video guide and tools checklist tailored for your exact issue, you can generate one in seconds at OmniGuide (https://www.omnivibe.app).`;
}

        while (!approved) {
            try {
                const aiResponse = await generateAIAnswer(post.title, post.body);
                commentText = aiResponse.commentText;
                logAction('RESPONSE_GENERATED', { reply: commentText });
            } catch (err) {
                console.error(`Failed to generate AI response for ${post.id}:`, err.message);
                logAction('RESILIENCE_FALLBACK', { details: 'Using local heuristic generator due to API error.' });
                commentText = generateLocalTroubleshootingReply(post.title, post.body);
                logAction('RESPONSE_GENERATED_FALLBACK', { reply: commentText });
            }

            if (autoApprove) {
                logAction('AUTO_APPROVED', { id: post.id });
                approved = true;
                break;
            }

            // CLI Menu Loop for approval
            console.log(`\n======================================================`);
            console.log(`[SAFETY APPROVAL QUEUE]`);
            console.log(`Platform: ${post.platform.toUpperCase()}`);
            console.log(`Post ID:  ${post.id}`);
            console.log(`Title:    ${post.title}`);
            console.log(`URL:      ${post.url}`);
            console.log(`------------------------------------------------------`);
            console.log(`Proposed Reply:\n\n${commentText}\n`);
            console.log(`======================================================`);
            console.log(`Options:`);
            console.log(`[1] Approve and Post`);
            console.log(`[2] Skip this post`);
            console.log(`[3] Regenerate response`);
            console.log(`[4] Exit script`);

            const selection = await askQuestion(`Select option (1-4): `);
            if (selection === '1') {
                approved = true;
            } else if (selection === '2') {
                logAction('SKIP_POST', { id: post.id });
                break;
            } else if (selection === '3') {
                logAction('REGENERATING_RESPONSE', { id: post.id });
            } else if (selection === '4') {
                logAction('BOT_EXIT', 'User terminated execution');
                process.exit(0);
            } else {
                console.log('Invalid option. Please enter a number between 1 and 4.');
            }
        }

        if (approved && commentText) {
            if (isDryRun) {
                logAction('SIMULATED_POST', { platform: post.platform, postId: post.id, commentText });
            } else {
                if (post.platform === 'reddit') {
                    if (mode === 'mock') {
                        logAction('MOCK_POST_SUCCESS', { platform: 'reddit', postId: post.id });
                    } else {
                        try {
                            const token = await getRedditToken(env);
                            await postRedditCommentLive(token, post.id, commentText);
                            logAction('POST_SUCCESS', { platform: 'reddit', postId: post.id });
                        } catch (err) {
                            console.error(`Failed to post comment to Reddit:`, err.message);
                        }
                    }
                } else if (post.platform === 'quora') {
                    if (mode === 'mock') {
                        logAction('MOCK_POST_SUCCESS', { platform: 'quora', postId: post.id });
                    } else {
                        // In live mode without Playwright session cookies, we log simulated success
                        logAction('QUORA_LIVE_SIMULATED', { postId: post.id, details: 'Quora live post requires Playwright browser automation.' });
                    }
                }
            }
        }
    }

    logAction('BOT_COMPLETE', 'All posts processed.');
}

main().catch(err => {
    console.error('Fatal error running bot:', err);
    process.exit(1);
});
