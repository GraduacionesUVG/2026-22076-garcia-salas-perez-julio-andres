import wave, json, numpy as np
from faster_whisper.vad import get_speech_timestamps, VadOptions
w = wave.open('vocals16k.wav'); a = np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(np.float32) / 32768
ts = get_speech_timestamps(a, VadOptions(threshold=0.4, min_silence_duration_ms=250, speech_pad_ms=120, min_speech_duration_ms=200))
seg = [(t['start'] / 16000, t['end'] / 16000) for t in ts]
json.dump(seg, open('speech.json', 'w'))
for s, e in seg: print(f'{s:7.2f}-{e:7.2f} ({e-s:4.1f})')
print('total voz', round(sum(e - s for s, e in seg), 1))
