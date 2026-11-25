"""Create the original print masters. Blender packs these when the scene is built."""
from pathlib import Path
import math
from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).resolve().parent
S = 896
INK = '#202727'
PAPER = '#eae5d6'
ORANGE = '#e96a32'

def font(size, bold=False, mono=False):
    family = 'consola' if mono else ('segoeuib' if bold else 'segoeui')
    return ImageFont.truetype(family + '.ttf', size)

def cover(mode):
    dark = mode == 'dark'
    bg, fg = ('#182b30', '#ece6d6') if dark else (PAPER, INK)
    im = Image.new('RGB', (S,S), bg)
    d = ImageDraw.Draw(im)
    def label(x,y,t,size=19,**kwargs):
        d.text((x,y),t,fill=fg,font=font(size,**kwargs),stroke_width=0)
    label(52,42,'VHINEL   /   FIELD SERIES',22,mono=True)
    label(712,42,'VHL—02',22,mono=True)
    d.line((52,88,844,88),fill=fg,width=2)
    label(47,91,'Soundings',105,bold=True)
    label(53,236,'STUDIES FOR A ROTATING FIELD',21,mono=True)
    d.ellipse((385,296,704,615), fill=ORANGE)
    for i in range(40):
        pts=[]
        for x in range(53,845,3):
            u=(x-53)/792
            y=468+i*6.6+57*math.sin(u*4.6-.8+i*.026)+28*math.sin(u*9.3+1.4+i*.03)
            pts.append((x,round(y)))
        d.line(pts, fill=fg, width=3)
    d.line((52,770,844,770),fill=fg,width=2)
    label(52,792,'ELIN VALE',29,bold=True)
    label(635,799,'STEREO   /   33⅓',20,mono=True)
    if mode == 'calibration':
        for name,(x,y) in zip(['TL','TR','BR','BL'],[(0,0),(S-45,0),(S-45,S-32),(0,S-32)]):
            d.rectangle((x,y,x+44,y+31), fill='#222c31')
            d.text((x+6,y+2),name,fill='white',font=font(20,mono=True))
    im.save(OUT/(mode+'.png'))

for variant in ('calibration','bright','dark'):
    cover(variant)
im=Image.new('RGB',(S,S),'#d2cbbb')
d=ImageDraw.Draw(im)
for j in range(26):
    d.line((64,350+j*8,832,350+j*8),fill='#888575',width=2)
d.text((58,78),'Untitled pressing',font=font(68,True),fill=INK)
d.text((64,776),'VHINEL ARCHIVE     /     NO SLEEVE IMAGE',font=font(24,mono=True),fill=INK)
im.convert('RGBA').save(OUT/'missing.png')
n=640
label=Image.new('RGBA',(n,n),(0,0,0,0))
d=ImageDraw.Draw(label)
d.ellipse((2,2,n-3,n-3),fill='#e38744',outline='#f4bc78',width=8)
d.arc((24,24,n-25,n-25),42,305,fill=INK,width=5)
d.polygon([(316,55),(361,127),(334,119),(334,169),(303,169),(303,119),(274,127)],fill=INK)
d.text((320,197),'VHINEL',font=font(69,True),fill=INK,anchor='mt')
d.text((167,396),'SIDE  A    •    33 RPM',font=font(30,mono=True),fill=INK)
d.line((185,449,455,449),fill=INK,width=3)
d.text((320,467),'VHL  02',font=font(26,mono=True),fill=INK,anchor='mt')
# The opening matches the 3.65 mm spindle-hole radius on a 49 mm paper label.
hole=round(n*.00365/.098)
d.ellipse((n//2-hole,n//2-hole,n//2+hole,n//2+hole),fill=(0,0,0,0))
label.save(OUT/'side-a.png')
d.rectangle((150,387,488,438),fill='#e38744')
d.text((167,396),'SIDE  B    •    33 RPM',font=font(30,mono=True),fill=INK)
label.save(OUT/'side-b.png')

