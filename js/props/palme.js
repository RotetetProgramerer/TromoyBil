'use strict';
/* Palme: buet stamme i ledd med ringer, hengende blader og kokosnøtter. Én felles palme for Ildfjellet og Verden. */
PROPS.palme={
  navn:'Palme',info:'Palme på strand og ved oasen. c.plant(\'palme\',x,z,{h,lean})',
  params:{
    h:{v:[2.8,4.6],min:1.5,max:7,step:.1,navn:'Høyde'},
    lean:{v:[-.175,.175],min:-.6,max:.6,step:.01,navn:'Helning'},
    bue:{v:1,min:0,max:2.5,step:.05,navn:'Bue i stammen'},
    blader:{v:9,min:4,max:14,step:1,navn:'Antall blader'},
    blad:{v:1.65,min:.8,max:2.6,step:.05,navn:'Bladlengde'},
    heng:{v:1,min:0,max:2,step:.05,navn:'Hvor mye bladene henger'},
    kokos:{v:3,min:0,max:6,step:1,navn:'Kokosnøtter'}
  },
  place(x,z,o,env){const p=propParams('palme',o,env.rng);env.colliders.push({x,z,r:.17});return Object.assign({x,z},p)},
  build(t,env,out){const R=env.rng,n=5,sl=t.h/n,ld=R()*6.28,L=Math.abs(t.lean),base=mix('#8a7048','#a58a5a',R());
    // stammen: fem ledd som lener mer og mer, så den bøyer seg mot lyset; annethvert ledd mørkere gir ringer
    let p={x:t.x,y:footY(env.H,t.x,t.z,.12)-.05,z:t.z};
    for(let i=0;i<n;i++){const th=Math.max(0,L*(1+t.bue*(i/(n-1)-.5))),v=dirVec(ld,th),q={x:p.x+v.x*sl,y:p.y+v.y*sl,z:p.z+v.z*sl},r=.13-.035*i/(n-1);
      out.add(PG.stem,DM.white,stemBetween(p,{x:q.x+v.x*.04,y:q.y+v.y*.04,z:q.z+v.z*.04},r,{c:shade(base,i%2?-.08:.05)}));p=q}
    out.add(PG.blob,DM.white,{x:p.x,y:p.y+.03,z:p.z,sx:.13,sy:.1,sz:.13,c:'#6b6a32'});
    // bladene i to lag: de øverste peker mer opp, de nederste henger
    const k0=R()*6.28,nb=Math.round(t.blader);
    for(let i=0;i<nb;i++){const a=k0+i*6.28/nb+(R()-.5)*.25,up=i%2?.42:.02,len=t.blad*(.88+R()*.2);
      out.add(PG.frond,DM.tuft,{x:p.x,y:p.y+.02,z:p.z,sx:len,sy:len*t.heng,sz:len*(.95+R()*.15),ry:-a,rz:up+(R()-.5)*.15,ord:'YXZ',c:['#2d7a2b','#3f9a3a','#25682a'][i%3]})}
    for(let i=0;i<Math.round(t.kokos);i++){const a=R()*6.28;out.add(DG.canopy,DM.white,{x:p.x+Math.cos(a)*.11,y:p.y-.1-R()*.05,z:p.z+Math.sin(a)*.11,sx:.075,sy:.085,sz:.075,c:'#5a4626'})}
    env.perches.push({x:p.x,y:p.y+.05,z:p.z,kind:'top'})}
};
