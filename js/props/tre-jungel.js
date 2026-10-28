'use strict';
/* Jungeltre: stamme som smalner oppover, støtterøtter, greiner med løv, krone, mose og lianer.
   Greinene og toppen blir sitteplasser for papegøyer og apekatter (env.perches). Brukes av c.tree i core.js. */
PROPS.jungeltre={
  navn:'Jungeltre',info:'Regnskogstre (Ildfjellet, Verden). c.tree(x,z,{h,r})',
  params:{
    h:{v:[5,9],min:2,max:14,step:.1,navn:'Høyde'},
    r:{v:[.18,.34],min:.08,max:.7,step:.01,navn:'Stammeradius'},
    lean:{v:[-.07,.07],min:-.4,max:.4,step:.01,navn:'Helning'},
    ry:{v:[0,6.28],min:0,max:6.28,step:.01,navn:'Dreiing'},
    mose:{v:.75,min:0,max:1,step:.05,navn:'Sjanse for mose'},
    grener:{v:[2,4],min:0,max:7,step:1,navn:'Antall greiner'},
    krone:{v:1,min:.4,max:2,step:.05,navn:'Kronestørrelse'},
    liana:{v:.6,min:0,max:1,step:.05,navn:'Sjanse for liane'}
  },
  BARK:['#4a3826','#6b5137'],LEAF:['#2d6b2a','#3b7f33','#246126','#4a8f3a'],MOSS:['#3a5a28','#4d6e30'],
  // trekker tilfeldige tall i samme rekkefølge som før, så skogene på øyene står der de alltid har stått
  place(x,z,o,env){const R=env.rng,P=this.params,rr=(k)=>o[k]??(Array.isArray(P[k].v)?P[k].v[0]+R()*(P[k].v[1]-P[k].v[0]):P[k].v);
    const t={x,z,h:rr('h'),r:rr('r'),lean:rr('lean'),ry:rr('ry'),branches:[]};t.moss=o.moss??R()<(o.mose??P.mose.v);
    const nb=o.grener??o.branches??(2+Math.floor(R()*3));
    for(let i=0;i<nb;i++){const hy=t.h*(.45+.4*i/nb+R()*.1),ang=t.ry+i*2.1+R()*.8,len=1.2+R()*1.4,tilt=.55+R()*.5;t.branches.push({hy,ang,len,tilt})}
    t.krone=o.krone??P.krone.v;t.liana=o.liana??P.liana.v;
    env.colliders.push({x,z,r:t.r*1.3,anchor:true,y:env.H(x,z)+.7});return t},
  build(t,env,out){const R=env.rng,H=env.H,th=t.h,r=t.r,k=t.krone;
    // helningen får en tilfeldig himmelretning (før lente alle trær bare mot øst eller vest)
    const ld=R()*6.28,la=Math.abs(t.lean),ax=tiltVec(ld,la),rot=dirRot(ld,la);
    const yb=footY(H,t.x,t.z,r*.8)-.06,at=s=>({x:t.x+ax.x*s,y:yb+ax.y*s,z:t.z+ax.z*s}),rAt=s=>r*(1-.3*s/th);
    const bark=mix(this.BARK[0],this.BARK[1],R()),barkD=tint(bark,-.18),hue=(R()-.5)*.16,leaf=()=>tint(this.LEAF[Math.floor(R()*4)],hue+(R()-.5)*.1);
    const mid=at(th/2);out.add(PG.taper,DM.bark,Object.assign({x:mid.x,y:mid.y,z:mid.z,sx:r,sy:th,sz:r,c:bark},rot));
    // støtterøtter: tynne finner som stråler ut fra stammen og skrår ned i bakken
    const nr=3+(R()<.5?1:0);for(let i=0;i<nr;i++){const a=t.ry+i*6.28/nr+(R()-.5)*.5,L=r*(1.6+R()*.9),d=r*.7+L/2;
      out.add(PG.fin,DM.bark,{x:t.x+Math.cos(a)*d,y:yb,z:t.z+Math.sin(a)*d,sx:L,sy:r*(2.2+R()*1.4),sz:r*.36,ry:-a,c:barkD})}
    // mose på den ene siden av stammen, langs samme akse og litt inn i den
    if(t.moss){const ml=th*.32,c0=at(ml/2+.02),d=r*.32;
      out.add(PG.taper,DM.white,Object.assign({x:c0.x+Math.cos(t.ry)*d,y:c0.y,z:c0.z+Math.sin(t.ry)*d,sx:r*.74,sy:ml,sz:r*.74,c:mix(this.MOSS[0],this.MOSS[1],R())},rot),false)}
    const blobs=[];
    for(const b of t.branches){const s=Math.min(b.hy,th*.92),bp=at(s),bv=tiltVec(b.ang,Math.PI/2-b.tilt),L=b.len;
      const tip={x:bp.x+bv.x*L,y:bp.y+bv.y*L,z:bp.z+bv.z*L};
      out.add(DG.branch,DM.bark,stemBetween(bp,tip,rAt(s)*.5,{c:bark}));
      // løvet sitter på greinspissen: kula går ned forbi spissen, så greina forsvinner inn i den
      const sx=(.85+R()*.45)*k,sy=(.52+R()*.2)*k;blobs.push({x:tip.x,y:tip.y+sy*.55,z:tip.z,sx,sy,sz:(.85+R()*.45)*k,c:leaf()});
      blobs.push({x:tip.x+bv.x*.35*k,y:tip.y+sy*.35,z:tip.z+bv.z*.35*k,sx:sx*.6,sy:sy*.75,sz:sx*.6,c:leaf()});
      // apene sitter på greina, under løvet
      const f=.45;env.perches.push({x:bp.x+bv.x*L*f,y:bp.y+bv.y*L*f+rAt(s)*.4,z:bp.z+bv.z*L*f,tree:t,kind:'branch',dir:b.ang})}
    // kronen: en hovedkule rett over stammetoppen (stammen går inn i den), noen rundt, og en mørkere undre kule for dybde
    const tp=at(th);
    blobs.push({x:tp.x,y:tp.y+.2*k,z:tp.z,sx:(1.4+R()*.6)*k,sy:(.75+R()*.3)*k,sz:(1.4+R()*.6)*k,c:leaf()});
    blobs.push({x:tp.x,y:tp.y-.2*k,z:tp.z,sx:(1.1+R()*.4)*k,sy:.45*k,sz:(1.1+R()*.4)*k,c:tint(leaf(),-.2)});
    const nt=2+(R()<.6?1:0);for(let i=0;i<nt;i++){const a=R()*6.28,d=(.5+R()*.5)*k,sy=(.6+R()*.35)*k;blobs.push({x:tp.x+Math.cos(a)*d,y:tp.y+.15*k+R()*.45*k,z:tp.z+Math.sin(a)*d,sx:(1.1+R()*.7)*k,sy,sz:(1.1+R()*.7)*k,c:tint(leaf(),.06)})}
    let top=blobs[blobs.length-1];for(const b of blobs){out.add(PG.crown,DM.leaf,b);if(b.y+b.sy>top.y+top.sy)top=b}
    env.perches.push({x:top.x,y:top.y+top.sy*.9,z:top.z,tree:t,kind:'top'});
    // en liane henger fra undersiden av en løvkule og stopper over bakken
    if(R()<t.liana){const b=blobs[Math.floor(R()*blobs.length)],a=R()*6.28,q=R()*.45,lx=b.x+Math.cos(a)*b.sx*q,lz=b.z+Math.sin(a)*b.sz*q,y0=b.y-b.sy*.75;
      const len=Math.min(th*(.35+R()*.45),y0-H(lx,lz)-.35);
      if(len>.5)out.add(DG.trunk,DM.white,{x:lx,y:y0-len/2,z:lz,sx:.022,sy:len,sz:.022,rx:(R()-.5)*.1,rz:(R()-.5)*.1,c:'#4f6b2c'},false)}}
};
