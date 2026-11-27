"use strict";

// Native archive geometry remains in shelf units. The vinyl array render has two pixels per legacy array pixel.
let vinylShelf;
function vinylArray() {
    if (!vinylShelf) {
        const j = vinylAssets().shelf.array, half = p => p.map(v => v/2);
        vinylShelf = {cover:j.cover.map(half), spine:j.spine.map(half), origin:half(j.origin), center:half(j.center),
            axes:{x:half(j.axes.x), y:half(j.axes.y), z:half(j.axes.z)}};
    }
    return vinylShelf;
}

// The rails use whole world units. Leave room at both ends for the top of a tipped LP.
const CRATE_PITCH = .22, CRATE_FRONT = 2.7;
const crateDepth = slot => CRATE_FRONT + slot * CRATE_PITCH;
const crateRailCount = slots => Math.ceil(crateDepth(slots) + 1.4);

let crateTimber;
function drawCrateBoards(gr,gi,pos,x,front,rear,toScreen,near) {
    if (crateTimber===undefined) {
        const plate=vinylWoodPlate();
        crateTimber=plate ? plate.Clone(840,1100,2100,330).Resize(700,110) : null;
    }
    const project=(across,along,height)=>toScreen({x:x+across,y:along,z:height});
    const alpha=rowAlpha(pos), tint=rowTint(pos);
    function board(a,b,height,shade) {
        const face=[project(...a,height),project(...b,height),project(...b,-.27),project(...a,-.27)];
        if (crateTimber) tintedCover(gr,face,0,0,1,alpha,tint,crateTimber);
        else gr.FillPolygon(withAlpha(mix(0xff84502c,fadeBg(),tint),alpha/255),0,face.flat());
        gr.FillPolygon(withAlpha(0xff25170c,shade*alpha/255),0,face.flat());
        gr.DrawLine(...face[0],...face[1],Math.max(HAIR,dp(1.6)),withAlpha(0xffc18c59,(1-tint)*alpha/255));
        if (near && alpha>160) AR.hits.push({gi,quad:face,board:true});
    }
    if (near) {
        board([2.12,rear],[2.12,front],.63,.2);
        board([-2.12,front],[2.12,front],.86,.05);
    } else {
        board([-2.12,rear],[2.12,rear],1.34,.23);
        board([-2.12,rear],[-2.12,front],.63,.35);
    }
}

const CRATE_UPRIGHT = .28, CRATE_TIPPED = -1.06, JACKET_THICKNESS = .01;
const crateCross = (a, b) => a[0] * b[1] - a[1] * b[0];
const crateDelta = (a, b) => [a[0] - b[0], a[1] - b[1]];
let jacketRig;

function crateShell(angle) {
    const { axes, hinge, width, height, halfThickness } = jacketRig;
    const cos = Math.cos(angle), sin = Math.sin(angle);
    const rise = axes.z.map((z, i) => height * (cos * z + sin * axes.y[i]));
    const offset = axes.y.map((y, i) => halfThickness * (cos * y - sin * axes.z[i]));
    const mid = [
        [hinge[0][0] + rise[0], hinge[0][1] + rise[1]],
        [hinge[1][0] + rise[0], hinge[1][1] + rise[1]],
        hinge[1], hinge[0]
    ];
    const front = mid.map(([x, y]) => [x - offset[0], y - offset[1]]);
    const rear = mid.map(([x, y]) => [x + offset[0], y + offset[1]]);
    const area = crateCross(width, rise), back = area > 0;
    // Winding follows the front artwork. Each outward-facing perimeter quad has the same screen winding.
    const edges = [];
    for (let i = 0; i < 4; i++) {
        const j = (i + 1) % 4;
        const edge = crateDelta(mid[j], mid[i]);
        const breadth = crateCross(offset, edge) * 2;
        if (breadth > 0.001) edges.push({
            quad: [front[j], front[i], rear[i], rear[j]], side: i, width: breadth / Math.hypot(...edge)
        });
    }
    // The back reads from the front of the crate, with its printed top along the hinge.
    const face = back ? [rear[1], rear[0], rear[3], rear[2]] : front;
    const art = back ? [rear[3], rear[2], rear[1], rear[0]] : front;
    return { face, art, edges, back, cos, sin, height,
        center: [(mid[0][0] + mid[2][0]) / 2, (mid[0][1] + mid[2][1]) / 2],
        faceWidth: Math.abs(area) / Math.hypot(...width) };
}

function cratePose(index, cursor, lift) {
    if (!jacketRig) {
        const { cover, axes } = vinylArray();
        const hinge = [cover[3], cover[2]], width = crateDelta(hinge[1], hinge[0]);
        const height = (cover[3][1] - cover[0][1]) / -axes.z[1];
        jacketRig = { axes, hinge, width, height, halfThickness: JACKET_THICKNESS * width[0] / axes.x[0] / 2 };
        jacketRig.upright = crateShell(CRATE_UPRIGHT);
        jacketRig.tipped = crateShell(CRATE_TIPPED);
    }
    const phase = clamp(cursor - index, 0, 1);
    if (!lift && phase === 0) return jacketRig.upright;
    if (!lift && phase === 1) return jacketRig.tipped;
    return crateShell(lerp(CRATE_UPRIGHT, CRATE_TIPPED, easeInOut(phase)) * (1 - lift));
}

