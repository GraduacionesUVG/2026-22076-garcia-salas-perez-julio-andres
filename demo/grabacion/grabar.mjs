// Uso: node demo/grabacion/grabar.mjs SALIDA_DIR
// Graba Bruno (CDP screencast) mientras envía las 16 peticiones reales de la colección.
import { connect } from './cdp.mjs';
import fs from 'node:fs';
import path from 'node:path';

const OUT = process.argv[2];
fs.mkdirSync(path.join(OUT, 'frames'), { recursive: true });
const { page, cdp } = await connect();
await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 810, deviceScaleFactor: 2, mobile: false });

// Cursor visible dentro de la ventana de Bruno.
await page.evaluate(() => {
  document.getElementById('rec-cursor')?.remove();
  const c = document.createElement('div');
  c.id = 'rec-cursor';
  c.style.cssText = 'position:fixed;left:0;top:0;width:26px;height:26px;z-index:2147483647;pointer-events:none;transform:translate(700px,420px);';
  c.innerHTML = '<div id="rec-ripple" style="position:absolute;left:-18px;top:-18px;width:36px;height:36px;border-radius:50%;background:rgba(217,119,6,.35);transform:scale(0);opacity:0"></div><svg width="26" height="26" viewBox="0 0 24 24"><path d="M4 2 L4 19 L8.6 14.8 L11.6 21.6 L14.4 20.4 L11.4 13.7 L17.6 13.4 Z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
  document.body.appendChild(c);
  window.__cur = { x: 700, y: 420 };
  window.__move = (x, y, ms) => new Promise(res => {
    const c = document.getElementById('rec-cursor');
    const { x: x0, y: y0 } = window.__cur; const t0 = performance.now();
    const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    const f = now => {
      const p = Math.min(1, (now - t0) / ms), e = ease(p);
      const cx = x0 + (x - x0) * e, cy = y0 + (y - y0) * e;
      c.style.transform = `translate(${cx}px,${cy}px)`; window.__cur = { x: cx, y: cy };
      p < 1 ? requestAnimationFrame(f) : res();
    };
    requestAnimationFrame(f);
  });
  window.__ripple = () => { const r = document.getElementById('rec-ripple'); r.animate([{ transform: 'scale(.2)', opacity: 1 }, { transform: 'scale(1.4)', opacity: 0 }], { duration: 450, easing: 'ease-out' }); };
});

const frames = [];
cdp.on('Page.screencastFrame', async ({ data, metadata, sessionId }) => {
  const i = frames.length;
  const file = `f${String(i).padStart(6, '0')}.jpg`;
  fs.writeFileSync(path.join(OUT, 'frames', file), Buffer.from(data, 'base64'));
  frames.push({ file, t: metadata.timestamp });
  cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
});

const marks = [];
const now = () => Date.now() / 1000;
const mark = (type, extra = {}) => marks.push({ type, t: now(), ...extra });
const wait = ms => page.waitForTimeout(ms);

async function moveClick(locator, ms = 650) {
  await locator.scrollIntoViewIfNeeded().catch(() => {});
  const b = await locator.boundingBox();
  if (!b) throw new Error('Elemento no visible');
  const x = b.x + Math.min(b.width / 2, 60), y = b.y + b.height / 2;
  await page.evaluate(([x, y, ms]) => window.__move(x, y, ms), [x, y, ms]);
  await wait(120);
  await page.evaluate(() => window.__ripple());
  await locator.click();
}

// Estado inicial limpio: descartar aviso de migración y cerrar pestañas abiertas.
await page.locator('[data-testid=migrate-yml-pill-dismiss]').click().catch(() => {});
for (let k = 0; k < 6; k++) { const close = page.locator('[data-testid=request-tab-close-icon]').first(); if (await close.count()) await close.click({ force: true }).catch(() => {}); else break; await wait(200); }
await wait(500);

console.log('peticiones en sidebar:', await page.locator('span.item-name').count());

await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 2880, maxHeight: 1620, everyNthFrame: 1 });
mark('start');
await wait(1800);

const names = ['01 Disponibilidad', '02 Autenticacion', '03 Crear proyecto', '04 Validar entrada', '05 Participantes', '06 Corpus documental', '07 Libro de codigos', '08 Memo analitico', '09 Leer delimitacion', '10 Guardar protocolo', '11 Revision metodologi', '12 Resumen de analisis', '13 Exportar libro de co', '14 Eliminar proyecto te', '15 Verificar limpieza', '16 Finalizar sesion'];
const results = [];
for (const [i, name] of names.entries()) {
  const item = page.locator('span.item-name', { hasText: name }).first();
  mark('open', { i });
  await moveClick(item);
  await wait(900);
  const method = (await page.locator('[data-testid=method-selector]').first().innerText().catch(() => '')).trim();
  const bodyTab = page.locator('[data-testid=responsive-tab-body]').first();
  if (/POST|PATCH/.test(method) && (await bodyTab.count())) {
    await moveClick(bodyTab, 500);
    await wait(1300);
  } else await wait(500);
  const send = page.locator('[data-testid=send-arrow-icon]').first();
  const paneText = () => page.evaluate(() => document.querySelector('[data-testid=response-pane-status]')?.textContent || '');
  const before = await paneText();
  mark('send', { i });
  await moveClick(send, 600);
  // Esperar a que cambie el estado de la respuesta (nueva respuesta del servidor).
  const status = page.locator('[data-testid=response-status-code]').first();
  for (let k = 0; k < 100; k++) { await wait(200); const now2 = await paneText(); if (now2 && now2 !== before && /\d{3}/.test(now2)) break; }
  await wait(300);
  const st = (await status.innerText().catch(() => '?')).trim();
  mark('response', { i, status: st });
  results.push({ i: i + 1, name, method, status: st });
  console.log(i + 1, name, method, st);
  // Mover el cursor fuera del camino y dejar ver la respuesta.
  await page.evaluate(() => window.__move(1180, 760, 700));
  await wait(i === 10 || i === 5 || i === 2 ? 3600 : 2600);
}
mark('end');
await wait(1500);
await cdp.send('Page.stopScreencast');
await wait(500);
fs.writeFileSync(path.join(OUT, 'timeline.json'), JSON.stringify({ frames, marks, results }, null, 1));
await page.evaluate(() => document.getElementById('rec-cursor')?.remove());
console.log('frames', frames.length);
process.exit(0);
