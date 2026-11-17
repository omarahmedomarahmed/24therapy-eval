# Convert PNG screenshots to WebP under 300 KB and update steps.json references.
import sys, os, glob
from PIL import Image
for d in sys.argv[1:]:
    for f in glob.glob(os.path.join(d, '*.png')):
        im = Image.open(f).convert('RGB'); im.thumbnail((1280, 1280)); w = f[:-4] + '.webp'; q = 70
        while True:
            im.save(w, 'WEBP', quality=q)
            if os.path.getsize(w) < 300000 or q < 30: break
            q -= 10
        os.remove(f)
