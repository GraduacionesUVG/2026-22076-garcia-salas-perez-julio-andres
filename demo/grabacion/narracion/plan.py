# Planifica la edición: qué tramos de la narración se conservan y qué parte de demo.mp4 se ve en cada uno.
import json, numpy as np

path = np.load('path.npy') / 10.0           # tiempo en demo.mp4 para cada 0.2 s de la grabación original
FPS_O = 5
speech = json.load(open('speech.json'))

# Tramos que el VAD confundió con voz (música residual), verificados con transcripción.
drop = [(115.0, 117.6), (131.6, 133.6), (232.0, 234.7)]
speech = [(s, e) for s, e in speech if not any(a <= s and e <= b for a, b in drop)]
speech = [(max(s, 30.0) if 27.9 <= s < 30 else s, e) for s, e in speech]

# Voz sobre la música que el VAD no detectó pero la transcripción sí (verificada).
speech = sorted(speech + [(152.6, 153.6), (155.1, 157.3), (158.9, 162.3), (186.4, 190.2), (191.0, 198.5), (244.5, 246.1)])
# Margen extra para no recortar el inicio ni el final de las palabras.
speech = [(max(0, s - 0.3), e + 0.25) for s, e in speech]
# Unir voces separadas por pausas cortas (respiraciones naturales).
merged = []
for s, e in speech:
    if merged and s - merged[-1][1] <= 0.45:
        merged[-1][1] = e
    else:
        merged.append([s, e])

def d_at(t):
    i = t * FPS_O
    i0 = int(np.floor(i)); i1 = min(i0 + 1, len(path) - 1); f = i - i0
    i0 = min(i0, len(path) - 1)
    return float(path[i0] * (1 - f) + path[i1] * f)

def video_pieces(t0, t1, length=None):
    """Divide [t0,t1] de la grabación en piezas (d0, d1, duración) a velocidad real."""
    out = []
    ts = np.arange(t0, t1, 0.2).tolist() + [t1]
    for a, b in zip(ts[:-1], ts[1:]):
        d0, d1 = d_at(a), d_at(b)
        if d1 - d0 < 0.04: d1 = d0
        if out and ((out[-1][0] == out[-1][1]) == (d0 == d1)) and abs(out[-1][1] - d0) < 0.06:
            out[-1] = (out[-1][0], d1, out[-1][2] + (b - a))
        else:
            out.append((d0, d1, b - a))
    return out

timeline = []   # (tipo, t0, t1, piezas, duración_salida)
tcur = 0.0
first = merged[0][0]
gaps = [(0.0, first)] + [(merged[i][1], merged[i + 1][0]) for i in range(len(merged) - 1)] + [(merged[-1][1], 268.1)]
for i, (s, e) in enumerate(merged):
    g0, g1 = gaps[i]
    d0, d1 = d_at(g0), d_at(g1)
    play = d1 - d0
    if g1 - g0 <= 0.55:
        timeline.append(('pausa', g0, g1, video_pieces(g0, g1), g1 - g0))
    elif play < 0.3:
        L = 0.35 if i > 0 else 0.6
        timeline.append(('corte', g0, g1, [(d1, d1, L)], L))
    else:
        L = max(0.8, play / 2.0)
        # el hueco contiene reproducción: se acelera solo la parte que avanza
        timeline.append(('rapido', g0, g1, [(d0, d1, L)], L))
    timeline.append(('voz', s, e, video_pieces(s, e), e - s))
# Final: lo que queda de la demo hasta el cierre.
g0, g1 = gaps[-1]
dend = d_at(g1)
timeline.append(('rapido', g0, g1, [(d_at(g0), dend, max(0.8, (dend - d_at(g0)) / 2))], max(0.8, (dend - d_at(g0)) / 2)))

total = sum(x[4] for x in timeline)
print('duración salida', round(total, 1), 's; voz', round(sum(e - s for s, e in merged), 1))
for k in ('corte', 'rapido', 'pausa'):
    xs = [x for x in timeline if x[0] == k]
    print(k, len(xs), round(sum(x[2] - x[1] for x in xs), 1), '→', round(sum(x[4] for x in xs), 1))
json.dump({'merged': merged, 'timeline': timeline, 'total': total}, open('plan.json', 'w'), indent=1)
