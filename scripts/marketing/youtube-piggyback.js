const fs = require('fs');
const path = require('path');
const https = require('https');

// Load environment variables
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
const youtubeApiKey = env.YOUTUBE_API_KEY;

// CLI arguments
const isDryRun = process.argv.includes('--dry-run');
const isJsonLog = process.argv.includes('--json');

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

// Check if description or title has parts list
function hasPartsList(description, title) {
    const combined = `${title} ${description}`.toLowerCase();
    const markers = [
        'parts list',
        'parts needed',
        'parts used',
        'components list',
        'part numbers',
        'replacement parts',
        'list of parts',
        'parts link'
    ];
    return markers.some(marker => combined.includes(marker));
}

// Fetch YouTube OAuth Token (used if YOUTUBE_CLIENT_ID / REFRESH_TOKEN is available)
async function refreshYouTubeAccessToken(env) {
    if (!env.YOUTUBE_CLIENT_ID || !env.YOUTUBE_CLIENT_SECRET || !env.YOUTUBE_REFRESH_TOKEN) {
        return null;
    }
    return new Promise((resolve, reject) => {
        const postData = new URLSearchParams({
            client_id: env.YOUTUBE_CLIENT_ID,
            client_secret: env.YOUTUBE_CLIENT_SECRET,
            refresh_token: env.YOUTUBE_REFRESH_TOKEN,
            grant_type: 'refresh_token'
        }).toString();

        const req = https.request('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        }, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                if (res.statusCode >= 400) reject(new Error(`Failed to refresh YT token: ${body}`));
                else resolve(JSON.parse(body).access_token);
            });
        });
        req.on('error', reject);
        req.write(postData);
        req.end();
    });
}

// Fetch YouTube search results (Live)
async function findDIYVideosLive(query, key) {
    return new Promise((resolve, reject) => {
        const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=video&maxResults=5&key=${key}`;
        const req = https.request(url, { method: 'GET' }, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                if (res.statusCode >= 400) reject(new Error(`Search fail: ${body}`));
                else resolve(JSON.parse(body).items || []);
            });
        });
        req.on('error', reject);
        req.end();
    });
}

// Fetch YouTube video statistics (Live)
async function getVideoDetailsLive(videoIds, key) {
    return new Promise((resolve, reject) => {
        const url = `https://www.googleapis.com/youtube/v3/videos?part=statistics,snippet&id=${videoIds.join(',')}&key=${key}`;
        const req = https.request(url, { method: 'GET' }, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                if (res.statusCode >= 400) reject(new Error(`Get details fail: ${body}`));
                else resolve(JSON.parse(body).items || []);
            });
        });
        req.on('error', reject);
        req.end();
    });
}

// Fetch YouTube comments (Live)
async function getRecentVideoCommentsLive(videoId, key) {
    return new Promise((resolve, reject) => {
        const url = `https://www.googleapis.com/youtube/v3/commentThreads?part=snippet&videoId=${videoId}&maxResults=5&key=${key}`;
        const req = https.request(url, { method: 'GET' }, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                if (res.statusCode >= 400) {
                    // It's common for some videos to have comments disabled; we log and return empty rather than crash
                    logAction('COMMENTS_DISABLED', { videoId });
                    resolve([]);
                } else {
                    try {
                        const data = JSON.parse(body);
                        const items = data.items || [];
                        const comments = items.map(item => ({
                            commentId: item.snippet.topLevelComment.id,
                            author: item.snippet.topLevelComment.snippet.authorDisplayName,
                            text: item.snippet.topLevelComment.snippet.textDisplay
                        }));
                        resolve(comments);
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

// Post YouTube comment reply (Live)
async function postYouTubeCommentLive(accessToken, parentCommentId, text) {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify({
            snippet: {
                parentId: parentCommentId,
                textOriginal: text
            }
        });

        const req = https.request('https://www.googleapis.com/youtube/v3/comments?part=snippet', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            }
        }, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                if (res.statusCode >= 400) reject(new Error(`YouTube reply post failed: ${body}`));
                else resolve(JSON.parse(body));
            });
        });
        req.on('error', reject);
        req.write(data);
        req.end();
    });
}

