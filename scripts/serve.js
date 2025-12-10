import { createServer } from 'http';
import { readFile, stat } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PUBLIC_DIR = path.resolve(__dirname, '..', 'public');
const PORT = process.env.PORT || 5000;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webm': 'video/webm'
};

function isPathInside(child, parent) {
  const relative = path.relative(parent, child);
  return !relative.startsWith('..') && !path.isAbsolute(relative);
}

async function sendFile(res, filePath) {
  try {
    const data = await readFile(filePath);
    const ext = path.extname(filePath);
    const mime = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'no-store' });
    res.end(data);
  } catch (error) {
    if (error.code === 'ENOENT') {
      res.writeHead(404);
      res.end('Not found');
    } else {
      console.error('Server error', error);
      res.writeHead(500);
      res.end('Server error');
    }
  }
}

function resolveRequestPath(urlPath) {
  try {
    const decoded = decodeURIComponent(urlPath.split('?')[0]);
    const safePath = path.normalize(decoded);
    const requested = path.join(PUBLIC_DIR, safePath);

    if (!isPathInside(requested, PUBLIC_DIR)) {
      return { status: 403 };
    }

    return { status: 200, path: requested };
  } catch {
    return { status: 400 };
  }
}

const server = createServer(async (req, res) => {
  if (!req.url) {
    res.writeHead(400);
    res.end('Bad request');
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405);
    res.end('Method not allowed');
    return;
  }

  const resolved = resolveRequestPath(req.url);
  if (resolved.status !== 200 || !resolved.path) {
    res.writeHead(resolved.status);
    res.end('Access denied');
    return;
  }

  let filePath = resolved.path;

  try {
    const fileStat = await stat(filePath);
    if (fileStat.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }
  } catch (error) {
    if (error.code === 'ENOENT') {
      // Fallback to index.html for SPA routes
      filePath = path.join(PUBLIC_DIR, 'index.html');
    } else {
      res.writeHead(500);
      res.end('Server error');
      return;
    }
  }

  await sendFile(res, filePath);
});

server.listen(PORT, () => {
  console.log(`Dev server running at http://localhost:${PORT}`);
  console.log(`Serving static files from ${PUBLIC_DIR}`);
});