const jacketLuma = rgb => rgb.reduce((n, v, i) => {
    const c = v / 255;
    return n + (c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4) * [.2126, .7152, .0722][i];
}, 0);
const jacketColor = ([r, g, b]) => (0xff000000 | (r << 16) | (g << 8) | b) >>> 0;
const jacketChroma = rgb => Math.max(...rgb) - Math.min(...rgb);
const jacketDistance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const jacketContrast = (a, b) => (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
const JACKET_LIGHT_INK = [255, 249, 238], JACKET_DARK_INK = [8, 7, 6];

function jacketPalette(base, accent) {
    const color = jacketColor(base), light = jacketLuma(base);
    const ink = jacketColor(jacketContrast(light, jacketLuma(JACKET_LIGHT_INK)) > jacketContrast(light, jacketLuma(JACKET_DARK_INK))
        ? JACKET_LIGHT_INK : JACKET_DARK_INK);
    const rule = accent ? jacketColor(accent) : mix(color, ink, .42);
    return { base: color, strip: mix(color, 0xff080706, .13), ink, rule };
}

const JACKET_STOCK = jacketPalette([210, 200, 181], null);
function sampleJacketPalette(img) {
    const size = 32, border = 3;
    const pixels = img.Resize(size, size, 2).GetPixelData("bgra32");
    if (!pixels || pixels.length < size * size * 4) return JACKET_STOCK;
    const bins = new Map();
    let total = 0;
    for (let y = border; y < size - border; y++) for (let x = border; x < size - border; x++) {
        const i = (y * size + x) * 4;
        if (pixels[i + 3] < 128) continue;
        const b = pixels[i], g = pixels[i + 1], r = pixels[i + 2];
        const key = ((r >> 5) << 6) | ((g >> 5) << 3) | (b >> 5);
        const bin = bins.get(key) || { n: 0, r: 0, g: 0, b: 0 };
        bin.n++; bin.r += r; bin.g += g; bin.b += b;
        bins.set(key, bin);
        total++;
    }
    if (!total) return JACKET_STOCK;
    const colors = [...bins.values()].map(bin => ({
        n: bin.n, rgb: [bin.r, bin.g, bin.b].map(v => v / bin.n)
    })).sort((a, b) => b.n - a.n);
    const clusters = [];
    for (const color of colors) {
        const nearby = clusters.find(c => jacketDistance(c.rgb, color.rgb) < 44);
        if (nearby) {
            nearby.rgb = nearby.rgb.map((v, i) => lerp(v, color.rgb[i], color.n / (nearby.n + color.n)));
            nearby.n += color.n;
        } else clusters.push(color);
    }
    clusters.sort((a, b) => b.n - a.n);
    const base = clusters[0].rgb.map(Math.round);
    let score = 0, accent = null;
    for (const { rgb, n } of clusters) {
        const distance = jacketDistance(base, rgb);
        if (n < total * .045 || distance < 48 || jacketChroma(rgb) < 24) continue;
        const weight = distance * Math.sqrt(n) * (.65 + jacketChroma(rgb) / 255);
        if (weight > score) { score = weight; accent = rgb.map(Math.round); }
    }
    if (!accent && jacketChroma(base) < 24) {
        const gray = Math.round(.2126 * base[0] + .7152 * base[1] + .0722 * base[2]);
        return jacketPalette([gray, gray, gray], null);
    }
    return jacketPalette(base, accent);
}

// Palette revisions and scan misses outlive the bounded bitmap cache.
const jacketPalettes = new Map(), jacketBacks = new Map(), jacketScanPending = new Map(), jacketNoScan = new Set();
const jacketPaletteQueue = new Set();
let jacketPaletteTimer = 0, jacketPrepareTimer = 0;
let jacketWantedPrints = new Map(), jacketWantedPalette = new Set(), jacketWantedBitmaps = new Set();
const jacketPrintKey = a => "print:" + a.key;
const jacketScanKey = key => "scan:" + key;
const JACKET_TRACK_LIMIT = 12;
const jacketTrackLists = new WeakMap();
let jacketPrintFonts;

function jacketTrackList(album) {
    const saved = jacketTrackLists.get(album);
    if (saved) return saved;
    const songs = album.online?.songs;
    const handles = songs ? null : albumHandles(album);
    if (!songs && !handles) return null;
    const total = songs ? songs.length : handles.Count;
    const titles = Array.from({ length: Math.min(total, JACKET_TRACK_LIMIT) }, (_, i) =>
        songs ? songs[i].title : TF_TITLE.EvalWithMetadb(handles[i]));
    const list = { titles, total };
    jacketTrackLists.set(album, list);
    return list;
}

function keepJacketBitmap(key, entry) {
    jacketBacks.delete(key);
    jacketBacks.set(key, entry);
    if (jacketBacks.size > 48) {
        for (const id of jacketBacks.keys()) {
            if (!jacketWantedBitmaps.has(id)) { jacketBacks.delete(id); break; }
        }
    }
}

function fitJacketTrack(gr, title, font, width) {
    const line = title.replace(/\s+/g, " ").trim() || tr("UNTITLED");
    if (gr.CalcTextWidth(line, font, true) <= width) return line;
    const chars = Array.from(line);
    const ending = n => chars.slice(0, n).join("").trimEnd() + "\u2026";
    let lo = 0, hi = chars.length - 1;
    while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2);
        if (gr.CalcTextWidth(ending(mid), font, true) <= width) lo = mid;
        else hi = mid - 1;
    }
    return ending(lo);
}

