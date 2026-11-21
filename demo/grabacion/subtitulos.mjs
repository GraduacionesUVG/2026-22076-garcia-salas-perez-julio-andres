// Genera el SRT a partir de los tiempos reales de la edición (SALIDA.tiempos.json).
// Uso: node demo/grabacion/subtitulos.mjs demo.tiempos.json salida.srt
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const [tiemposPath, out] = process.argv.slice(2);
const t = JSON.parse(fs.readFileSync(tiemposPath, 'utf8'));
const pasos = JSON.parse(fs.readFileSync(path.join(here, 'pasos.json'), 'utf8'));
const ts = x => { const ms = Math.round(x * 1000); const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60; return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`; };
const cues = [[0, t.offset, 'Demo del backend de investigación antropológica · Julio Andrés García Salas Pérez · 22076. Grabación real en Bruno contra el servidor local.']];
t.pasos.forEach((p, i) => cues.push([t.offset + Math.max(p.desde, 0.3), t.offset + p.hasta, `${String(i + 1).padStart(2, '0')}/${pasos.length} · ${pasos[i].titulo}: ${pasos[i].metodo} ${pasos[i].ruta} → ${p.estado}`]));
cues.push([t.offset + t.rawDur, t.total, `${t.pasos.length} peticiones enviadas, ${t.pasos.length} respuestas esperadas. El proyecto temporal se eliminó y la sesión se cerró.`]);
fs.writeFileSync(out, cues.map((c, i) => `${i + 1}\n${ts(c[0])} --> ${ts(c[1])}\n${c[2]}\n`).join('\n'));
console.log(cues.length, 'subtítulos');
