const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

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

// CLI arguments
let guideId = 1;
const idIdx = process.argv.indexOf('--id');
if (idIdx !== -1 && idIdx + 1 < process.argv.length) {
    guideId = parseInt(process.argv[idIdx + 1], 10);
}

// Fetch a single guide from D1 database locally
function fetchGuideFromD1(id) {
    try {
        console.log(`Fetching guide with ID ${id} from local D1 database...`);
        const command = `npx wrangler d1 execute omnivibe-db --local --json --command="SELECT id, prompt, content FROM saved_guides WHERE id=${id}"`;
        const output = execSync(command, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
        
        const startIdx = output.indexOf('[');
        if (startIdx === -1) {
            throw new Error(`No JSON array found in Wrangler output: ${output}`);
        }
        const queryResult = JSON.parse(output.substring(startIdx));
        
        if (queryResult && queryResult[0] && queryResult[0].results && queryResult[0].results.length > 0) {
            const row = queryResult[0].results[0];
            return {
                id: row.id,
                prompt: row.prompt,
                guide: JSON.parse(row.content)
            };
        }
        return null;
    } catch (err) {
        console.error('Error querying D1 database via Wrangler:', err.message);
        return null;
    }
}

function slugify(text) {
    return text.toString().toLowerCase().trim()
        .replace(/\s+/g, '-')
        .replace(/[^\w\-]+/g, '')
        .replace(/\-\-+/g, '-');
}

// Format guide into Twitter thread using Gemini
async function generateTwitterThread(guide) {
    if (!apiKey) {
        throw new Error('GEMINI_API_KEY is not defined.');
    }

    const prompt = `You are a social media copywriter.
Format the following DIY repair guide into a high-converting Twitter thread (array of tweets).
Each tweet in the array must be strictly 280 characters or fewer.
Include a clickbait hook tweet, tools/parts list tweet, grouped step-by-step tweets, and a CTA tweet at the end linking to https://www.omnivibe.app/guides/${slugify(guide.title)}.

Guide details:
Title: ${guide.title}
Difficulty: ${guide.difficulty}
Estimated Time: ${guide.estimatedTime}
Tools: ${(guide.tools || []).map(t => t.name).join(', ')}
Parts: ${(guide.parts || []).map(p => p.name).join(', ')}
Steps:
${(guide.steps || []).map((s, i) => `${i+1}. ${s}`).join('\n')}

Return the response in raw JSON format matching this schema:
{
  "tweets": [
    "Tweet 1...",
    "Tweet 2...",
    ...
  ]
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
                    reject(new Error(`API Error ${res.statusCode}: ${body}`));
                } else {
                    try {
                        const parsed = JSON.parse(body);
                        const rawText = parsed.candidates[0].content.parts[0].text;
                        let cleaned = rawText.trim();
                        if (cleaned.startsWith('```json')) cleaned = cleaned.substring(7);
                        if (cleaned.endsWith('```')) cleaned = cleaned.substring(0, cleaned.length - 3);
                        resolve(JSON.parse(cleaned.trim()));
                    } catch (err) {
                        reject(err);
                    }
                }
            });
        });
        req.on('error', reject);
        req.write(data);
        req.end();
    });
}