function prepareJacketPrint(a) {
    const cover = coverKey(a), key = jacketPrintKey(a);
    const palette = jacketPalettes.get(cover)?.palette || JACKET_STOCK;
    const album = albumOf(a) || a;
    const list = jacketTrackList(album);
    const saved = jacketBacks.get(key);
    if (saved && saved.palette === palette && saved.list === list && saved.artist === album.artist && saved.no === a.no) {
        keepJacketBitmap(key, saved);
        return;
    }
    if (!jacketPrintFonts) jacketPrintFonts = {
        track: d2d.Font("Segoe UI", 17, 0),
        credit: d2d.Font("Segoe UI Semibold", 16, 0),
        small: d2d.Font("Geist Mono", 12, 0)
    };
    const { track, credit, small } = jacketPrintFonts, flags = DT_SINGLE | DT_ELLIPSIS;
    const img = d2d.CreateImage(320, 320), gr = img.GetGraphics();
    try {
        gr.FillSolidRect(0, 0, 320, 320, palette.base);
        gr.DrawString(album.artist || "", credit, palette.ink, 20, 23, 280, 25, flags);
        gr.FillSolidRect(20, 54, 58, 3, palette.rule);
        if (list) {
            const { titles, total } = list, rows = Math.ceil(titles.length / 2);
            titles.forEach((title, i) => {
                const left = i < rows, x = left ? 20 : 166, y = 68 + (left ? i : i - rows) * 27;
                gr.DrawString(pad(i + 1, 2), small, palette.ink, x, y, 18, 24, DT_SINGLE);
                const fitted = fitJacketTrack(gr, title || "", track, 110);
                gr.DrawString(fitted, track, palette.ink, x + 22, y, 112, 24, DT_SINGLE);
            });
            if (total > titles.length) {
                gr.DrawString(tr("+{0} MORE", total - titles.length), small, palette.ink, 20, 237, 280, 22, flags);
            }
        }
        gr.DrawString("VHINEL  /  " + pad(a.no, 4), small, palette.ink, 20, 268, 280, 28, DT_SINGLE);
    } finally { img.ReleaseGraphics(gr); }
    keepJacketBitmap(key, { img, cover, palette, list, artist: album.artist, no: a.no });
}

function prepareJacketScan(a) {
    const cover = coverKey(a), key = jacketScanKey(cover), saved = jacketBacks.get(key);
    if (saved) { keepJacketBitmap(key, saved); return; }
    if (jacketNoScan.has(cover) || jacketScanPending.has(cover)) return;
    const handle = albumFirst(albumOf(a) || a);
    if (!handle) return;
    const request = {};
    jacketScanPending.set(cover, request);
    utils.GetAlbumArtAsyncV2(window.ID, handle, 1, false, false, false).then(result => {
        if (jacketScanPending.get(cover) !== request) return;
        if (!result || !result.image) { jacketNoScan.add(cover); return; }
        keepJacketBitmap(key, { img: result.image.Resize(384, 384), cover });
        if (jacketWantedPrints.has(cover)) window.Repaint();
    }).catch(() => {}).finally(() => {
        if (jacketScanPending.get(cover) === request) jacketScanPending.delete(cover);
    });
}

function jacketBack(a) {
    return jacketBacks.get(jacketScanKey(coverKey(a)))?.img || jacketBacks.get(jacketPrintKey(a))?.img;
}

function queueJacketPalette(key) {
    const thumb = THUMBS.get(key), saved = jacketPalettes.get(key);
    if (thumb === undefined || (thumb === null && !saved) || (saved && saved.source === (thumb && thumb.source))) return;
    jacketPaletteQueue.add(key);
    if (!jacketPaletteTimer) jacketPaletteTimer = window.SetTimeout(updateJacketPalettes, 0);
}

function updateJacketPalettes() {
    jacketPaletteTimer = 0;
    const until = performance.now() + 4;
    let changed = false;
    for (const key of jacketPaletteQueue) {
        jacketPaletteQueue.delete(key);
        if (!jacketWantedPalette.has(key)) continue;
        const thumb = THUMBS.get(key);
        if (thumb === undefined) continue;
        let palette = JACKET_STOCK;
        if (thumb) {
            try { palette = sampleJacketPalette(thumb.img); }
            catch (e) { /* An unreadable thumbnail uses matte stock. */ }
        }
        jacketPalettes.set(key, { source: thumb && thumb.source, palette });
        for (const a of jacketWantedPrints.get(key) || []) prepareJacketPrint(a);
        changed = true;
        if (performance.now() >= until) break;
    }
    if (changed) window.Repaint();
    if (jacketPaletteQueue.size) jacketPaletteTimer = window.SetTimeout(updateJacketPalettes, 0);
}

function prepareCrateJackets(albums, nearby) {
    jacketWantedPalette = new Set(albums.map(coverKey));
    jacketWantedPrints = new Map();
    jacketWantedBitmaps = new Set(nearby.flatMap(a => [jacketPrintKey(a), jacketScanKey(coverKey(a))]));
    for (const a of nearby) {
        const key = coverKey(a);
        if (!jacketWantedPrints.has(key)) jacketWantedPrints.set(key, []);
        jacketWantedPrints.get(key).push(a);
        prepareJacketPrint(a);
        prepareJacketScan(a);
    }
    for (const key of jacketWantedPalette) queueJacketPalette(key);
}

function scheduleCrateJackets(albums, nearby) {
    if (jacketPrepareTimer) window.ClearTimeout(jacketPrepareTimer);
    jacketPrepareTimer = window.SetTimeout(() => {
        jacketPrepareTimer = 0;
        prepareCrateJackets(albums, nearby);
    }, 0);
}

LIB_LISTENERS.push((kind, key) => {
    if (kind === "cover" && jacketWantedPalette.has(key)) queueJacketPalette(key);
    if (kind !== "cover-reset") return;
    const reset = cover => key ? key.has(cover) : !cover.startsWith(ONL_KEY);
    for (const cover of jacketPalettes.keys()) if (reset(cover)) jacketPalettes.delete(cover);
    for (const cover of jacketNoScan) if (reset(cover)) jacketNoScan.delete(cover);
    for (const cover of jacketScanPending.keys()) if (reset(cover)) jacketScanPending.delete(cover);
    for (const [id, entry] of jacketBacks) if (reset(entry.cover)) jacketBacks.delete(id);
});

function crateLayers(items, cursor, lift) {
    let pile, previous, moving, upright;
    for (const it of items) {
        if (!it.pose || (it.isSel && lift)) continue;
        const phase = cursor - it.i;
        if (phase >= 1) { previous = pile; pile = it; }
        else if (phase > 0) { moving = it; it.moving = true; }
        else if (!upright) upright = it;
    }
    if (pile) pile.topBack = true;
    for (const pair of moving ? [[pile, moving], [moving, upright]] : [[previous, pile], [pile, upright]]) {
        const [a, b] = pair;
        if (!a || !b) continue;
        const [receiver, caster] = a.close < b.close ? pair : [b, a];
        (receiver.shadows ||= []).push(caster);
    }
}

