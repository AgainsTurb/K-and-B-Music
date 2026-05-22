// sidecar/server.js
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const extract = require('extract-zip');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 9191;
const args = process.argv.slice(2);
const PROFILE_DIR = args[0] || path.join(os.homedir(), '.kandb_profile'); 
const BIN_DIR = path.join(PROFILE_DIR, 'browser_bin');

let activeContext = null;
let downloadState = { status: 'idle', progress: 0, error: '' }; 
let isBrowserBusy = false; 
let cachedCookies = null; 
let hasCheckedBackground = false; 

const platform = os.platform();

// Look for all variant stealth binary names
const possibleExeNames = platform === 'win32' 
    ? ['chrome.exe', 'chromium.exe', 'cloakbrowser.exe'] 
    : ['chrome', 'chromium', 'cloakbrowser'];

const DOWNLOAD_URLS = {
    win32: 'https://github.com/CloakHQ/CloakBrowser/releases/download/chromium-v146.0.7680.177.4/cloakbrowser-windows-x64.zip', 
    darwin: 'https://github.com/CloakHQ/CloakBrowser/releases/download/chromium-v146.0.7680.177.4/cloakbrowser-linux-arm64.tar.gz',
    linux: 'https://github.com/CloakHQ/CloakBrowser/releases/download/chromium-v146.0.7680.177.4/cloakbrowser-linux-x64.tar.gz'
};

function findExecutable(dir, targetNames) {
    if (!fs.existsSync(dir)) return null;
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            const found = findExecutable(fullPath, targetNames);
            if (found) return found;
        } else if (targetNames.includes(file.toLowerCase())) {
            return fullPath;
        }
    }
    return null;
}

function downloadBrowser() {
    return new Promise((resolve, reject) => {
        downloadState = { status: 'downloading', progress: 0, error: '' };
        fs.mkdirSync(BIN_DIR, { recursive: true });
        const zipPath = path.join(PROFILE_DIR, 'browser.zip');
        const file = fs.createWriteStream(zipPath);

        const handleError = (err) => {
            downloadState = { status: 'error', progress: 0, error: err.message };
            reject(err);
        };

        const fetchUrl = (url) => {
            https.get(url, (res) => {
                if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    return fetchUrl(res.headers.location);
                }
                if (res.statusCode !== 200) {
                    return handleError(new Error(`Download failed with HTTP ${res.statusCode}`));
                }
                const total = parseInt(res.headers['content-length'] || '0', 10);
                let downloaded = 0;

                res.on('data', (chunk) => {
                    downloaded += chunk.length;
                    if (total > 0) {
                        downloadState.progress = Math.round((downloaded / total) * 100);
                    } else {
                        downloadState.progress = Math.min(downloadState.progress + 1, 99);
                    }
                });

                res.pipe(file);

                file.on('finish', async () => {
                    file.close();
                    downloadState.status = 'extracting';
                    try {
                        await extract(zipPath, { dir: BIN_DIR });
                        fs.unlinkSync(zipPath);
                        downloadState = { status: 'ready', progress: 100, error: '' };
                        resolve();
                    } catch (e) {
                        handleError(e);
                    }
                });
            }).on('error', handleError);
        };
        fetchUrl(DOWNLOAD_URLS[platform]);
    });
}