function generateLocalTwitterThread(guide) {
    const thread = [];
    const siteUrl = `https://www.omnivibe.app/guides/${slugify(guide.title)}`;
    
    // Hook
    let t1 = `🔧 DIY Repair Guide: How to fix your "${guide.title}"!\n\n`;
    t1 += `• Difficulty: ${guide.difficulty || 'Medium'}\n`;
    t1 += `• Time required: ${guide.estimatedTime || '1-2 hours'}\n\n`;
    t1 += `Stop wasting hundreds of dollars on mechanics. Here is the step-by-step thread 🧵👇`;
    thread.push(t1);

    // Gear
    let t2 = `🛠️ Required Gear:\n\n`;
    if (guide.tools && guide.tools.length > 0) {
        const toolList = guide.tools.slice(0, 3).map(t => t.name).join('\n');
        t2 += `Tools Needed:\n${toolList}\n`;
    }
    if (guide.parts && guide.parts.length > 0) {
        const partList = guide.parts.slice(0, 2).map(p => p.name).join('\n');
        t2 += `\nParts Needed:\n${partList}\n`;
    }
    t2 += `\nBe sure to work on a level surface!`;
    thread.push(t2);

    // Steps
    let currentTweet = "";
    for (let i = 0; i < guide.steps.length; i++) {
        const stepNum = i + 1;
        const rawStep = guide.steps[i];
        const cleanStep = rawStep.replace(/^Step\s*\d+:\s*/i, '');
        const stepText = `📍 Step ${stepNum}: ${cleanStep}\n\n`;

        if ((currentTweet + stepText).length > 250) {
            thread.push(currentTweet.trim());
            currentTweet = stepText;
        } else {
            currentTweet += stepText;
        }
    }
    if (currentTweet) {
        thread.push(currentTweet.trim());
    }

    // CTA
    let tN = `🎥 Want the complete video tutorial, cheap parts shopping links, and interactive checklists?\n\n`;
    tN += `Get the full guide here: ${siteUrl} 🚀`;
    thread.push(tN);

    return thread.map(t => t.length > 280 ? t.substring(0, 277) + '...' : t);
}

