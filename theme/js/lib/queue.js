"use strict";

const sameQueuedTrack = (a, b) => !!(a && b && a.RawPath === b.RawPath && a.SubSong === b.SubSong);
const sameQueueEntry = (a, b) => !!(a && b && a.PlaylistIndex === b.PlaylistIndex &&
    a.PlaylistItemIndex === b.PlaylistItemIndex && sameQueuedTrack(a.Handle, b.Handle));

function enqueueTracks(items, source = null) {
    if (!items || !items.Count) return 0;
    const before = plman.GetPlaybackQueueContents().length;
    let linked = source && source.playlist >= 0 && source.playlist < plman.PlaylistCount && source.indexes.length === items.Count;
    if (linked) {
        const tracks = plman.GetPlaylistItems(source.playlist);
        linked = source.indexes.every((index, i) => sameQueuedTrack(tracks[index], items[i]));
    }
    for (let i = 0; i < items.Count; i++) {
        if (linked) plman.AddPlaylistItemToPlaybackQueue(source.playlist, source.indexes[i]);
        else plman.AddItemToPlaybackQueue(items[i]);
    }
    return Math.max(0, plman.GetPlaybackQueueContents().length - before);
}

const queueSwipeReady = (swipe, x, y) => x - swipe.x >= dp(52) && Math.abs(y - swipe.y) <= dp(32);

function updateQueueSwipe(swipe, x, y) {
    const ready = queueSwipeReady(swipe, x, y);
    const distance = Math.abs(y - swipe.y) <= dp(32) ? clamp(x - swipe.x, 0, dp(96)) : 0;
    const changed = ready !== swipe.ready || (!REDUCE_MOTION && distance !== swipe.distance);
    swipe.moved = swipe.moved || Math.abs(x - swipe.x) > dp(12) || Math.abs(y - swipe.y) > dp(12);
    swipe.ready = ready;
    swipe.distance = distance;
    if (changed) window.Repaint();
}

function drawQueueSwipe(gr, swipe, width, height) {
    if (!swipe) return;
    if (!REDUCE_MOTION && swipe.distance >= dp(5)) {
        const k = swipe.tw ? easeOutCubic(tweenK(swipe.tw)) : 0;
        const offset = swipe.added ? swipe.distance + dp(30) * k : swipe.distance * (1 - k);
        const opacity = 1 - k;
        const hit = swipe.hit, h = hit ? hit.h : dp(30);
        const w = Math.min(hit ? hit.w : dp(244), dp(272), width - dp(36));
        if (w > dp(44) && opacity > 0) {
            const x = clamp(hit ? hit.x : swipe.x - dp(12), dp(8), width - w - dp(28));
            const y = clamp(hit ? hit.y : swipe.y - h / 2, dp(4), height - h - dp(4));
            const slide = Math.round(Math.min(offset, width - x - w - dp(6))), moved = x + slide;
            if (hit) gr.FillSolidRect(x, y, w, h, withAlpha(C.bg, opacity));
            gr.FillSolidRect(x, y, slide, h, withAlpha(C.accent, opacity * (swipe.ready ? .36 : .17)));
            if (slide >= dp(18)) {
                const plus = withAlpha(C.accent, opacity);
                hline(gr, x + dp(5), y + h / 2, dp(9), plus);
                vline(gr, x + dp(9), y + h / 2 - dp(4), dp(9), plus);
            }
            gr.FillSolidRect(moved, y, w, h, withAlpha(C.panel, opacity));
            box(gr, moved, y, w, h, withAlpha(swipe.ready ? C.accent : C["line-dim"], opacity));
            const indent = hit ? dp(30) : dp(10);
            text(gr, swipe.title, 12, 600, withAlpha(C.fg, opacity), moved + indent, y, w - indent - dp(8), h);
        }
    }
    if (!swipe.tw && swipe.ready) {
        const x = clamp(swipe.x + dp(12), dp(8), Math.max(dp(8), width - dp(190)));
        const y = clamp(swipe.y - dp(36), dp(8), Math.max(dp(8), height - dp(24)));
        chip(gr, tr("ADD TO QUEUE"), x, y, dp(22), "acc", 9, C.bg);
    }
}

// foobar2000 exposes removal and append, so keep the unaffected prefix and replay only the changed tail.
function moveQueuedTrack(snapshot, from, to) {
    if (from === to || from < 0 || to < 0 || from >= snapshot.length || to >= snapshot.length) return false;
    const queue = plman.GetPlaybackQueueContents();
    if (queue.length !== snapshot.length || !queue.every((entry, i) => sameQueueEntry(entry, snapshot[i]))) return false;
    const start = Math.min(from, to), tail = queue.slice(start);
    const [entry] = tail.splice(from - start, 1);
    tail.splice(to - start, 0, entry);

    const playlists = new Map();
    const linked = tail.map(q => {
        const pl = q.PlaylistIndex, at = q.PlaylistItemIndex;
        if (pl < 0 || pl >= plman.PlaylistCount || at < 0 || at >= plman.PlaylistItemCount(pl)) return false;
        if (!playlists.has(pl)) playlists.set(pl, plman.GetPlaylistItems(pl));
        return sameQueuedTrack(playlists.get(pl)[at], q.Handle);
    });
    plman.RemoveItemsFromPlaybackQueue(tail.map((q, i) => start + i));
    tail.forEach((q, i) => {
        if (linked[i]) plman.AddPlaylistItemToPlaybackQueue(q.PlaylistIndex, q.PlaylistItemIndex);
        else plman.AddItemToPlaybackQueue(q.Handle);
    });
    return true;
}