// Generate YouTube reply using Gemini
async function generateYouTubeReply(videoTitle, userComment) {
    if (!apiKey) {
        throw new Error('GEMINI_API_KEY is not defined. Cannot generate AI replies.');
    }

    const prompt = `You are a helpful YouTube assistant for a DIY repair brand.
A user left a comment on a video titled "${videoTitle}".
User comment: "${userComment}"

Answer their question in a friendly, conversational tone (1-2 sentences).
Then, suggest that if they want a fully interactive, customized guide with all tools, parts lists, and specific instruction steps for their make/model, they can generate one in seconds at OmniGuide (https://www.omnivibe.app).

Return the response in raw JSON format matching this schema:
{
  "replyText": "Your troubleshooting reply..."
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

async function main() {
    logAction('YT_BOT_START', { mode, isDryRun });

    if (mode === 'live' && !apiKey) {
        console.error('Error: GEMINI_API_KEY must be set in live mode.');
        process.exit(1);
    }

    let rawVideos = [];

    // Load Videos
    if (mode === 'mock') {
        const fixturePath = path.join(__dirname, 'fixtures', 'mock-youtube.json');
        if (!fs.existsSync(fixturePath)) {
            console.error(`Mock fixture not found at ${fixturePath}`);
            process.exit(1);
        }
        rawVideos = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
    } else if (mode === 'live') {
        if (!youtubeApiKey) {
            console.error('Error: YOUTUBE_API_KEY must be set in live mode.');
            process.exit(1);
        }
        try {
            logAction('LIVE_SEARCH_START', 'Searching YouTube for videos...');
            const searchItems = await findDIYVideosLive('how to fix car appliance', youtubeApiKey);
            const videoIds = searchItems.map(item => item.id.videoId).filter(Boolean);

            if (videoIds.length > 0) {
                const detailItems = await getVideoDetailsLive(videoIds, youtubeApiKey);
                rawVideos = detailItems.map(item => ({
                    videoId: item.id,
                    videoTitle: item.snippet.title,
                    views: parseInt(item.statistics.viewCount || '0', 10),
                    description: item.snippet.description,
                    // Comments fetched later per video
                    liveComments: true
                }));
            }
        } catch (err) {
            console.error('Failed to query live YouTube API:', err.message);
            process.exit(1);
        }
    } else {
        console.error(`Unknown mode: ${mode}`);
        process.exit(1);
    }

    logAction('VIDEOS_LOADED', { totalCount: rawVideos.length });

    // Filter videos: views > 5000 and lacking a parts list
    const filteredVideos = rawVideos.filter(video => {
        const viewCount = video.views;
        const matchesViews = viewCount > 5000;
        const hasParts = hasPartsList(video.description, video.videoTitle);
        const matchesNoPartsList = !hasParts;

        logAction('FILTER_CHECK', {
            videoId: video.videoId,
            views: viewCount,
            hasPartsList: hasParts,
            passed: matchesViews && matchesNoPartsList
        });

        return matchesViews && matchesNoPartsList;
    });

    logAction('VIDEOS_FILTERED', { count: filteredVideos.length });

    // Refresh OAuth Token if live and NOT dry-run
    let accessToken = null;
    if (mode === 'live' && !isDryRun) {
        accessToken = await refreshYouTubeAccessToken(env);
        if (!accessToken) {
            logAction('OAUTH_MISSING', 'YOUTUBE OAuth config missing. Comments will be processed but live replies cannot be posted.');
        }
    }

    // Process comments for each filtered video
    for (const video of filteredVideos) {
        logAction('PROCESSING_VIDEO', { videoId: video.videoId, title: video.videoTitle });
        
        let comments = [];
        if (mode === 'mock') {
            comments = video.comments || [];
        } else if (mode === 'live') {
            try {
                comments = await getRecentVideoCommentsLive(video.videoId, youtubeApiKey);
            } catch (err) {
                console.error(`Failed to fetch comments for video ${video.videoId}:`, err.message);
                continue;
            }
        }

        logAction('COMMENTS_LOADED', { videoId: video.videoId, count: comments.length });

function generateLocalYouTubeReply(videoTitle, userComment) {
    let answer = "For this issue, double check the connection and verify that you have the correct tool size.";
    const combined = `${videoTitle} ${userComment}`.toLowerCase();
    
    if (combined.includes('spark') || combined.includes('socket')) {
        answer = "For the F-150 spark plugs, you generally need a 5/8 inch spark plug socket with a rubber insert to hold the plug.";
    } else if (combined.includes('harness') || combined.includes('2018')) {
        answer = "Yes, the wiring harness layout differs slightly across model years, so check your specific engine schematic.";
    }
    
    return `${answer} If you want a fully interactive, customized guide with all tools, parts lists, and specific instruction steps for your model, you can generate one in seconds at OmniGuide (https://www.omnivibe.app).`;
}

        for (const comment of comments) {
            logAction('PROCESSING_YT_COMMENT', { commentId: comment.commentId, author: comment.author });
            
            try {
                let replyText = "";
                try {
                    const aiResponse = await generateYouTubeReply(video.videoTitle, comment.text);
                    replyText = aiResponse.replyText;
                    logAction('YT_RESPONSE_GENERATED', { reply: replyText });
                } catch (err) {
                    console.error(`Error generating AI reply for comment ${comment.commentId}:`, err.message);
                    logAction('RESILIENCE_FALLBACK', { details: 'Using local heuristic generator due to API error.' });
                    replyText = generateLocalYouTubeReply(video.videoTitle, comment.text);
                    logAction('YT_RESPONSE_GENERATED_FALLBACK', { reply: replyText });
                }

                if (isDryRun) {
                    logAction('SIMULATED_YT_POST', { parentCommentId: comment.commentId, replyText });
                } else {
                    if (mode === 'mock') {
                        logAction('MOCK_YT_POST_SUCCESS', { parentCommentId: comment.commentId });
                    } else {
                        if (accessToken) {
                            await postYouTubeCommentLive(accessToken, comment.commentId, replyText);
                            logAction('POST_SUCCESS', { platform: 'youtube', parentCommentId: comment.commentId });
                        } else {
                            logAction('POST_SKIPPED', { parentCommentId: comment.commentId, details: 'OAuth Token missing, posting skipped.' });
                        }
                    }
                }
            } catch (err) {
                console.error(`Error processing comment ${comment.commentId}:`, err.message);
            }
        }
    }

    logAction('YT_BOT_COMPLETE', 'All comments processed.');
}

main().catch(err => {
    console.error('Fatal error running YouTube bot:', err);
    process.exit(1);
});
