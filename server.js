/**
 * GovMonitor Diskoperindag Banyuasin - Local Development Server
 * 
 * Server lokal mandiri (Zero-Dependency) untuk pengujian & pengembangan
 * langsung di komputer tanpa perlu deploy ulang ke Google Apps Script.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const PORT = process.env.PORT || 3000;
const ROOT_DIR = __dirname;

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    let pathname = decodeURIComponent(parsedUrl.pathname);

    // Penanganan CORS Preflight
    if (req.method === 'OPTIONS') {
        res.writeHead(204, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization'
        });
        return res.end();
    }

    const GAS_EXEC_URL = 'https://script.google.com/macros/s/AKfycbwfOAV8tI1Ue6EBLehOvE-WgduT7CACvfb6VUXRyJWXBtnfi-QFAGmP7G_uCffhMLLJ/exec';

    // Penanganan API POST (Proxy Langsung ke Google Apps Script)
    if (req.method === 'POST') {
        let bodyData = '';
        req.on('data', chunk => { bodyData += chunk; });
        req.on('end', async () => {
            try {
                console.log(`[Local Server] Meneruskan panggilan POST (${pathname}) ke Google Apps Script...`);
                const gasRes = await fetch(GAS_EXEC_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                    body: bodyData,
                    redirect: 'follow'
                });
                const resText = await gasRes.text();
                res.writeHead(200, {
                    'Content-Type': 'application/json; charset=utf-8',
                    'Access-Control-Allow-Origin': '*'
                });
                res.end(resText);
            } catch (proxyErr) {
                console.error('[Local Server Proxy Error]:', proxyErr.message);
                res.writeHead(500, {
                    'Content-Type': 'application/json; charset=utf-8',
                    'Access-Control-Allow-Origin': '*'
                });
                res.end(JSON.stringify({ success: false, error: 'Proxy gagal menghubungi Google Apps Script: ' + proxyErr.message }));
            }
        });
        return;
    }

    // API Route untuk cuaca & kualitas udara (Environment)
    if (pathname === '/api/environment') {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({
            success: true,
            weather: {
                temperature: 31,
                feels_like: 36,
                humidity: 78,
                code: 1,
                wind: 8,
                minimum: 24,
                maximum: 33,
                rain_probability: 20,
                timezone: 'Asia/Jakarta',
                time: Date.now(),
                fetched_at: Date.now(),
                stale: false
            },
            air: {
                aqi: 52,
                pm25: 14.8,
                time: Date.now(),
                fetched_at: Date.now(),
                stale: false
            },
            timezone: 'Asia/Jakarta'
        }));
    }

    // Route default '/' ke Index.html
    if (pathname === '/' || pathname === '') {
        pathname = '/Index.html';
    }

    const filePath = path.join(ROOT_DIR, pathname);

    // Keamanan path traversal
    if (!filePath.startsWith(ROOT_DIR)) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end('Akses Ditolak');
    }

    // Periksa keberadaan file
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        // Fallback jika memanggil file HTML lain yang tidak ada, arahkan ke Index.html
        if (pathname.endsWith('.html') || !path.extname(pathname)) {
            const fallbackPath = path.join(ROOT_DIR, 'Index.html');
            if (fs.existsSync(fallbackPath)) {
                return serveHtml(fallbackPath, res);
            }
        }
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end(`File tidak ditemukan: ${pathname}`);
    }

    const ext = path.extname(filePath).toLowerCase();

    // Khusus file HTML, evaluasi template Google Apps Script jika ada
    if (ext === '.html') {
        return serveHtml(filePath, res);
    }

    // Static files umum
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
});

function serveHtml(filePath, res) {
    fs.readFile(filePath, 'utf8', (err, html) => {
        if (err) {
            res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
            return res.end('Gagal membaca file HTML: ' + err.message);
        }

        // Hubungkan langsung ke deployment Google Apps Script aktif
        const liveBoot = {
            success: true,
            version: '2026.10.07-live',
            deployment_url: 'https://script.google.com/macros/s/AKfycbwfOAV8tI1Ue6EBLehOvE-WgduT7CACvfb6VUXRyJWXBtnfi-QFAGmP7G_uCffhMLLJ/exec',
            spreadsheet_id: '1SgaDigEUmYCLMfXPysWDxI243RgZlbws6fozC9xXF9M',
            timezone: 'Asia/Jakarta',
            archive_token: ''
        };

        let processedHtml = html.replace(/<(?:div|script) id="gm-boot-data"[^>]*>[\s\S]*?<\/(?:div|script)>/, `<script id="gm-boot-data" type="application/json">${JSON.stringify(liveBoot)}</script>`);
        processedHtml = processedHtml.replace(/<\?!=?\s*bootJson\s*\?>/g, JSON.stringify(liveBoot));

        // Evaluasi include template modular GAS: <?!= include('Filename'); ?>
        processedHtml = processedHtml.replace(/<\?!=\s*include\(['"]([^'"]+)['"]\)\s*;?\s*\?>/g, (match, filename) => {
            const incPath = path.join(ROOT_DIR, filename + '.html');
            if (fs.existsSync(incPath)) {
                return fs.readFileSync(incPath, 'utf8');
            }
            console.warn(`[Local Server] File include tidak ditemukan: ${incPath}`);
            return `<!-- Missing include: ${filename} -->`;
        });

        res.writeHead(200, {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'no-cache, no-store, must-revalidate'
        });
        res.end(processedHtml);
    });
}

function startServer(portToTry) {
    server.listen(portToTry, '0.0.0.0', () => {
        const localUrl = `http://localhost:${portToTry}`;
        console.log('================================================================');
        console.log('  🚀 GOVMONITOR DISKOPERINDAG BANYUASIN - LOCALHOST SERVER');
        console.log('================================================================');
        console.log(`  Alamat Akses : ${localUrl}`);
        console.log(`  Folder Kerja : ${ROOT_DIR}`);
        console.log('');
        console.log('  Akun Default untuk Uji Login:');
        console.log('  - Administrator : username: admin_banyuasin | password: Admin@Banyuasin2026!');
        console.log('  - Staf Uji 1    : username: staf_uji1       | password: Staf@Banyuasin2026!');
        console.log('  - Staf Uji 2    : username: staf_uji2       | password: Staf@Banyuasin2026!');
        console.log('================================================================');
        console.log('  Tekan Ctrl+C di terminal ini untuk menghentikan server.');
        console.log('================================================================');
    });

    server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.log(`Port ${portToTry} sedang digunakan, mencoba port ${portToTry + 1}...`);
            startServer(portToTry + 1);
        } else {
            console.error('Server error:', err);
        }
    });
}

startServer(PORT);
