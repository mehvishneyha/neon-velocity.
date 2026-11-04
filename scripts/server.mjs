import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
const root = resolve(process.argv[2] || '.');
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json' };
http.createServer(async (req,res)=>{
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); } catch {res.writeHead(400).end();return;}
  const path = resolve(root, '.'+pathname, pathname.endsWith('/')?'index.html':'');
  if(path!==root&&!path.startsWith(root+sep)){res.writeHead(403).end();return;}
  try {
    const file=await readFile(path);res.writeHead(200,{'Content-Type':mime[extname(path)]||'application/octet-stream','Cache-Control':'no-store'});res.end(file);
  } catch {res.writeHead(404).end('Not found');}
}).listen(Number(process.env.PORT||3000),'0.0.0.0',()=>console.log('Neon Velocity → http://localhost:'+(process.env.PORT||3000)));
