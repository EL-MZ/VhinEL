"""Build the isolated model in Blender. The two passes allow review before detailing."""
import bpy, math
from pathlib import Path
from mathutils import Vector
from math import sin, cos, pi, radians
from bpy_extras.object_utils import world_to_camera_view

HERE = Path(__file__).resolve().parent
TITLE = 'VHINEL Vinyl Archive'
JX, JZ = -.318, .209
DX = .205
SEAT = .058
ALPHA = radians(30)
GROUPS = ['Jacket rear', 'Jacket front', 'Disc surface', 'Deck base', 'Spindle foreground',
          'Arm', 'Contact shadow', 'Proof artwork', 'Proof label', 'Rig and anchors', 'Studio']

def group(name):
    return scene.collection.children[name]

def attach(obj, name, where, parent=None, pos=None, mat=None):
    obj.name = name
    for coll in list(obj.users_collection):
        coll.objects.unlink(obj)
    group(where).objects.link(obj)
    if parent: obj.parent = parent
    if pos is not None: obj.location = pos
    if mat: obj.data.materials.append(mat)
    return obj

def empty(name, parent, pos, where='Rig and anchors'):
    o=bpy.data.objects.new(name,None)
    o.empty_display_type='PLAIN_AXES'
    o.empty_display_size=.009
    return attach(o,name,where,parent,pos)

def material(name, rgb, rough=.45, metal=0):
    m=bpy.data.materials.new(name)
    m.diffuse_color=(*rgb,1)
    m.use_nodes=True
    p=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
    p.inputs['Base Color'].default_value=(*rgb,1)
    p.inputs['Roughness'].default_value=rough
    p.inputs['Metallic'].default_value=metal
    return m

def bevel(o,r):
    if r:
        b=o.modifiers.new('Machined radius','BEVEL')
        b.width=r; b.segments=4
        w=o.modifiers.new('Face normals','WEIGHTED_NORMAL')
        w.keep_sharp=True
    return o

def box(name,g,p,loc,dims,mat,r=.001):
    bpy.ops.mesh.primitive_cube_add(size=1)
    o=attach(bpy.context.object,name,g,p,loc,mat)
    for v in o.data.vertices:
        for a in range(3): v.co[a]*=dims[a]
    return bevel(o,r)

def mesh(name,g,p,loc,verts,faces,mat):
    m=bpy.data.meshes.new(name);m.from_pydata(verts,[],faces);m.update()
    return attach(bpy.data.objects.new(name,m),name,g,p,loc,mat)

def lathe(name,g,p,loc,profile,mat,n=144):
    # A closed radial profile gives both labels and the LP a true centre bore.
    vs=[(r*cos(2*pi*j/n),r*sin(2*pi*j/n),z) for r,z in profile for j in range(n)]
    fs=[(i*n+j,i*n+(j+1)%n,((i+1)%len(profile))*n+(j+1)%n,((i+1)%len(profile))*n+j)
        for i in range(len(profile)) for j in range(n)]
    o=mesh(name,g,p,loc,vs,fs,mat)
    for f in o.data.polygons: f.use_smooth=abs(f.normal.z)<.999
    return o

def ring(name,g,p,loc,ro,ri,h,m,n=128):
    e=min(h*.18,(ro-ri)*.22)
    return lathe(name,g,p,loc,[(ri,-h/2),(ro-e,-h/2),(ro,-h/2+e),(ro,h/2-e),(ro-e,h/2),(ri,h/2)],m,n)

def cylinder(name,g,p,loc,r,h,m,b=.00035):
    bpy.ops.mesh.primitive_cylinder_add(vertices=96,radius=r,depth=h)
    o=attach(bpy.context.object,name,g,p,loc,m)
    for f in o.data.polygons: f.use_smooth=abs(f.normal.z)<.5
    return bevel(o,b)

def rod(name,g,p,a,b,r,m):
    a,b=Vector(a),Vector(b)
    o=cylinder(name,g,p,(a+b)*.5,r,(b-a).length,m,min(r*.20,.0004))
    o.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler()
    return o

