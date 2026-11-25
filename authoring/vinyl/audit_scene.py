"""Run with Blender -b scene.blend -P audit_scene.py -- audit.json."""
import bpy, hashlib, json, sys
from pathlib import Path
s=bpy.context.scene
assert s.name=='VHINEL Vinyl Archive'
assert s.camera and s.frame_current==42
source=Path(__file__).resolve().parent/'source'
files={}
for im in bpy.data.images:
    if im.source=='FILE' and im.type=='IMAGE':
        assert im.packed_file,im.name
        raw=im.packed_file.data
        assert raw==(source/im.name).read_bytes(),im.name
        files[im.name]=hashlib.sha256(raw).hexdigest()
assert len(files)==6
o=bpy.data.objects
assert o['Deck wordmark'].data.body=='VHINEL'
assert o['Contact penumbra'].hide_get() and len(o['Contact penumbra'].data.vertices)>100
for n in ['Paper label A','Paper label B','Side A | directional print','Side B | directional print']:
    assert o[n].type=='MESH' and abs(o[n].dimensions.x-.098)<1e-4
for side in 'AB':
    p=o[f'Side {side} | directional print']
    radii=[(v.co.x**2+v.co.y**2)**.5 for v in p.data.vertices]
    assert abs(min(radii)-.00365)<1e-5 and abs(max(radii)-.049)<1e-5
report={'scene':s.name,'version':bpy.app.version_string,'objects':len(s.objects),'openingFrame':s.frame_current,
        'markers':{k.name:k.frame for k in s.timeline_markers},'packedImagesSHA256':files,
        'wordmark':o['Deck wordmark'].data.body,'labelDiameterMm':98,'labelBoreMm':7.3,'squareShadowVisible':False}
print(json.dumps(report,indent=2))
if '--' in sys.argv: Path(sys.argv[sys.argv.index('--')+1]).write_text(json.dumps(report,indent=2))