function generatePinterestHtml(guide) {
    const toolsHtml = (guide.tools || []).slice(0, 4).map(t => `
        <li class="flex items-center gap-2">
          <span class="w-1.5 h-1.5 bg-[#0F172A] rounded-full"></span>
          <span>${t.name}</span>
        </li>`).join('\n');

    const partsHtml = (guide.parts || []).slice(0, 4).map(p => `
        <li class="flex items-center gap-2">
          <span class="w-1.5 h-1.5 bg-[#0F172A] rounded-full"></span>
          <span>${p.name}</span>
        </li>`).join('\n');

    const stepsHtml = (guide.steps || []).slice(0, 5).map((step, idx) => {
        const stepClean = step.replace(/^Step\s*\d+:\s*/i, '');
        const colIdx = stepClean.indexOf(':');
        const title = colIdx !== -1 ? stepClean.substring(0, colIdx).trim() : `Step ${idx + 1}`;
        const desc = colIdx !== -1 ? stepClean.substring(colIdx + 1).trim() : stepClean;
        return `
      <div class="flex gap-4 items-start">
        <div class="bg-[#0F172A] text-white font-bold rounded-lg text-lg flex items-center justify-center min-w-[36px] h-9">
          ${idx + 1}
        </div>
        <div class="text-base text-[#57534E] leading-relaxed pt-1">
          <strong>${title}</strong>: ${desc}
        </div>
      </div>`;
    }).join('\n');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Pinterest Infographic - ${guide.title}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Playfair+Display:ital,wght@0,600;1,600&display=swap" rel="stylesheet">
  <script>
    tailwind.config = {
      theme: {
        extend: {
          fontFamily: {
            sans: ['Inter', 'sans-serif'],
            serif: ['Playfair Display', 'serif'],
          }
        }
      }
    }
  </script>
  <style>
    body {
      background-color: #FAF9F6;
      color: #1C1917;
      font-family: 'Inter', sans-serif;
    }
    h1, h2, h3 {
      font-family: 'Playfair Display', Georgia, serif;
    }
  </style>
</head>
<body class="w-[1000px] h-[1500px] flex flex-col justify-between p-12 overflow-hidden box-border">

  <!-- Branding & Header -->
  <div class="border-b-4 border-[#0F172A] pb-6 mb-6">
    <div class="text-xs uppercase tracking-widest text-[#57534E] font-bold mb-2">OmniGuide DIY Repair Series</div>
    <h1 class="text-5xl font-bold leading-tight italic text-[#0F172A]">${guide.title}</h1>
  </div>

  <!-- Key Specs / Stats -->
  <div class="grid grid-cols-3 gap-6 mb-6">
    <div class="bg-white p-4 rounded-xl border border-[#E7E5E4] shadow-sm flex flex-col justify-center items-center">
      <span class="text-xs uppercase font-bold text-[#57534E]">Difficulty</span>
      <span class="text-lg font-bold mt-1 text-[#0F172A]">${guide.difficulty || 'Medium'}</span>
    </div>
    <div class="bg-white p-4 rounded-xl border border-[#E7E5E4] shadow-sm flex flex-col justify-center items-center">
      <span class="text-xs uppercase font-bold text-[#57534E]">Est. Time</span>
      <span class="text-lg font-bold mt-1 text-[#0F172A]">${guide.estimatedTime || '1 hour'}</span>
    </div>
    <div class="bg-white p-4 rounded-xl border border-[#E7E5E4] shadow-sm flex flex-col justify-center items-center">
      <span class="text-xs uppercase font-bold text-[#57534E]">Est. Savings</span>
      <span class="text-lg font-bold mt-1 text-emerald-700">$150 - $400</span>
    </div>
  </div>

  <!-- Tools & Parts Needed -->
  <div class="grid grid-cols-2 gap-8 mb-8">
    <!-- Tools -->
    <div class="bg-white p-6 rounded-2xl border border-[#E7E5E4] shadow-sm">
      <h3 class="text-xl font-bold mb-3 border-b pb-2 border-[#E7E5E4] flex items-center gap-2 text-[#0F172A]">
        🛠️ Tools Required
      </h3>
      <ul class="space-y-2 text-sm text-[#57534E]">
        ${toolsHtml}
      </ul>
    </div>

    <!-- Parts -->
    <div class="bg-white p-6 rounded-2xl border border-[#E7E5E4] shadow-sm">
      <h3 class="text-xl font-bold mb-3 border-b pb-2 border-[#E7E5E4] flex items-center gap-2 text-[#0F172A]">
        📦 Parts Required
      </h3>
      <ul class="space-y-2 text-sm text-[#57534E]">
        ${partsHtml}
      </ul>
    </div>
  </div>

  <!-- Key Steps Section -->
  <div class="flex-1 bg-white p-8 rounded-3xl border border-[#E7E5E4] shadow-md mb-8">
    <h3 class="text-2xl font-bold mb-6 text-[#0F172A]">📋 Key Repair Steps</h3>
    <div class="grid grid-cols-1 gap-5">
      ${stepsHtml}
    </div>
  </div>

  <!-- Footer Banner / CTA -->
  <div class="bg-[#0F172A] text-white p-6 rounded-2xl flex justify-between items-center">
    <div>
      <h4 class="text-xl font-bold font-serif italic">Need step-by-step video tutorials?</h4>
      <p class="text-xs text-stone-300 mt-1">Get an instant customized AI video guide tailored to your model.</p>
    </div>
    <div class="bg-white text-[#0F172A] px-6 py-3 rounded-lg font-bold text-sm tracking-wide shadow-md">
      omnivibe.app
    </div>
  </div>

</body>
</html>`;
}

async function main() {
    const result = fetchGuideFromD1(guideId);
    if (!result) {
        console.error(`Could not find guide with ID ${guideId} in local database.`);
        process.exit(1);
    }

    console.log(`Successfully fetched guide: "${result.guide.title}"`);

    // 1. Generate Twitter Thread
    let tweets = [];
    try {
        const data = await generateTwitterThread(result.guide);
        tweets = data.tweets || [];
        console.log(`Generated Twitter thread via Gemini.`);
    } catch (e) {
        console.error(`Gemini thread generation failed: ${e.message}`);
        console.log(`Using resilient local thread generator fallback.`);
        tweets = generateLocalTwitterThread(result.guide);
    }

    console.log('\n--- TWITTER THREAD ---');
    tweets.forEach((tweet, i) => {
        console.log(`[Tweet ${i+1}] (Length: ${tweet.length})`);
        console.log(`${tweet}\n`);
        if (tweet.length > 280) {
            console.error(`❌ ERROR: Tweet ${i+1} exceeds 280 characters!`);
        }
    });

    // 2. Generate Pinterest Infographic HTML Layout
    const pinterestHtml = generatePinterestHtml(result.guide);
    const scratchDir = path.join(__dirname, '..', '..', 'scratch');
    if (!fs.existsSync(scratchDir)) {
        fs.mkdirSync(scratchDir, { recursive: true });
    }
    const outputPath = path.join(scratchDir, `pinterest_pin_${result.id}.html`);
    fs.writeFileSync(outputPath, pinterestHtml);
    console.log(`✅ Saved Pinterest Infographic HTML to ${outputPath}`);
}

main().catch(err => {
    console.error('Fatal error running content repurposer:', err);
    process.exit(1);
});
