const fs = require('fs');
const path = require('path');
const https = require('https');

// Load environment variables (for Gemini API Key)
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

const outputDir = path.join(__dirname, '..', '..', 'seo-pages');
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

const topicsPath = path.join(__dirname, 'seo-topics.json');
if (!fs.existsSync(topicsPath)) {
    console.error(`Error: topics file not found at ${topicsPath}`);
    process.exit(1);
}
const topics = JSON.parse(fs.readFileSync(topicsPath, 'utf8'));

const progressFile = path.join(outputDir, 'progress.json');

function getProgress() {
    if (fs.existsSync(progressFile)) {
        try {
            return JSON.parse(fs.readFileSync(progressFile, 'utf8'));
        } catch (e) {
            return { completed: [] };
        }
    }
    return { completed: [] };
}

function saveProgress(slug) {
    const progress = getProgress();
    if (!progress.completed.includes(slug)) {
        progress.completed.push(slug);
        fs.writeFileSync(progressFile, JSON.stringify(progress, null, 2));
    }
}

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function callGemini(topic) {
    if (!apiKey) {
        throw new Error('GEMINI_API_KEY is not defined.');
    }

    const prompt = `Write a comprehensive, professional SEO article on: "${topic.title}". Category: ${topic.category}. Include common symptoms, causes, and step-by-step overview. Inform them to use OmniGuide at the end.`;

    return new Promise((resolve, reject) => {
        const data = JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { 
                temperature: 0.6, 
                responseMimeType: "application/json",
                responseSchema: {
                    type: "OBJECT",
                    properties: {
                        metaDescription: { type: "STRING", description: "150-160 character description." },
                        htmlBody: { type: "STRING", description: "Authoritative HTML body containing <h2>, <h3>, <p>, <ul>, <li> tags. Do not include <h1>." }
                    },
                    required: ["metaDescription", "htmlBody"]
                }
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
                    const err = new Error(`API Error Status ${res.statusCode}: ${body}`);
                    err.statusCode = res.statusCode;
                    reject(err);
                } else {
                    try {
                        resolve(JSON.parse(body));
                    } catch (e) {
                        reject(e);
                    }
                }
            });
        });
        req.on('error', reject);
        req.write(data);
        req.end();
    });
}

function generateLocalSeoContent(topic) {
    const metaDescription = `Find out how to troubleshoot and fix ${topic.title}. DIY guide for ${topic.category} including symptoms, causes, and step-by-step instructions.`;
    const htmlBody = `
<p>If you are dealing with a <strong>${topic.title}</strong>, you are not alone. This is a common issue in <strong>${topic.category}</strong>. In this guide, we will cover the symptoms, causes, and a step-by-step overview of how to fix it.</p>
<h2>Common Symptoms</h2>
<ul>
  <li>The system displays the error or displays unexpected behavior.</li>
  <li>Performance is degraded or the appliance/vehicle stops operating correctly.</li>
  <li>Related error codes or indicator lights are active.</li>
</ul>
<h2>Common Causes</h2>
<ul>
  <li>Worn out parts or damaged electrical wiring.</li>
  <li>Sensors reading out of bounds.</li>
  <li>Lack of regular maintenance or alignment.</li>
</ul>
<h2>Step-by-Step Troubleshooting</h2>
<p>To resolve the ${topic.title} issue, follow these steps:</p>
<ol>
  <li><strong>Safety First:</strong> Turn off the power or disconnect the battery before inspecting any components.</li>
  <li><strong>Inspect the components:</strong> Locate the affected area and look for physical signs of wear, cracks, or burnt connections.</li>
  <li><strong>Clean or Replace:</strong> Clean the sensor or component using the appropriate cleaner, or obtain a replacement part if it is damaged.</li>
  <li><strong>Reassemble and Test:</strong> Securely reinstall all parts and run a test cycle to confirm the issue is resolved.</li>
</ol>
<p>For a complete interactive, step-by-step video guide and tools checklist tailored for your exact issue, you can generate one in seconds at OmniGuide.</p>
`;
    return { metaDescription, htmlBody };
}

function generateHtml(topic, seoContent) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${topic.title} | OmniGuide DIY Repair</title>
    <meta name="description" content="${seoContent.metaDescription}">
    <link rel="canonical" href="https://www.omnivibe.app/guides/${topic.slug}">
    <link rel="stylesheet" href="/index.css">
    <script src="https://cdn.jsdelivr.net/npm/lucide@0.344.0/dist/umd/lucide.min.js" defer></script>
