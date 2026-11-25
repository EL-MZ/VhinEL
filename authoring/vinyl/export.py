"""Regenerate vinyl.json and its PNGs from the open, editable vinyl scene.

blender -b authoring/vinyl/vinyl-archive.blend -P authoring/vinyl/export.py
Optional arguments after --: --out PATH, --mode blockout|test|full|verify.
"""
import argparse, bpy, json, math, struct, sys, tempfile
from pathlib import Path
from mathutils import Vector, Matrix
from bpy_extras.object_utils import world_to_camera_view

HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[1]
SCENE='VHINEL Vinyl Archive'
CORNERS=('TL','TR','BR','BL')
REAR='Jacket rear'; FRONT='Jacket front'; DISC='Disc surface'
BASE='Deck base'; SHADE='Contact shadow'; ARM='Arm'; PIN='Spindle foreground'
D=bpy.data.objects

def rounded(p): return [round(float(x),4) for x in p]
def mix(a,b,t): return a+(b-a)*t
def dimensions(path):
    with path.open('rb') as stream:
        stream.seek(16);return list(struct.unpack('>II',stream.read(8)))

class Export:
    def __init__(self,out,mode):
        self.out=Path(out);self.out.mkdir(exist_ok=True,parents=True)
        self.mode=mode;self.fast=mode=='blockout';self.subset=mode in ('test','verify')
        self.s=bpy.data.scenes[SCENE];bpy.context.window.scene=self.s
        self.s.frame_set(1)
        self.r=self.s.render;self.r.resolution_percentage=100
        self.r.dither_intensity=0
        self.r.image_settings.compression=85
        self.s.cycles.samples=3 if self.fast else 8
        self.s.cycles.use_denoising=True
        self.cam=self.s.camera
        self.seen=[]
        self.original_cam=(self.cam.matrix_world.copy(),self.cam.data.ortho_scale)
        # Export poses are independent of animation evaluation. Only this process's scene copy changes.
        self.rec=D['Record ROOT']; self.j=D['Jacket ROOT']
        for o in (self.rec,D['Arm yaw'],D['Cue lift'],D['Label rotation'],D['Contact penumbra']):
            if o.animation_data: o.animation_data.action=None
        self.j0=self.j.location.copy()
        self.rest=self.anchor('Sleeved centre');self.free=self.anchor('Released centre');self.seat=self.anchor('Spindle seat')
        self.rad=(self.anchor('Record X')-self.rec.matrix_world.translation).length
        mouth=(self.anchor('Mouth top')+self.anchor('Mouth bottom'))*.5
        self.free=mouth+(mouth-self.j0).normalized()*(self.rad+.004)
        self.lr=self.rec['label_radius_m']
        self.m={'schemaVersion':'1.0','units':'metres','space':{'origin':'top-left','x':'right','y':'down',
            'quadOrder':list(CORNERS),'crop':'[left, top, width, height] in uncropped canvas pixels; PNG is native crop size',
            'targetPanel':[1440,864],'camera':'orthographic except Room','alpha':'straight sRGB PNG, source-over'},
            'animation':{'pull':'position-driven, clamp to [0,1], reversible','transferDurationMs':420,
            'transferSamples':12,'endpoints':'both inclusive; last tilt is seated','spinPeriodMs':1800,
            'spin':'clockwise in record plane, modulo one turn, pause holds elapsed time','armFrameMs':1000/30,
            'playbackStart':'contact','inspectionDurationMs':650,'inspection':'0..59 inclusive, reversible'},
            'order':{'pull':['base','shadow','spindle','arm','rear','disc','label','front','cover'],
            'seated':['base','rear','front','cover','shadow','disc','label','spindle','arm'],
            'shelf':['cover or fallback','shell','spine lettering'],'room':['side','top','cover or fallback','front']}}
        self.panel()
    def update(self): bpy.context.view_layer.update()
    def anchor(self,n):
        self.update();return D[n].evaluated_get(bpy.context.evaluated_depsgraph_get()).matrix_world.translation.copy()
    def world(self,o,p):
        return o.evaluated_get(bpy.context.evaluated_depsgraph_get()).matrix_world @ Vector(p)
    def xy(self,p):
        n=world_to_camera_view(self.s,self.cam,Vector(p))
        return [round(n.x*self.r.resolution_x,4),round((1-n.y)*self.r.resolution_y,4)]
    def local(self,o,p): return self.xy(self.world(o,p))
    def canvas(self,w,h):
        self.r.resolution_x=w;self.r.resolution_y=h
    def panel(self):
        self.cam.data.type='ORTHO';self.cam.matrix_world=self.original_cam[0].copy()
        self.cam.data.ortho_scale=self.original_cam[1]
        self.canvas(*( (720,432) if self.fast else (2880,1728) ))
        self.update()
    def pose(self,loc,angle):
        self.rec.location=loc;self.rec.rotation_euler=(math.radians(angle),0,0);self.update()
    def arm(self,yaw,lift):
        D['Arm yaw'].rotation_euler.z=math.radians(yaw);D['Cue lift'].rotation_euler.x=math.radians(lift);self.update()
    def visible(self,names,only=None):
        visible=[]
        for col in self.s.collection.children:
            for o in col.objects:
                if o.type not in ('MESH','FONT','CURVE'): continue
                o.hide_render=col.name not in names or (only is not None and o.name not in only)
                if not o.hide_render: visible.append(o)
        self.update();return visible
    def sprite(self,key,groups,only=None):
        objects=self.visible(groups,only)
        points=[self.local(o,v) for o in objects for v in o.bound_box]
        w,h=self.r.resolution_x,self.r.resolution_y
        x=max(0,math.floor(min(p[0] for p in points))-3);y=max(0,math.floor(min(p[1] for p in points))-3)
        ex=min(w,math.ceil(max(p[0] for p in points))+3);ey=min(h,math.ceil(max(p[1] for p in points))+3)
        if ex<=x or ey<=y: raise ValueError(f'{key} outside its canvas')
        r=self.r;r.use_border=True;r.use_crop_to_border=True
        # Cycles quantizes the normalized border to integer pixels by truncation.
        r.border_min_x=(x+.02)/w;r.border_max_x=min(1,(ex+.02)/w)
        r.border_min_y=(h-ey+.02)/h;r.border_max_y=min(1,(h-y+.02)/h)
        path=self.out/(key+'.png');path.parent.mkdir(exist_ok=True,parents=True)
        r.filepath=str(path)
        bpy.ops.render.render(write_still=True,scene=self.s.name)
        size=dimensions(path)
        if size!=[ex-x,ey-y]: raise RuntimeError(f'{key}: unexpected crop {size} at {x,y,ex,ey}')
        self.seen.append(key)
        return {'png':key+'.png','canvas':[w,h],'crop':[x,y,*size]}
    def jacket(self):
        cv=[self.xy(self.anchor('Art '+k)) for k in CORNERS]
        return {'cover':cv,'spine':[self.xy(self.anchor('Spine '+k)) for k in CORNERS],
                'opening':[self.xy(self.anchor('Mouth '+k)) for k in ('top','bottom')],
                'center':self.xy(self.world(self.j,(0,0,0))),'origin':self.local(self.j,(0,0,-.1575))}
    def circle(self,o,r,z=0):
        return {'center':self.local(o,(0,0,z)),'x':self.local(o,(r,0,z)),'y':self.local(o,(0,r,z))}
    def recmeta(self):
        r=self.rad;l=self.lr;o=self.rec
        return {'center':self.local(o,(0,0,0)),'radiusM':round(r,6),'discAxes':self.circle(o,r),
            'labelAxes':self.circle(o,l,.001),'labelQuad':[self.local(o,(x,y,.001)) for x,y in [(-l,l),(l,l),(l,-l),(-l,-l)]],
            'rimGrab':self.local(o,(r-.002,0,0)),
            'silhouette':[self.local(o,(r*math.cos(i*math.tau/40),r*math.sin(i*math.tau/40),0)) for i in range(40)]}
    def packed(self,name,dest):
        path=self.out/dest;path.parent.mkdir(exist_ok=True,parents=True)
        path.write_bytes(bpy.data.images[name].packed_file.data)
        return {'png':dest,'size':dimensions(path)}
    def gesture(self):
        self.panel();self.arm(0,-1.7)
        m=self.m
        m['label']=self.packed('side-a.png','transfer/side-a.png')
        m['rear']=self.sprite('transfer/rear',[REAR]);m['front']=self.sprite('transfer/front',[FRONT])
        m['jacket']=self.jacket()
        s=self.xy(self.rest);e=self.xy(self.free);r=self.rad
        # Hit polygon follows only the exposed arc. Intersect with the sleeve opening.
        self.pose(self.rest,90)
        mouth_local=(self.anchor('Mouth top')-self.rest).x
        a=math.acos(min(1,max(-1,mouth_local/r)))
        rim=[self.local(self.rec,(r*math.cos(t),r*math.sin(t),0)) for t in [mix(-a,a,i/24) for i in range(25)]]
        m['pull']={'rest':s,'free':e,'direction':rounded(Vector(e)-Vector(s)),'travelM':round((self.free-self.rest).length,6),
                   'rimHit':rim,'release':'centre reaches free; trailing rim has 4 mm clearance'}
        m['deck']={'base':self.sprite('deck/base',[BASE]),'spindle':self.sprite('deck/spindle',[PIN]),
            'shadow':self.sprite('deck/contact',[SHADE]),'seat':self.xy(self.seat),
            'shadowAnchor':self.xy(self.anchor('Contact penumbra')),
            'spindleTip':self.xy(self.anchor('Spindle tip')),'dropEllipse':self.circle(D['Deck ROOT'],.17,.058),
            'rimAxes':{k:self.xy(self.anchor('Rim '+k)) for k in ['X','Y']}}
        m['transfer']=[]
        for i in ([0,8,11] if self.fast else [0,6,11] if self.subset else range(12)):
            t=i/11
            # Use the exact seat transform for the endpoint. UI offsets this reference path at release.
            horizontal=min(1,t/.72);horizontal=horizontal*horizontal*(3-2*horizontal)
            pos=self.free.lerp(self.seat,horizontal);pos.z=mix(self.free.z,self.seat.z,t)+.085*math.sin(math.pi*t)
            self.pose(pos,90*(1-t));meta=self.recmeta()
            m['transfer'].append(dict(index=i,t=round(t,6),surface=self.sprite('deck/seated' if i==11 else f'transfer/tilt-{i:02}',[DISC]),
                worldCenter=rounded(pos),tiltDeg=round(90*(1-t),5),shadowCenter=self.xy((pos.x,pos.y,self.seat.z-.001)),
                shadowOpacity=round(.25+.75*t*t,4),**meta))
        m['deck']['seated']=m['transfer'][-1]['surface'];m['deck']['seatedTransform']=[rounded(row) for row in self.rec.matrix_world]
        m['deck']['arm']=[]
        poses=[('park',0,-1.7,0),('lift',0,-6,14),('swing-1',-5,-6,22),('swing-2',-10,-6,30),
            ('above',-14.5,-6,37),('lower',-14.5,-3,44),('contact',-14.5,0,52),
            ('sweep-mid',-26,0,80),('sweep-end',-38,0,110),('return-lift',-38,-6,124),('return-mid',-21,-6,138)]
        for nm,angle,lift,f in poses:
            if (self.fast or self.subset) and nm not in ('park','above','contact'): continue
            self.arm(angle,lift);tip=self.anchor('Stylus tip')
            m['deck']['arm'].append({'name':nm,'frame':f,'yawDeg':angle,'liftDeg':lift,
                'tip':self.xy(tip),'tipM':rounded(tip),'pivot':self.xy(self.anchor('Arm yaw')),
                'clearanceM':round(tip.z-self.seat.z-.0009,6),'sprite':self.sprite('deck/arm-'+nm,[ARM])})
        m['animation']['armClips']={'cue':['park','lift','swing-1','swing-2','above','lower','contact'],
            'play':['contact','sweep-mid','sweep-end'],'return':['sweep-end','return-lift','return-mid','swing-2','lift','park'],
            'cancelCue':'reverse traversed cue samples','returnFromMidTrack':'raise at current yaw then interpolate to lifted return path'}
    def aperture(self,enable):
        o=D['Runtime cover | calibration']
        if not hasattr(self,'artmat'):
            self.artmat=o.data.materials[0]
            self.mask=bpy.data.materials.new('Export only | artwork window');self.mask.use_nodes=True
            ns=self.mask.node_tree.nodes; out=next(n for n in ns if n.type=='OUTPUT_MATERIAL')
            self.mask.node_tree.links.new(ns.new('ShaderNodeHoldout').outputs[0],out.inputs['Surface'])
        o.data.materials[0]=self.mask if enable else self.artmat
    def shelf_cam(self,t,family):
        # The original CASE_META projected axes fix the azimuth and elevation.
        az=math.radians(36.0)*(1-t); el=math.radians(39.9*(1-t)+30*t)
        eye=Vector((math.sin(az)*math.cos(el),-math.cos(az)*math.cos(el),math.sin(el)))
        if family=='hero': eye=Vector((0,-1,0))
        self.cam.data.type='ORTHO';self.cam.location=self.j0+eye*2
        self.cam.rotation_euler=(-eye).to_track_quat('-Z','Y').to_euler()
        self.cam.data.ortho_scale={'shelf':.482,'inspect':.482,'hero':.435}[family]
        n={'shelf':1200,'hero':1000,'inspect':1800}[family]
        self.canvas(n,n);self.update()
    def library(self):
        self.m['fallback']=self.packed('missing.png','shelf/missing.png')
        self.aperture(True);groups=[REAR,FRONT,'Proof artwork']
        self.s.cycles.samples=4
        self.m['shelf']={}
        for name,fam,t in [('array','shelf',0),('hero','hero',1)]:
            self.shelf_cam(t,fam);j=self.jacket()
            for state in ['clear','frost']:
                p=bpy.data.materials['Uncoated chalk board']
                node=next(n for n in p.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
                old=node.inputs['Base Color'].default_value[:]
                if state=='frost': node.inputs['Base Color'].default_value=(.27,.27,.26,1)
                j[state]=self.sprite('shelf/'+name+'-'+state,groups)
                node.inputs['Base Color'].default_value=old
            j['axes']={k:rounded(Vector(self.local(self.j,v))-Vector(j['center'])) for k,v in
                       [('x',(.07875,0,0)),('y',(0,.07875,0)),('z',(0,0,.07875))]}
            self.m['shelf'][name]=j
        self.m['inspect']=[]
        for i in ([0,30,59] if self.subset else range(60)):
            t=i/59;self.shelf_cam(t,'inspect')
            # Smooth exposure only near the end of the turn.
            u=max(0,min(1,(t-.70)/.30));u=u*u*(3-2*u)
            self.pose(self.j0.lerp(self.rest,u),90)
            self.m['inspect'].append(dict(index=i,**self.jacket(),shell=self.sprite(f'inspect/inspect-{i:02}',groups+[DISC])))
        self.aperture(False)
    def room(self):
        ref=json.loads((ROOT/'theme/assets/render/room/cream/light/room.json').read_text())
        camera=ref['camera'];w,h=ref['size'];self.canvas(w,h)
        self.cam.data.type='PERSP';self.cam.data.sensor_fit='HORIZONTAL';self.cam.data.sensor_width=36
        self.cam.data.lens=camera['f']*36/w
        # Unit conversion assigns a square 4.0 Room-unit face to the 315 mm LP.
        unit=.315/4; forward=Vector(camera['fwd']);right=Vector(camera['right']);up=Vector(camera['up'])
        self.cam.rotation_euler=Matrix([right,up,-forward]).transposed().to_euler()
        reference_origin=Vector(camera['pos'])*unit
        self.cam.location=reference_origin
        self.aperture(True)
        m=self.m['room']={'reference':'cream/light six-level perspective rig','size':[w,h],'camera':camera,
            'box':[2,.00395/unit,4],'cover':[-.1566/unit,.0009/unit,.1566/unit,.3141/unit,-.00403/unit],
            'dx':ref['dx'],'dy':ref['dy'],'metresPerUnit':unit,'levels':[],
            'inspect':'fade in the terminal inspection frame (no extra turn)','samples':'depth measured along camera forward'}
        depths=[('L'+str(i),a['depth']) for i,a in enumerate(ref['levels'])]
        depths.append(('selected',ref['sel']['depth']))
        for k,depth in depths:
            if self.subset and k not in ['L0','L5','selected']: continue
            # Translate eye and target together conceptually, keeping the optical axis fixed in world space.
            # Keep the jacket at the studio lights and move the eye to the specified depth.
            self.cam.location=self.j0-forward*(depth*unit)
            self.update()
            fit={n:self.local(self.j,pt) for n,pt in {'A':(-.1575,-.00395,.1575),'B':(.1575,-.00395,.1575),
                 'C':(-.1575,-.00395,-.1575),'D':(-.1575,.00395,.1575)}.items()}
            j=self.jacket();layers={}
            names={'side':['Bound spine'],'top':['Top fold'],'front':['Face board','Open lip','Runtime cover | calibration']}
            for n,objs in names.items():
                layers[n]=self.sprite(f'room/{k}-{n}',[FRONT,REAR,'Proof artwork'],set(objs))
            layers['haze']=self.sprite(f'room/{k}-haze',[FRONT,REAR])
            self.blur_haze(layers['haze'],max(1.2,depth*.027))
            if k=='selected':
                layers['selected']=self.sprite('room/sel',[FRONT,REAR,'Proof artwork'])
            m['levels'].append(dict(name=k,depth=depth,fit=fit,**j,layers=layers))
        m['selected']='selected'
        m['inspection']={'mode':'fade','frame':self.m['inspect'][-1],'durationMs':220}
        self.aperture(False)
    def blur_haze(self,sprite,sigma):
        import OpenImageIO as oiio
        path=str(self.out/sprite['png'])
        source=oiio.ImageBuf(path)
        kernel=oiio.ImageBufAlgo.make_kernel('gaussian',sigma*4+1,sigma*4+1)
        result=oiio.ImageBufAlgo.convolve(source,kernel)
        if not result.write(path): raise RuntimeError(result.geterror())
    def run(self):
        self.gesture()
        if not self.fast:
            self.library();self.room()
        (self.out/'vinyl.json').write_text(json.dumps(self.m,indent=1),encoding='utf-8')
        print('VINYL EXPORT COMPLETE',self.mode,len(self.seen),self.out,flush=True)

def main():
    p=argparse.ArgumentParser();p.add_argument('--mode',default='full',choices=['full','test','blockout','verify'])
    p.add_argument('--out',type=Path)
    args=p.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
    out=args.out or (ROOT/'theme/assets/render/vinyl' if args.mode=='full' else Path(tempfile.gettempdir())/'vhinel-checks'/args.mode)
    Export(out,args.mode).run()

if __name__=='__main__': main()

