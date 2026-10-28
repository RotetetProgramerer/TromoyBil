'use strict';
/* Bregne: en rosett av buede blader (samme blad som palmen, bare mindre og brattere). Erstatter de gamle kjeglene.
   Bregner har ingen kollider: bilen kjører gjennom dem. Brukes i Froland, Ildfjellet og Verden. */
PROPS.bregne={
  navn:'Bregne',info:'Bregne i skogbunnen. c.plant(\'bregne\',x,z,{s,c})',
  PALETTER:[['Skog',['#3f6b28','#58802f','#2f5a22']],['Jungel',['#2f7a2c','#3e8f35','#1f6a2a','#58a03a']]],
  params:{
    s:{v:[.25,.65],min:.1,max:1.4,step:.01,navn:'Størrelse'},
    blader:{v:[6,9],min:3,max:12,step:1,navn:'Antall blader'},
    reis:{v:.5,min:.2,max:1.4,step:.05,navn:'Hvor bratt bladene står'},
    heng:{v:1.8,min:0,max:2.5,step:.05,navn:'Hvor mye bladene henger'},
    palett:{v:0,min:0,max:1,step:1,navn:'Farger',valg:['Skog','Jungel']}
  },
  place(x,z,o,env){const p=propParams('bregne',o,env.rng);p.c=o.c;return Object.assign({x,z},p)},
  build(t,env,out){const R=env.rng,s=t.s,n=Math.max(3,Math.round(t.blader)),y=env.H(t.x,t.z)-.02,a0=R()*6.28,cols=this.PALETTER[t.palett|0][1];
    const base=t.c||cols[Math.floor(R()*cols.length)];
    for(let i=0;i<n;i++){const a=a0+i*6.28/n+(R()-.5)*.5,L=s*(1.1+R()*.35);
      out.add(PG.frond,DM.tuft,{x:t.x,y,z:t.z,sx:L,sy:L*t.heng,sz:L*.95,ry:-a,rz:t.reis+(R()-.5)*.3,ord:'YXZ',c:tint(base,(R()-.5)*.18)})}}
};