def print_text(name,g,p,loc,body,size,mat,rot=(0,0,0)):
    curve=bpy.data.curves.new(name,'FONT');curve.body=body;curve.size=size
    curve.space_character=1.12
    o=attach(bpy.data.objects.new(name,curve),name,g,p,loc,mat)
    o.rotation_euler=rot
    return o

def card(name,g,p,verts,imgname):
    img=bpy.data.images.load(str(HERE/'source'/imgname),check_existing=True);img.pack()
    m=material(name+' ink',(.7,.6,.5),.9)
    ns=m.node_tree.nodes;links=m.node_tree.links
    tex=ns.new('ShaderNodeTexImage');tex.image=img
    sh=next(n for n in ns if n.type=='BSDF_PRINCIPLED')
    links.new(tex.outputs['Color'],sh.inputs['Base Color'])
    links.new(tex.outputs['Alpha'],sh.inputs['Alpha'])
    o=mesh(name,g,p,(0,0,0),verts,[(0,3,2,1)],m)
    uv=o.data.uv_layers.new()
    for l in o.data.loops:
        uv.data[l.index].uv=[(0,1),(1,1),(1,0),(0,0)][l.vertex_index]
    return o

def setup():
    global scene
    if TITLE in bpy.data.scenes: raise RuntimeError('A vinyl authoring scene is already open')
    scene=bpy.data.scenes.new(TITLE)
    bpy.context.window.scene=scene
    scene.unit_settings.system='METRIC'
    for name in GROUPS:
        c=bpy.data.collections.new(name);scene.collection.children.link(c)
    scene.render.engine='CYCLES';scene.cycles.samples=8
    scene.cycles.use_denoising=True
    scene.cycles.transparent_max_bounces=6
    scene.render.film_transparent=True
    scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA'
    scene.render.image_settings.color_depth='8';scene.render.image_settings.compression=45
    scene.view_settings.view_transform='AgX'
    scene.world=bpy.data.worlds.new('Vinyl softbox room');scene.world.use_nodes=True
    bg=next(n for n in scene.world.node_tree.nodes if n.type=='BACKGROUND')
    bg.inputs[0].default_value=(.52,.58,.65,1);bg.inputs[1].default_value=.36
    def light(name,loc,target,energy,size,width,color):
        d=bpy.data.lights.new(name,'AREA');d.energy=energy;d.shape='RECTANGLE'
        d.size=size;d.size_y=width;d.color=color
        o=attach(bpy.data.objects.new(name,d),name,'Studio',pos=loc)
        o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler()
    light('01 | Long silk',(-.40,-.46,.73),(0,0,.08),16,.66,.33,(1,.93,.84))
    light('02 | Silver strip',(.39,.32,.56),(.18,0,.05),23,.48,.10,(.83,.91,1))
    light('03 | Front fill',(.48,-.52,.32),(.2,0,.06),6,.26,.43,(1,.97,.91))
    d=bpy.data.cameras.new('Archive optics');d.type='ORTHO';d.ortho_scale=1.06;d.clip_start=.005
    cam=attach(bpy.data.objects.new('Interaction camera',d),'Interaction camera','Studio')
    aim=Vector((.003,0,.151));cam.location=aim+Vector((0,-cos(ALPHA),sin(ALPHA)))*2
    cam.rotation_euler=(aim-cam.location).to_track_quat('-Z','Y').to_euler()
    scene.camera=cam;scene.render.resolution_x=1440;scene.render.resolution_y=864
    scene.render.resolution_percentage=100
    return scene

