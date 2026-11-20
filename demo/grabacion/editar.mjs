// Edita la grabación de Bruno: marco, franjas por paso, difuminado del correo QA, portada, cierre y audio.
// Uso: node demo/grabacion/editar.mjs GRABACION_DIR CAPAS_DIR SALIDA.mp4 [musica.wav]
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const [rec, layers, out, music] = process.argv.slice(2);
const tl = JSON.parse(fs.readFileSync(path.join(rec, 'timeline.json'), 'utf8'));
const t0 = tl.frames[0].t;
const at = (type, i) => tl.marks.find(m => m.type === type && m.i === i).t - t0;
const ff = args => { const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', ...args], { stdio: 'inherit' }); if (r.status) throw new Error('ffmpeg falló'); };
const tmp = fs.mkdtempSync(path.join(path.dirname(out), '.edit-'));

// 1. Video crudo con la duración real de cada cuadro capturado.
const f = tl.frames;
let list = '';
f.forEach((fr, i) => { list += `file '${path.resolve(rec, 'frames', fr.file)}'\nduration ${Math.max(0.001, (i < f.length - 1 ? f[i + 1].t : tl.marks.at(-1).t + 1.2) - fr.t).toFixed(4)}\n`; });
list += `file '${path.resolve(rec, 'frames', f.at(-1).file)}'\n`;
fs.writeFileSync(path.join(tmp, 'frames.txt'), list);
const rawDur = tl.marks.at(-1).t + 1.2 - t0;

// 2. Composición principal.
const n = tl.results.length;
const inputs = ['-f', 'concat', '-safe', '0', '-i', path.join(tmp, 'frames.txt'), '-loop', '1', '-i', path.join(layers, 'mask.png')];
const caps = [];
for (let i = 0; i < n; i++) {
  const id = String(i + 1).padStart(2, '0');
  inputs.push('-loop', '1', '-i', path.join(layers, `cap_${id}.png`), '-loop', '1', '-i', path.join(layers, `st_${id}.png`));
  const a = Math.max(0, at('open', i) - 0.2), b = i < n - 1 ? at('open', i + 1) - 0.2 : rawDur;
  caps.push({ cap: 2 + i * 2, st: 3 + i * 2, a, b, r: at('response', i) });
}
// Correo de la cuenta QA en la respuesta del inicio de sesión (coordenadas de la grabación a 1920×1080).
// Cubre desde que se pulsa Send en el login hasta que la siguiente petición ya está abierta.
const blurFrom = at('send', 1), blurTo = at('send', 2);
let fc = `[0:v]fps=30,scale=1920:1080:flags=lanczos,format=rgba,split[r0][r1];` +
  `[r1]crop=380:34:1262:412,scale=19:2:flags=area,scale=380:34:flags=neighbor,boxblur=luma_radius=6:luma_power=2:chroma_radius=6:chroma_power=2:alpha_radius=0[bl];` +
  `[r0][bl]overlay=1262:412:enable='between(t,${blurFrom.toFixed(2)},${blurTo.toFixed(2)})',scale=1680:945:flags=lanczos[rs];` +
  `[1:v]scale=1680:945,format=gray[mk];[rs][mk]alphamerge[rr];` +
  `color=c=0x0C1310:s=1920x1080:r=30:d=${rawDur.toFixed(2)}[bg];` +
  `[bg]drawbox=x=118:y=28:w=1684:h=949:color=0xFFFFFF@0.06:t=fill[bg2];` +
  `[bg2][rr]overlay=120:30:shortest=1[v0]`;
caps.forEach((c, k) => {
  fc += `;[v${k * 2}][${c.cap}:v]overlay=0:0:enable='between(t,${c.a.toFixed(2)},${c.b.toFixed(2)})'[v${k * 2 + 1}]`;
  fc += `;[v${k * 2 + 1}][${c.st}:v]overlay=0:0:enable='between(t,${c.r.toFixed(2)},${c.b.toFixed(2)})'[v${k * 2 + 2}]`;
});
fc += `;[v${n * 2}]format=yuv420p[vout]`;
const main = path.join(tmp, 'main.mp4');
ff([...inputs, '-filter_complex', fc, '-map', '[vout]', '-t', rawDur.toFixed(2), '-c:v', 'libx264', '-crf', '17', '-preset', 'medium', '-r', '30', main]);

// 3. Portada y cierre con fundidos.
const still = (png, d, o) => ff(['-loop', '1', '-i', png, '-t', String(d), '-vf', 'fps=30,format=yuv420p', '-c:v', 'libx264', '-crf', '17', o]);
const p1 = path.join(tmp, 'portada.mp4'), p2 = path.join(tmp, 'cierre.mp4');
still(path.join(layers, 'portada.png'), 4, p1);
still(path.join(layers, 'cierre.png'), 5, p2);
const X = 0.6;
const total = 4 + rawDur + 5 - 2 * X;
const vf = `[0:v][1:v]xfade=transition=fade:duration=${X}:offset=${4 - X}[a];[a][2:v]xfade=transition=fade:duration=${X}:offset=${(4 + rawDur - 2 * X).toFixed(2)},format=yuv420p[v]`;
const args = ['-i', p1, '-i', main, '-i', p2];
if (music) args.push('-i', music);
ff([...args, '-filter_complex', vf + (music ? `;[3:a]atrim=0:${total.toFixed(2)},afade=t=out:st=${(total - 2.5).toFixed(2)}:d=2.5,volume=0.55[au]` : ''), '-map', '[v]', ...(music ? ['-map', '[au]', '-c:a', 'aac', '-b:a', '192k'] : []), '-c:v', 'libx264', '-crf', '18', '-preset', 'medium', '-movflags', '+faststart', out]);
fs.rmSync(tmp, { recursive: true, force: true });
fs.writeFileSync(out.replace(/\.mp4$/, '.tiempos.json'), JSON.stringify({ offset: 4 - X, rawDur, total, pasos: caps.map((c, i) => ({ paso: i + 1, desde: c.a, hasta: c.b, respuesta: c.r, estado: tl.results[i].status })) }, null, 1));
console.log('listo', out, total.toFixed(1), 's');