// Project the casting sleeve's leading edge into the receiving face. The band stays inside that face.
function drawCrateContact(gr, it, caster, face, k, alpha) {
    const q = it.pose.face, c = caster.pose.face, axes = vinylArray().axes;
    const dy = caster.y - it.y, dz = caster.z - it.z;
    const offset = axes.y.map((v, i) => dy * v + dz * axes.z[i]);
    const u = crateDelta(q[1], q[0]), v = crateDelta(q[3], q[0]), area = crateCross(u, v);
    if (Math.abs(area) < 1) return;
    const project = p => crateDelta([p[0] + offset[0], p[1] + offset[1]], q[0]);
    const left = project(c[0]), right = project(c[1]), foot = project(c[3]);
    const along = w => crateCross(u, w) / area, across = w => crateCross(w, v) / area;
    const top = along(left), bottom = along(foot), direction = Math.sign(top - bottom);
    if (top <= 0 || top >= 1 || Math.abs(top - bottom) < .002) return;
    const x0 = clamp(Math.min(across(left), across(right)), 0, 1);
    const x1 = clamp(Math.max(across(left), across(right)), 0, 1);
    if (x1 <= x0) return;
    const p = it.pose, s = caster.pose;
    const gap = Math.abs(dy * p.cos - dz * p.sin + s.height * (s.sin * p.cos - s.cos * p.sin));
    const strength = .16 * clamp(1 - gap / (CRATE_PITCH * 1.55), 0, 1) * alpha / 255;
    if (strength < .018) return;
    const span = Math.min(.11, 4.5 / (p.faceWidth * k));
    const at = (x, y) => [face[0][0] + x * u[0] * k + y * v[0] * k, face[0][1] + x * u[1] * k + y * v[1] * k];
    let start = top;
    for (let i = 1; i <= 3; i++) {
        const end = clamp(top + direction * span * i / 3, 0, 1);
        if (end === start) break;
        gr.FillPolygon(withAlpha(0xff140f0c, strength * (4 - i) / 3), 0,
            [...at(x0, start), ...at(x1, start), ...at(x1, end), ...at(x0, end)]);
        start = end;
    }
}

function drawCrateJacket(gr, it, sx, sy, k) {
    const m = vinylArray(), q = it.pose.face;
    const ox = sx - m.origin[0] * k, oy = sy - m.origin[1] * k;
    const screen = p => [ox + p[0] * k, oy + p[1] * k];
    const pts = q.map(screen);
    if (it.isSel) AR.from = screen(it.pose.center);
    if (it.isSel && inspTurn() > 0) return;
    const { alpha, tint } = it;
    if (!alpha) return;
    const colors = jacketPalettes.get(coverKey(it.a))?.palette || JACKET_STOCK;
    const surface = color => withAlpha(mix(color, fadeBg(), tint), alpha / 255);
    const hit = { i: it.i, gi: it.gi, panels: [] };
    const faceWidth = it.pose.faceWidth * k;
    if (faceWidth > .025) {
        const detailed = !it.pose.back || it.topBack || it.moving;
        let art;
        if (detailed && faceWidth > .65) {
            art = it.pose.back ? jacketBack(it.a) : thumbOf(it.a)?.img || vinylImage(vinylAssets().fallback);
        }
        if (art) tintedCover(gr, it.pose.art, ox, oy, k, alpha, tint, art);
        else gr.FillPolygon(surface(detailed ? colors.base : colors.strip), 0, pts.flat());
        if (it.shadows && faceWidth > .65) for (const caster of it.shadows) drawCrateContact(gr, it, caster, pts, k, alpha);
        hit.panels.push(pts);
    }
    for (const { quad, side, width } of it.pose.edges) {
        const edge = quad.map(screen);
        const color = side === 1 ? mix(colors.base, 0xffd7cab5, .28)
            : side === 0 ? mix(colors.base, 0xffe5d8bf, .14) : colors.strip;
        gr.FillPolygon(surface(color), 0, edge.flat());
        if (side === 1 && width * k >= 2.6) {
            const seam = [vinylMix(edge[0], edge[3], .37), vinylMix(edge[1], edge[2], .37),
                vinylMix(edge[1], edge[2], .63), vinylMix(edge[0], edge[3], .63)];
            gr.FillPolygon(surface(mix(colors.base, 0xff100d0a, .72)), 0, seam.flat());
        }
        hit.panels.push(edge);
    }
    AR.hits.push(hit);
    const plate = { a: it.a, ox, oy, k, alpha, top: q[it.pose.back ? 0 : 1] };
    if (it.isSel && AR.insp === 0) {
        AR.selPlate = plate;
        for (const [x,y] of pts) gr.FillSolidRect(Math.round(x-dp(2)),Math.round(y-dp(2)),dp(4),dp(4),C.accent);
    } else if (AR.hover === it.i && AR.hoverRow === it.gi && !AR.inspOn) {
        if (AR.hoverMode === "label") AR.hoverPlate = plate;
        if (AR.hoverMode === "outline") {
            for (const panel of hit.panels) gr.DrawPolygon(C.accent, dp(1.5), panel.flat());
        }
    }
}
function vinylRoomMeta(backdrop, room) {
    const adapt = s => ({ off:s.crop.slice(0,2), size:s.crop.slice(2), sprite:s });
    const levels = room.levels.filter(v => v.name !== room.selected).map(v => ({
        depth:v.depth, fit:v.fit, haze:adapt(v.layers.haze), layers:{
            side:adapt(v.layers.side), top:adapt(v.layers.top), front:adapt(v.layers.front)
        }
    }));
    const selected = room.levels.find(v => v.name === room.selected);
    return Object.assign({}, backdrop, {box:room.box, cover:room.cover,
        nodes:null, sealed:false, levels,
        sel:{depth:selected.depth, fit:selected.fit, cover:selected.cover, sprite:selected.layers.selected}});
}

