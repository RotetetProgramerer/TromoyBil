'use strict';
/* Gran: kort stamme og tre eller fire kjegler oppå hverandre, hver med en snøhette. snø 0 gir grønn gran uten snø.
   Brukes av c.spruce i core.js (Gautefall) og på fjellsiden på Verden. */
PROPS.gran={
  navn:'Gran',info:'Gran med snø på greinene. c.spruce(x,z,{h,snow})',
  params:{
    h:{v:[1.5,3.2],min:.6,max:6,step:.05,navn:'Høyde'},
    snow:{v:[.5,.95],min:0,max:1,step:.05,navn:'Snø'},
    ry:{v:[0,6.28],min:0,max:6.28,step:.01,navn:'Dreiing'},
    bredde:{v:1,min:.6,max:1.5,step:.05,navn:'Bredde'}
  },
  place(x,z,o,env){const p=propParams('gran',o,env.rng);env.colliders.push({x,z,r:.14+p.h*.03,anchor:true,y:env.H(x,z)+.5});return Object.assign({x,z},p)},
  build(t,env,out){const R=env.rng,h=t.h,n=h>2.3?4:3,col=mix('#1d452b','#2e5c38',R()),w=t.bredde,y=footY(env.H,t.x,t.z,.1)-.04;
    out.add(PG.trunk,DM.bark,{x:t.x,y:y+h*.1,z:t.z,sx:.05+h*.012,sy:h*.22,sz:.05+h*.012,c:'#4a3626'});
    for(let i=0;i<n;i++){const u=i/n,j=1+(R()-.5)*.1,yb=y+h*(.12+.7*u),ch=h*(.42-.14*u),r=h*(.31-.19*u)*w*j,ry=t.ry+i*.9+(R()-.5)*.3;
      out.add(DG.fern,DM.white,{x:t.x,y:yb,z:t.z,sx:r,sy:ch,sz:r,ry,c:shade(col,.06*i-.04)});
      // snøhetten er en mindre kjegle som ligger på toppen av greinlaget og stikker litt ut over kanten
      if(t.snow>.02)out.add(DG.fern,DM.white,{x:t.x,y:yb+ch*(1-t.snow*.62),z:t.z,sx:r*t.snow*.66,sy:ch*t.snow*.64,sz:r*t.snow*.66,ry:ry+.5,c:'#f1f5f8'},false)}}
};