def basic():
    s=setup()
    paper=material('Uncoated chalk board',(.59,.56,.48),.86)
    edge=material('Buff paper ply',(.31,.25,.17),.85)
    rubber=material('Soft graphite',(.017,.021,.023),.71)
    black=material('Charcoal ceramic',(.055,.063,.068),.36,.34)
    metal=material('Satin aluminium',(.45,.51,.55),.28,.89)
    wax=material('Pressed black PVC',(.015,.019,.024),.26,.30)
    amber=material('Vermilion enamel',(.79,.20,.045),.41)
    j=empty('Jacket ROOT',None,(JX,0,JZ))
    disc=empty('Record ROOT',None,(JX+.029,0,JZ));disc.rotation_euler.x=pi/2
    deck=empty('Deck ROOT',None,(DX,.024,0));deck.rotation_euler.z=radians(-9)
    yaw=empty('Arm yaw',deck,(.173,.103,.074))
    tilt=empty('Cue lift',yaw,(0,0,0))
    h=.1575
    for nm,y,g in [('Rear board',.0033,'Jacket rear'),('Face board',-.0033,'Jacket front')]:
        box(nm,g,j,(0,y,0),(.315,.0013,.315),paper,.00055)
    box('Bound spine','Jacket front',j,(-h+.001,0,0),(.002,.0068,.315),edge,.00065)
    for nm,z in [('Top fold',h-.0011),('Bottom fold',-h+.0011)]:
        box(nm,'Jacket rear',j,(-.001,0,z),(.313,.006,.0022),paper,.0005)
    box('Open lip','Jacket front',j,(h-.0006,-.00325,0),(.0012,.0015,.314),edge,.0003)
    a=h-.0009
    corners=[(-a,-.00403,a),(a,-.00403,a),(a,-.00403,-a),(-a,-.00403,-a)]
    card('Runtime cover | calibration','Proof artwork',j,corners,'calibration.png')
    for tag,pt in zip(('TL','TR','BR','BL'),corners): empty('Art '+tag,j,pt)
    for tag,pt in zip(('TL','TR','BR','BL'),[(-h,-.0037,h),(-h,.0037,h),(-h,.0037,-h),(-h,-.0037,-h)]): empty('Spine '+tag,j,pt)
    for tag,z in [('top',h),('bottom',-h)]: empty('Mouth '+tag,j,(h,0,z))
    rest=empty('Sleeved centre',j,(.029,0,0))
    free=empty('Released centre',j,(h+.150+.004,0,0))
    disc['radius_m']=.150;disc['label_radius_m']=.049
    ring('LP | rim and bore','Disc surface',disc,(0,0,0),.15,.00365,.0018,wax,192)
    for z,nm in [(.00093,'A'),(-.00093,'B')]:
        ring('Paper label '+nm,'Disc surface',disc,(0,0,z),.049,.00365,.00007,amber)
    for nm,xy in [('X',(.15,0)),('Y',(0,.15))]: empty('Record '+nm,disc,(*xy,0))
    spin=empty('Label rotation',disc,(0,0,.001))
    card('Side A | directional print','Proof label',spin,[(-.049,.049,0),(.049,.049,0),(.049,-.049,0),(-.049,-.049,0)],'side-a.png')
    for nm,pt in [('Spindle seat',(0,0,SEAT)),('Rim X',(.15,0,SEAT)),('Rim Y',(0,.15,SEAT)),('Spindle tip',(0,0,SEAT+.009))]:
        empty(nm,deck,pt)
    # Origin of the deck rig is on the spindle axis, allowing direct local alignment.
    box('Floating graphite plinth','Deck base',deck,(.036,0,.027),(.438,.351,.037),black,.008)
    for x in [-.135,.202]:
        for y in [-.115,.116]: cylinder('Isolation foot','Deck base',deck,(x,y,.007),.019,.014,rubber,.002)
    cylinder('Turned platter rim','Deck base',deck,(0,0,.0486),.153,.0106,metal,.001)
    cylinder('Carbon mat','Deck base',deck,(0,0,.05545),.1508,.0033,rubber,.00065)
    cylinder('Tapered silver spindle','Spindle foreground',deck,(0,0,.061),.0032,.012,metal,.00085)
    cylinder('Bearing housing','Deck base',deck,(.173,.103,.0565),.023,.023,black,.002)
    cylinder('Gimbal collar','Arm',yaw,(0,0,-.002),.014,.014,metal,.001)
    rod('Arm wand','Arm',tilt,(0,.026,0),(-.004,-.167,-.001),.0032,metal)
    box('Headshell','Arm',tilt,(-.009,-.180,-.003),(.014,.034,.008),black,.0018)
    box('Pickup cartridge','Arm',tilt,(-.010,-.19,-.009),(.011,.014,.006),amber,.001)
    rod('Diamond cantilever','Arm',tilt,(-.01,-.19,-.011),(-.011,-.194,-.0151),.0006,metal)
    empty('Stylus tip',tilt,(-.011,-.194,-.0151))
    box('Arm rest','Deck base',deck,(.169,-.02,.057),(.014,.011,.024),rubber,.002)
    # The contact attenuation is a separate, editable, soft radial matte.
    m=material('Vinyl contact attenuation',(.001,.001,.001),1)
    ns=m.node_tree.nodes;lk=m.node_tree.links
    geom=ns.new('ShaderNodeTexCoord');v=ns.new('ShaderNodeVectorMath');v.operation='LENGTH'
    lk.new(geom.outputs['Object'],v.inputs[0])
    ramp=ns.new('ShaderNodeValToRGB');rr=ramp.color_ramp
    rr.elements[0].position=.140;rr.elements[0].color=(.52,.52,.52,1)
    rr.elements[1].position=.155;rr.elements[1].color=(0,0,0,1)
    lk.new(v.outputs['Value'],ramp.inputs[0]);sh=next(n for n in ns if n.type=='BSDF_PRINCIPLED')
    lk.new(ramp.outputs[0],sh.inputs['Alpha'])
    mesh('Contact penumbra','Contact shadow',deck,(0,0,.05718),[(-.158,-.158,0),(.158,-.158,0),(.158,.158,0),(-.158,.158,0)],[(0,1,2,3)],m)
    park_and_key()
    for area in bpy.context.screen.areas:
        if area.type=='VIEW_3D':
            area.spaces.active.region_3d.view_perspective='CAMERA'
            area.spaces.active.overlay.show_overlays=False
    return s

