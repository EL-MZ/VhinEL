"use strict";
// 02 · PLAYLISTS, right: the signal profile card — the same card as the Lyrics view's
// (lib/nowplaying.js), ending in QUEUE / NEXT instead of the pager, and as tall as the view. The ghost number behind
// it is the active playlist's. A click on a queue row plays that track; a click on the profile inspects the album in
// the Archive. The transport can switch this panel to the editable playback queue.

window.DefineScript("RhinE Queue and Profile", { features: { drag_n_drop: true } });
include(fb.ProfilePath + "themes\\audio-archive\\js\\lib\\core.js");
for (const f of ["waveform", "album", "playlists", "queue", "nowplaying", "queue-panel"]) include(fb.ProfilePath + `themes\\audio-archive\\js\\lib\\${f}.js`);

const M = TOKENS.metrics;
let W = 0, H = 0;
const hits = Hits();
let hover = null;

// (a cover come in: only painted, since it comes in the cover's promise callback, where no timer may be set; nothing
// starts moving with it)
function npChanged(same, h, what) { window.Repaint(); if (what !== "cover") clock.wake(); }

const clock = Clock(dt => {
    let more = stepSpring(heroClear, dt);
    if (T.title && !scrambleDone(T.title)) more = true;
    if (STATE.queueOpen) more = stepQueueRows(dt) || more;
    const revealing = !!QUEUE_PANEL.reveal;
    if (revealing && tweenK(QUEUE_PANEL.reveal) >= 1) QUEUE_PANEL.reveal = null;
    if (more || revealing) window.Repaint();
    return more || !!QUEUE_PANEL.reveal;
});

function cardRect() { const g = dp(M.gutter); return [g, g, W - 2 * g, H - 2 * g]; }

function on_size(w, h) { W = w; H = h; }
function on_paint(gr) {
    hits.clear();
    gr.FillSolidRect(0, 0, W, H, C.bg);
    if (STATE.queueOpen) {
        vline(gr, 0, 0, H, C.hair);
        drawQueuePanel(gr);
        drawGrain(gr, 0, 0, W, H);
        return;
    }
    if (STATE.view !== "playlists") return;
    if (QUEUE_PANEL.over) {
        drawQueueDropFeedback(gr);
        return;
    }
    if (wallpaperOn("playlists") && (typeof wallpaperCard !== "function" || wallpaperCard())) drawWallpaper(gr, "card", 0, 0, W, H);   // round the card (lib/wallpaper.js)
    const [x, y, w, h] = cardRect();
    if (w < dp(200) || h < dp(200)) return;
    gr.PushTransform();
    gr.Translate(x, y);
    drawCard(gr, w, h, "queue", pad(Math.max(0, plman.ActivePlaylist) + 1, 3));
    gr.PopTransform();
    hitsCard(x, y);
    if (hover && hover.id === "queue") gr.FillSolidRect(hover.x, hover.y + dp(4), dp(2), hover.h - dp(8), C.accent);
    if (hover && (hover.id === "profile" || hover.id === "folder")) box(gr, hover.x, hover.y, hover.w, hover.h, C.accent);
    drawGrain(gr, 0, 0, W, H);
    // the panel's left edge (next to the playlist) widens or narrows the card: marked while under the mouse or dragged
    if (edgeHot || edgeDrag) gr.FillSolidRect(0, 0, dp(2), H, C.accent);
}

