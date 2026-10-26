'use strict';
/* Busk: lave, runde klumper av løv. Hver klump står på bakken der den er, så busken ikke svever på skrå bakke.
   Brukes av c.bushes(antall,farger,ok) i core.js. */
PROPS.busk={
  navn:'Busk',info:'Lav busk. c.bushes(antall,farger,(x,z)=>ok) eller c.plant(\'busk\',x,z,{s,cols})',
  PALETTER:[['Skog',['#3e6b28','#58802f','#2f5a22']],['Eng',['#4b6629','#7f9441','#5a7a2f']],['Jungel',['#3e7a34','#4f8f3c','#2f6a2c','#6a9a40']],['Tørr',['#8a8a4a','#9a9a5a','#6a7a3a']]],
  params:{
    s:{v:[.35,.7],min:.15,max:1.4,step:.01,navn:'Størrelse'},
    klumper:{v:3,min:1,max:6,step:1,navn:'Klumper'},
    hoyde:{v:.75,min:.4,max:1.3,step:.05,navn:'Høyde'},
    palett:{v:0,min:0,max:3,step:1,navn:'Farger',valg:['Skog','Eng','Jungel','Tørr']}
  },
  place(x,z,o,env){const p=propParams('busk',o,env.rng);p.cols=o.cols||this.PALETTER[p.palett|0][1];env.colliders.push({x,z,r:p.s*.7});return Object.assign({x,z},p)},
  build(t,env,out){const R=env.rng,s=t.s,n=Math.max(1,Math.round(t.klumper)),hue=(R()-.5)*.12,a0=R()*6.28;
    for(let k=0;k<n;k++){const a=a0+k*6.28/Math.max(1,n-1)+(R()-.5)*.6,d=k?s*(.5+R()*.25):0,x=t.x+Math.cos(a)*d,z=t.z+Math.sin(a)*d;
      // den midterste klumpen er størst; de rundt er litt mindre og mørkere nederst
      const f=k?.75+R()*.2:1,sy=s*t.hoyde*f,c=shade(t.cols[(k+Math.floor(R()*3))%t.cols.length],hue+(k?-.06:.04));
      out.add(PG.blob,DM.leaf,{x,y:env.H(x,z)+sy*.55,z,sx:s*f*(.9+R()*.3),sy,sz:s*f*(.9+R()*.3),ry:R()*6.28,c})}}
};
