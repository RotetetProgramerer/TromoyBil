'use strict';
/* Kjempestamme: i skala 1:24 er en vanlig trestamme enorm, og kronen er langt over bildet.
   Stammen får røtter, avbrukne greinstumper og mose. Brukes i Froland og Nidelva (banen lager selve rotmolden med rock()). */
PROPS.kjempestamme={
  navn:'Kjempestamme',info:'Stamme som går ut av bildet (Froland, Nidelva). c.plant(\'kjempestamme\',x,z,{r})',
  params:{
    r:{v:[.5,1.25],min:.3,max:2,step:.05,navn:'Radius'},
    h:{v:24,min:6,max:40,step:1,navn:'Høyde'},
    stumper:{v:4,min:0,max:9,step:1,navn:'Greinstumper'},
    mose:{v:.7,min:0,max:1,step:.05,navn:'Sjanse for mose'}
  },
  place(x,z,o,env){const p=propParams('kjempestamme',o,env.rng);env.colliders.push({x,z,r:p.r*1.05});return Object.assign({x,z},p)},
  build(t,env,out){const R=env.rng,r=t.r,h=t.h,y=footY(env.H,t.x,t.z,r*.6)-.1,bark=mix('#5a4331','#6e5440',R()),barkD=shade(bark,-.2),ry=R()*6.28;
    out.add(DG.trunk,DM.bark,{x:t.x,y:y+h/2,z:t.z,sx:r,sy:h,sz:r,ry,c:bark});
    for(let i=0;i<5;i++){const a=ry+i*1.26+(R()-.5)*.4,L=r*(1.3+R()*.8),d=r*.8+L/2;
      out.add(PG.fin,DM.bark,{x:t.x+Math.cos(a)*d,y,z:t.z+Math.sin(a)*d,sx:L,sy:r*(1.4+R()*1.0),sz:r*.32,ry:-a,c:barkD})}
    for(let i=0;i<Math.round(t.stumper);i++){const a=R()*6.28,s=2.5+R()*8,b={x:t.x+Math.cos(a)*r*.6,y:y+s,z:t.z+Math.sin(a)*r*.6},v=dirVec(a,1.05+R()*.4),L=r*.5+R()*.6;
      out.add(DG.branch,DM.bark,stemBetween(b,{x:b.x+v.x*(r*.35+L),y:b.y+v.y*(r*.35+L),z:b.z+v.z*(r*.35+L)},r*.16,{c:barkD}))}
    if(R()<t.mose){const a=R()*6.28,ml=1.2+R()*2,d=r*.25;
      out.add(DG.trunk,DM.white,{x:t.x+Math.cos(a)*d,y:y+ml/2,z:t.z+Math.sin(a)*d,sx:r*.82,sy:ml,sz:r*.82,c:mix('#3a5228','#4c6834',R())},false)}}
};
