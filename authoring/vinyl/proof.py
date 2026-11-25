"""Reference source-over compositor for the archive sprites (Pillow and NumPy)."""
import argparse, json, math, os, shutil, subprocess
from functools import lru_cache
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageChops

HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[1];SRC=HERE/'source';PROOFS=HERE/'proofs'
DARK='#191d1e';LIGHT='#e8e5dc'
TAG=['Inspect','Half extracted','Free','Above spindle','Seated','Playing']
NOTES=['Grip the exposed rim','Sleeve lip masks the label','Trailing edge clears the jacket',
       'Guide the hole over the spindle','Record settles onto the mat','Stylus down · label turning']

@lru_cache(maxsize=256)
def load(path):
    with Image.open(path) as im: return im.convert('RGBA')
@lru_cache(maxsize=200)
def scaled(path,w,h):
    return load(path).resize((w,h),Image.Resampling.LANCZOS)
def ft(size,bold=False,mono=False):
    return ImageFont.truetype(('consola' if mono else 'segoeuib' if bold else 'segoeui')+'.ttf',size)
def warp(dst,im,quad):
    q=np.array(quad,dtype=float)
    extent=max(np.linalg.norm(q[(i+1)%4]-q[i]) for i in range(4))
    if extent < im.width*.70:
        n=max(2,round(extent*1.25))
        im=im.resize((n,n),Image.Resampling.LANCZOS)
    low=np.floor(q.min(axis=0)).astype(int); high=np.ceil(q.max(axis=0)).astype(int)
    w,h=high-low
    if min(w,h)<1: return
    q=q-low
    uv=[(0,0),(im.width,0),(im.width,im.height),(0,im.height)]
    A=[];b=[]
    for (x,y),(u,v) in zip(q,uv):
        A.extend([[x,y,1,0,0,0,-u*x,-u*y],[0,0,0,x,y,1,-v*x,-v*y]]);b.extend([u,v])
    try: mat=np.linalg.solve(A,b)
    except np.linalg.LinAlgError: return
    patch=im.transform((int(w),int(h)),Image.Transform.PERSPECTIVE,mat,Image.Resampling.BICUBIC)
    dst.alpha_composite(patch,tuple(low))
def cursor(im,pt):
    x,y=map(round,pt);d=ImageDraw.Draw(im)
    pts=[(x,y),(x+2,y+17),(x+6,y+12),(x+11,y+20),(x+14,y+18),(x+10,y+11),(x+17,y+10)]
    d.polygon(pts,fill='white',outline='#202324',width=2)

