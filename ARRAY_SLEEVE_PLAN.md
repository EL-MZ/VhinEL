# Array LP sleeves · implementation brief for Sol 6.2

Make each jacket identifiable by its own print and by its movement as a thin cardboard object. Work in the vinyl Array path. The first review should show one jacket paused nearly edge-on and a mixed pile after three forward flips and one reverse.

## 1. Prove the silhouette first

In `theme/js/vinyl.js`, `cratePose` already rotates the cover about its bottom edge. `drawCrateJacket` adds a lip by moving the two top corners vertically in screen space. Replace that lip with two parallel panels joined around the perimeter. Use temporary contrasting face and edge colors to evaluate the geometry independently of artwork.

- Keep the existing bottom edge as the hinge of the jacket's centre plane. For the existing height direction `z cos(a) + y sin(a)`, the perpendicular thickness direction is `y cos(a) - z sin(a)`. Project this using the same metadata axes as the height. Offset each corner by plus or minus half the thickness along that direction, in model units before screen scaling.
- Start with a thickness of 1% of jacket width. Tune against crate slot spacing and the screenshot at normal panel size. Draw the camera-facing broad panel and visible perimeter faces using consistent winding. As the projected area approaches zero, skip degenerate artwork transforms and keep the edge geometry visible. Check the back with readable lettering in both resting poses.
- Give the closed spine a continuous band of jacket color. Give the opposite opening a narrow dark seam between two paper edges where scale permits. Keep rim highlights faint and directional. At small sizes collapse the seam detail into a single shaded edge. The silhouette should stay slender face-on and occupy a visible band edge-on.

## 2. Give every sleeve its own print

Extend the album-keyed state around `jacketBack` and `coverKey(album)`. Array already requests real back art using art ID 1, guards stale completions, and caps its back-image cache at 48. Preserve that lookup and guard. Track palette source, generated back, and real back separately so a late palette update can never overwrite a scan.

- Trace thumbnail completion from `requestVisibleThumbs` and `thumbOf`. Use a pixel or palette API confirmed in the installed foobar panel host. Work on a small copy, approximately 32 × 32, when a new thumbnail becomes available. Discount the outer 5–10%, group similar colors, and use the largest interior cluster as the base. Choose a distinct accent by color distance and population with a small minimum support so isolated noise cannot win. If the clusters have little chroma, keep the entire design neutral.
- Choose warm light or dark ink by contrast against the base. Put the accent on a short rule if it has insufficient contrast for the title. Keep the title, artist and existing catalogue mark. Use a neutral matte stock for missing art. For the described *Baby Mamas* cover, blue-black, off-white and restrained red are a visual reference, never an album-specific override.
- Use each underlying item's own slightly darkened base for its exposed strip, including items with real back scans. Use the scan at full-face visibility, otherwise the generated print. On reverse, promote the newly exposed jacket to full detail before its printed surface opens into view. Retain small palette values separately from bounded bitmap storage so bitmap eviction does not force repeated sampling during a flip. Invalidate on changed artwork and repaint on arrival. Keep sampling, scan requests and fallback bitmap generation out of the animation loop.

## 3. Make the pile support the motion

In `theme/js/archive.js`, inspect the crate item ordering and `topBack` assignment. Today the code tests only the final sorted item. Identify the foremost eligible back in the forward pile even while an upright or lifted jacket draws later. Render the moving jacket's visible artwork independently of the cheap strip treatment below it.

- Derive resting separation from projected thickness. Check the nearest three sleeves for intersections at the hinge and leading edge. Keep the existing flip cursor, easing and lower pivot so reverse input retraces the same pose. Only adjust the rest offsets if the geometry intersects or visibly floats.
- Add a narrow contact shadow on the receiving jacket, strongest where the two approach and fading as they separate. Draw or clip it within the receiving face, before the casting jacket. Keep the existing rear-board, jackets, front-board paint order. Tune on pale sleeves first, where a repeated black outline is easiest to spot.
- Derive hits from the same visible panels and perimeter faces used to draw. Update the edge-hit consumer if needed. Preserve front-board occlusion, selection markers, hover labels and the inspection launch point. Check that a click on a narrow exposed spine selects the LP it belongs to.

## 4. Review in the portable installation

| Check | Acceptance |
| --- | --- |
| One asymmetric, lettered sleeve at rest, mid-flip, edge-on and reversed | Front and back read correctly. The spine rotates with the artwork. The near edge stays continuous through the face change. |
| Dark, bright, monochrome, missing-art and real-back LPs in one crate | Flip three forward and one back. Each visible strip retains its own color. The newly exposed LP immediately shows its own print or available scan. |
| Late thumbnail, late scan, rapid direction changes and two albums with the same title | Only the matching jacket updates. Real scans keep precedence. No repeated requests or palette extractions during a warmed-up flip. |
| Several rows, narrow and wide panels, light and dark themes | No penetrating edges, floating shadows, mirrored titles, flickering outlines or pick-through at the crate lip. Existing wheel, key, hover and inspection interactions work. |
| Performance | Compare frame times for the same repeated browse sequence before and after. Record panel size, visible jacket count, median and 95th percentile. Investigate regressions before adding finer seam detail. |

Deliver the Array code changes, a short forward/reverse capture, and stills of the edge-on pose and the mixed pile. Report the final thickness ratio and before/after timing. A procedural Direct2D shell is sufficient for the first pass and uses the existing art, projection and animation.
