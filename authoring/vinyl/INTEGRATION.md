# VHINEL vinyl archive

### Download the portable update

After downloading the repository, open `VHINEL-foobar-update.zip.001` in 7-Zip with all numbered parts in the same folder. Extract into the portable player's `foobar2000\profile` directory and allow the existing `themes` directory to merge. The separate `VHINEL-asset-pack.zip.001` set contains the authoring pack and opens the same way.

Open `vinyl-archive.blend` to continue editing. It opens on frame 42 with the record clear of the sleeve. Timeline markers locate inspection (1), partial extraction (23), release (42), approach (63), seating (82), stylus contact (134), and playback (149). The scene contains 123 objects and six packed print images. The 300 mm disc has independently editable 98 mm Side A and Side B labels, each with a 7.3 mm bore. The circular contact-shadow helper is hidden in the editing viewport.

## Runtime integration

Array and Room read the vinyl manifest through `theme/js/lib/vinyl-assets.js`. Their shelf renderers retain selection, rails and perspective. `theme/js/vinyl.js` provides the shared pull, transfer, cue, album-art label and Now Spinning view. A centered turntable occupies the stage while the transport remains accessible. The arm follows album duration when the library can identify the album and uses track duration otherwise.

## Placement and drawing

All PNG paths are relative to `vinyl.json`. Coordinates use the full family canvas, with the origin at the top left. Draw a sprite at its crop's left and top, using the crop width and height. Apply the same panel scale and translation to the sprite, its artwork and its hit geometry. The cover quad order is top left, top right, bottom right, bottom left. The interaction canvas is 2880 × 1728 for a representative 1440 × 864 panel. The actual archive is responsive.

| Family | Consumer and draw order |
| --- | --- |
| Shelf and hero | Use the array in `archive.js` and the hero in `lib/album.js`, including the now-playing caller. Draw album art or the missing-art image, then the shell. A holdout creates the artwork aperture. Use sharp artwork and the clear shell for every vinyl album. Array and Room show the selected album title in a floating label. The exported array uses native pixels. Scale its axes, origin and crop together when placing it on the existing rails. |
| Inspection | Use indices 00–59 through lift and turn. Interpolate the four cover corners while crossfading adjacent shells. The terminal frame contains the exposed rim. Map its art corners onto the extraction jacket's corners to establish the handoff. |
| Pull and carry | Draw empty deck, spindle and parked arm, then jacket rear, disc, projected label, jacket front and artwork. Capture the pointer inside `pull.rimHit`. Project its displacement onto `pull.direction`, clamp the fraction, and preserve the original grab offset. The available travel is 282.5 mm. A missed drop reverses the path. |
| Transfer | Use the 12 tilt samples. The first references the fully free disc and the last shares the seated PNG. Interpolate screen position from the actual release. Register adjacent surfaces using their projected disc axes before blending. Offset the hover shadow by its registered center and clip it to the platter. |
| Playback | Draw the base, contact shadow, seated surface, rotating label, spindle and tonearm. Rotate the square label texture in its own plane before mapping it onto `labelQuad`. Angle advances clockwise by 360° per 3.6 seconds in the player, twice the reference period stored in the manifest. Pause holds the angle. The cue clip reaches `contact` at frame 52 of the exported arm timeline. The editable master reaches the same pose at scene frame 134. |
| Room | The first finish uses the cream Room camera's six distance levels and its own selected sample. Choose the nearest depth by log ratio. Fit side, top and front with ADC, ABD and ABC as in `room.js`. The full selected shell, haze and terminal inspection fade are in the manifest. The existing Room plate can be reused. |

Projected disc and label axes are **endpoints**. Subtract the associated center to obtain each basis vector. `dropEllipse` supplies the generous acceptance region. The seating point supplies the exact final transform. For picking jacket silhouettes, use the projected geometry instead of the legacy CD box constants.

## Regenerate

From the RhinE checkout in PowerShell, with Blender 5.0.1 installed:

```powershell
$blender = 'C:\Program Files\Blender Foundation\Blender 5.0\blender.exe'
& $blender -b authoring/vinyl/vinyl-archive.blend --python-exit-code 7 -P authoring/vinyl/export.py
```

The exporter reads the saved scene and the checkout's Room camera metadata. It writes the known vinyl pack paths. To repeat representative renders, append `-- --mode verify --out "$env:TEMP/vhinel-check"`. Run `python authoring/vinyl/verify.py --rerenders "$env:TEMP/vhinel-check"` with Pillow and NumPy installed. `proof.py --ffmpeg <path-to-ffmpeg.exe>` regenerates the proof sheets and movie. The original print masters and their generator are in `source/`.

## Verification

| Check | Result |
| --- | --- |
| Saved file reopened | Blender 5.0.1, correct opening scene and frame, all six packed images matched source bytes |
| Asset contract | 123 RGBA PNGs and one manifest, 14.63 MiB total. All paths, image dimensions and crop bounds passed |
| Coverage | 60 inspection frames, 12 transfer samples, 11 arm poses, six Room depths plus selected |
| Independent render check | 33 representative PNGs from the reopened scene matched the delivered decoded RGBA pixels |
| Handoffs | Seated center error 0.00 display pixels. Final inspection to extraction art corners agreed within 0.001 display pixels. The center pixel was transparent in the seated surface and opaque in the spindle layer |
| Tonearm | Contact radius 140.291 mm, contact clearance 0.000 mm, raised swing clearance 20.361 mm |
| Interaction | Partial pull cancellation, missed-drop return, pause, and one complete turn returned pixel-exact endpoint images. The 12-second H.264 preview uses the delivered sprites and metadata |
| Visual checks | Six-pose blockout reviewed before detailing. Final light and dark panels, four artwork cases, contact markers, the original array rails, and near/far Room stacking reviewed in the reference compositor |
| Decoded memory | Eight active playback layers total 13.52 MiB before runtime album art and render targets. The largest adjacent inspection pair uses 10.45 MiB. Eagerly decoding every asset would use 374.58 MiB |

The original reference checkout was `e068aeb6d1d97af479ab9d74fce670350a2d926e`. Blackout uses a 600² logical array with a 1200² source PNG, a 1000² hero, and 60 cropped images on an 1800² inspection canvas. Its array origin is (300, 431.62) and center is (300, 300). The vinyl array reproduces its projected axis directions. Room uses a separate 2560 × 1580 perspective reference and a single-frame inspection fade. A separate foobar2000 2.26 portable instance exercised both archive layouts, the native Direct2D album-art mask, partial and cancelled pulls, missed drops, successful cue-triggered playback, pause/resume and screensaver dismissal using a silent WAV.

