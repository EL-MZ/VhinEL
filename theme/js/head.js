"use strict";
// 02 · PLAYLISTS, above the native playlist: the playlist head.
//   row 1  bracketed PLAYLIST NO. 003 (the number rolls on a switch), the name (scrambles in; double-click renames;
//          the Archive's album playlist shows the album it holds), 041 TRACKS · 3:02:11 · 1.9 GB on the right
//   row 2  state chips, Add to queue and the selection count; Add to playlist and LAYOUT [ALBUM | INDEX] on the right
//   a heavy rule, then the playlist's column titles: the native header is off (Windows draws it white on paper), so
//   they are drawn here, placed the way Columns UI sizes the preset's columns (columns/preset-*.json). Clicking a
//   title sorts the playlist by it (again: the other way round; Edit › Undo restores the order).

include(fb.ProfilePath + "themes\\audio-archive\\js\\lib\\core.js");
include(fb.ProfilePath + "themes\\audio-archive\\js\\lib\\playlists.js");
include(fb.ProfilePath + "themes\\audio-archive\\js\\lib\\queue.js");

const HST = {
    head: { size: 12, weight: 500, track: .12 },
    stat: { size: 9.5, weight: 500, track: .1 },
    statN: { size: 9.5, weight: 700, track: .1 },
    tog: { size: 9, weight: 500, track: .14 },
    sel: { size: 9, weight: 500, track: .12 },
    col: { size: 8.5, weight: 500, track: .12 },
};
const hst = (s, colour, bg = C.bg) => Object.assign({ colour, bg }, s);

let W = 0, H = 0;
const hits = Hits();
let hover = null;
let playlistQueueSwipe = null, playlistQueueSettle = null;
const P = { pl: -1, name: null, no: Roll("000"), sel: 0 };
const TF_QUEUE_SELECTION = fb.TitleFormat("%title%");

const clock = Clock(() => {
    const more = (P.name && !scrambleDone(P.name)) || !rollDone(P.no);
    if (playlistQueueSettle && tweenK(playlistQueueSettle.tw) >= 1) playlistQueueSettle = null;
    window.Repaint();
    return more || !!playlistQueueSettle;
});

function load(animate) {
    const pl = plman.ActivePlaylist;
    // the Archive's album playlist goes by the album it holds (lib/playlists.js)
    const name = pl >= 0 ? albumPlaylistTitle(pl) || plman.GetPlaylistName(pl) : tr("NO PLAYLIST");
    if (pl !== P.pl || !P.name || P.name.text !== name) {
        P.name = animate ? Scramble(name) : { text: name, tw: Tween(0), seed: 0 };
        if (animate) setRoll(P.no, pad(pl + 1, 3)); else P.no = Roll(pad(pl + 1, 3));
        clock.wake();
    }
    P.pl = pl;
    countSelection();
    window.Repaint();
}
function countSelection() { P.sel = P.pl >= 0 ? plman.GetPlaylistSelectedIndexes(P.pl).length : 0; }

function on_size(w, h) { W = w; H = h; }

