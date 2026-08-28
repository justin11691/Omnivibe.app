const { test: base, expect } = require('@playwright/test');
const { execSync } = require('child_process');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

exports.test = base.extend({
  // Custom fixture to auto-reset D1/SQLite before each test
  dbReset: [async ({}, use) => {
    const fs = require('fs');
    const path = require('path');
    let attempts = 3;
    let success = false;
    while (attempts > 0 && !success) {
      try {
        execSync('npx wrangler d1 execute omnivibe-db --local --file=schema.sql --yes', {
          stdio: 'pipe'
        });
        success = true;
      } catch (err) {
        attempts--;
        if (attempts > 0) {
          await sleep(500);
        } else {
          console.error("Database reset failed after multiple attempts:", err.message);
        }
      }
    }

    try {
      const d1Dir = path.join(__dirname, '..', '.wrangler', 'state', 'v3', 'd1', 'miniflare-D1DatabaseObject');
      const source = path.join(d1Dir, 'e7352547963de7050bd7d94658afc4fe78b61811b7815da12d90be8e863abf4d.sqlite');
      if (fs.existsSync(source)) {
        const targets = [
          '1bba1fb41ea2c5724105292eaca93621e5cdf41225e4f0d09e6e31d067d12f0c.sqlite',
          'b3c790614231b190d459c42284cc6d7969edb57c64dc22f3a6e3b6ee3eb4c9a7.sqlite'
        ];
        for (const target of targets) {
          const dest = path.join(d1Dir, target);
          fs.copyFileSync(source, dest);
          const extFiles = ['.sqlite-wal', '.sqlite-shm'];
          extFiles.forEach(ext => {
            const srcExt = source.replace('.sqlite', ext);
            const destExt = dest.replace('.sqlite', ext);
            if (fs.existsSync(srcExt)) {
              fs.copyFileSync(srcExt, destExt);
            } else if (fs.existsSync(destExt)) {
              try { fs.unlinkSync(destExt); } catch (_) {}
            }
          });
        }
      }
    } catch (copyErr) {
      console.error("Error aligning database files:", copyErr.message);
    }

    await use();
  }, { auto: true }],
});

exports.expect = expect;
