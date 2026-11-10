# Contact sheets of recorded videos: one frame per subtitle cue (mid-cue).
# usage: python3 tools/review-sheet.py OUT_PREFIX id [id ...]
import json, glob, os, subprocess, sys
from PIL import Image, ImageDraw
out, ids = sys.argv[1], sys.argv[2:]
W, H, COLS = 384, 216, 6
rows = []
for t in sorted(glob.glob('*/*/timeline.json')):
    d = json.load(open(t))
    if ids and d['id'] not in ids: continue
    ims = []
    for i, c in enumerate(d['cues']):
        f = f"/tmp/rv_{d['id']}_{i}.jpg"
        subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-ss', str((c['start'] + c['end']) / 2), '-i', f"{os.path.dirname(t)}/source.mp4", '-frames:v', '1', '-vf', f'scale={W}:{H}', f])
        ims.append(Image.open(f))
    for k in range(0, len(ims), COLS):
        rows.append((f"{d['id']} ({d['duration']}s) {'' if k == 0 else 'cont.'}", ims[k:k + COLS]))
for n in range(0, len(rows), 5):
    chunk = rows[n:n + 5]
    sheet = Image.new('RGB', (W * COLS, (H + 22) * len(chunk)), 'white')
    dr = ImageDraw.Draw(sheet)
    for j, (label, ims) in enumerate(chunk):
        dr.text((4, j * (H + 22) + 4), label, fill='black')
        for i, im in enumerate(ims): sheet.paste(im, (i * W, j * (H + 22) + 22))
    sheet.save(f"{out}{n // 5}.jpg", quality=80)
    print(f"{out}{n // 5}.jpg")
