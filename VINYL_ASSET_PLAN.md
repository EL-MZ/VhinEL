# RhinE vinyl archive · Blender MCP production brief for Sol 6.2

## Assignment

Build an editable Blender scene and a reproducible set of transparent renders for this interaction in RhinE. The listener browses LP jackets, lifts one from the shelf, pulls the record out by its rim, carries it to a turntable, and watches the stylus land. Album artwork comes from foobar2000 at runtime. One jacket and one record must serve the whole library.

Use the local Blender MCP connection to construct and inspect the scene. Deliver the art, exporter, placement metadata, and a visual proof of the sequence. Production JavaScript and playback wiring are a subsequent implementation task. Work in the RhinE checkout containing this brief. Preserve existing user work, especially changes to the archive, queue, and player.

## 1. Establish the reference before modeling

1. Through MCP, request the Blender version, active scene, current file path, and object list. Confirm that a viewport capture or test render works. If the connection fails, report the failing operation and Blender add-on status. Avoid clearing the user's active scene. Use a separate project file for the vinyl set.
2. Read `theme/js/archive.js` for shelf selection, lift, turn, compositing, and hit testing. Read `theme/js/room.js` for the perspective shelf layout. Search `theme/js` for consumers of `hero-clear.png`, `array-clear.png`, and `CASE_META` to identify every view that needs jacket art. Record the checked-out revision.
3. Inspect `theme/assets/render/case/blackout/case.json` alongside its array, hero, and inspection renders. The reference set includes 60 numbered inspection images. Measure its frame dimensions and inspect the cover quad, axes, origin, and center. Use the existing coordinate ordering wherever the same consumer will read the data. Check Room's own metadata and visible face files separately.
4. Use the existing archive screenshots and both light and dark backgrounds as art direction. Keep the cover the most legible surface. Proposed finish: charcoal plinth, brushed metal platter rim, satin black vinyl, uncoated paper jacket, and a single accent on the stylus or label. Build one coherent finish first.

## 2. Build the master scene

Use meters and Z-up. Start with a 0.300 m disc and roughly 0.315 m square jacket as modeling targets. Lay the deck flat with its spindle axis along +Z. Place the jacket upright with its opening on the viewer's right in the inspection pose. Give the sleeve, record, and deck independent parent transforms so the same objects can be used by every camera.

| Asset | Construction | Acceptance at display size |
| --- | --- | --- |
| LP jacket | Separate front, rear, and spine. Add subtle board thickness, a visible opening, a small bevel, and a full-bleed square artwork plane. Reserve spine space for artist/title. Create a neutral missing-art treatment. | An asymmetrically marked test cover reads upright. All four corners remain visible. The lip occludes the record during extraction. |
| LP record | Thin beveled disc, real spindle hole, lead-in, banded groove area, run-out, two paper labels. Use a procedural groove material with subdued variation. Make the label field and its off-center print independently compositable. | The record reads as vinyl against either theme. Grooves survive downsampling without flicker. Label rotation is visible and centered. |
| Deck and platter | Body, isolation feet, platter rim, rubber mat, spindle, arm rest, and restrained controls. Model enough sidewall to show height at the playing angle. Keep the spindle tip accessible as a foreground layer. | An empty deck looks complete. A seated disc is concentric with the mat and casts a small contact shadow. |
| Tonearm | Pivot, counterweight, arm tube, headshell, cartridge, and stylus. Parent the assembly to a yaw pivot. Give the lift its own tilt pivot. Place a marker at the stylus tip. | The tip clears the platter during travel and lands on the outer groove. The parked arm fits its rest. |
| Lighting and shadow | Broad fixed lights to reveal paper edges, metal, and the vinyl sheen. Separate the disc shadow from the empty deck. Bake shadows within the static assembly where practical. | The deck looks grounded when empty and loaded. A highlight stays in room space as the printed label turns. |

Start with procedural materials and original geometry so the scene opens on another machine. Pack any required textures. Use an unmistakable temporary cover with labeled corners and an off-center arrow on the test label. Keep those calibration graphics in the proof collection.

## 3. Prove the gesture with a low-resolution blockout

Make this pass before detailed grooves, arm hardware, Room exports, or full-resolution sequences. Use a fixed inspection camera with the upright jacket at left and an unobstructed platter at right. Render six poses at the actual archive panel aspect ratio.

| Pose | What the proof must show |
| --- | --- |
| Inspect | Front cover readable, a small crescent of record exposed at the opening, deck identifiable. |
| Half extracted | The user can reverse the pull. The visible arc grows continuously and the label stays behind the jacket until it clears the lip. |
| Free | The trailing edge clears the jacket. The disc follows the grabbed point without jumping under the cursor. |
| Above spindle | The record tilts from its carry pose toward the deck plane. A soft shadow helps the listener judge the drop target. |
| Seated | The hole meets the spindle. The final transfer pose matches the first seated pose exactly in size, center, and orientation. |
| Playing | The arm is down, the label has visibly advanced, and the groove highlight still points toward the light. |

Assemble these from the proposed runtime layers, with a simulated pointer path and a reverse pull. A single beauty render cannot test occlusion or registration. Inspect at normal UI size. Adjust camera angle, deck placement, or exposed rim width until the action reads clearly.

## 4. Render the complete asset set

Use transparent RGBA PNGs and a shared canvas/origin for layers that move together. If cropping saves significant space, export the crop offset for each frame. Freeze the camera, color transform, resolution, and pixel aspect for each render family. Use the existing array/hero/inspection resolutions as the starting point. Size the deck family for its largest intended panel footprint at 2× display density.

