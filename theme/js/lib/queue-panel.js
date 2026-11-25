"use strict";

const QUEUE_PANEL = { first: 0, drag: null, over: false, reveal: null, shown: [] };
const TF_QUEUE_ROW = fb.TitleFormat("%title%\u0001[%artist%]");
const QUEUE_TEXT = { size: 10, weight: 600, track: .1 };
const queueListTop = () => dp(60);
const queueRowHeight = () => dp(42);
const queueVisibleRows = () => Math.max(1, Math.floor((H - queueListTop() - dp(16)) / queueRowHeight()));
const queueScrollMax = count => Math.max(0, count - queueVisibleRows());
const queueDragTarget = drag => drag.slot > drag.from ? drag.slot - 1 : drag.slot;

function stepQueueRows(dt) {
    const drag = QUEUE_PANEL.drag;
    if (!drag || drag.slot < 0) return false;
    let moving = false;
    for (const shift of drag.shifts) moving = stepSpring(shift, dt) || moving;
    return moving;
}

function drawQueueDropFeedback(gr) {
    const k = QUEUE_PANEL.reveal ? easeOutCubic(tweenK(QUEUE_PANEL.reveal)) : 1;
    const inset = Math.round(dp(10) * (1 - k));
    box(gr, inset, inset, W - inset * 2, H - inset * 2, C.accent, dp(2));
    if (STATE.queueOpen) return;
    const s = { ...QUEUE_TEXT, colour: C.accent, bg: C.bg };
    const x = Math.round(W / 2 + dp(24) * (1 - k));
    label(gr, tr("ADD TO QUEUE"), s, x, Math.round((H - labelHeight(s)) / 2), 1);
}

function drawQueueRow(gr, entry, i, x, y, w, row, floating) {
    const hot = hover && (hover.id === "queue-entry" || hover.id === "queue-remove") && hover.data === i;
    const [title, artist] = TF_QUEUE_ROW.EvalWithMetadb(entry.Handle).split("\u0001");
    if (floating || hot) gr.FillSolidRect(x, y, w, row, C.panel);
    for (let j = -1; j <= 1; j++) hline(gr, x + dp(7), y + row / 2 + dp(4) * j, dp(8), floating ? C.accent : C["line-dim"]);
    text(gr, pad(i + 1, 2), 9, 600, C.accent, x + dp(22), y, dp(38), row);
    text(gr, title, 12, 600, C.fg, x + dp(59), y + dp(2), w - dp(92), dp(20));
    text(gr, artist, 9.5, 400, C["text-muted"], x + dp(59), y + dp(20), w - dp(92), dp(17));
    if (floating) box(gr, x, y, w, row, C.accent);
    else {
        text(gr, "×", 13, 500, hot ? C.fg : C["text-muted"], x + w - dp(21), y, dp(18), row);
        hline(gr, x, y + row - HAIR, w, C["line-faint"]);
    }
}

function drawQueuePanel(gr) {
    const queue = plman.GetPlaybackQueueContents(), count = queue.length;
    QUEUE_PANEL.shown = queue;
    const x = dp(16), w = W - 2 * x, top = queueListTop(), row = queueRowHeight(), foot = H - dp(12);
    if (w <= dp(48) || foot <= top) return;
    const style = { ...QUEUE_TEXT, colour: C.fg, bg: C.bg };
    const close = dp(28), closeX = W - x - close, cy = dp(34);
    const titleW = label(gr, tr("QUEUE"), style, x, cy - Math.round(labelHeight(style) / 2));
    label(gr, String(count), { ...style, colour: C.accent }, x + titleW + dp(12), cy - Math.round(labelHeight(style) / 2));
    const closeHot = hover && hover.id === "queue-close";
    box(gr, closeX, cy - close / 2, close, close, closeHot ? C.accent : C["line-faint"]);
    gr.DrawLine(closeX + dp(9), cy - dp(5), closeX + dp(19), cy + dp(5), HAIR, C.fg);
    gr.DrawLine(closeX + dp(9), cy + dp(5), closeX + dp(19), cy - dp(5), HAIR, C.fg);
    hits.add("queue-close", closeX, cy - close / 2, close, close);
    hline(gr, x, top - dp(4), w, C.hair);

    const max = queueScrollMax(count), first = QUEUE_PANEL.first = clamp(QUEUE_PANEL.first, 0, max);
    const end = Math.min(count, first + queueVisibleRows()), drag = QUEUE_PANEL.drag;
    const floating = !REDUCE_MOTION && drag && drag.slot >= 0 && sameQueueEntry(queue[drag.from], drag.snapshot[drag.from]);
    if (!count) text(gr, tr("QUEUE IS EMPTY"), 10, 500, C["text-muted"], x, top + dp(12), w, dp(24));
    gr.PushClip(x, top, w, foot - top);
    for (let i = floating ? Math.max(0, first - 1) : first; i < (floating ? Math.min(count, end + 1) : end); i++) {
        if (floating && i === drag.from) continue;
        const shift = floating && drag.shifts[i] ? drag.shifts[i].x : 0;
        const y = top + Math.round((i - first + shift) * row);
        drawQueueRow(gr, queue[i], i, x, y, w, row, false);
        if (!floating) {
            hits.add("queue-entry", x, y, w - dp(28), row, i);
            hits.add("queue-remove", W - x - dp(28), y, dp(28), row, i);
        }
    }
    if (floating) {
        const y = clamp(drag.y - drag.grab, top, Math.max(top, foot - row));
        drawQueueRow(gr, queue[drag.from], queueDragTarget(drag), x, y, w, row, true);
    } else if (drag && drag.slot >= first && drag.slot <= end) {
        const y = Math.min(foot - HEAVY, top + (drag.slot - first) * row);
        hline(gr, x, y, w, C.accent, HEAVY);
    }
    gr.PopClip();
    if (max > 0) {
        const span = Math.min(foot - top, queueVisibleRows() * row), size = Math.max(dp(14), Math.round(span * queueVisibleRows() / count));
        gr.FillSolidRect(W - dp(6), top + Math.round((span - size) * first / max), dp(2), size, C["line-dim"]);
    }
    if (QUEUE_PANEL.over) drawQueueDropFeedback(gr);
}