// The left edge drags the card's width. The panel moves with its edge, so the width comes from where the mouse is in
// the panel as it is now (its right edge stays where it is): W - x, less where the edge was grabbed.
let edgeHot = false, edgeDrag = null;
const onEdge = x => x <= dp(5);
const cardWidthAt = x => clamp(Math.round((W - (x - edgeDrag.off)) / SCALE - 2 * M.gutter), SIDES_RANGE.card[0], SIDES_RANGE.card[1]);
function on_mouse_lbtn_down(x, y) {
    if (STATE.queueOpen) queueRowDown(hits.at(x, y), y);
    else if (STATE.view === "playlists" && onEdge(x)) edgeDrag = { off: x };
}
function on_mouse_lbtn_dblclk(x) { if (!STATE.queueOpen && onEdge(x)) sendSide("card", SIDES_START.card, true); }
function on_mouse_move(x, y, mask) {
    if (STATE.queueOpen) {
        queueRowMove(y, !!(mask & 1));
        const a = hits.at(x, y);
        window.SetCursor(QUEUE_PANEL.drag || (a && a.id === "queue-entry") ? 32645 : a ? 32649 : 32512);
        if ((a && a.id) !== (hover && hover.id) || (a && a.data) !== (hover && hover.data)) { hover = a; window.Repaint(); }
        return;
    }
    if (edgeDrag) {
        if (!(mask & 1)) { edgeEnd(x); return; }
        const w = cardWidthAt(x);
        if (w !== side("card")) sendSide("card", w, false);
        window.SetCursor(32644);
        return;
    }
    const hot = onEdge(x);
    if (hot !== edgeHot) { edgeHot = hot; window.Repaint(); }
    if (hot) { window.SetCursor(32644); return; }   // IDC_SIZEWE
    const a = hits.at(x, y);
    const n = a && a.id === "rate" ? ratingAt(x, a.x + a.data.pad, a.data.size) : 0;   // the rating the marks would give
    if (n !== NP_RATE.hover) { NP_RATE.hover = n; window.Repaint(); }
    const fh = !!(a && a.id === "fav");   // the heart, previewed
    if (fh !== NP_FAV.hover) { NP_FAV.hover = fh; window.Repaint(); }
    window.SetCursor(a ? 32649 : 32512);
    if ((a && a.id + a.y) !== (hover && hover.id + hover.y)) { hover = a; window.Repaint(); }
}
function on_mouse_leave() { NP_RATE.hover = 0; NP_FAV.hover = false; if (edgeHot && !edgeDrag) edgeHot = false; if (hover) hover = null; window.Repaint(); }
function edgeEnd(x) { const w = cardWidthAt(x); edgeDrag = null; sendSide("card", w, true); window.Repaint(); }
function on_mouse_lbtn_up(x, y) {
    if (STATE.queueOpen) {
        if (queueRowUp(x, y)) return;
        const a = hits.at(x, y);
        if (a && a.id === "queue-close") send("queue-open", false);
        else if (a && a.id === "queue-remove") removeQueueRow(a.data);
        return;
    }
    if (edgeDrag) { edgeEnd(x); return; }
    const a = hits.at(x, y);
    if (a && a.id === "queue") plman.ExecutePlaylistDefaultAction(a.data.pl, a.data.index);
    else if (a && a.id === "rate") setRating(T.handle, ratingAt(x, a.x + a.data.pad, a.data.size));
    else if (a && a.id === "fav") setFav(T.handle);
    else if (a && a.id === "profile") send("inspect");
    else if (a && a.id === "folder") openFolder(T.handle);
}
function on_mouse_rbtn_up(x, y, mask) { return !(mask & 4) && STATE.queueOpen && queueRowMenu(x, y, hits.at(x, y)); }
function on_mouse_wheel(step) { if (STATE.queueOpen) scrollQueue(-step * 3); }
function on_char(code) { searchChar(code); }
function on_key_down(vk) {
    if (STATE.queueOpen && vk === 0x1b) {
        if (QUEUE_PANEL.drag) stopQueueDrag(); else send("queue-open", false);
        return;
    }
    if (searchKey(vk)) return;
    if (vk === 0x20) fb.PlayOrPause(); else globalKey(vk);
}

const queueDrops = trackDropReceiver();
function queueDropEffect(action) {
    return (STATE.queueOpen || STATE.view === "playlists") && !queueDrops.busy() ? (action.Effect & 1) || (action.Effect & 4) : 0;
}
function queueDropHover(active) {
    if (QUEUE_PANEL.over === active) return;
    QUEUE_PANEL.over = active;
    QUEUE_PANEL.reveal = active && !REDUCE_MOTION ? Tween(150) : null;
    if (QUEUE_PANEL.reveal) clock.wake();
    window.Repaint();
}
function on_drag_enter(action) { on_drag_over(action); }
function on_drag_over(action) { action.Effect = queueDropEffect(action); queueDropHover(!!action.Effect); }
function on_drag_leave() { queueDropHover(false); }
function on_drag_drop(action) {
    const effect = queueDropEffect(action);
    queueDropHover(false);
    if (!effect) { action.Effect = 0; return; }
    const playlist = plman.ActivePlaylist;
    const source = STATE.view === "playlists" && playlist >= 0 ? { playlist, indexes: plman.GetPlaylistSelectedIndexes(playlist) } : null;
    action.Effect = queueDrops.start(action, items => {
        enqueueTracks(items, source);
        send("queue-open", true);
        return true;
    }) ? effect : 0;
}

function on_playback_new_track() { loadTrack(); }
function on_playback_starting() { window.Repaint(); }
function on_playback_pause() { window.Repaint(); }
function on_playback_stop(reason) { if (reason !== 2) loadTrack(); }
function on_playback_queue_changed() { stopQueueDrag(); window.Repaint(); }
function on_item_focus_change() { if (!fb.IsPlaying) loadTrack(); else window.Repaint(); }
function on_metadb_changed() { if (T.handle) loadTrack(); }
function on_playlist_switch() { window.Repaint(); }
function on_playlists_changed() { plDirty(); window.Repaint(); }
function on_playlist_items_added(i) { plDirty(i); queueDrops.added(i); window.Repaint(); }
function on_playlist_items_removed(i) { plDirty(i); window.Repaint(); }
function on_playlist_items_reordered(i) { plDirty(i); window.Repaint(); }
function on_colours_changed() { refreshTokens(); window.Repaint(); }
onMessage("rating-store", () => { if (T.handle) loadTrack(); });
FAV_LISTENERS.push(() => { if (T.handle) loadTrack(); window.Repaint(); });
let queueWasOpen = false;
onMessage("state", () => {
    if (queueWasOpen !== STATE.queueOpen) {
        queueWasOpen = STATE.queueOpen;
        edgeHot = false; edgeDrag = null; hover = null;
        stopQueueDrag();
    }
    if (STATE.skin !== CASE_SKIN) loadSkin(STATE.skin);
    window.Repaint();
});
helloFrame();   // lib/bus.js
window.SetTimeout(loadTrack, 0);
