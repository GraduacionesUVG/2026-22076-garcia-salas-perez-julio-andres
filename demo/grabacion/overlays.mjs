// Genera las capas PNG (portada, cierre, franjas de cada paso y máscara) para editar la grabación de Bruno.
// Uso: node demo/grabacion/overlays.mjs timeline.json SALIDA_DIR
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(here, '../../src/package.json'));
const { chromium } = require('playwright');
const [timelinePath, out] = process.argv.slice(2);
const timeline = JSON.parse(fs.readFileSync(timelinePath, 'utf8'));
const steps = JSON.parse(fs.readFileSync(path.join(here, 'pasos.json'), 'utf8'));
fs.mkdirSync(out, { recursive: true });

const css = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 1920px; height: 1080px; background: transparent; font-family: -apple-system, 'SF Pro Display', 'Helvetica Neue', sans-serif; }
  .serif { font-family: 'Iowan Old Style', Charter, Georgia, serif; }
  .mono { font-family: 'SF Mono', Menlo, monospace; }`;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
async function png(name, body, transparent = true) {
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${body}</body></html>`);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(out, name), omitBackground: transparent });
}

const status = s => (s >= 400 ? '#B42318' : '#0F766E');
const results = timeline.results;

// Franja inferior de cada paso.
for (const [i, s] of steps.entries()) {
  const n = String(i + 1).padStart(2, '0');
  await png(`cap_${n}.png`, `
    <div style="position:absolute;left:120px;right:120px;top:990px;height:70px;display:flex;align-items:center;gap:22px;color:#F3EEE4">
      <span class="mono" style="font-size:24px;color:rgba(243,238,228,.5)">${n} / ${steps.length}</span>
      <span class="serif" style="font-size:36px;letter-spacing:-.4px">${s.titulo}</span>
      <span class="mono" style="font-size:22px;color:rgba(243,238,228,.55);margin-left:6px">${s.metodo} ${s.ruta}</span>
    </div>`);
  const code = results[i].status;
  await png(`st_${n}.png`, `
    <div style="position:absolute;right:120px;top:1002px;height:46px;padding:0 20px;border-radius:12px;display:flex;align-items:center;background:${status(parseInt(code))};color:#fff" class="mono"><span style="font-size:22px;font-weight:700">${code}</span></div>`);
}

// Portada y cierre (fondo opaco).
const bg = 'background:radial-gradient(1200px 800px at 70% 30%,#15231D 0%,#0C1310 70%);';
await png('portada.png', `<div style="position:absolute;inset:0;${bg}color:#F3EEE4">
  <div class="serif" style="position:absolute;left:160px;top:360px;font-size:92px;line-height:1.05;letter-spacing:-2px">Demo del backend<br>de investigación antropológica</div>
  <div style="position:absolute;left:164px;top:620px;font-size:34px;color:rgba(243,238,228,.75)">Julio Andrés García Salas Pérez · 22076</div>
  <div style="position:absolute;left:164px;top:680px;font-size:28px;color:#2DD4BF">Grabación real en Bruno · servidor local · datos sintéticos</div></div>`, false);
const ok = results.length;
await png('cierre.png', `<div style="position:absolute;inset:0;${bg}color:#F3EEE4">
  <div class="serif" style="position:absolute;left:160px;top:380px;font-size:88px;line-height:1.05;letter-spacing:-2px">${ok} peticiones enviadas.<br>${ok} respuestas esperadas.</div>
  <div style="position:absolute;left:164px;top:620px;font-size:32px;color:rgba(243,238,228,.75)">El proyecto temporal se eliminó y la sesión se cerró.</div>
  <div class="mono" style="position:absolute;left:164px;top:690px;font-size:24px;color:rgba(243,238,228,.5)">github.com/Hayser8/2026-22076-garcia-salas-perez-julio-andres</div></div>`, false);

// Máscara de esquinas redondeadas para la grabación (1680×945).
await page.setViewportSize({ width: 1680, height: 945 });
await page.setContent('<html><body style="margin:0;background:#000"><div style="width:1680px;height:945px;border-radius:22px;background:#fff"></div></body></html>');
await page.screenshot({ path: path.join(out, 'mask.png') });
await browser.close();
console.log('capas listas en', out);