function on_paint(gr) {
    hits.clear();
    gr.FillSolidRect(0, 0, W, H, C.bg);
    const x0 = dp(20), x1 = W - dp(20), pl = P.pl;
    // row 1: bracketed head
    const y = dp(18), bh = dp(34), f = font(12, 700), cell = Math.ceil(gr.CalcTextWidth("0", f));
    const lw = labelWidth(tr("PLAYLIST NO."), hst(HST.head, 0)), bw = dp(14) + lw + dp(10) + cell * 3 + dp(14);
    for (const [sx, sy] of [[x0, y], [x0 + bw - dp(6), y], [x0, y + bh - dp(6)], [x0 + bw - dp(6), y + bh - dp(6)]]) gr.FillSolidRect(sx, sy, dp(6), dp(6), C.fg);
    label(gr, tr("PLAYLIST NO."), hst(HST.head, C.fg), x0 + dp(14), y + Math.round((bh - labelHeight(HST.head)) / 2));
    drawRoll(gr, P.no, f, C.fg, x0 + dp(14) + lw + dp(10), y, cell, bh);
    // stats, right-aligned: 041 TRACKS · 3:02:11 · 1.9 GB
    // (the name comes first: on a narrow panel the size, then the length, give way to it)
    let sx = x1;
    const nx = x0 + bw + dp(22), full = P.name ? P.name.text : "", name = P.name ? scrambleText(P.name) : "", nf = fontFor(full, 17, 700);
    if (pl >= 0) {
        const s = plStats(pl), parts = [[pad(s.count, s.count > 999 ? 4 : 3), " " + tr("TRACKS")], [fmtTime(s.length), ""], [fmtSize(s.size), ""]];
        const sy = y + Math.round((bh - labelHeight(HST.stat)) / 2), nameW = gr.CalcTextWidth(full, nf), need = nx + nameW + dp(24);
        const partW = ([n, word], i) => labelWidth(n, hst(HST.statN, 0)) + (word ? labelWidth(word, hst(HST.stat, 0)) : 0) + (i ? labelWidth("  ·  ", hst(HST.stat, 0)) : 0);
        const left = () => x1 - parts.reduce((w, p, i) => w + partW(p, i), 0);
        while (parts.length > 1 && left() < need) parts.pop();
        // narrower still, and the name would have no room to start: the word goes, then the count itself
        const least = nx + Math.min(nameW, dp(120)) + dp(24);
        if (left() < least) parts[0][1] = "";
        if (left() < least) parts.pop();
        for (let i = parts.length - 1; i >= 0; i--) {
            const [n, word] = parts[i];
            if (word) sx -= label(gr, word, hst(HST.stat, C["text-muted"]), sx, sy, 2);
            sx -= label(gr, n, hst(HST.statN, C.fg), sx, sy, 2);
            if (i) sx -= label(gr, "  ·  ", hst(HST.stat, C["text-muted"]), sx, sy, 2);
        }
    }
    // the name between the bracket and the stats
    const nw = (sx < x1 ? sx - dp(24) : x1) - nx;
    if (nw > dp(24)) {
        gr.DrawText(name, nf, C.fg, nx, y, nw, bh, DT_SINGLE | DT_ELLIPSIS);
        hits.add("name", nx, y, Math.min(nw, gr.CalcTextWidth(name, nf)), bh);
    }
    // row 2: chips and the selection on the left, actions on the right
    const cy = dp(62), ch = dp(18);
    const layoutLeft = drawLayoutToggle(gr, x1, cy, ch);
    const actionsLeft = drawAddTracksButton(gr, x0, layoutLeft - dp(16), cy, ch);
    let cx = x0;
    if (pl >= 0) {
        const loc = plman.GetPlayingItemLocation();
        if (loc.IsValid && loc.PlaylistIndex === pl) cx += chip(gr, tr(fb.IsPaused ? "PAUSED" : "PLAYING"), cx, cy, ch, "acc", 9, C.bg) + dp(6);
        if (plman.IsAutoPlaylist(pl)) cx += chip(gr, tr("AUTOPLAYLIST"), cx, cy, ch, "", 9, C.bg) + dp(6);
        else if (plman.IsPlaylistLocked(pl)) cx += chip(gr, tr("LOCKED"), cx, cy, ch, "", 9, C.bg) + dp(6);
        cx = drawQueueButton(gr, cx, actionsLeft - dp(12), cy, ch);
        const selection = tr("{0} SELECTED", pad(P.sel, 2)), s = hst(HST.sel, C["text-muted"]);
        if (P.sel > 1 && cx + dp(6) + labelWidth(selection, s) + dp(10) <= actionsLeft) {
            label(gr, selection, s, cx + dp(6), cy + Math.round((ch - labelHeight(HST.sel)) / 2));
        }
    }
    // heavy rule, column titles, hairline
    const ry = H - dp(34);
    gr.FillSolidRect(0, ry, W, HEAVY, C.fg);
    drawColumns(gr, ry + HEAVY, H - HAIR - ry - HEAVY);
    hline(gr, 0, H - HAIR, W, C.hair);
    drawGrain(gr, 0, 0, W, H);
    drawQueueSwipe(gr, playlistQueueSwipe || playlistQueueSettle, W, H);
}

