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
    labelSource:null, auto:getSetting("vinylScreenAuto",true), albumTiming:null, dismissUp:false, previousView:null, trackAt:0 };

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
    s.screen=false;
    const previous=s.previousView; s.previousView=null;
    if (previous && previous!=="archive") send("view",previous);
    clock.wake(); window.Repaint(); return true;
}
function vinylEnterScreen(manual) {
    if (!vinylAssets() || !fb.IsPlaying || STATE.mini || VPLAYER.screen) return;
    if (manual && STATE.view!=="archive") { VPLAYER.previousView=STATE.view; send("view","archive"); }
    vinylAlbumTiming(); VPLAYER.screen=true; VPLAYER.entered=performance.now(); clock.wake(); window.Repaint();
}
onMessage("vinyl-screen",()=>{ if (VPLAYER.screen) vinylWakeScreen(); else vinylEnterScreen(true); });
function on_playback_time() {
    if (VPLAYER.auto && STATE.view==="archive" && AR.layout!=="grid" && !AF.open && !STATE.queueOpen && !STATE.mini && !fb.IsPaused &&
        !VPLAYER.grip && !archiveQueueSwipe && !SIDE_DRAG && !AR.rulerDrag && Date.now()-VPLAYER.idle>=30000) vinylEnterScreen(false);
}
function vinylScreenPaint(gr) {
    const m=vinylAssets(),d=m.deck.base.crop, now=performance.now();
    const approach=REDUCE_MOTION ? 1 : clamp((now-VPLAYER.entered)/650,0,1);
    const to=Math.min(W*.77/d[2],H*.75/d[3]), layout=vinylLayout();
    const g={k:lerp(layout.k,to,approach),dx:lerp(layout.dx,(W-d[2]*to)/2-d[0]*to,approach),
        dy:lerp(layout.dy,(H-d[3]*to)/2-d[1]*to,approach)};
    gr.FillSolidRect(0,0,W,H,0xff16191a);
    const h=fb.GetNowPlaying(), c=h && cover(h,()=>window.Repaint());
    vinylDeck(gr,g,c && c.img,true,"groove");
    const age=now-Math.max(VPLAYER.entered,VPLAYER.trackAt);
    if (age<5000 && h && T.info) {
        const alpha=clamp((5000-age)/700,0,1);
        gr.DrawText([T.info.artist,T.info.title].filter(Boolean).join("  ·  "),font(15,500),withAlpha(0xffe9e7dc,alpha),0,H*.87,W,H*.09,DT_CENTER_SINGLE);
    }
}