| Family | Outputs | Runtime use |
| --- | --- | --- |
| Shelf and hero jacket | Array and hero jacket shells, cover/spine projection data, and the inactive appearance required by the existing loader. Reuse shelf rails if spacing and silhouette work in the blockout. | Draw many lightweight jackets with per-album artwork. |
| Inspection turn | Matching numbered jacket frames with per-frame cover and spine coordinates. Match the loader's frame count and indexing if reusing it. Include the small exposed record rim by the end of the turn. | Preserve the shelf lift and smooth transition to the frontal jacket. |
| Extraction and carry | Jacket rear and front/lip layers, projected art surface, free record face, label overlay, and rim hit region. | Draw rear, record, then jacket front/art/lip. Translate the record continuously along the sleeve axis. Pull distance follows the pointer and supports reversal without an image sequence. |
| Drop and settle | A short sampled tilt sequence from the free pose to the deck pose. Export disc silhouette, center, label projection, and shadow information for each sample. Start with 12 poses and refine only where motion steps visibly. | The UI interpolates travel from the actual release point to the spindle while the sprite supplies the change in orientation. |
| Playback deck | Empty deck base, disc contact shadow, seated disc surface, independent rotating label artwork, spindle foreground, and separate arm poses. Include arm rest, lift, swing, lower, playing sweep, and return coverage. | Spin the label in the record's own plane before projecting it onto the deck. Share the same disc surface and static reflections across rotation angles. Support pause, resume, and track changes. |
| Room shelves | Vinyl front, spine/side, and top face renders for the camera samples and visible faces actually requested by the Room loader. Include projection/extent data and a jacket inspection transition if that layout uses a distinct one. | Preserve correct perspective and occlusion in near and far rows. Verify against the existing Room camera before exporting the full sample set. |

For the first pass, stage the new files under `theme/assets/render/vinyl/` in `shelf/`, `inspect/`, `transfer/`, `deck/`, and `room/`. Record how each file maps to a consumer. Legacy skin variants can be a later art pass. Deliver both light- and dark-background proofs for this finish.

## 5. Export a coordinate contract

Place named Blender empties at the jacket art corners, sleeve opening endpoints, rest and fully extracted disc centers, platter spindle, deck rim axes, tonearm pivot, and stylus tip. Project them from Blender's evaluated camera and object transforms for every animated frame. Store the metadata next to the PNGs in `vinyl.json`, with a schema version and paths relative to the manifest.

- **Frame space** — declare image width and height, pixel origin at top left, positive X right, positive Y down, crop offset, and the order of every polygon's corners. Convert coordinates once in the exporter. Store four artwork corners even when the frontal view looks square.
- **Jacket** — store its artwork quad, spine quad, opening segment, extraction direction, allowed pull travel, and the exposed rim hit region. Derive travel from geometry so release timing still works after resizing the jacket.
- **Record and deck** — store the record center and radius in its own plane, projected disc and label axes or quads, spindle position, platter drop ellipse, and the seated transform. Model a generous drop area separately from the precisely aligned final pose.
- **Arm and transfer** — store the pivot, stylus tip, contact frame, disc center and shadow registration by pose. Name the frame or normalized time where playback can start. Record z-order per composite so the arm and spindle appear in front of the loaded record.
- **Animation** — declare frame order, duration, loop rules, reversible clips, and endpoint conventions. Use elapsed time for a proposed 33⅓ RPM loop, one revolution per 1.8 seconds. The interactive pull is position-driven. Pause freezes the current angle.

Export from a repeatable Blender Python script. Use MCP to run a small test batch, inspect the resulting images, then run the full export from the saved scene. Provide a working Windows command to regenerate the pack using Blender in background mode. Reruns should replace only generated outputs belonging to this pack.

## 6. Verify and deliver

1. Reopen the saved blend, render a representative frame from each family, and confirm all material dependencies resolve. Verify that every manifest path, frame count, and image dimension matches the exported files.
2. Composite the calibration art, then a bright cover, a dark cover, and the missing-art fallback. Check corners through the turn and partial pull. Inspect light and dark backgrounds for alpha halos, doubled shadows, and color changes where baked art meets runtime overlays.
3. Overlay projected markers on renders. Aim for at most one display pixel between the seated disc center and spindle at the target panel size. Check arm clearance and inspect the stylus at contact. Flip between the last inspect/first extraction and last transfer/first seated frames to catch a jump.
4. Preview extraction, cancellation, a successful drop, a missed drop with return, pause/resume, and a full label revolution at normal speed. Use the same transparent layers and placement metadata the panel will consume. Verify a full revolution closes smoothly. Record which checks were done in a compositor and which, if any, ran inside foobar2000.
5. Build a representative shelf row and inspect near and far Room rows. Check artwork orientation, spine legibility, stacking, and clipping. Measure file count, total on-disk size, and decoded RGBA memory for the active frame set. Reduce oversized transparent canvases or redundant frames where justified.

Deliver the editable `vinyl-archive.blend`, exporter, rendered pack and manifest, a labeled contact sheet, a short interaction preview, and a brief integration note listing draw order, anchor conventions, regeneration command, and verification results. Keep authoring sources and proofs outside the installed theme asset directory. A successful handoff lets another developer change the cover or rerender the deck without manually moving a single hotspot.