// ------------------------------------------------------------------------------------------------ column titles
const PRESET_META = {};
function presetMeta() {
    const p = STATE.preset;
    if (!PRESET_META[p]) {
        try { PRESET_META[p] = JSON.parse(utils.ReadTextFile(THEME_ROOT + `columns\\preset-${p}.json`, 65001)); }
        catch (e) { PRESET_META[p] = { groups: false, columns: [] }; }
    }
    return PRESET_META[p];
}
// the playlist view's size (frame.js sends it) and whether its rows overflow, i.e. it shows a vertical scroll bar
const VIEW = { w: 0, h: 0 };
onMessage("playlist-size", s => { VIEW.w = s.w; VIEW.h = s.h; window.Repaint(); });
const TF_GROUP = fb.TitleFormat("$lower(%album artist%|%album%|%discnumber%)");
let groupRows = { items: null, n: 0 };
function scrollBarShown(meta) {
    if (P.pl < 0 || !VIEW.h) return false;
    const items = plItems(P.pl), row = dp(TOKENS.metrics.row);
    if (items.Count * row > VIEW.h) return true;
    if (!meta.groups) return false;
    if (groupRows.items !== items) {
        const keys = TF_GROUP.EvalWithMetadbs(items);
        let n = 0;
        keys.forEach((k, i) => { if (!i || k !== keys[i - 1]) n++; });
        groupRows = { items, n };
    }
    return (items.Count + groupRows.n) * row > VIEW.h;
}
// x and width of each column: the fixed widths, plus the spare width shared out by each column's resize weight
function columnLayout(meta) {
    const cols = meta.columns, client = W - (scrollBarShown(meta) ? utils.GetSystemMetrics(2) : 0);
    const fixed = cols.reduce((a, c) => a + dp(c.width), 0), weights = cols.reduce((a, c) => a + c.resize, 0);
    let x = 0;
    return cols.map(c => {
        const w = dp(c.width) + (weights ? (client - fixed) * c.resize / weights : 0), r = { c, x, w };
        x += w;
        return r;
    });
}
const SORT = { title: "", dir: 1 };
function drawColumns(gr, y, h) {
    const s = hst(HST.col, 0), ty = y + Math.round((h - labelHeight(HST.col)) / 2);
    for (const { c, x, w } of columnLayout(presetMeta())) {
        if (!c.title) continue;
        const hov = c.sort && hover && hover.id === "col" && hover.data === c.title, col = hov ? C.fg : C["text-muted"];
        if (c.align === "right") label(gr, tr(c.title), hst(HST.col, col), Math.round(x + w - dp(6)), ty, 2);
        else label(gr, tr(c.title), hst(HST.col, col), Math.round(x + dp(6)), ty);
        if (x > dp(8)) vline(gr, Math.round(x), y + dp(6), h - dp(12), C.hair);
        if (c.sort && P.pl >= 0) hits.add("col", x, y, w, h, c.title);
    }
}
function sortBy(title) {
    const c = presetMeta().columns.find(k => k.title === title);
    if (!c || !c.sort || P.pl < 0) return;
    SORT.dir = SORT.title === title ? -SORT.dir : 1;
    SORT.title = title;
    plman.UndoBackup(P.pl);
    plman.SortByFormatV2(P.pl, c.sort, SORT.dir);
}

