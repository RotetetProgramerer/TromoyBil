'use strict';
/* Lykt: stolpe med sokkel, arm og lampehode. Hodet lyser om natta (fx 'lamp', se game.js), og duene sitter på toppen.
   arm 0 gir en kailykt med hodet rett på toppen av stolpen (landsbyene). Brukes av c.lamp i core.js. */
PROPS.lykt={
  navn:'Lykt',info:'Gatelykt og kailykt. c.lamp(x,z,{h,arm,ang,col,y})',
  params:{
    h:{v:1.7,min:.8,max:3.5,step:.05,navn:'Høyde'},
    arm:{v:.45,min:0,max:1,step:.01,navn:'Armlengde (0 = kailykt)'},
    ang:{v:0,min:0,max:6.28,step:.01,navn:'Retning'},
    hode:{v:1,min:.6,max:1.6,step:.05,navn:'Hodestørrelse'}
  },
  // høyden leses først når lykta bygges, så den står på ferdig bakke; kollideren får riktig høyde da
  place(x,z,o,env){const p=propParams('lykt',o,env.rng),col={x,z,r:.08,anchor:true,y:(o.y??env.H(x,z))+.6};env.colliders.push(col);
    return Object.assign({x,z,y:o.y,col:o.col||'#3a3a3a',collider:col},p)},
  build(t,env,out){const y=t.y??footY(env.H,t.x,t.z,.06),h=t.h,k=t.hode,ax=Math.sin(t.ang)*t.arm,az=Math.cos(t.ang)*t.arm,hx=t.x+ax,hz=t.z+az,dark=t.col;
    t.collider.y=y+.6;
    out.add(PG.stem,DM.white,{x:t.x,y:y-.05,z:t.z,sx:.08,sy:.17,sz:.08,c:shade(dark,.15)});                     // sokkel
    out.add(PG.stem,DM.white,{x:t.x,y:y-.05,z:t.z,sx:.045,sy:h+.05,sz:.045,c:dark});                             // stolpe
    let hc;   // midten av lampehodet
    if(t.arm>.02){out.add(DG.root,DM.white,{x:t.x+ax/2,y:y+h-.025,z:t.z+az/2,sx:.05,sy:.05,sz:t.arm+.04,ry:t.ang,c:dark});hc=y+h-.09*k}
    else hc=y+h+.07*k;
    out.add(DG.root,DM.white,{x:hx,y:hc,z:hz,sx:.26*k,sy:.14*k,sz:.26*k,ry:t.ang,c:'#fff0c0'});
    out.add(DG.root,DM.white,{x:hx,y:hc+.09*k,z:hz,sx:.3*k,sy:.04*k,sz:.3*k,ry:t.ang,c:dark});
    (env.fx||[]).push({type:'lamp',x:hx,y:hc-.01,z:hz});
    env.perches.push(t.arm>.02?{x:t.x,y:y+h,z:t.z,kind:'post'}:{x:hx,y:hc+.11*k,z:hz,kind:'post'})}
};