</head>
<body class="bg-[#FAF9F6] text-[#1C1917]">
    <header class="nav-header">
        <div class="container nav-container">
            <a href="/" class="wordmark" style="text-decoration: none;">OmniGuide.</a>
            <nav class="nav-controls">
                <a href="/error-decoder" class="btn ghost small">Free Error Decoder</a>
                <a href="/?prompt=${encodeURIComponent(topic.promptStr)}" class="btn primary small">Get Video Guide</a>
            </nav>
        </div>
    </header>

    <main class="container" style="max-width: 800px; padding-top: 4rem; padding-bottom: 4rem;">
        <article class="glass-card" style="padding: 3rem; background: #FFFFFF; border: 1px solid #E7E5E4; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.02);">
            <div class="meta-tags mb-4" style="margin-bottom: 1rem;">
                <span class="tag" style="background: rgba(15, 23, 42, 0.05); color: #0F172A; padding: 0.25rem 0.75rem; border-radius: 9999px; font-size: 0.85rem; font-weight: 500;">${topic.category}</span>
            </div>
            <h1 style="font-family: 'Playfair Display', Georgia, serif; font-size: 2.5rem; margin-bottom: 1.5rem; color: #0F172A; font-style: italic;">${topic.title}</h1>
            
            <div class="seo-content" style="line-height: 1.8; font-size: 1.1rem; color: #57534E;">
                ${seoContent.htmlBody}
            </div>

            <div class="cta-box mt-6" style="margin-top: 2rem; background: #FAF9F6; padding: 2.5rem; border-radius: 12px; border: 1px solid #E7E5E4; text-align: center;">
                <h3 style="font-family: 'Playfair Display', serif; font-size: 1.5rem; margin-bottom: 1rem; color: #0F172A;">Don't want to guess? Let AI build your exact repair course.</h3>
                <p class="muted mb-4" style="color: #57534E; margin-bottom: 1.5rem;">Get the exact step-by-step videos, tools checklist, and parts list required to fix this issue.</p>
                <a href="/?prompt=${encodeURIComponent(topic.promptStr)}" class="btn primary large" style="background: #0F172A; color: white; padding: 0.85rem 1.75rem; border-radius: 6px; text-decoration: none; font-weight: 500;">
                    Generate Instant Video Guide
                </a>
            </div>
        </article>
    </main>
</body>
</html>`;
}

async function run() {
    console.log('Starting Programmatic SEO Generation of 100 pages...');
    const progress = getProgress();
    
    let isKeyBroken = false;

    for (let i = 0; i < topics.length; i++) {
        const topic = topics[i];
        
        // Check if page already exists in outputDir
        const pagePath = path.join(outputDir, `${topic.slug}.html`);
        if (progress.completed.includes(topic.slug) && fs.existsSync(pagePath)) {
            console.log(`[${i+1}/100] Skipping ${topic.slug} (Already generated)`);
            continue;
        }

        console.log(`[${i+1}/100] Processing: ${topic.title}...`);
        
        let seoContent;
        let usedFallback = false;

        if (!isKeyBroken) {
            try {
                const data = await callGemini(topic);
                const rawJson = data.candidates[0].content.parts[0].text.trim();
                let cleaned = rawJson;
                if (cleaned.startsWith('```json')) cleaned = cleaned.substring(7);
                if (cleaned.endsWith('```')) cleaned = cleaned.substring(0, cleaned.length - 3);
                seoContent = JSON.parse(cleaned.trim());
            } catch (e) {
                console.error(`❌ Gemini API call failed for ${topic.slug}: ${e.message}`);
                if (e.statusCode === 403 || e.statusCode === 401 || e.statusCode === 429) {
                    console.log('Detected permanent credential failure or rate limit. Skipping subsequent delays & using fallback.');
                    isKeyBroken = true;
                }
                usedFallback = true;
            }
        } else {
            usedFallback = true;
        }

        if (usedFallback) {
            seoContent = generateLocalSeoContent(topic);
        }

        const fullHtml = generateHtml(topic, seoContent);
        fs.writeFileSync(pagePath, fullHtml);
        saveProgress(topic.slug);
        console.log(`✅ Saved ${topic.slug}.html ${usedFallback ? '(fallback)' : ''}`);

        // Throttle to stay under 15 RPM (delay of ~4.5 seconds) if we actually queried a working API
        if (!isKeyBroken && !usedFallback) {
            console.log('Throttling: waiting 4.5 seconds before next request...');
            await delay(4500);
        }
    }

    // Write updated sitemap.xml in root directory
    const sitemapPath = path.join(__dirname, '..', '..', 'sitemap.xml');
    const sitemapEntries = topics.map(topic => {
        return `  <url>\n    <loc>https://www.omnivibe.app/guides/${topic.slug}</loc>\n    <changefreq>monthly</changefreq>\n    <priority>0.8</priority>\n  </url>`;
    });

    const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://www.omnivibe.app/</loc>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://www.omnivibe.app/error-decoder</loc>
    <changefreq>monthly</changefreq>
    <priority>0.9</priority>
  </url>
${sitemapEntries.join('\n')}
</urlset>`;

    fs.writeFileSync(sitemapPath, sitemapXml);
    console.log('🎉 sitemap.xml updated successfully.');

    // Write root redirects file
    const redirectsPath = path.join(__dirname, '..', '..', '_redirects');
    const redirectsContent = `/guides/:slug /seo-pages/:slug.html 200\n`;
    fs.writeFileSync(redirectsPath, redirectsContent);
    console.log('🎉 _redirects updated successfully.');
}

run().catch(err => {
    console.error('Fatal error in generate-seo-pages-scaled:', err);
    process.exit(1);
});