def park_and_key():
    s=scene; s.render.fps=30;s.frame_start=1;s.frame_end=192
    D=bpy.data.objects
    disc=D['Record ROOT'];deck=D['Deck ROOT'];yaw=D['Arm yaw'];tilt=D['Cue lift'];spin=D['Label rotation']
    bpy.context.view_layer.update()
    rest=D['Sleeved centre'].matrix_world.translation.copy()
    free=D['Released centre'].matrix_world.translation.copy()
    seat=D['Spindle seat'].matrix_world.translation.copy()
    for f,loc,angle in [(1,rest,90),(23,rest.lerp(free,.43),90),(42,free,90),(63,seat+Vector((0,0,.088)),26),(82,seat,0),(192,seat,0)]:
        disc.location=loc;disc.rotation_euler.x=radians(angle)
        disc.keyframe_insert(data_path='location',frame=f);disc.keyframe_insert(data_path='rotation_euler',frame=f)
    for f,ang in [(1,0),(82,0),(96,0),(119,-14.5),(134,-14.5),(188,-26),(192,-26)]:
        yaw.rotation_euler.z=radians(ang);yaw.keyframe_insert(data_path='rotation_euler',frame=f)
    for f,ang in [(1,-1.7),(82,-1.7),(96,-6),(119,-6),(134,0),(192,0)]:
        tilt.rotation_euler.x=radians(ang);tilt.keyframe_insert(data_path='rotation_euler',frame=f)
    for f,ang in [(1,0),(134,0),(188,-360),(192,-386.6667)]:
        spin.rotation_euler.z=radians(ang);spin.keyframe_insert(data_path='rotation_euler',frame=f)
    for n,f in [('Inspect',1),('Half extracted',23),('Free',42),('Above spindle',63),('Seated',82),('Stylus contact',134),('Playing',149)]:
        s.timeline_markers.new(n,frame=f)
    s.frame_set(1)