// LAYOUT [■ ALBUM | □ INDEX]: the playlist preset (the P key and the playlist's context menu switch it too)
function drawLayoutToggle(gr, xRight, y, hh) {
    const items = [["album", tr("ALBUM")], ["index", tr("INDEX")]], s = hst(HST.tog, 0);
    const widths = items.map(([, t]) => dp(9) + dp(5) + dp(6) + labelWidth(t, s) + dp(9)), total = widths[0] + widths[1];
    let ix = xRight - total;
    const layout = tr("LAYOUT"), layoutLeft = ix - dp(12) - labelWidth(layout, s);
    label(gr, layout, hst(HST.tog, C["text-muted"]), ix - dp(12), y + Math.round((hh - labelHeight(HST.tog)) / 2), 2);
    items.forEach(([p, t], i) => {
        const on = STATE.preset === p, hov = !on && hover && hover.id === "preset", col = on ? C.bg : hov ? C.fg : C["text-muted"];
        if (on) gr.FillSolidRect(ix, y, widths[i], hh, C.fg);
        toggleMark(gr, ix + dp(9), y + hh / 2, on, col);
        label(gr, t, hst(HST.tog, col, on ? C.fg : C.bg), ix + dp(20), y + Math.round((hh - labelHeight(HST.tog)) / 2));
        if (!on) hits.add("preset", ix, y, widths[i], hh, p);
        ix += widths[i];
    });
    box(gr, xRight - total, y, total, hh, C["line-faint"]);
    return layoutLeft;
}

function drawAddTracksButton(gr, minX, right, y, h) {
    const enabled = P.sel > 0, hot = enabled && hover && hover.id === "add-tracks";
    const title = tr("Add to playlist"), s = hst(HST.tog, enabled ? C.fg : C["text-muted"]);
    const w = labelWidth(title, s) + dp(20), x = right - w;
    if (x < minX) return right;
    box(gr, x, y, w, h, hot ? C.accent : C["line-faint"]);
    label(gr, title, s, x + dp(10), y + Math.round((h - labelHeight(HST.tog)) / 2));
    if (enabled) hits.add("add-tracks", x, y, w, h);
    return x;
}

function drawQueueButton(gr, x, right, y, h) {
    const enabled = P.sel > 0, hot = enabled && hover && hover.id === "queue-add";
    const s = hst(HST.tog, enabled ? C.fg : C["text-muted"]);
    let title = tr("ADD TO QUEUE"), w = labelWidth(title, s) + dp(34);
    if (x + w > right) { title = tr("QUEUE"); w = labelWidth(title, s) + dp(34); }
    if (x + w > right) return x;
    box(gr, x, y, w, h, enabled ? C.accent : C["line-faint"]);
    label(gr, title, s, x + dp(10), y + Math.round((h - labelHeight(HST.tog)) / 2));
    const ax = x + w - dp(11), ay = y + h / 2;
    const arrow = hot ? C.fg : enabled ? C.accent : C["text-muted"];
    gr.DrawLine(ax - dp(4), ay - dp(4), ax, ay, HAIR, arrow);
    gr.DrawLine(ax, ay, ax - dp(4), ay + dp(4), HAIR, arrow);
    if (enabled) hits.add("queue-add", x, y, w, h);
    return x + w + dp(6);
}

function addTracksMenu(x, y) {
    const from = plman.ActivePlaylist;
    if (from < 0) return;
    const items = plman.GetPlaylistSelectedItems(from);
    if (!items.Count) return;
    const menu = window.CreatePopupMenu(), destinations = [];
    menu.AppendMenuItem(0, 1, tr("New playlist") + "…");
    for (let i = 0; i < plman.PlaylistCount; i++) {
        if (i !== from && canReceiveTracks(i)) destinations.push(i);
    }
    if (destinations.length) menu.AppendMenuSeparator();
    destinations.forEach((pl, i) => menu.AppendMenuItem(0, i + 2, plman.GetPlaylistName(pl).replace(/&/g, "&&")));
    const id = menu.TrackPopupMenu(x, y);
    if (id > 0) appendUniqueTracks(id === 1 ? newNamedPlaylist() : destinations[id - 2], items);
}