const VPLAYER = { key:null, phase:"sleeve", pull:0, center:null, grip:null, since:0,
    angle:0, spinAt:null, idle:Date.now(), screen:false, entered:0, lastPaint:0, label:null,
    labelSource:null, auto:getSetting("vinylScreenAuto",true), albumTiming:null, dismissUp:false, previousView:null, trackAt:0,
    manual:false, fullscreen:false, controlsAt:0, zoom:Spring(0,12,.001), surface:getSetting("vinylScreenSurface","wood") };

function vinylLayout() {
    const m=vinylAssets(), aw=arrayW(), narrow=aw/H<.95;
    const base=m.deck.base.crop;
    const k=narrow ? Math.min(aw/1940,H/2340) : Math.min(aw/2880,H/1728);
    const x=narrow ? (aw-1840*k)/2 : (aw-2880*k)/2;
    const y=narrow ? H/2-1120*k : (H-1728*k)/2;
    const dx=narrow ? aw/2-(base[0]+base[2]/2)*k : x;
    const dy=narrow ? H/2+130*k-base[1]*k : y;
    return {x,y,k,dx,dy};
}
function vinylPoint(p,g,deck=false) {
    return [(deck?g.dx:g.x)+p[0]*g.k,(deck?g.dy:g.y)+p[1]*g.k];
}
const vinylMix=(a,b,t)=>a.map((v,i)=>lerp(v,b[i],t));
function vinylProgress(ms) { return REDUCE_MOTION ? 1 : clamp((performance.now()-VPLAYER.since)/ms,0,1); }
function vinylPhase(phase) { VPLAYER.phase=phase; VPLAYER.since=performance.now(); }
function vinylReset() { VPLAYER.key=null; VPLAYER.grip=null; VPLAYER.pull=0; VPLAYER.center=null; vinylPhase("sleeve"); }
function vinylSync() {
    const a=curAlbum();
    if (!a) return;
    if (VPLAYER.key!==a.key) {
        vinylReset(); VPLAYER.key=a.key;
    }
    if (VPLAYER.phase==="sleeve" && itemPlaying(a)) vinylPhase("playing");
}
function vinylArt(a) {
    if (!a) return null;
    const c=cover(albumFirst(a),()=>window.Repaint()), t=thumbOf(a);
    return c && c.img || t && t.img || null;
}
function vinylLabel(art) {
    const mask=vinylImage(vinylAssets().label);
    if (!art) return mask;
    if (VPLAYER.labelSource===art) return VPLAYER.label;
    const w=mask.Width,h=mask.Height, side=Math.min(art.Width,art.Height);
    const square=d2d.CreateImage(w,h), sg=square.GetGraphics();
    sg.DrawImage(art,0,0,w,h,(art.Width-side)/2,(art.Height-side)/2,side,side);
    square.ReleaseGraphics(sg);
    const effect=d2d.Effect(FX_ALPHA_MASK);
    effect.SetInput(0,square); effect.SetInput(1,mask);
    const result=d2d.CreateImage(w,h), g=result.GetGraphics();
    g.DrawEffect(effect,0,0,0,0,w,h); result.ReleaseGraphics(g);
    VPLAYER.labelSource=art; VPLAYER.label=result; return result;
}
function vinylSpin() {
    const now=performance.now();
    const period = vinylAssets().animation.spinPeriodMs * 2;
    if (VPLAYER.spinAt!==null) VPLAYER.angle=(VPLAYER.angle+(now-VPLAYER.spinAt)*2*Math.PI/period)%(2*Math.PI);
    VPLAYER.spinAt=fb.IsPlaying && !fb.IsPaused ? now : null;
    return VPLAYER.angle;
}
function vinylRecord(gr,sample,center,k,art,angle,alpha=255) {
    const ox=center[0]-sample.center[0]*k, oy=center[1]-sample.center[1]*k;
    vinylBlit(gr,sample.surface,ox,oy,k,alpha);
    vinylProjectedLabel(gr,sample.labelQuad,sample.labelAxes.center,ox,oy,k,art,angle,alpha);
}
function vinylProjectedLabel(gr,q,c,ox,oy,k,art,angle,alpha) {
    const cs=Math.cos(angle),sn=Math.sin(angle);
    const u=q[1].map((n,i)=>(n-q[0][i])/2), v=q[3].map((n,i)=>(n-q[0][i])/2);
    const rotated=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,y])=>c.map((n,i)=>n+(x*cs-y*sn)*u[i]+(x*sn+y*cs)*v[i]));
    quadImage(gr,vinylLabel(art),rotated,ox,oy,k,alpha);
}
// Fit neighbouring renders to the same projected record plane, including the printed label.
function vinylTilt(gr,t,center,k,art,alpha) {
    const frames=vinylAssets().transfer, index=t*(frames.length-1), lo=Math.floor(index);
    const a=frames[lo], b=frames[Math.min(lo+1,frames.length-1)], f=index-lo;
    const offset=(pt,c)=>pt.map((v,i)=>v-c[i]);
    const axis=(s,key)=>offset(s.discAxes[key],s.center);
    const u=vinylMix(axis(a,"x"),axis(b,"x"),f), v=vinylMix(axis(a,"y"),axis(b,"y"),f);
    function surface(s,opacity) {
        const U=axis(s,"x"),V=axis(s,"y"), det=U[0]*V[1]-U[1]*V[0];
        const [x,y,w,h]=s.surface.crop;
        const q=[[x,y],[x+w,y],[x+w,y+h],[x,y+h]].map(pt=>{
            const [dx,dy]=offset(pt,s.center), ux=(dx*V[1]-dy*V[0])/det, vy=(U[0]*dy-U[1]*dx)/det;
            return u.map((n,i)=>ux*n+vy*v[i]);
        });
        quadImage(gr,vinylImage(s.surface),q,center[0],center[1],k,opacity);
    }
    surface(a,alpha);
    if (f>.001) surface(b,Math.round(alpha*f));
    const q=a.labelQuad.map((pt,i)=>vinylMix(offset(pt,a.center),offset(b.labelQuad[i],b.center),f));
    const c=vinylMix(offset(a.labelAxes.center,a.center),offset(b.labelAxes.center,b.center),f);
    vinylProjectedLabel(gr,q,c,center[0],center[1],k,art,0,alpha);
}
function vinylArm(gr,g,pose,alpha) {
    const m=vinylAssets(), d=m.deck;
    if (pose!=="groove") {
        vinylBlit(gr,d.arm.find(a=>a.name===pose).sprite,g.dx,g.dy,g.k,alpha);
        return;
    }
    const start=d.arm.find(a=>a.name==="contact"), end=d.arm.find(a=>a.name==="sweep-end");
    const timing=VPLAYER.albumTiming, duration=timing ? timing.total : fb.PlaybackLength;
    const frac=duration>0 ? clamp(((timing ? timing.before : 0)+fb.PlaybackTime)/duration,0,1) : 0;
    const delta=(end.yawDeg-start.yawDeg)*frac*Math.PI/180, cs=Math.cos(delta),sn=Math.sin(delta);
    const u=d.rimAxes.X.map((x,i)=>x-d.seat[i]),v=d.rimAxes.Y.map((x,i)=>x-d.seat[i]);
    const det=u[0]*v[1]-u[1]*v[0],p=start.pivot;
    const rotate=([x,y])=>{
        x-=p[0]; y-=p[1];
        const a=(x*v[1]-y*v[0])/det,b=(u[0]*y-u[1]*x)/det;
        return p.map((c,i)=>c+u[i]*(a*cs-b*sn)+v[i]*(a*sn+b*cs));
    };
    const [x,y,w,h]=start.sprite.crop;
    quadImage(gr,vinylImage(start.sprite),[[x,y],[x+w,y],[x+w,y+h],[x,y+h]].map(rotate),g.dx,g.dy,g.k,alpha);
}
function vinylAlbumTiming() {
    VPLAYER.albumTiming=null;
    const h=fb.GetNowPlaying(); if (!h) return;
    const a=LIB.albumMap.get(albumKey(h)), list=a && albumHandles(a);
    if (!list) return;
    let total=0,before=null;
    for (let i=0;i<list.Count;i++) {
        if (sameTrack(list[i],h)) before=total;
        total+=Math.max(0,list[i].Length || 0);
    }
    if (before!==null && total>0) VPLAYER.albumTiming={before,total};
}
function vinylDeck(gr,g,art,loaded,arm,alpha=255,shadow=0) {
    const m=vinylAssets(),d=m.deck;
    vinylBlit(gr,d.base,g.dx,g.dy,g.k,alpha);
    if (loaded || shadow) vinylBlit(gr,d.shadow,g.dx,g.dy,g.k,Math.round(alpha*(loaded?1:shadow)));
    if (loaded) vinylRecord(gr,m.transfer[m.transfer.length-1],vinylPoint(d.seat,g,true),g.k,art,vinylSpin(),alpha);
    vinylBlit(gr,d.spindle,g.dx,g.dy,g.k,alpha);
    vinylArm(gr,g,arm,alpha);
}
function vinylInspection(gr,e,fade) {
    const a=curAlbum(); if (!a) return;
    vinylSync();
    const m=vinylAssets(),aw=arrayW(), g=vinylLayout(), s=VPLAYER, art=vinylArt(a), S=swapState();
    const opacity=Math.round(255*S.a*fade);
    gr.FillSolidRect(0,0,aw,H,withAlpha(fadeBg(),.94*fade*e));
    g.x+=S.dx;
    const phase=s.phase, loaded=phase==="cue" || phase==="playing";
    const clip=m.animation.armClips.cue;
    const arm=phase==="cue" ? clip[Math.min(clip.length-1,Math.floor(vinylProgress(720)*clip.length))] :
        phase==="playing" ? "groove" : "park";
    const transfer=phase==="settle" ? vinylProgress(m.animation.transferDurationMs) : 0;
    vinylDeck(gr,g,art,loaded && e===1,arm,Math.round(opacity*e),transfer*.8);
    if (e<1) {
        const j=m.inspect[Math.round(e*(m.inspect.length-1))], end=m.inspect[m.inspect.length-1];
        const cover=m.jacket.cover;
        const endK=g.k*(cover[1][0]-cover[0][0])/(end.cover[1][0]-end.cover[0][0]);
        const k=lerp(arK()/3,endK,e), from=AR.from || [aw*.5,H*.5];
        const to=vinylPoint(m.jacket.center,g), c=vinylMix(from,to,e);
        const x=c[0]-j.center[0]*k, y=c[1]-j.center[1]*k;
        quadImage(gr,art || vinylImage(m.fallback),j.cover,x,y,k,opacity);
        vinylBlit(gr,j.shell,x,y,k,opacity); return;
    }
    vinylBlit(gr,m.rear,g.x,g.y,g.k,opacity);
    if (!loaded) {
        const free=m.transfer[0], rest=vinylPoint(m.pull.rest,g);
        let center=vinylMix(rest,vinylPoint(m.pull.free,g),s.pull);
        if (s.center) center=vinylPoint(s.center,g);
        if (phase==="return") {
            const progress=vinylProgress(300), lip=vinylPoint(m.pull.free,g);
            center=s.pull<1 ? vinylMix(center,rest,progress) : progress<.4 ? vinylMix(center,lip,progress/.4) : vinylMix(lip,rest,(progress-.4)/.6);
        }
        if (phase==="settle") {
            center=vinylMix(center,vinylPoint(m.deck.seat,g,true),transfer);
            center[1]-=Math.sin(transfer*Math.PI)*70*g.k;
            vinylTilt(gr,transfer,center,g.k,art,opacity);
        } else vinylRecord(gr,free,center,g.k,art,0,opacity);
    }
    vinylBlit(gr,m.front,g.x,g.y,g.k,opacity);
    quadImage(gr,art || vinylImage(m.fallback),m.jacket.cover,g.x,g.y,g.k,opacity);
    const text=phase==="sleeve" ? "Drag the record by its rim" : phase==="carry" ? "Drop on the platter" : "";
    if (text) gr.DrawText(text,font(12,500),C.fg,0,H-dp(80),aw,dp(24),DT_CENTER_SINGLE);
    const bw=dp(148), bx=(aw-bw)/2, by=H-dp(45);
    box(gr,bx,by,bw,dp(27),C["line-dim"]);
    gr.DrawText(tr("RETURN TO ARCHIVE"),font(10,600),C.fg,bx,by,bw,dp(27),DT_CENTER_SINGLE);
    hits.add("ar-return",bx,by,bw,dp(27));
}
function vinylInteractive() {
    return STATE.view==="archive" && !STATE.mini && AR.layout!=="grid" && AR.inspOn && AR.insp>=2 && !!vinylAssets();
}
function vinylDown(x,y) {
    if (!vinylInteractive() || VPLAYER.phase!=="sleeve") return false;
    const m=vinylAssets(), g=vinylLayout(), p=[(x-g.x)/g.k,(y-g.y)/g.k];
    if (!inQuad(p[0],p[1],m.pull.rimHit)) return false;
    VPLAYER.grip=p.map((v,i)=>v-m.pull.rest[i]); VPLAYER.center=m.pull.rest.slice();
    AR.lastClick=null; vinylPhase("pull"); return true;
}
function vinylMove(x,y) {
    const s=VPLAYER,m=vinylAssets(),g=vinylLayout(), p=[(x-g.x)/g.k-s.grip[0],(y-g.y)/g.k-s.grip[1]];
    if (s.phase==="pull") {
        const d=m.pull.direction,r=m.pull.rest;
        s.pull=clamp(((p[0]-r[0])*d[0]+(p[1]-r[1])*d[1])/(d[0]*d[0]+d[1]*d[1]),0,1);
        s.center=vinylMix(r,m.pull.free,s.pull);
        if (s.pull>=1) {
            s.center=p;   // Keep the original grip even when a mouse event crosses the lip in one step.
            vinylPhase("carry");
        }
    } else s.center=p;
    window.RepaintRect(0,0,arrayW(),H);
}
function vinylRelease(cancel) {
    const s=VPLAYER,g=vinylLayout(), e=vinylAssets().deck.dropEllipse, p=vinylPoint(s.center,g);
    const x=(p[0]-g.dx)/g.k-e.center[0], y=(p[1]-g.dy)/g.k-e.center[1];
    const u=e.x.map((v,i)=>v-e.center[i]),v=e.y.map((n,i)=>n-e.center[i]),det=u[0]*v[1]-u[1]*v[0];
    const inside=Math.hypot((x*v[1]-y*v[0])/det,(u[0]*y-u[1]*x)/det)<=1;
    s.grip=null; vinylPhase(!cancel && s.phase==="carry" && inside ? "settle" : "return"); clock.wake();
}
function vinylUpdate() {
    const s=VPLAYER;
    if (!vinylInteractive()) { if (s.key!==null) vinylReset(); return false; }
    vinylSync();
    if (s.phase==="return" && vinylProgress(300)>=1) { s.center=null; s.pull=0; vinylPhase("sleeve"); }
    if (s.phase==="settle" && vinylProgress(vinylAssets().animation.transferDurationMs)>=1) vinylPhase("cue");
    if (s.phase==="cue" && vinylProgress(720)>=1) {
        vinylPhase("playing"); playCase();
    }
    if (s.phase==="playing" && !itemPlaying(curAlbum()) && performance.now()-s.since>1500) vinylReset();
    return ["return","settle","cue"].includes(s.phase) || (s.phase==="playing" && (!fb.IsPaused || !fb.IsPlaying));
}
function vinylWakeScreen() {
    const s=VPLAYER; s.idle=Date.now();
    if (!s.screen) return false;
    if (s.fullscreen) vinylFullscreen(false);
    s.screen=false;
    vinylWood=undefined;
    const previous=s.previousView; s.previousView=null;
    if (previous && previous!=="archive") send("view",previous);
    clock.wake(); window.Repaint(); return true;
}
function vinylEnterScreen(manual) {
    if (!vinylAssets() || !fb.IsPlaying || STATE.mini || VPLAYER.screen) return;
    if (manual && STATE.view!=="archive") { VPLAYER.previousView=STATE.view; send("view","archive"); }
    vinylAlbumTiming(); VPLAYER.screen=true; VPLAYER.manual=manual;
    VPLAYER.controlsAt=VPLAYER.entered=performance.now(); clock.wake(); window.Repaint();
}
onMessage("vinyl-screen",()=>{ if (VPLAYER.screen) vinylWakeScreen(); else vinylEnterScreen(true); });
function on_playback_time() {
    if (VPLAYER.auto && STATE.view==="archive" && AR.layout!=="grid" && !AF.open && !STATE.queueOpen && !STATE.mini && !fb.IsPaused &&
        !VPLAYER.grip && !archiveQueueSwipe && !SIDE_DRAG && !AR.rulerDrag && Date.now()-VPLAYER.idle>=30000) vinylEnterScreen(false);
}
function vinylFullscreen(on) {
    VPLAYER.fullscreen=on;
    VPLAYER.controlsAt=performance.now();
    send("turntable-fullscreen",on);
    clock.wake(); window.Repaint();
}
function vinylZoom(step) {
    VPLAYER.zoom.to=clamp(VPLAYER.zoom.to+step*.125,0,1);
    clock.wake();
}
function vinylSurface(surface) {
    VPLAYER.surface=surface;
    setSetting("vinylScreenSurface",surface);
    window.Repaint();
}
function vinylScreenMenu(x,y) {
    const m=window.CreatePopupMenu();
    m.AppendMenuItem(VPLAYER.surface==="wood" ? 8 : 0,1,"Wood surface");
    m.AppendMenuItem(VPLAYER.surface==="plain" ? 8 : 0,2,"Plain surface");
    m.AppendMenuSeparator();
    m.AppendMenuItem(0,3,VPLAYER.fullscreen ? "Exit fullscreen" : "Fullscreen");
    m.AppendMenuItem(0,4,"Return to player");
    const id=m.TrackPopupMenu(x,y);
    if (id===1 || id===2) vinylSurface(id===1 ? "wood" : "plain");
    if (id===3) vinylFullscreen(!VPLAYER.fullscreen);
    if (id===4) vinylWakeScreen();
}

