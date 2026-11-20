# Construye la lista de cuadros (desde demo.mp4) y la pista de voz editada según plan.json.
import json, wave, numpy as np, os

plan = json.load(open('plan.json'))
FPS = 30
tl = plan['timeline']
# Cierre: termina la última respuesta y muestra la tarjeta final de demo.mp4.
tl.append(['cierre', 0, 0, [[144.2, 150.0, 2.4], [150.0, 155.3, 5.3]], 7.7])
# Mientras se explica la validación (narración original 87.5–110.7 s) se muestra la respuesta 400 del paso 04.
first = True
for item in tl:
    kind, t0, t1, pieces, L = item
    if 87.0 <= t0 and t1 <= 111.0:
        if first and kind == 'voz':
            item[3] = [[38.6, 40.4, 1.8], [40.4, 40.4, L - 1.8]]; first = False
        else:
            item[3] = [[40.4, 40.4, L]]

# ── Video: un cuadro de demo.mp4 por cada cuadro de salida ──
frames = []
cum = 0.0
for kind, t0, t1, pieces, L in tl:
    tot = sum(p[2] for p in pieces)
    for d0, d1, l in pieces:
        l = l * L / tot
        a, b = round(cum * FPS), round((cum + l) * FPS)
        n = b - a
        for k in range(n):
            d = d0 + (d1 - d0) * (k / max(1, n))
            frames.append(min(4663, int(round(d * FPS)) + 1))
        cum += l
with open('frames.txt', 'w') as f:
    for idx in frames:
        f.write(f"file 'dframes/d{idx:05d}.jpg'\nduration {1 / FPS:.6f}\n")
    f.write(f"file 'dframes/d{frames[-1]:05d}.jpg'\n")
print('cuadros', len(frames), 'duración', len(frames) / FPS)

# ── Voz ──
w = wave.open('sep/htdemucs/voz48k/vocals.wav')
sr = w.getframerate(); ch = w.getnchannels()
v = np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(np.float32).reshape(-1, ch).mean(1) / 32768
out = np.zeros(int(len(frames) / FPS * sr) + sr, np.float32)
cum = 0.0
fade = int(0.012 * sr)
marks = []
for kind, t0, t1, pieces, L in tl:
    if kind in ('voz', 'pausa'):
        seg = v[int(t0 * sr):int(t1 * sr)].copy()
        if len(seg) > 2 * fade:
            seg[:fade] *= np.linspace(0, 1, fade); seg[-fade:] *= np.linspace(1, 0, fade)
        a = round(cum * FPS) / FPS
        i = int(a * sr)
        out[i:i + len(seg)] += seg[:len(out) - i]
        if kind == 'voz': marks.append([t0, t1, a])
    cum += L
out = out[:int(len(frames) / FPS * sr)]
wo = wave.open('voz_editada.wav', 'w'); wo.setnchannels(1); wo.setsampwidth(2); wo.setframerate(sr)
wo.writeframes((np.clip(out, -1, 1) * 32767).astype(np.int16).tobytes()); wo.close()
json.dump({'marks': marks, 'dur': len(frames) / FPS}, open('marks.json', 'w'))
print('voz editada', round(len(out) / sr, 2), 's')