async function launchBrowser(isVisible) {
    if (activeContext) {
        try { await activeContext.close(); } catch(e) {}
        activeContext = null;
    }

    const lockFile = path.join(PROFILE_DIR, 'SingletonLock');
    const cookieLock = path.join(PROFILE_DIR, 'SingletonCookie');
    try { if (fs.existsSync(lockFile)) fs.unlinkSync(lockFile); } catch(e) {}
    try { if (fs.existsSync(cookieLock)) fs.unlinkSync(cookieLock); } catch(e) {}

    const { launchPersistentContext } = await import('cloakbrowser');
    const browserExePath = findExecutable(BIN_DIR, possibleExeNames);
    
    if (!browserExePath) {
        throw new Error(`Executable not found. Download must finish first.`);
    }

    let browser = await launchPersistentContext({
        userDataDir: PROFILE_DIR, 
        headless: !isVisible,
        executablePath: browserExePath, 
        viewport: { width: 1280, height: 800 },
        humanize: true,
        args: ['--disable-blink-features=AutomationControlled']
    });

    const page = browser.pages()[0] || await browser.newPage();
    
    // PYTHON STYLE: We MUST navigate to the domains to force the cookies out of the SQLite database
    await page.goto('https://www.bilibili.com', { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => null);
    
    if (isVisible) {
        const page2 = await browser.newPage();
        await page2.goto('https://www.chosic.com/music-genre-finder', { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => null);
        await page.bringToFront(); 
    }

    activeContext = browser;
    return browser;
}

app.get('/api/status', async (req, res) => {
    try {
        const browserExePath = findExecutable(BIN_DIR, possibleExeNames);
        
        // 1. Download Management
        if (!browserExePath) {
            if (downloadState.status === 'ready') {
                downloadState = { status: 'idle', progress: 0, error: '' };
            }
            // THE FIX: Remove the downloadBrowser() call from here!
            return res.json({ isReady: false, state: downloadState });
        }

        // 2. Lock Management
        if (isBrowserBusy) {
            return res.json({ isReady: true, isBiliLoggedIn: false, status: 'busy' });
        }

        let cookies = cachedCookies || [];

        // 3. Cookie Extraction
        if (activeContext) {
            try {
                // Get ALL cookies (Python style)
                cookies = await activeContext.cookies();
                cachedCookies = cookies; 
            } catch (err) {
                activeContext = null;
                hasCheckedBackground = false; 
            }
        } 
        
        if (!activeContext && !hasCheckedBackground) {
            isBrowserBusy = true;
            hasCheckedBackground = true; 

            try {
                const tempContext = await launchBrowser(false);
                cookies = await tempContext.cookies(); // Python style grab
                cachedCookies = cookies;
                
                await tempContext.close(); 
                activeContext = null;
            } catch (err) {
                hasCheckedBackground = false; 
            } finally {
                isBrowserBusy = false;
            }
        }

        // 4. Data Formatting
        const biliCookiesArr = cookies.filter(c => c.domain.includes('bilibili.com'));
        const chosicCookiesArr = cookies.filter(c => c.domain.includes('chosic.com'));

        const sessData = biliCookiesArr.find(c => c.name === 'SESSDATA');
        const biliJct = biliCookiesArr.find(c => c.name === 'bili_jct');
        const isBiliLoggedIn = !!(sessData && biliJct);

        // Auto close if logged in
        if (activeContext && isBiliLoggedIn) {
            isBrowserBusy = true;
            await activeContext.close().catch(() => null);
            activeContext = null;
            isBrowserBusy = false;
        }

        const biliCookiesObj = {};
        biliCookiesArr.forEach(c => biliCookiesObj[c.name] = c.value);

        const chosicCookiesObj = {};
        chosicCookiesArr.forEach(c => chosicCookiesObj[c.name] = c.value);

        res.json({
            isReady: true,
            isBiliLoggedIn,
            totalCookiesFound: cookies.length, 
            biliCookies: biliCookiesObj,
            chosicCookies: chosicCookiesObj
        });

    } catch (e) {
        res.status(500).json({ error: e.message, stack: e.stack });
    }
});

app.post('/api/install', (req, res) => {
    if (downloadState.status === 'idle' || downloadState.status === 'error') {
        downloadBrowser().catch(console.error);
    }
    res.json({ status: 'install_started' });
});

app.post('/api/login', async (req, res) => {
    if (isBrowserBusy) return res.status(400).json({ error: "Browser is already launching." });
    
    try {
        isBrowserBusy = true; 
        await launchBrowser(true);
        isBrowserBusy = false; 
        res.json({ status: 'browser_opened' });
    } catch (e) {
        isBrowserBusy = false;
        res.status(500).json({ error: e.message, stack: e.stack });
    }
});

app.post('/api/shutdown', async (req, res) => {
    console.log(`[Sidecar] Shutdown API triggered, cleaning up...`);
    res.json({ status: 'shutting_down' });
    if (activeContext) {
        await activeContext.close().catch(() => {});
    }
    process.exit(0);
});

['SIGINT', 'SIGTERM', 'SIGQUIT'].forEach(signal => {
    process.on(signal, async () => {
        console.log(`[Sidecar] Received ${signal}, shutting down gracefully...`);
        if (activeContext) {
            await activeContext.close().catch(() => {});
        }
        process.exit(0);
    });
});

app.listen(PORT, () => console.error(`Sidecar running on port ${PORT}`));