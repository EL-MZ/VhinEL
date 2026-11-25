"use strict";

const VINYL_DIR = THEME_ROOT + "assets\\render\\vinyl\\";
let vinylManifest;
const vinylBitmaps = new Map(), vinylTurnFrames = new Map();

function vinylAssets() {
    if (vinylManifest !== undefined) return vinylManifest;
    vinylManifest = null;
    try {
        const file = VINYL_DIR + "vinyl.json";
        if (utils.IsFile(file)) {
            const m = JSON.parse(utils.ReadTextFile(file, 65001));
            if (m.schemaVersion === "1.0" && m.inspect.length && m.transfer.length) vinylManifest = m;
        }
    } catch (e) { console.log("VHINEL manifest: " + e); }
    return vinylManifest;
}
function vinylImage(sprite) {
    const path = sprite.png, turn = path.startsWith("inspect/"), cache = turn ? vinylTurnFrames : vinylBitmaps;
    if (!cache.has(path)) {
        cache.set(path, d2d.Image(VINYL_DIR + path.replace(/\//g, "\\")));
        if (turn && cache.size > 4) cache.delete(cache.keys().next().value);
    }
    return cache.get(path);
}
function vinylBlit(gr, sprite, ox, oy, k, alpha = 255) {
    if (alpha <= 0) return;
    const [x, y, w, h] = sprite.crop, img = vinylImage(sprite);
    gr.DrawImage(img, ox+x*k, oy+y*k, w*k, h*k, 0, 0, img.Width, img.Height, 0, alpha);
}
function vinylHero(gr, x, y, w, h, cov) {
    const m = vinylAssets(), hero = m.shelf.hero, c = hero.clear.crop;
    const k = Math.min(w/c[2], h/c[3])*.90, ox = x+(w-c[2]*k)/2-c[0]*k, oy = y+(h-c[3]*k)/2-c[1]*k;
    const [tl,,br] = hero.cover;
    const img = cov && cov.img || vinylImage(m.fallback);
    gr.DrawImage(img,ox+tl[0]*k,oy+tl[1]*k,(br[0]-tl[0])*k,(br[1]-tl[1])*k,0,0,img.Width,img.Height);
    vinylBlit(gr,hero.clear,ox,oy,k);
}
