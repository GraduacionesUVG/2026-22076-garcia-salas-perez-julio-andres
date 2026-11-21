// Música de fondo sintetizada (pad + bajo + pulso suave). Uso: node audio.mjs DURACION salida.wav
import fs from 'node:fs';

const [durArg, outPath] = process.argv.slice(2);
const duration = Number(durArg);
const SR = 48000;
const N = Math.ceil((duration + 0.5) * SR);
const L = new Float32Array(N), R = new Float32Array(N);
let seed = 12345;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
const TAU = Math.PI * 2;
const add = (i, v, pan = 0) => { if (i >= 0 && i < N) { L[i] += v * (1 - pan); R[i] += v * (1 + pan); } };
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
const chords = [[57, 60, 64, 67, 71], [53, 57, 60, 64, 69], [48, 55, 60, 64, 67], [55, 59, 62, 66, 69]];
const beat = 60 / 100, chordLen = beat * 8;
for (let c = 0; c * chordLen < duration; c++) {
  const notes = chords[c % chords.length], t0 = c * chordLen;
  notes.forEach((m, k) => {
    const f = mtof(m), det = 1 + (k % 2 ? 0.0021 : -0.0018), len = chordLen + 1.2;
    for (let j = 0; j < len * SR; j++) {
      const t = j / SR, env = Math.min(1, t / 1.4) * Math.min(1, Math.max(0, (len - t) / 1.2));
      add(Math.floor((t0 + t) * SR), (Math.sin(TAU * f * t) + 0.5 * Math.sin(TAU * f * det * t + 1) + 0.18 * Math.sin(TAU * 2 * f * t)) * env * 0.018, k % 2 ? 0.25 : -0.25);
    }
  });
  const fb = mtof(notes[0] - 12);
  for (let j = 0; j < chordLen * SR; j++) {
    const t = j / SR, env = Math.min(1, t / 0.3) * Math.min(1, (chordLen - t) / 0.4);
    add(Math.floor((t0 + t) * SR), Math.sin(TAU * fb * t) * env * 0.05);
  }
}
for (let b = 0; b * beat < duration - 4; b++) {
  const t0 = b * beat, ramp = Math.min(1, t0 / 6);
  for (let j = 0; j < 0.32 * SR; j++) { const t = j / SR, f = 48 + 70 * Math.exp(-t * 30); add(Math.floor((t0 + t) * SR), Math.sin(TAU * f * t) * Math.exp(-t * 11) * 0.10 * ramp); }
  let lp = 0; const th = t0 + beat / 2;
  for (let j = 0; j < 0.05 * SR; j++) { const t = j / SR, n = rnd(), hp = n - lp; lp = n * 0.6 + lp * 0.4; add(Math.floor((th + t) * SR), hp * Math.exp(-t * 90) * 0.022 * ramp, 0.3); }
}
let peak = 0;
for (let i = 0; i < N; i++) { L[i] = Math.tanh(L[i] * 1.2); R[i] = Math.tanh(R[i] * 1.2); peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i])); }
const norm = 0.89 / peak, buf = Buffer.alloc(44 + N * 4);
buf.write('RIFF', 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write('WAVE', 8); buf.write('fmt ', 12);
buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22); buf.writeUInt32LE(SR, 24);
buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N; i++) { buf.writeInt16LE(Math.round(L[i] * norm * 32767), 44 + i * 4); buf.writeInt16LE(Math.round(R[i] * norm * 32767), 46 + i * 4); }
fs.writeFileSync(outPath, buf);
