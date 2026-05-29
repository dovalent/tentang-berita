/**
 * TENTANG Berita — CMS Server
 * Lightweight local CMS for managing Markdown articles.
 * Run with: npm run cms
 */

import { createServer } from 'http';
import { readdir, readFile, writeFile, unlink, mkdir, stat } from 'fs/promises';
import { join, extname, basename } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');
const CONTENT_DIR = join(PROJECT_ROOT, 'src', 'content', 'news');
const IMAGES_DIR = join(PROJECT_ROOT, 'public', 'images');
const ADMIN_HTML = join(__dirname, 'admin.html');
const PORT = 3001;

// ─── Helpers ────────────────────────────────────────────────

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return null;

  const frontmatter = {};
  const lines = match[1].split('\n');
  let currentKey = null;

  for (const line of lines) {
    const kvMatch = line.match(/^(\w[\w_]*)\s*:\s*(.+)$/);
    if (kvMatch) {
      const [, key, rawValue] = kvMatch;
      let value = rawValue.trim();

      // Parse arrays
      if (value.startsWith('[') && value.endsWith(']')) {
        value = value
          .slice(1, -1)
          .split(',')
          .map(v => v.trim().replace(/^["']|["']$/g, ''))
          .filter(Boolean);
      } else {
        // Remove quotes
        value = value.replace(/^["']|["']$/g, '');
      }

      frontmatter[key] = value;
      currentKey = key;
    }
  }

  return { frontmatter, body: match[2].trim() };
}

function toFrontmatterString(data) {
  const lines = ['---'];
  lines.push(`title: "${data.title}"`);
  lines.push(`permalink: "${data.permalink}"`);
  lines.push(`date: "${data.date}"`);
  lines.push(`author: "${data.author}"`);
  lines.push(`category: "${data.category}"`);
  const tagsStr = (data.tags || []).map(t => `"${t.trim()}"`).join(', ');
  lines.push(`tags: [${tagsStr}]`);
  lines.push(`image_url: "${data.image_url}"`);
  if (data.image_caption) {
    lines.push(`image_caption: "${data.image_caption}"`);
  }
  lines.push(`excerpt: "${data.excerpt}"`);
  lines.push('---');
  return lines.join('\n');
}

async function getAllArticles() {
  try {
    const files = await readdir(CONTENT_DIR);
    const articles = [];

    for (const file of files) {
      if (!file.endsWith('.md') || file.startsWith('_')) continue;
      const content = await readFile(join(CONTENT_DIR, file), 'utf-8');
      const parsed = parseFrontmatter(content);
      if (parsed) {
        articles.push({
          filename: file,
          ...parsed.frontmatter,
          body: parsed.body,
        });
      }
    }

    // Sort by date descending
    articles.sort((a, b) => new Date(b.date) - new Date(a.date));
    return articles;
  } catch {
    return [];
  }
}

async function getImages() {
  try {
    const files = await readdir(IMAGES_DIR);
    return files.filter(f => /\.(png|jpg|jpeg|webp|gif|svg)$/i.test(f));
  } catch {
    return [];
  }
}

function sendJSON(res, data, status = 200) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(JSON.stringify(data));
}

function sendError(res, message, status = 400) {
  sendJSON(res, { error: message }, status);
}

async function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function parseMultipart(req) {
  const boundary = req.headers['content-type']?.split('boundary=')[1];
  if (!boundary) return null;

  const body = await readBody(req);
  const parts = [];
  const boundaryBuffer = Buffer.from(`--${boundary}`);

  let start = body.indexOf(boundaryBuffer) + boundaryBuffer.length + 2;

  while (start < body.length) {
    const end = body.indexOf(boundaryBuffer, start);
    if (end === -1) break;

    const part = body.slice(start, end - 2);
    const headerEnd = part.indexOf('\r\n\r\n');
    const headers = part.slice(0, headerEnd).toString();
    const content = part.slice(headerEnd + 4);

    const nameMatch = headers.match(/name="([^"]+)"/);
    const filenameMatch = headers.match(/filename="([^"]+)"/);

    if (nameMatch) {
      parts.push({
        name: nameMatch[1],
        filename: filenameMatch?.[1],
        data: content,
        headers,
      });
    }

    start = end + boundaryBuffer.length + 2;
  }

  return parts;
}

// ─── Request Handler ────────────────────────────────────────

async function handleRequest(req, res) {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;
  const method = req.method;

  // CORS
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    return res.end();
  }

  try {
    // ── Serve Admin UI ──
    if (path === '/' || path === '/admin') {
      const html = await readFile(ADMIN_HTML, 'utf-8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(html);
    }

    // ── Serve images ──
    if (path.startsWith('/images/')) {
      const filename = basename(path);
      const filepath = join(IMAGES_DIR, filename);
      try {
        const data = await readFile(filepath);
        const ext = extname(filename).toLowerCase();
        const mimeTypes = {
          '.png': 'image/png',
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.webp': 'image/webp',
          '.gif': 'image/gif',
          '.svg': 'image/svg+xml',
        };
        res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
        return res.end(data);
      } catch {
        return sendError(res, 'Image not found', 404);
      }
    }

    // ── API: List Articles ──
    if (method === 'GET' && path === '/api/articles') {
      const articles = await getAllArticles();
      return sendJSON(res, articles);
    }

    // ── API: Get Single Article ──
    if (method === 'GET' && path.startsWith('/api/articles/')) {
      const permalink = decodeURIComponent(path.split('/api/articles/')[1]);
      const articles = await getAllArticles();
      const article = articles.find(a => a.permalink === permalink);
      if (!article) return sendError(res, 'Article not found', 404);
      return sendJSON(res, article);
    }

    // ── API: Create Article ──
    if (method === 'POST' && path === '/api/articles') {
      const body = await readBody(req);
      const data = JSON.parse(body.toString());

      if (!data.title || !data.body) {
        return sendError(res, 'Title and body are required');
      }

      data.permalink = data.permalink || slugify(data.title);
      data.date = data.date || new Date().toISOString().split('T')[0];
      data.tags = typeof data.tags === 'string'
        ? data.tags.split(',').map(t => t.trim()).filter(Boolean)
        : (data.tags || []);

      const filename = `${data.permalink}.md`;
      const filepath = join(CONTENT_DIR, filename);

      // Check if exists
      try {
        await stat(filepath);
        return sendError(res, 'Article with this permalink already exists', 409);
      } catch { /* good — file doesn't exist */ }

      const content = `${toFrontmatterString(data)}\n\n${data.body}\n`;
      await writeFile(filepath, content, 'utf-8');

      return sendJSON(res, { success: true, permalink: data.permalink }, 201);
    }

    // ── API: Update Article ──
    if (method === 'PUT' && path.startsWith('/api/articles/')) {
      const oldPermalink = decodeURIComponent(path.split('/api/articles/')[1]);
      const body = await readBody(req);
      const data = JSON.parse(body.toString());

      data.tags = typeof data.tags === 'string'
        ? data.tags.split(',').map(t => t.trim()).filter(Boolean)
        : (data.tags || []);

      const oldFilepath = join(CONTENT_DIR, `${oldPermalink}.md`);
      const newPermalink = data.permalink || oldPermalink;
      const newFilepath = join(CONTENT_DIR, `${newPermalink}.md`);

      // Delete old file if permalink changed
      if (oldPermalink !== newPermalink) {
        try { await unlink(oldFilepath); } catch { /* ok */ }
      }

      const content = `${toFrontmatterString(data)}\n\n${data.body}\n`;
      await writeFile(newFilepath, content, 'utf-8');

      return sendJSON(res, { success: true, permalink: newPermalink });
    }

    // ── API: Delete Article ──
    if (method === 'DELETE' && path.startsWith('/api/articles/')) {
      const permalink = decodeURIComponent(path.split('/api/articles/')[1]);
      const filepath = join(CONTENT_DIR, `${permalink}.md`);

      try {
        await unlink(filepath);
        return sendJSON(res, { success: true });
      } catch {
        return sendError(res, 'Article not found', 404);
      }
    }

    // ── API: Upload Image ──
    if (method === 'POST' && path === '/api/upload') {
      const parts = await parseMultipart(req);
      if (!parts || parts.length === 0) {
        return sendError(res, 'No file uploaded');
      }

      const filePart = parts.find(p => p.filename);
      if (!filePart) return sendError(res, 'No file found in upload');

      await mkdir(IMAGES_DIR, { recursive: true });

      const ext = extname(filePart.filename).toLowerCase();
      const safeName = slugify(basename(filePart.filename, ext)) + ext;
      const filepath = join(IMAGES_DIR, safeName);
      await writeFile(filepath, filePart.data);

      return sendJSON(res, {
        success: true,
        filename: safeName,
        url: `/images/${safeName}`,
      });
    }

    // ── API: List Images ──
    if (method === 'GET' && path === '/api/images') {
      const images = await getImages();
      return sendJSON(res, images);
    }

    // ── API: Publish (git push) ──
    if (method === 'POST' && path === '/api/publish') {
      const { execSync } = await import('child_process');
      try {
        const opts = { cwd: PROJECT_ROOT, encoding: 'utf-8', timeout: 30000 };
        execSync('git add .', opts);
        const msg = `Publish: ${new Date().toLocaleString('id-ID')}`;
        try {
          execSync(`git commit -m "${msg}"`, opts);
        } catch (e) {
          // Nothing to commit
          if (e.stdout?.includes('nothing to commit')) {
            return sendJSON(res, { success: true, message: 'Tidak ada perubahan untuk dipublish.' });
          }
          throw e;
        }
        const pushResult = execSync('git push', { ...opts, timeout: 60000 });
        return sendJSON(res, { success: true, message: 'Berhasil dipublish! Website akan update dalam 30-60 detik.' });
      } catch (err) {
        console.error('Publish error:', err.message);
        return sendError(res, 'Gagal publish: ' + (err.stderr || err.message), 500);
      }
    }

    // ── 404 ──
    sendError(res, 'Not found', 404);

  } catch (err) {
    console.error('Server error:', err);
    sendError(res, 'Internal server error', 500);
  }
}

// ─── Start Server ───────────────────────────────────────────

const server = createServer(handleRequest);
server.listen(PORT, () => {
  console.log('');
  console.log('  ┌──────────────────────────────────────────┐');
  console.log('  │                                          │');
  console.log('  │   📰 TENTANG Berita — CMS Dashboard      │');
  console.log('  │                                          │');
  console.log(`  │   🌐 http://localhost:${PORT}               │`);
  console.log('  │                                          │');
  console.log('  │   Buka URL di atas di browser kamu.      │');
  console.log('  │   Tekan Ctrl+C untuk berhenti.           │');
  console.log('  │                                          │');
  console.log('  └──────────────────────────────────────────┘');
  console.log('');
});