function scrollQueue(delta) {
    const before = QUEUE_PANEL.first, count = plman.GetPlaybackQueueContents().length;
    QUEUE_PANEL.first = clamp(before + delta, 0, queueScrollMax(count));
    if (before !== QUEUE_PANEL.first) window.Repaint();
}

function stopQueueDrag() {
    const drag = QUEUE_PANEL.drag;
    if (!drag) return;
    QUEUE_PANEL.drag = null;
    window.ClearInterval(drag.timer);
    window.Repaint();
}

function queueRowDown(hit, y) {
    if (!hit || hit.id !== "queue-entry") return;
    const snapshot = plman.GetPlaybackQueueContents();
    if (!sameQueueEntry(snapshot[hit.data], QUEUE_PANEL.shown[hit.data])) return;
    const drag = { snapshot, from: hit.data, y0: y, y, grab: y - hit.y, slot: -1, timer: 0,
        shifts: snapshot.map(() => Spring(0)) };
    QUEUE_PANEL.drag = drag;
    drag.timer = window.SetInterval(() => {
        if (QUEUE_PANEL.drag !== drag) return;
        if (!utils.IsKeyPressed(0x01)) { stopQueueDrag(); return; }
        if (drag.slot < 0) return;
        const top = queueListTop(), bottom = top + queueVisibleRows() * queueRowHeight();
        const edge = dp(12), step = drag.y < top + edge ? -1 : drag.y >= bottom - edge ? 1 : 0;
        if (step) { scrollQueue(step); queueRowMove(drag.y, true); }
    }, 120);
}

function queueRowMove(y, held) {
    const drag = QUEUE_PANEL.drag;
    if (!drag) return;
    if (!held) { stopQueueDrag(); return; }
    drag.y = y;
    if (drag.slot < 0 && Math.abs(y - drag.y0) < dp(5)) return;
    const row = clamp(Math.round((y - queueListTop()) / queueRowHeight()), 0, queueVisibleRows());
    const slot = clamp(QUEUE_PANEL.first + row, 0, drag.snapshot.length);
    if (slot !== drag.slot) {
        drag.slot = slot;
        const from = drag.from, to = queueDragTarget(drag);
        drag.shifts.forEach((shift, i) => { shift.to = i > from && i <= to ? -1 : i < from && i >= to ? 1 : 0; });
        if (!REDUCE_MOTION) clock.wake();
    }
    window.Repaint();
}

function queueRowUp(x, y) {
    const drag = QUEUE_PANEL.drag;
    if (!drag) return false;
    queueRowMove(y, true);
    stopQueueDrag();
    if (x >= 0 && x < W && y >= queueListTop() - dp(10) && y < H && drag.slot >= 0) {
        moveQueuedTrack(drag.snapshot, drag.from, queueDragTarget(drag));
    }
    return true;
}

function removeQueueRow(i, entry = QUEUE_PANEL.shown[i]) {
    if (sameQueueEntry(entry, plman.GetPlaybackQueueContents()[i])) plman.RemoveItemFromPlaybackQueue(i);
}

function queueRowMenu(x, y, hit) {
    if (!hit || !["queue-entry", "queue-remove"].includes(hit.id)) return false;
    const queue = plman.GetPlaybackQueueContents(), i = hit.data;
    if (!sameQueueEntry(queue[i], QUEUE_PANEL.shown[i])) return true;
    const menu = window.CreatePopupMenu();
    menu.AppendMenuItem(i > 0 ? 0 : 1, 1, tr("Move up"));
    menu.AppendMenuItem(i + 1 < queue.length ? 0 : 1, 2, tr("Move down"));
    menu.AppendMenuSeparator();
    menu.AppendMenuItem(0, 3, tr("Remove"));
    const id = menu.TrackPopupMenu(x, y);
    if (id === 1 || id === 2) moveQueuedTrack(queue, i, i + (id === 1 ? -1 : 1));
    else if (id === 3) removeQueueRow(i, queue[i]);
    return true;
}