class Panel:
    def __init__(self,pack,width=960):
        self.pack=Path(pack);self.m=json.loads((self.pack/'vinyl.json').read_text())
        self.w=width;self.h=round(width*.6);self.s=width/self.m['front']['canvas'][0]
        self.arm={a['name']:a for a in self.m['deck']['arm']}
    def blit(self,im,sprite,offset=(0,0),alpha=1):
        x,y,w,h=sprite['crop'];s=self.s
        pic=scaled(self.pack/sprite['png'],max(1,round(w*s)),max(1,round(h*s)))
        if alpha<1:
            pic=pic.copy();pic.putalpha(pic.getchannel('A').point(lambda a:round(a*alpha)))
        im.alpha_composite(pic,(round((x+offset[0])*s),round((y+offset[1])*s)))
    def frame(self,pull=0,t=0,angle=0,arm='park',bg=DARK,cover='bright',pointer=True,
              offset=(0,0),markers=False,arm2=None,arm_mix=0):
        m=self.m; im=Image.new('RGBA',(self.w,self.h),bg)
        a=np.array; samples=m['transfer'];ref=min(samples,key=lambda v:abs(v['t']-t))
        center=a(ref['center']); rest=a(m['pull']['rest']);free=a(m['pull']['free'])
        if t<=0: desired=rest+(free-rest)*pull
        else:
            # Interpolate the pointer flight continuously between the sampled orientations.
            hi=next((i for i,v in enumerate(samples) if v['t']>=t),len(samples)-1)
            lo=max(0,hi-1);f=(t-samples[lo]['t'])/max(1e-8,samples[hi]['t']-samples[lo]['t'])
            desired=a(samples[lo]['center'])*(1-f)+a(samples[hi]['center'])*f
        delta=desired-center+a(offset)
        self.blit(im,m['deck']['base'])
        if t>0:
            if t<1 and 'shadowAnchor' in m['deck']:
                shadow=Image.new('RGBA',im.size)
                off=a(ref['shadowCenter'])-a(m['deck']['shadowAnchor'])
                self.blit(shadow,m['deck']['shadow'],off,alpha=t*ref['shadowOpacity'])
                mask=Image.new('L',im.size);d=ImageDraw.Draw(mask)
                axes=m['deck']['rimAxes'];c=a(m['deck']['seat'])
                xaxis=a(axes['X'])-c;yaxis=a(axes['Y'])-c
                points=[tuple((c+1.015*(math.cos(k/20*math.pi)*xaxis+math.sin(k/20*math.pi)*yaxis))*self.s) for k in range(40)]
                d.polygon(points,fill=255)
                shadow.putalpha(ImageChops.multiply(shadow.getchannel('A'),mask));im.alpha_composite(shadow)
            else: self.blit(im,m['deck']['shadow'],alpha=min(1,t)*ref['shadowOpacity'])
        if t<1:
            self.blit(im,m['deck']['spindle'])
            self.blit(im,self.arm['park']['sprite'])
        self.blit(im,m['rear'])
        label_quad=a(ref['labelQuad'])+delta
        if 0<t<1 and hi!=lo and 0<f<1:
            # Register both samples in the interpolated record plane before blending the fixed-light render.
            def basis(sample):
                axes=sample['discAxes'];c=a(axes['center'])
                return np.column_stack([a(axes['x'])-c,a(axes['y'])-c])
            first,last=samples[lo],samples[hi]
            B=(1-f)*basis(first)+f*basis(last)
            layers=[]
            for sample in (first,last):
                sp=sample['surface'];x,y,w,h=sp['crop']
                q=np.array([[x,y],[x+w,y],[x+w,y+h],[x,y+h]])
                quad=(q-a(sample['center']))@np.linalg.inv(basis(sample)).T@B.T+desired+a(offset)
                layer=Image.new('RGBA',im.size)
                warp(layer,load(self.pack/sp['png']),quad*self.s);layers.append(layer.convert('RGBa'))
            im.alpha_composite(Image.blend(*layers,f).convert('RGBA'))
            label_quad=(1-f)*a(first['labelQuad'])+f*a(last['labelQuad'])+a(offset)
        else: self.blit(im,ref['surface'],delta)
        lab=load(self.pack/m['label']['png'])
        if angle%360: lab=lab.rotate(-angle,Image.Resampling.BICUBIC)
        warp(im,lab,label_quad*self.s)
        self.blit(im,m['front'])
        art=load(self.pack/m['fallback']['png']) if cover=='missing' and 'fallback' in m else load(SRC/(cover+'.png'))
        warp(im,art,a(m['jacket']['cover'])*self.s)
        # The carry plane is ahead of a parked arm until the record approaches the mat.
        if t==1: self.blit(im,m['deck']['spindle'])
        if t==1 and arm2 and arm2!=arm and arm_mix>0:
            self.blit(im,self.arm[arm]['sprite'],alpha=1-arm_mix)
            self.blit(im,self.arm[arm2]['sprite'],alpha=arm_mix)
        elif t==1: self.blit(im,self.arm[arm]['sprite'])
        if pointer: cursor(im,(a(ref['rimGrab'])+delta)*self.s)
        if markers:
            d=ImageDraw.Draw(im);s=self.s
            for pt,col in [(m['deck']['seat'],'#54c8d4'),((center+delta).tolist(),'#f59547'),(self.arm[arm]['tip'],'#e2f2ac')]:
                x,y=a(pt)*s;d.ellipse((x-5,y-5,x+5,y+5),outline=col,width=1);d.line((x-8,y,x+8,y),fill=col);d.line((x,y-8,x,y+8),fill=col)
        return im
    def poses(self):
        return [dict(pull=0),dict(pull=.43),dict(pull=1),dict(pull=1,t=8/11),dict(pull=1,t=1),
                dict(pull=1,t=1,arm='contact',angle=125,pointer=False)]