// Project an LP-sized square on the same tabletop plane as the calibrated platter.
let spinningScene, vinylWood;
function vinylScene() {
    if (spinningScene) return spinningScene;
    const d=vinylAssets().deck,[x,y,w,h]=d.base.crop;
    const u=d.rimAxes.X.map((v,i)=>v-d.seat[i]), v=d.rimAxes.Y.map((n,i)=>n-d.seat[i]);
    const center=[x+w*.145,y-h*.055], angle=-.24, cs=Math.cos(angle),sn=Math.sin(angle);
    const sleeve=[[-1,1],[1,1],[1,-1],[-1,-1]].map(([a,b])=>center.map((p,i)=>
        p+1.055*((a*cs-b*sn)*u[i]+(a*sn+b*cs)*v[i])));
    const left=Math.min(x,...sleeve.map(p=>p[0])), top=Math.min(y,...sleeve.map(p=>p[1]));
    spinningScene={sleeve,left,top,width:x+w-left,height:y+h-top};
    return spinningScene;
}
function vinylCamera(scene) {
    const zoom=VPLAYER.zoom.x, seat=vinylAssets().deck.seat;
    const wide=Math.min(W*.90/scene.width,H*.80/scene.height);
    const close=Math.min(W/900,H/480);
    const entry=REDUCE_MOTION ? 1 : easeOutCubic(clamp((performance.now()-VPLAYER.entered)/480,0,1));
    const k=lerp(wide,close,zoom)*lerp(.96,1,entry);
    const cx=lerp(scene.left+scene.width/2,seat[0]+70,zoom);
    const cy=lerp(scene.top+scene.height/2,seat[1],zoom);
    return {k,dx:W*.5-cx*k,dy:H*.5-cy*k,wide};
}
function vinylTable(gr,g) {
    gr.FillSolidRect(0,0,W,H,0xff16191a);
    if (VPLAYER.surface!=="wood") return;
    if (vinylWood===undefined) vinylWood=vinylWoodPlate();
    if (!vinylWood) return;
    const scene=vinylScene(), img=vinylWood, scale=Math.max(W/img.Width,H/img.Height)*1.12*g.k/g.wide;
    const w=img.Width*scale,h=img.Height*scale;
    const cx=g.dx+(scene.left+scene.width/2)*g.k, cy=g.dy+(scene.top+scene.height/2)*g.k;
    gr.DrawImage(img,clamp(cx-w/2,W-w,0),clamp(cy-h/2,H-h,0),w,h,0,0,img.Width,img.Height);
    gr.FillSolidRect(0,0,W,H,0x360d0907);
}
function vinylWoodPlate() {
    if (FLOOR.key && FLOOR.key.endsWith("real-dark\\") && FLOOR.img) return FLOOR.img.plate;
    const path=THEME_ROOT+"assets\\render\\floor\\real-dark\\plate.jpg";
    return utils.IsFile(path) ? d2d.Image(path) : null;
}
function vinylScreenPaint(gr) {
    const m=vinylAssets(),scene=vinylScene(),g=vinylCamera(scene),now=performance.now();
    vinylTable(gr,g);
    const h=fb.GetNowPlaying(), c=h && cover(h,()=>window.Repaint());
    const art=c && c.img, sleeve=scene.sleeve;
    gr.FillPolygon(0x52000000,0,quadPts(sleeve,g.dx+3*g.k,g.dy+7*g.k,g.k));
    gr.FillPolygon(0xffb4a189,0,quadPts(sleeve,g.dx,g.dy+3*g.k,g.k));
    quadImage(gr,art || vinylImage(m.fallback),sleeve,g.dx,g.dy,g.k);
    const [x,y,w,bh]=m.deck.base.crop;
    const feet=[[.095,.34],[.55,.18],[.97,.6],[.84,.98],[.015,.78]].map(([a,b])=>[x+a*w,y+b*bh]);
    for (let i=4;i>=1;i--) gr.FillPolygon(0x23000000,0,quadPts(feet,g.dx+i*2*g.k,g.dy+i*4*g.k,g.k));
    vinylDeck(gr,g,art,true,"groove");
    hits.add("spinning-deck",g.dx+x*g.k,g.dy+y*g.k,w*g.k,bh*g.k);
    if (VPLAYER.manual && (!VPLAYER.fullscreen || now-VPLAYER.controlsAt<2400)) {
        const label=VPLAYER.fullscreen ? "EXIT FULLSCREEN" : "FULLSCREEN";
        const w=dp(VPLAYER.fullscreen ? 146 : 116),h=dp(30),x=W-w-dp(16),y=dp(16);
        gr.FillSolidRect(x,y,w,h,0xd51c1b19);
        gr.DrawText(label,font(11,600),0xfff6f1e6,x,y,w,h,DT_CENTER_SINGLE);
        hits.add("spinning-fullscreen",x,y,w,h);
    }
    const age=now-Math.max(VPLAYER.entered,VPLAYER.trackAt);
    if (age<5000 && h && T.info) {
        const alpha=clamp((5000-age)/700,0,1);
        gr.DrawText([T.info.artist,T.info.title].filter(Boolean).join("  \u00b7  "),font(15,500),withAlpha(0xffe9e7dc,alpha),0,H*.87,W,H*.09,DT_CENTER_SINGLE);
    }
}

