"""Audit a finished pack and reproduce the integration proof plates."""
import argparse, hashlib, json, math
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from proof import HERE, ROOT, PROOFS, SRC, Panel, load, warp, ft, story

COLORS=['bright','dark','calibration','missing']
def images(obj):
    if isinstance(obj,dict):
        if 'png' in obj: yield obj
        for value in obj.values(): yield from images(value)
    elif isinstance(obj,list):
        for value in obj: yield from images(value)
def byte_hash(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def dist(a,b): return float(np.linalg.norm(np.array(a)-b))
def art(mode,pack):
    return load((pack/'shelf/missing.png') if mode=='missing' else (SRC/(mode+'.png')))
def jacket_tile(pack,meta,asset,kind,wh,bg):
    im=Image.new('RGBA',wh,bg)
    x,y,w,h=asset['crop']
    s=min((wh[0]-14)/w,(wh[1]-14)/h)
    pos=np.array([(wh[0]-w*s)/2,(wh[1]-h*s)/2]);off=pos-s*np.array([x,y])
    warp(im,art(kind,pack),np.array(meta['cover'])*s+off)
    pic=load(pack/asset['png']).resize((max(1,round(w*s)),max(1,round(h*s))),Image.Resampling.LANCZOS)
    im.alpha_composite(pic,tuple(map(round,pos)))
    return im
def title(draw,xy,text,small=False):
    draw.text(xy,text,font=ft(17 if small else 26,not small),fill='#eae6da')

def coverage(pack,m,out):
    page=Image.new('RGB',(1200,870),'#181d1f');d=ImageDraw.Draw(page)
    title(d,(24,16),'VHINEL   /   Cover registration')
    for c,txt in enumerate(['Shelf angle','Mid-turn','End of turn','Partial pull']):
        title(d,(28+c*294,67),txt,True)
    p=Panel(pack,610)
    for row,kind in enumerate(['calibration','bright','dark','missing']):
        for col,index in enumerate([0,30,59]):
            j=m['inspect'][index];tile=jacket_tile(pack,j,j['shell'],kind,(284,176),'#e5e1d6' if (row+col)%2 else '#303839')
            page.paste(tile,(24+col*294,97+row*186))
        f=p.frame(pull=.55,cover=kind,bg='#e5e1d6' if row%2 else '#303839',pointer=False)
        box=np.array(m['jacket']['cover'])*p.s
        left,top=box.min(axis=0);hi=box.max(axis=0);tile=f.crop((int(left)-2,int(top)-2,int(hi[0]+(hi[0]-left)*.62),int(hi[1])+2))
        tile.thumbnail((284,176),Image.Resampling.LANCZOS);page.paste(tile,(906,97+row*186))
    page.save(out/'cover-registration.jpg',quality=94)
    p=Panel(pack,1152)
    f=p.frame(t=1,pull=1,arm='contact',angle=46,pointer=False,markers=True)
    bb=m['deck']['base']['crop'];s=p.s
    l,t,w,h=bb;f=f.crop((round(l*s)-8,round(t*s)-18,round((l+w)*s)+8,round((t+h)*s)+9))
    pg=Image.new('RGB',(f.width+32,f.height+91),'#171c1c');pg.paste(f,(16,48))
    d=ImageDraw.Draw(pg);title(d,(16,7),'Spindle and stylus contact')
    d.text((16,pg.height-30),'CYAN  spindle   /   AMBER  disc centre   /   LIME  stylus tip',font=ft(12,mono=True),fill='#eae6da')
    pg.save(out/'contact-markers.png')

def room_proof(pack,m,out):
    M=m['room'];cam=M['camera'];w,h=M['size'];scale=1080/w
    p=lambda v:np.array(v,dtype=float)
    def project(xyz):
        v=p(xyz)-cam['pos'];z=v@cam['fwd']
        return p([w/2+cam['f']*(v@cam['right'])/z,h/2-cam['f']*(v@cam['up'])/z])*scale
    bg=load(ROOT/'theme/assets/render/room/cream/light/plate.jpg').resize((1080,round(h*scale)),Image.Resampling.LANCZOS)
    levels=M['levels'][:6];hx,hd,H=M['box'];x0,z0,x1,z1,yf=M['cover']
    items=[]
    for shelf in range(-1,6):
        for slot in range(-14,18):
            z=2.4*math.exp(-slot*slot/42-shelf*shelf/2)+(1.6 if (shelf,slot)==(0,0) else 0)
            pos=p([shelf*M['dx'],-slot*M['dy'],z])
            depth=float((pos-cam['pos'])@cam['fwd'])
            items.append((depth,shelf,slot,pos))
    seen=0
    for depth,shelf,slot,pos in sorted(items,key=lambda i:-i[0]):
        q=np.array([project(pos+pt) for pt in [(x0,yf,z1),(x1,yf,z1),(x1,yf,z0),(x0,yf,z0)]])
        if np.any(q.max(axis=0)<-10) or np.any(q.min(axis=0)>np.array(bg.size)+10): continue
        seen+=1
        L=min(levels,key=lambda a:abs(math.log(a['depth']/depth)))
        dest={k:project(pos+pt) for k,pt in {'A':(-hx,-hd,H),'B':(hx,-hd,H),'C':(-hx,-hd,0),'D':(-hx,hd,H)}.items()}
        for name,order in [('side','ADC'),('top','ABD'),('front','ABC')]:
            if name=='front': warp(bg,art(COLORS[(shelf+slot)%4],pack),q)
            spr=L['layers'][name];x,y,ww,hh=spr['crop']
            src=np.array([[*L['fit'][k],1] for k in order]);dst=np.array([dest[k] for k in order])
            transform=np.linalg.solve(src,dst)
            corners=np.array([[x,y,1],[x+ww,y,1],[x+ww,y+hh,1],[x,y+hh,1]])@transform
            warp(bg,load(pack/spr['png']),corners)
        # Long axis of the closed paper spine is the typesetting baseline.
        if slot in [-3,0,3] and shelf<=2:
            spine_ink=Image.new('RGBA',(36,660),'#bfb7a4')
            ink=Image.new('RGBA',(660,36),'#bfb7a4');d=ImageDraw.Draw(ink)
            d.text((17,2),'VHINEL   /   SOUNDINGS     VHL–02',font=ft(22,True),fill='#262a29')
            spine_ink=ink.transpose(Image.Transpose.ROTATE_90)
            sq=[project(pos+pt) for pt in [(-hx,hd,H),(-hx,-hd,H),(-hx,-hd,0),(-hx,hd,0)]]
            warp(bg,spine_ink,sq)
    # Float thin jackets in the same pitches/rails as the native array.
    width=1080;row=Image.new('RGBA',(width,378),'#262a2a')
    J=m['shelf']['array'];s=.14
    ax=np.array(J['axes']['y'])
    rails=ROOT/'theme/assets/render/rail'
    railmeta=json.loads((rails/'rail.json').read_text())
    legacy=json.loads((ROOT/'theme/assets/render/case/blackout/case.json').read_text())
    rail_scale=np.linalg.norm(ax)*s/np.linalg.norm(legacy['axes']['y'])
    for i in range(14,-2,-1):
        origin=np.array([112,311])+ax*(i-2)*s
        which='front' if i<0 else 'back' if i==14 else 'mid'
        rail=load(rails/f'rail-{which}.png').resize(tuple(round(v*rail_scale) for v in railmeta['res']),Image.Resampling.LANCZOS)
        row.alpha_composite(rail,tuple(np.round(origin-np.array(railmeta['origin'])*rail_scale).astype(int)))
        if i in (-1,14): continue
        off=origin-np.array(J['origin'])*s+np.array([0,-48 if i==6 else 0])
        c=J['clear'] if i==6 else J['frost']
        warp(row,art(COLORS[i%4],pack),np.array(J['cover'])*s+off)
        x,y,ww,hh=c['crop'];pic=load(pack/c['png']).resize((round(ww*s),round(hh*s)),Image.Resampling.LANCZOS)
        row.alpha_composite(pic,tuple(np.round(off+s*np.array([x,y])).astype(int)))
    # Display a near and far reference jacket at physical relative scale.
    for i,L in enumerate((levels[0],levels[-1])):
        src=L['layers']['front'];tile=jacket_tile(pack,L,src,'bright',(212,180 if i==0 else 94),'#262a2a')
        row.alpha_composite(tile,(575+i*220,32))
        ImageDraw.Draw(row).text((608+i*220,220),f"DEPTH  {L['depth']:.0f}",font=ft(15,mono=True),fill='#ece8dc')
    page=Image.new('RGB',(width,bg.height+row.height+100),'#171d1e');page.paste(bg,(0,49));page.paste(row,(0,bg.height+96))
    d=ImageDraw.Draw(page);title(d,(18,5),'VHINEL   /   Room camera');title(d,(18,bg.height+52),'Array shelf and Room depth samples')
    page.save(out/'shelf-room.jpg',quality=93)
    return seen

def validate(pack,reread,out):
    m=json.loads((pack/'vinyl.json').read_text());rows={a['png']:a for a in images(m)}
    files={p.relative_to(pack).as_posix() for p in pack.rglob('*.png')}
    assert set(rows)==files,(set(rows)-files,files-set(rows))
    sizes={}
    for name,node in rows.items():
        with Image.open(pack/name) as im:
            assert im.mode=='RGBA',(name,im.mode)
            assert list(im.size)==(node['crop'][2:] if 'crop' in node else node['size']),name
            im.load();assert im.getchannel('A').getbbox(),name
            sizes[name]=im.width*im.height*4
        if 'crop' in node:
            x,y,w,h=node['crop'];W,H=node['canvas'];assert 0<=x<x+w<=W and 0<=y<y+h<=H,name
    assert [i['index'] for i in m['inspect']]==list(range(60))
    assert [i['index'] for i in m['transfer']]==list(range(12))
    assert len(m['room']['levels'])==7 and len(m['deck']['arm'])==11
    arm={p['name']:p for p in m['deck']['arm']};T=m['transfer'];deck=m['deck']
    assert T[-1]['surface']==deck['seated']
    seat_error=dist(T[-1]['center'],deck['seat'])/2;assert seat_error<1
    def anchor_alpha(sprite,pt):
        x,y=np.round(np.array(pt)-sprite['crop'][:2]).astype(int)
        return load(pack/sprite['png']).getpixel((x,y))[3]
    bore_alpha=anchor_alpha(deck['seated'],deck['seat'])
    pin_alpha=anchor_alpha(deck['spindle'],deck['seat'])
    assert bore_alpha<8 and pin_alpha>245,(bore_alpha,pin_alpha)
    assert abs(arm['contact']['clearanceM'])<.00003
    assert all(arm[k]['clearanceM']>0 for k in ('lift','swing-1','swing-2','above','lower'))
    contact=np.array(arm['contact']['tipM']);seat=np.array(T[-1]['worldCenter']);radius=dist(contact[:2],seat[:2])
    assert .125<=radius<=.148
    start=np.array(m['pull']['free']);assert dist(T[0]['center'],start)<.01
    final=np.array(m['inspect'][-1]['cover']);gesture=np.array(m['jacket']['cover'])
    fac=np.linalg.norm(gesture[1]-gesture[0])/np.linalg.norm(final[1]-final[0])
    offset=gesture[0]-final[0]*fac
    junction=max(dist(a,b) for a,b in zip(final*fac+offset,gesture))/2
    assert junction<1
    compare=[]
    if reread:
        check=json.loads((reread/'vinyl.json').read_text())
        for n,v in {a['png']:a for a in images(check)}.items():
            assert rows[n]==v,n
            a=np.asarray(load(pack/n)).astype('int16');b=np.asarray(load(reread/n)).astype('int16')
            # Subpixel Cycles variations are reported in premultiplied display space.
            ap=a[:,:,:3]*0.+a[:,:,:3]*a[:,:,3:4].astype(float)/255
            bp=b[:,:,:3]*b[:,:,3:4].astype(float)/255
            diff=np.abs(ap-bp)
            compare.append({'png':n,'byteIdentical':byte_hash(pack/n)==byte_hash(reread/n),'meanAbsolute8bit':round(float(diff.mean()),5)})
            assert diff.mean()<1.0,n
    pp=Panel(pack,720);baseline=pp.frame(pull=0)
    assert baseline.tobytes()==pp.frame(pull=0).tobytes()
    for t in [2.05,4.62]:
        _,kw=story(t,pp);assert baseline.tobytes()==pp.frame(**kw).tobytes()
    _,a=story(9.33,pp);_,b=story(9.70,pp)
    assert pp.frame(**a).tobytes()==pp.frame(**b).tobytes()
    f0=pp.frame(t=1,arm='contact',angle=0,pointer=False)
    assert f0.tobytes()==pp.frame(t=1,arm='contact',angle=360,pointer=False).tobytes()
    assert f0.tobytes()!=pp.frame(t=1,arm='contact',angle=90,pointer=False).tobytes()
    def mem(s): return sum(sizes[n] for n in {a['png'] for a in images(s)})
    active=[deck['base'],deck['spindle'],deck['shadow'],deck['seated'],arm['contact']['sprite'],m['label'],m['front'],m['rear']]
    report={'packFiles':len(list(pack.rglob('*.png')))+1,'pngCount':len(files),'bytes':sum(v.stat().st_size for v in pack.rglob('*') if v.is_file()),
        'decodedActiveRGBABytes':mem(active),'activeLayers':[n['png'] for n in active],
        'worstAdjacentInspectionPairRGBABytes':max(mem(m['inspect'][i:i+2]) for i in range(59)),
        'decodedAllRGBABytes':sum(sizes.values()),'inspectionFrames':60,'transferSamples':12,'armPoses':11,'roomDepths':[l['depth'] for l in m['room']['levels'][:6]],
        'seatedErrorDisplayPx':seat_error,'inspectionHandoffCornerErrorDisplayPx':round(junction,5),'contactRadiusMm':round(radius*1000,3),
        'contactClearanceMm':round(arm['contact']['clearanceM']*1000,4),'liftedSwingClearanceMm':round(arm['above']['clearanceM']*1000,3),
        'seatedBoreAlphaAtAnchor':bore_alpha,'spindleAlphaAtAnchor':pin_alpha,
        'spinPeriodSeconds':1.8,'cancelAndMissReturnPixelExact':True,'pauseHoldsPixelExact':True,'fullRevolutionClosesPixelExact':True,
        'representativeRerenders':compare,'foobar2000':'Not run. Validation uses the reference compositor.'}
    coverage(pack,m,out);report['visibleRoomJacketsInProof']=room_proof(pack,m,out)
    (out/'verification.json').write_text(json.dumps(report,indent=2))
    print(json.dumps({k:v for k,v in report.items() if k not in ('representativeRerenders','activeLayers')},indent=1))

if __name__=='__main__':
    a=argparse.ArgumentParser();a.add_argument('--pack',type=Path,default=ROOT/'theme/assets/render/vinyl');a.add_argument('--rerenders',type=Path);a.add_argument('--out',type=Path,default=PROOFS)
    args=a.parse_args();validate(args.pack,args.rerenders,args.out)