// --------------------------------------------------------------------------------------------------- mouse
function on_mouse_lbtn_down(x, y) {
    playlistQueueSwipe = null;
    const a = hits.at(x, y), playlist = plman.ActivePlaylist;
    if (!a || a.id !== "queue-add" || playlist < 0) return;
    const items = plman.GetPlaylistSelectedItems(playlist);
    if (!items.Count) return;
    const title = items.Count === 1 ? TF_QUEUE_SELECTION.EvalWithMetadb(items[0]) : tr("{0} TRACKS", items.Count);
    const source = { playlist, indexes: plman.GetPlaylistSelectedIndexes(playlist) };
    playlistQueueSettle = null;
    playlistQueueSwipe = { x, y, hit: a, title, items, source, distance: 0, ready: false, moved: false };
}

function finishPlaylistQueueSwipe(add) {
    const swipe = playlistQueueSwipe;
    playlistQueueSwipe = null;
    if (!swipe) return;
    const added = add && enqueueTracks(swipe.items, swipe.source) > 0;
    if (!REDUCE_MOTION && swipe.distance >= dp(5)) {
        playlistQueueSettle = { ...swipe, added, tw: Tween(180) };
        clock.wake();
    }
    if (added) send("queue-open", true);
    window.Repaint();
}

function on_mouse_move(x, y, mask) {
    if (playlistQueueSwipe) {
        if (mask & 1) {
            updateQueueSwipe(playlistQueueSwipe, x, y);
            window.SetCursor(32649);
            return;
        }
        finishPlaylistQueueSwipe(false);
    }
    const a = hits.at(x, y);
    if ((a && a.id) !== (hover && hover.id) || (a && a.data) !== (hover && hover.data)) { hover = a; window.Repaint(); }
    window.SetCursor(a && (a.id === "preset" || a.id === "col" || a.id === "add-tracks" || a.id === "queue-add") ? 32649 : 32512);
}
function on_mouse_leave() { finishPlaylistQueueSwipe(false); if (hover) { hover = null; window.Repaint(); } }
function on_mouse_lbtn_up(x, y) {
    const a = hits.at(x, y);
    if (playlistQueueSwipe) {
        const swipe = playlistQueueSwipe;
        updateQueueSwipe(swipe, x, y);
        finishPlaylistQueueSwipe(swipe.ready || (!swipe.moved && a && a.id === "queue-add"));
        return;
    }
    if (a && a.id === "preset") send("preset");
    else if (a && a.id === "col") sortBy(a.data);
    else if (a && a.id === "add-tracks") addTracksMenu(a.x, a.y + a.h);
}
function on_mouse_lbtn_dblclk(x, y) {
    const a = hits.at(x, y);
    if (!a || a.id !== "name" || P.pl < 0) return;
    let name;
    try { name = utils.InputBox(window.ID, tr("Playlist name"), tr("Rename playlist"), plman.GetPlaylistName(P.pl), true); } catch (e) { return; }
    if (name && name.trim()) plman.RenamePlaylist(P.pl, name.trim());
}
function on_char(code) { searchChar(code); }
function on_key_down(vk) {
    if (vk === 0x1b && playlistQueueSwipe) { finishPlaylistQueueSwipe(false); return; }
    if (searchKey(vk)) return;
    if (vk === 0x20) fb.PlayOrPause(); else globalKey(vk);
}

// ----------------------------------------------------------------------------------------------- callbacks
function on_playlist_switch() { load(true); }
function on_playlists_changed() { plDirty(); load(false); }
// (the album playlist's name follows what it holds: refilled, it scrambles in as the new album. Both callbacks come
// after the refill, so the removal already sees the new album; load() only animates a name that changed)
function on_playlist_items_added(i) { plDirty(i); if (i === P.pl) load(true); }
function on_playlist_items_removed(i) { plDirty(i); if (i === P.pl) load(true); }
function on_playlist_items_selection_change() { countSelection(); window.Repaint(); }
function on_playlist_items_reordered(i) { plDirty(i); }
function on_playback_new_track() { window.Repaint(); }
function on_playback_pause() { window.Repaint(); }
function on_playback_stop(reason) { if (reason !== 2) window.Repaint(); }
function on_colours_changed() { refreshTokens(); window.Repaint(); }
onMessage("state", () => { SORT.title = ""; window.Repaint(); });
helloFrame();   // lib/bus.js
load(false);
