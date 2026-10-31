// Enterprise Property & Leasing Management System Server
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { runSeed } = require('./db/seed');
const { handleApiRequest } = require('./api/routes');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

// Initialize database schema and seed data
runSeed();

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml'
};

const server = http.createServer(async (req, res) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

    // API Routing
    if (url.pathname.startsWith('/api/')) {
        let body = {};
        if (['POST', 'PATCH', 'PUT'].includes(req.method)) {
            try {
                const buffers = [];
                for await (const chunk of req) {
                    buffers.push(chunk);
                }
                const bodyStr = Buffer.concat(buffers).toString();
                if (bodyStr) body = JSON.parse(bodyStr);
            } catch (err) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Invalid JSON payload' }));
                return;
            }
        }

        try {
            const response = handleApiRequest(req.url, req.method, body);
            res.writeHead(response.status, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(response.data));
        } catch (err) {
            console.error('API Error:', err);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message || 'Internal server error' }));
        }
        return;
    }

    // Static Assets
    let filePath = path.join(PUBLIC_DIR, url.pathname === '/' ? 'index.html' : url.pathname);
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        filePath = path.join(PUBLIC_DIR, 'index.html');
    }

    const ext = path.extname(filePath);
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, content) => {
        if (err) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('File Not Found');
            return;
        }
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content);
    });
});

server.listen(PORT, () => {
    console.log(`================================================================`);
    console.log(`  Enterprise Property & Leasing Management System is RUNNING!`);
    console.log(`  Local URL: http://localhost:${PORT}`);
    console.log(`================================================================`);
});
