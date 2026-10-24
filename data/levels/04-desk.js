// Bane: se README for hva feltene betyr. Rekkefølgen i menyen følger filnavnet.
LEVELS.push(
{ id:'desk', name:'Skrivebordet', diff:2, seed:71, gates:10, outside:-8,
  desc:'Bøker, blyanter, kaffesøl og et tastatur. Kjør forsiktig, for det er langt ned til gulvet.',
  sky:['#1d1814','#4d3c2e'], fog:0x2b221b, fogNear:24, fogFar:78, sun:0xffe2b8, sunI:1.0, hemi:[0xfff0dc,0x3a2a1e,.58], sunDir:[-14,26,18], clouds:false, ground:'#120e0b', waterCol:'#2a160c',
  path:[[-26,-26],[-13,-24],[-4,-16],[-12,-8],[-24,-2],[-21,10],[-8,13],[2,6],[12,-2],[22,-10],[26,1],[20,12],[8,20],[-6,23],[-20,25]],
  base:(x,z)=>(Math.abs(x)>30||Math.abs(z)>30)?-8:0,
  surf:(x,z)=>(Math.abs(x)>30||Math.abs(z)>30)?S.FLOOR:S.WOOD,
  build(c){const R=c.rng;
    {const t=.045,p=c.P(t),an=c.ang(t)+.12;shape(p.x,p.z,an,4.4,3.1,()=>.004,S.PAPER,(a,b)=>((b+9)%.36)<.03?'#9fb6d6':(a>1.85&&a<1.9?'#d98a8a':'#f2efe7'))}
    // book pyramid
    {const t=.17,p=c.P(t),an=c.ang(t);[[4.8,3.6,.24,'#2f5d8a'],[3.4,3.0,.48,'#a8322d'],[2.0,2.6,.72,'#d6b04a']].forEach(([l,w,top,cl])=>{const a2=an+(R()-.5)*.16;
      shape(p.x,p.z,a2,l,w,()=>top,S.BOOK,(a,b)=>(Math.abs(a)>l/2-.13||Math.abs(b)>w/2-.13)?'#e9e0c8':(Math.abs(a-l*.28)<.12?'#efe2b8':cl))})}
    // pencils
    {const t=.3,p=c.P(t),tn=c.T(t),s=c.side(t);[-1,0,1].forEach((o,i)=>{const cx=p.x+tn.x*o*.95,cz=p.z+tn.z*o*.95,f=i%2?1:-1,sh=(R()-.5)*.8;
      log(cx-s.x*2.6*f+tn.x*sh*.3,cz-s.z*2.6*f+tn.z*sh*.3,cx+s.x*2.6*f,cz+s.z*2.6*f,.12,S.PENCIL,u=>u<.07?'#3a3a3a':u<.15?'#e2b98a':u<.88?(i===1?'#2f7bc0':'#f0c419'):u<.92?'#b8b8b8':'#e98aa0')})}
    // keyboard
    {const t=.42,p=c.P(t),an=c.ang(t)+.08;const key=(a,b)=>{const fa=((a+20)/.44)%1,fb=((b+20)/.44)%1;return fa>.12&&fa<.88&&fb>.1&&fb<.9};
      shape(p.x,p.z,an,3.4,8.2,(a,b)=>key(a,b)?.22:.11,S.KEY,(a,b)=>key(a,b)?'#2a2c30':'#50535a')}
    // erasers
    {const t=.53,p=c.P(t),tn=c.T(t),s=c.side(t);for(let i=0;i<5;i++){const a=(R()-.5)*5,b=(R()-.5)*2.6;shape(p.x+tn.x*a+s.x*b,p.z+tn.z*a+s.z*b,R()*3,.8,.42,()=>.26,S.BOOK,(u)=>Math.abs(u)<.12?'#3a6fb0':'#f2a5b4')}}
    // ruler ramp onto a thick book
    {const t=.66,p=c.P(t),an=c.ang(t);shape(p.x,p.z,an,6,3.2,(a,b)=>{if(a<-.8){if(Math.abs(b)>1)return null;return(a+3)/2.2*.55}if(a<1.6)return .55;return null},S.BOOK,
      (a,b)=>a<-.8?(((a*4)%1+1)%1<.14||Math.abs(Math.abs(b)-.95)<.04?'#3b3b36':'#d8dccf'):(Math.abs(b)>1.45||a>1.45?'#ece3cc':'#2f6b4f'))}
    // coins
    {const t=.8,p=c.P(t),tn=c.T(t),s=c.side(t);for(let i=0;i<7;i++){const a=(R()-.5)*4,b=(R()-.5)*2.6;disc(p.x+tn.x*a+s.x*b,p.z+tn.z*a+s.z*b,.42+R()*.12,.05+Math.floor(R()*4)*.05,S.BOOK,i%3?'#c9a64a':'#b9bcbf')}}
    // cable
    {const t=.9,p=c.P(t),tn=c.T(t),s=c.side(t);let lx=null,lz=null;for(let k=0;k<=12;k++){const b=-4.5+k*.75,a=Math.sin(k*.9)*.7;const x=p.x+tn.x*a+s.x*b,z=p.z+tn.z*a+s.z*b;if(lx!==null)log(lx,lz,x,z,.075,S.KEY,()=>'#26272b');lx=x;lz=z}}
    // spilled coffee: slick and splashy
    {const t=.6,p=c.P(t),s=c.side(t);paint(p.x+s.x*.3,p.z+s.z*.3,1.6,S.MUD);c.pools.push({x:p.x+s.x*.3,z:p.z+s.z*.3,r:1.55,level:.03});
      for(let i=0;i<5;i++){const a=i*1.3+.4,d=1.7+(i%2)*.35;c.pools.push({x:p.x+s.x*.3+Math.cos(a)*d,z:p.z+s.z*.3+Math.sin(a)*d,r:.22+(i%3)*.1,level:.028})}}
    // sticky notes
    for(let i=0;i<6;i++){const t=.1+R()*.85,p=c.P(t),s=c.side(t),b=(R()-.5)*5;shape(p.x+s.x*b,p.z+s.z*b,R()*3,1,1,()=>.004,S.PAPER,()=>['#f5e06a','#f59ab5','#9fe0a5'][i%3])}
    c.finish();
    // mug, pen cup, lamp
    const place=(cands,r)=>cands.find(([x,z])=>c.dist(x,z)>r+2.6&&!c.nearGate(x,z,r+2.6));
    const mugP=place([[4,-12],[-2,-2],[14,6],[-14,20],[16,-20]],1.3);
    if(mugP){const g=new THREE.Group(),m=new THREE.MeshStandardMaterial({color:0xe9e4da,roughness:.35});
      const body=new THREE.Mesh(new THREE.CylinderGeometry(1.25,1.15,2.8,32,1,true),m);body.position.y=1.4;
      const inner=new THREE.Mesh(new THREE.CylinderGeometry(1.15,1.08,2.7,32,1,true),new THREE.MeshStandardMaterial({color:0xd9d2c6,side:THREE.BackSide}));inner.position.y=1.42;
      const cof=new THREE.Mesh(new THREE.CircleGeometry(1.14,32),new THREE.MeshStandardMaterial({color:0x3a2416,roughness:.15}));cof.rotation.x=-Math.PI/2;cof.position.y=2.45;
      const hd=new THREE.Mesh(new THREE.TorusGeometry(.62,.15,10,24,Math.PI*1.3),m);hd.position.set(1.35,1.5,0);hd.rotation.z=-Math.PI*.65;
      const band=new THREE.Mesh(new THREE.CylinderGeometry(1.255,1.24,.35,32,1,true),new THREE.MeshStandardMaterial({color:0xE5A92B,roughness:.5}));band.position.y=1.9;
      [body,inner,cof,hd,band].forEach(o=>{o.castShadow=true;g.add(o)});g.position.set(mugP[0],0,mugP[1]);g.rotation.y=R()*6;c.decor.add(g);c.colliders.push({x:mugP[0],z:mugP[1],r:1.3})}
    const cupP=place([[-6,0],[-8,-20],[18,-2],[12,14]],.9);
    if(cupP){const g=new THREE.Group(),cup=new THREE.Mesh(new THREE.CylinderGeometry(.9,.9,2.4,20,1,true),new THREE.MeshStandardMaterial({color:0x2d4f3e,roughness:.6,side:THREE.DoubleSide}));cup.position.y=1.2;cup.castShadow=true;g.add(cup);
      ['#f0c419','#2f7bc0','#c43b2f','#f0c419'].forEach((cl,i)=>{const pn=new THREE.Mesh(new THREE.CylinderGeometry(.11,.11,4.4,6),new THREE.MeshStandardMaterial({color:cl,flatShading:true}));pn.position.set(Math.cos(i*1.7)*.4,2.4,Math.sin(i*1.7)*.4);pn.rotation.set((R()-.5)*.35,0,(R()-.5)*.35);pn.castShadow=true;g.add(pn)});
      g.position.set(cupP[0],0,cupP[1]);c.decor.add(g);c.colliders.push({x:cupP[0],z:cupP[1],r:.95})}
    {const g=new THREE.Group(),m=new THREE.MeshStandardMaterial({color:0x1f1f22,roughness:.4,metalness:.6});
      const base=new THREE.Mesh(new THREE.CylinderGeometry(1.7,1.8,.35,28),m);base.position.y=.17;
      const arm1=new THREE.Mesh(new THREE.CylinderGeometry(.12,.12,7,8),m);arm1.position.set(0,3.6,-1.2);arm1.rotation.x=-.35;
      const arm2=new THREE.Mesh(new THREE.CylinderGeometry(.12,.12,6,8),m);arm2.position.set(0,7.6,.6);arm2.rotation.x=1.05;
      const shade=new THREE.Mesh(new THREE.ConeGeometry(1.5,2,24,1,true),new THREE.MeshStandardMaterial({color:0xE5A92B,roughness:.5,side:THREE.DoubleSide}));shade.position.set(0,7.6,3.4);shade.rotation.x=.4;
      const bulb=new THREE.Mesh(new THREE.SphereGeometry(.5,12,10),new THREE.MeshBasicMaterial({color:0xfff3d0}));bulb.position.set(0,7.0,3.6);
      [base,arm1,arm2,shade,bulb].forEach(o=>{o.castShadow=o!==bulb;g.add(o)});g.position.set(25,0,-25);g.rotation.y=-.8;c.decor.add(g);c.colliders.push({x:25,z:-25,r:1.8})}
  }}
);