def sheet(panel,path,bg=DARK,cover='calibration',block=False):
    w=panel.w; h=panel.h;gap=14; margin=30; titleH=78; caption=53
    page=Image.new('RGB',(margin*2+2*w+gap,margin+titleH+3*(h+caption+gap)), '#111617' if bg==DARK else '#f5f2e9')
    ink='#eeeae0' if bg==DARK else '#202626';accent='#df8953' if bg==DARK else '#9c4828'
    d=ImageDraw.Draw(page);d.text((margin,16),'VHINEL   /   VINYL ARCHIVE',font=ft(14,mono=True),fill=accent)
    d.text((margin,34),'Interaction study' if block else 'From sleeve to stylus',font=ft(34,True),fill=ink)
    for i,kw in enumerate(panel.poses()):
        x=margin+(i%2)*(w+gap);y=titleH+ (i//2)*(h+gap+caption)
        im=panel.frame(bg=bg,cover=cover,**kw)
        page.paste(im,(x,y));d.text((x,y+h+6),f'{i+1:02d}   {TAG[i]}',font=ft(20,True),fill=ink)
        d.text((x,y+h+33),NOTES[i],font=ft(14),fill=ink)
    page.save(path)

def smooth(v): return v*v*(3-2*v)
def story(t,p):
    # Closed intervals share exactly one endpoint. A return never teleports the grip.
    motion=[(0,.50,0,0,'Inspect'),(.50,1.40,0,.61,'Pull by the rim'),(1.40,2.05,.61,0,'Cancel · reverse the pull'),
            (2.05,3.22,0,1,'Extract'),(3.22,3.65,1,1,'Release outside the target'),(3.65,4.62,1,0,'Missed drop · return'),
            (4.62,5.72,0,1,'Extract')]
    for start,end,a,b,name in motion:
        if t<end:
            k=smooth(max(0,(t-start)/(end-start)))
            off=(0,0)
            if 3.22<=t<4.62:
                amount=(k if t<3.65 else 1-k)*p.m['front']['canvas'][0]
                off=(.029*amount,-.048*amount)
            return name,dict(pull=a+(b-a)*k,offset=off)
    if t<6.65: return 'Carry to the spindle',dict(pull=1,t=smooth((t-5.72)/.93))
    if t<6.95: return 'Seated',dict(pull=1,t=1,pointer=False)
    if t<8.20:
        clip=p.m['animation']['armClips']['cue']; k=(t-6.95)/1.25*(len(clip)-1);i=min(len(clip)-2,int(k))
        return 'Cue the stylus',dict(pull=1,t=1,arm=clip[i],arm2=clip[i+1],arm_mix=k-i,pointer=False)
    elapsed=t-8.20
    if 1.0<=elapsed<1.68: phase=1;title='Paused · angle held'
    else: phase=elapsed if elapsed<1 else elapsed-.68;title='Playing' if elapsed<1 else 'Resumed · 33⅓ RPM'
    return title,dict(pull=1,t=1,arm='contact',angle=(phase/1.8*360)%360,pointer=False)

def video(p,out,ffmpeg):
    fps=30;seconds=12; h=p.h+64
    cmd=[ffmpeg,'-hide_banner','-loglevel','error','-y','-f','rawvideo','-pix_fmt','rgb24','-s',f'{p.w}x{h}','-r',str(fps),'-i','-','-an',
         '-c:v','libx264','-preset','fast','-crf','18','-pix_fmt','yuv420p','-movflags','+faststart',str(out)]
    proc=subprocess.Popen(cmd,stdin=subprocess.PIPE)
    for i in range(seconds*fps):
        t=i/fps;name,kw=story(t,p)
        im=Image.new('RGB',(p.w,h),'#121617');im.paste(p.frame(**kw),(0,0))
        d=ImageDraw.Draw(im);d.line((23,p.h+1,p.w-23,p.h+1),fill='#434a48')
        d.text((24,p.h+13),name,font=ft(24,True),fill='#efeade')
        d.text((p.w-224,p.h+22),'VHINEL   /   R-01',font=ft(16,mono=True),fill='#eda16d')
        proc.stdin.write(im.tobytes())
    proc.stdin.close()
    if proc.wait(): raise RuntimeError('video encoder failed')

if __name__=='__main__':
    ap=argparse.ArgumentParser();ap.add_argument('--pack',type=Path,default=ROOT/'theme/assets/render/vinyl')
    ap.add_argument('--out',type=Path,default=PROOFS);ap.add_argument('--block',action='store_true')
    ap.add_argument('--ffmpeg',default=shutil.which('ffmpeg'))
    args=ap.parse_args();args.out.mkdir(parents=True,exist_ok=True)
    panel=Panel(args.pack,480 if args.block else 600)
    sheet(panel,args.out/('blockout.png' if args.block else 'contact-sheet.png'),block=args.block)
    if not args.block:
        sheet(panel,args.out/'light.png',LIGHT,cover='bright')
        if args.ffmpeg: video(Panel(args.pack,960),args.out/'interaction.mp4',args.ffmpeg)

