# Dev helper: generates app icons (not needed at runtime)
from PIL import Image, ImageDraw
def icon(size, maskable=False):
    s = size
    im = Image.new("RGBA", (s, s), (255, 193, 7, 255))  # safety yellow
    d = ImageDraw.Draw(im)
    pad = s*0.18 if maskable else s*0.12
    # dark rounded box (toolbox)
    x0,y0,x1,y1 = pad, s*0.36, s-pad, s-pad
    d.rounded_rectangle([x0,y0,x1,y1], radius=s*0.06, fill=(17,17,17,255))
    # handle
    hw = s*0.10
    d.rounded_rectangle([s*0.33, s*0.20 if not maskable else s*0.24, s*0.67, y0+hw*0.4], radius=s*0.05, outline=(17,17,17,255), width=int(hw*0.7))
    # latch stripe
    d.rectangle([x0, y0+(y1-y0)*0.38, x1, y0+(y1-y0)*0.48], fill=(255,193,7,255))
    d.rounded_rectangle([s*0.44, y0+(y1-y0)*0.30, s*0.56, y0+(y1-y0)*0.56], radius=s*0.02, fill=(255,255,255,255))
    return im
for sz in (192, 512):
    icon(sz).save(f"icons/icon-{sz}.png")
    icon(sz, True).save(f"icons/icon-maskable-{sz}.png")
icon(180).convert("RGB").save("icons/apple-touch-icon.png")
icon(32).save("icons/favicon-32.png")
