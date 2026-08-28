const fs = require('fs');
const path = require('path');
const https = require('https');

// Load environment variables (for Gemini API Key)
const dotenvPath = path.join(__dirname, '..', '.dev.vars');
let apiKey = process.env.GEMINI_API_KEY;
if (fs.existsSync(dotenvPath)) {
    const dotenvContent = fs.readFileSync(dotenvPath, 'utf8');
    const match = dotenvContent.match(/GEMINI_API_KEY\s*=\s*(.*)/);
    if (match) apiKey = match[1].replace(/["']/g, "").trim();
}

if (!apiKey) {
    console.error('Error: GEMINI_API_KEY not found in environment or .dev.vars');
    process.exit(1);
}

const guidesDir = path.join(__dirname, '..', 'guides');
if (!fs.existsSync(guidesDir)) {
    fs.mkdirSync(guidesDir, { recursive: true });
}

// Top searched DIY repair issues
const topics = [
    { slug: 'whirlpool-cabrio-ul-error', title: 'How to Fix Whirlpool Cabrio Washer uL Error', category: 'Appliance Repair', promptStr: 'Whirlpool Cabrio Washer uL error code fix' },
    { slug: 'honda-civic-p0171', title: 'Honda Civic P0171 Code: System Too Lean Bank 1', category: 'Auto Repair', promptStr: 'Honda Civic P0171 check engine light fix' },
    { slug: 'lg-fridge-not-cooling', title: 'LG Refrigerator Not Cooling: Quick DIY Fixes', category: 'Appliance Repair', promptStr: 'LG refrigerator not cooling linear compressor' },
    { slug: 'ford-f150-spark-plugs', title: 'How to Replace Spark Plugs on a Ford F-150', category: 'Auto Repair', promptStr: 'Ford F150 replace spark plugs' },
    { slug: 'dryer-not-heating', title: 'Why Is My Clothes Dryer Not Heating?', category: 'Appliance Repair', promptStr: 'Clothes dryer tumbles but not heating heating element replacement' }
];

async function callGemini(prompt) {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.7, responseMimeType: "application/json" }
        });

        const req = https.request(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        }, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                if (res.statusCode >= 400) reject(new Error(body));
                else resolve(JSON.parse(body));
            });
        });
        req.on('error', reject);
        req.write(data);
        req.end();
    });
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
<body>
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
        <article class="glass-card" style="padding: 3rem;">
            <div class="meta-tags mb-4">
                <span class="tag">${topic.category}</span>
            </div>
            <h1 style="font-size: 2.5rem; margin-bottom: 1.5rem;">${topic.title}</h1>
            
            <div class="seo-content" style="line-height: 1.8; font-size: 1.1rem;">
                ${seoContent.htmlBody}
            </div>

            <div class="cta-box mt-6" style="background: rgba(255,255,255,0.05); padding: 2rem; border-radius: var(--radius-md); border: 1px solid var(--accent-color); text-align: center;">
                <h3 style="margin-bottom: 1rem;">Don't want to guess? Let AI build your exact repair course.</h3>
                <p class="muted mb-4">Get the exact step-by-step videos, tools checklist, and parts list required to fix this issue.</p>
                <a href="/?prompt=${encodeURIComponent(topic.promptStr)}" class="btn primary large">
                    <i data-lucide="sparkles"></i> Generate Instant Video Guide
                </a>
            </div>
        </article>
    </main>
    <script>
        document.addEventListener('DOMContentLoaded', () => {
            if (typeof lucide !== 'undefined') lucide.createIcons();
        });
    </script>
</body>
</html>`;
}

async function run() {
    console.log('Generating Programmatic SEO Pages...');
    
    let sitemapEntries = [];

    for (const topic of topics) {
        console.log(`Generating content for: ${topic.title}...`);
        
        const prompt = `Write an SEO-optimized blog article about: "${topic.title}".
It must be extremely helpful and authoritative.
Structure the output as JSON with two fields:
1. "metaDescription": A compelling 150-character meta description.
2. "htmlBody": The HTML content of the article (use <h2>, <p>, <ul>). Do not include the <h1>, I will provide it. Include common symptoms, potential causes, and a brief overview of the fix. Tell them to use OmniGuide to get the full video tutorial and parts list at the end.`;

        try {
            const data = await callGemini(prompt);
            const resultText = data.candidates[0].content.parts[0].text;
            const seoContent = JSON.parse(resultText);
            
            const fullHtml = generateHtml(topic, seoContent);
            const filePath = path.join(guidesDir, `${topic.slug}.html`);
            fs.writeFileSync(filePath, fullHtml);
            
            console.log(`✅ Saved ${topic.slug}.html`);
            
            sitemapEntries.push(`  <url>
    <loc>https://www.omnivibe.app/guides/${topic.slug}</loc>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>`);
            
        } catch (e) {
            console.error(`❌ Failed to generate ${topic.slug}:`, e.message);
        }
    }

    // Update sitemap.xml
    const sitemapPath = path.join(__dirname, '..', 'sitemap.xml');
    let sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
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
    console.log('✅ Updated sitemap.xml');
    console.log('🎉 SEO Generation Complete!');
}

run();