def detail():
    global scene
    scene=bpy.data.scenes[TITLE]; D=bpy.data.objects; M=bpy.data.materials
    g='Deck base'; deck=D['Deck ROOT'];disc=D['Record ROOT'];tilt=D['Cue lift'];yaw=D['Arm yaw']
    metal=M['Satin aluminium']; black=M['Charcoal ceramic'];rub=M['Soft graphite'];amber=M['Vermilion enamel']
    for ob in group('Disc surface').objects:
        for face in ob.data.polygons: face.use_smooth=abs(face.normal.z)<.999
    for mat,color in [(black,(.022,.027,.030)),(rub,(.009,.011,.013))]:
        node=next(n for n in mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
        node.inputs['Base Color'].default_value=(*color,1)
    for x in (.1637,.1744):
        box('Rest fork',g,deck,(x,-.019,.072),(.003,.009,.013),rub,.0013)
    pale=material('Warm ivory screen ink',(.77,.77,.66),.58)
    mach=material('Brushed titanium',(.26,.29,.31),.31,.86)
    wax=M['Pressed black PVC'];ns=wax.node_tree.nodes;lk=wax.node_tree.links
    tc=ns.new('ShaderNodeTexCoord');v=ns.new('ShaderNodeVectorMath');v.operation='LENGTH';lk.new(tc.outputs['Object'],v.inputs[0])
    def op(kind,a,b):
        n=ns.new('ShaderNodeMath');n.operation=kind
        if isinstance(a,(int,float)): n.inputs[0].default_value=a
        else: lk.new(a,n.inputs[0])
        if isinstance(b,(int,float)): n.inputs[1].default_value=b
        else: lk.new(b,n.inputs[1])
        return n.outputs[0]
    radial=v.outputs['Value']
    phase=op('MULTIPLY',radial,3600)
    ripple=op('SINE',phase,0)
    sh=next(n for n in ns if n.type=='BSDF_PRINCIPLED')
    lk.new(op('ADD',.29,op('MULTIPLY',.036,ripple)),sh.inputs['Roughness'])
    # Circumferential tangent keeps the broad specular lobes locked to the room.
    tan=ns.new('ShaderNodeTangent');tan.direction_type='RADIAL';tan.axis='Z'
    lk.new(tan.outputs[0],sh.inputs['Tangent']);sh.inputs['Anisotropic'].default_value=.78
    separator=material('Unmodulated track lands',(.016,.020,.024),.21,.35)
    for i,r in enumerate([.056,.075,.096,.116,.133,.1468,.1485]):
        ring('Band land %02d'%i,'Disc surface',disc,(0,0,.00093),r,r-.00065,.000045,separator,256)
    for r in [.057,.074,.10,.127,.146]:
        ring('Mat rib','Deck base',deck,(0,0,.05706),r,r-.00065,.00013,rub)
    for z in [.0464,.0492,.0518]:
        ring('Platter lathe line',g,deck,(0,0,z),.15308,.15265,.00044,mach,192)
    box('Recessed bottom fascia',g,deck,(.036,0,.014),(.435,.348,.012),rub,.003)
    for x in [-.159,.232]:
        for y in [-.151,.151]:
            cylinder('Recessed fixing',g,deck,(x,y,.0456),.0033,.00055,mach)
            box('Screw slot',g,deck,(x,y,.04596),(.0034,.0006,.0003),rub,.0001)
    for x,r,nm in [(-.145,.011,'Motor'),(-.115,.005,'Speed selector')]:
        cylinder(nm+' collar',g,deck,(x,-.137,.0463),r+.0012,.002,mach)
        cylinder(nm+' key',g,deck,(x,-.137,.048),r,.0025,black)
    cylinder('Run lamp',g,deck,(-.145,-.137,.0494),.0023,.0006,amber)
    print_text('Speed legend',g,deck,(-.129,-.157,.04565),'33  /  45',.0051,pale)
    print_text('Motor legend',g,deck,(-.165,-.118,.04565),'START',.0042,pale)
    # Tangential control strip and vernier markings.
    box('Pitch fader recess',g,deck,(.216,-.048,.0458),(.006,.088,.001),rub,.001)
    for i in range(17):
        box('Vernier %02d'%i,g,deck,(.225,-.086+i*.0048,.04565),(.005 if i%4==0 else .0028,.00065,.0003),pale,.0001)
    box('Pitch carriage',g,deck,(.216,-.045,.0486),(.021,.010,.006),mach,.0014)
    box('Pitch index',g,deck,(.216,-.045,.05175),(.014,.0008,.0004),pale,.0001)
    print_text('Deck wordmark',g,deck,(.157,-.132,.0457),'VHINEL',.013,pale)
    print_text('Model legend',g,deck,(.157,-.144,.0457),'R-01   /   DIRECT DRIVE',.0039,pale)
    # Counterweight with machined ridges and visible gimbal bearings.
    rod('Counterweight spindle','Arm',tilt,(0,.004,0),(0,.047,0),.0034,mach)
    rod('Tracking counterweight','Arm',tilt,(0,.018,0),(0,.043,0),.0125,black)
    for i in range(5):
        y=.021+i*.004
        rod('Weight knurl','Arm',tilt,(0,y,0),(0,y+.001,0),.0127,mach)
    rod('Knife edge gimbal','Arm',yaw,(-.018,0,0),(.018,0,0),.006,mach)
    rod('Finger lift','Arm',tilt,(-.006,-.181,0),(.012,-.184,.004),.0011,metal)
    for x in [-.005,-.013]:
        cylinder('Headshell screw','Arm',tilt,(x,-.178,.0011),.0015,.001,metal)
    for nm in ['missing.png','bright.png','dark.png']:
        im=bpy.data.images.load(str(HERE/'source'/nm),check_existing=True);im.pack();im.use_fake_user=True
    # Link fallback to the file even when writing a single scene datablock.
    scene['Fallback image']=bpy.data.images['missing.png']
    scene['Bright proof image']=bpy.data.images['bright.png']
    scene['Dark proof image']=bpy.data.images['dark.png']
    shadow=D['Contact penumbra']
    for f,hidden in [(1,True),(62,True),(63,False)]:
        shadow.hide_render=hidden
        shadow.keyframe_insert(data_path='hide_render',frame=f)
    action=D['Label rotation'].animation_data.action
    for layer in action.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                for fc in bag.fcurves:
                    for k in fc.keyframe_points: k.interpolation='LINEAR'
    scene.frame_set(1)

def save(path):
    scene.frame_set(1)
    bpy.data.libraries.write(str(path),{scene},fake_user=True,compress=True)

def finish():
    """Tune the radial reflection and orient the spine's UV basis for the Room camera."""
    wax=bpy.data.materials['Pressed black PVC'];ns=wax.node_tree.nodes;lk=wax.node_tree.links
    coord=next(n for n in ns if n.type=='TEX_COORD')
    shading=next(n for n in ns if n.type=='BSDF_PRINCIPLED')
    tangent=ns.new('ShaderNodeVectorMath');tangent.operation='CROSS_PRODUCT'
    lk.new(coord.outputs['Object'],tangent.inputs[0]);tangent.inputs[1].default_value=(0,0,1)
    direction=ns.new('ShaderNodeVectorTransform');direction.vector_type='VECTOR'
    direction.convert_from='OBJECT';direction.convert_to='WORLD';lk.new(tangent.outputs[0],direction.inputs[0])
    unit=ns.new('ShaderNodeVectorMath');unit.operation='NORMALIZE';lk.new(direction.outputs[0],unit.inputs[0])
    dot=ns.new('ShaderNodeVectorMath');dot.operation='DOT_PRODUCT';lk.new(unit.outputs[0],dot.inputs[0])
    dot.inputs[1].default_value=(-.66,-.26,.70)
    absolute=ns.new('ShaderNodeMath');absolute.operation='ABSOLUTE';lk.new(dot.outputs['Value'],absolute.inputs[0])
    ramp=ns.new('ShaderNodeValToRGB');ramp.color_ramp.interpolation='EASE'
    ramp.color_ramp.elements[0].color=(.058,.065,.076,1)
    ramp.color_ramp.elements[1].position=.43;ramp.color_ramp.elements[1].color=(.012,.014,.018,1)
    lk.new(absolute.outputs[0],ramp.inputs[0]);lk.new(ramp.outputs[0],shading.inputs['Base Color'])
    for k in ('TL','TR','BR','BL'):
        ob=bpy.data.objects['Spine '+k];ob.location.y=abs(ob.location.y)*(1 if k in ('TL','BL') else -1)

def round_helpers(scene):
    """The edit viewport must show the same round openings as the composited layers."""
    shadow=bpy.data.objects['Contact penumbra']
    label=bpy.data.objects['Side A | directional print']
    n=192
    for o,outer,inner in [(shadow,.156,0),(label,.049,.00365)]:
        vs=[(r*cos(i*2*pi/n),r*sin(i*2*pi/n),0) for r in (outer,inner) for i in range(n)]
        if inner:
            faces=[(i,(i+1)%n,n+(i+1)%n,n+i) for i in range(n)]
        else:
            vs=vs[:n]+[(0,0,0)]
            faces=[(n,i,(i+1)%n) for i in range(n)]
        mat=o.data.materials[0];old=o.data
        new=bpy.data.meshes.new(o.name+' | circular mesh')
        new.from_pydata(vs,[],faces);new.update();new.materials.append(mat);o.data=new
        if not old.users: bpy.data.meshes.remove(old)
        if o==label:
            uv=new.uv_layers.new()
            for loop in new.loops:
                x,y,_=vs[loop.vertex_index]
                uv.data[loop.index].uv=(.5+x/(2*outer),.5+y/(2*outer))
            mat.diffuse_color=(.72,.33,.10,1)
    shadow.hide_set(True)
    shadow.display_type='WIRE'
    shadow['purpose']='Render-only contact attenuation. Isolate the Contact shadow collection to export.'

def standalone():
    """Save a normal startup file from the scene-only transfer produced by the live session."""
    if not bpy.app.background: raise RuntimeError('Use this conversion in background mode')
    scene=bpy.data.scenes[TITLE]
    for window in bpy.context.window_manager.windows: window.scene=scene
    bpy.data.objects['Contact penumbra'].hide_set(True)
    for other in list(bpy.data.scenes):
        if other!=scene and not len(other.objects): bpy.data.scenes.remove(other)
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type=='VIEW_3D':
                space=area.spaces.active;space.region_3d.view_perspective='CAMERA'
                space.region_3d.view_camera_zoom=6
                space.overlay.show_overlays=False;space.shading.type='MATERIAL'
                space.shading.use_scene_lights=True;space.shading.use_scene_world=True
    scene.frame_set(42);scene.cycles.samples=24
    bpy.context.preferences.filepaths.save_version=0
    bpy.ops.wm.save_as_mainfile(filepath=str(HERE/'vinyl-archive.blend'),compress=True)

def reverse_label(scene):
    face=bpy.data.objects['Side A | directional print']
    back=face.copy();back.data=face.data.copy();back.name='Side B | directional print'
    scene.collection.children['Proof label'].objects.link(back)
    back.location.z=-.002;back.rotation_euler.y=pi
    mat=face.data.materials[0].copy();mat.name='Side B | printed paper';back.data.materials[0]=mat
    img=bpy.data.images.load(str(HERE/'source/side-b.png'),check_existing=True);img.pack()
    next(n for n in mat.node_tree.nodes if n.type=='TEX_IMAGE').image=img

if __name__=='__main__' and bpy.app.background:
    standalone()

