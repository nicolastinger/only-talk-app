import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, normalize, extname } from 'node:path';

const ROOT = normalize(process.argv[2] || 'apps/pc/dist');
const PORT = Number(process.argv[3] || 8899);

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json',
};

http
  .createServer(async (req, res) => {
    try {
      let pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (pathname.endsWith('/')) pathname += 'index.html';
      const filePath = join(ROOT, pathname);
      if (!filePath.startsWith(ROOT)) {
        res.writeHead(403);
        return res.end('forbidden');
      }
      const data = await readFile(filePath);
      res.writeHead(200, {
        'content-type': MIME[extname(filePath).toLowerCase()] || 'application/octet-stream',
      });
      res.end(data);
    } catch (e) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('not found: ' + req.url);
    }
  })
  .listen(PORT, () => console.log(`serving ${ROOT} at http://localhost:${PORT}`));
