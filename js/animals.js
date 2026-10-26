'use strict';
/* =================================================================
   ANIMALS & THE ROLLING BOULDER
   Parrots, monkeys, butterflies and crabs that live in a level, plus the boulder that rolls across the road.
   Everything here is for atmosphere only: no animal can stop the car. The boulder gives the car a small shove.
   Loaded before game.js; it only touches game.js globals (scene, levelGroup, car, H …) inside functions, at run time.
   A level turns this on with  animals:{parrots, circling, monkeys, butterflies, crabs, liana:[x,z], bridgeMonkeys:{A,B}}
   and  boulder:{trigger:[x,z], from:[x,z], to:[x,z], speed, r}.
   ================================================================= */
const ANIMAL_GEO={
  sph:new THREE.SphereGeometry(1,8,6), cone:new THREE.ConeGeometry(1,1,6), box:new THREE.BoxGeometry(1,1,1), cyl:new THREE.CylinderGeometry(1,1,1,6),
  cylTop:new THREE.CylinderGeometry(1,1,1,6), wing:new THREE.PlaneGeometry(1,1), tail:new THREE.TorusGeometry(1,.14,5,10,3.6), rock:new THREE.IcosahedronGeometry(1,1),
  bwing:new THREE.PlaneGeometry(1,1)
};
ANIMAL_GEO.cylTop.translate(0,-.5,0); ANIMAL_GEO.wing.translate(.5,0,0); ANIMAL_GEO.bwing.translate(.5,0,0);
const _amat={};
function amat(h,o={}){const k=h+JSON.stringify(o);if(_amat[k])return _amat[k];return _amat[k]=new THREE.MeshStandardMaterial(Object.assign({color:new THREE.Color(h).convertSRGBToLinear(),roughness:.8,flatShading:true},o))}
function apart(parent,geo,mat,x,y,z,sx,sy,sz,rx,ry,rz){const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.scale.set(sx,sy??sx,sz??sx);if(rx||ry||rz)m.rotation.set(rx||0,ry||0,rz||0);m.castShadow=true;parent.add(m);return m}
const _ap=new V3(),_aq=new THREE.Quaternion(),_ae=new THREE.Euler(),_am=new THREE.Matrix4(),_as=new V3();
const ANIMALS={parrots:[],monkeys:[],butterflies:null,crabs:[],hootT:6,eagle:null,bear:null,gulls:[],deer:[],rabbits:[],fish:[],lizards:[]};

/* ---------- parrots ---------- */
const PARROT_COLS=[['#e23a2e','#2d63d8','#f2c23a'],['#f2c23a','#2a5ad0','#2a5ad0'],['#3fae3a','#2f8f2e','#e2c33a'],['#e8542a','#d8b22a','#2f8f2e']];
function makeParrot(cols){const g=new THREE.Group();const [cb,cw,ct]=cols;
  apart(g,ANIMAL_GEO.sph,amat(cb),0,0,0,.1,.09,.17);apart(g,ANIMAL_GEO.sph,amat(cb),0,.07,.13,.075);apart(g,ANIMAL_GEO.sph,amat('#f4f0e6'),0,.085,.19,.03,.03,.02);
  apart(g,ANIMAL_GEO.cone,amat('#55504a'),0,.06,.2,.03,.055,.03,Math.PI/2);apart(g,ANIMAL_GEO.box,amat(ct),0,0,-.2,.05,.015,.16);
  const wings=[];for(const sd of[-1,1]){const piv=new THREE.Group();piv.position.set(sd*.06,.03,0);const w=new THREE.Mesh(ANIMAL_GEO.wing,amat(cw,{side:THREE.DoubleSide}));w.scale.set(sd*.26,.12,1);w.rotation.x=-Math.PI/2;w.castShadow=true;piv.add(w);g.add(piv);wings.push(piv)}
  g.userData.wings=wings;return g}
function parrotPerch(p,avoid){const L=LV.perches.filter(q=>q!==avoid&&Math.hypot(q.x-car.pos.x,q.z-car.pos.z)>9);const S=L.length?L:LV.perches;return S[Math.floor(Math.random()*S.length)]}
function parrotTakeoff(b){const to=parrotPerch(b.perch,b.perch);if(!to)return;const P0=new V3(b.g.position.x,b.g.position.y,b.g.position.z),P3=new V3(to.x,to.y,to.z);
  const away=new V3(P0.x-car.pos.x,0,P0.z-car.pos.z).normalize();const P1=P0.clone().add(away.multiplyScalar(3)).add(_ap.set(0,3.5,0)),P2=P3.clone().add(_ap.set(0,2.8,0));
  b.st='fly';b.u=0;b.dur=Math.max(2.5,P0.distanceTo(P3)/4.5+1.2);b.bz=[P0,P1,P2,P3];b.perch=to;if(b.pigeon){if(typeof ambCoo==='function')ambCoo(P0.x,P0.z)}else ambSquawk(P0.x,P0.z)}
// town pigeons: the parrot's body and flight in grey, a little smaller; they sit on lamps, roofs and the few trees
const PIGEON_COLS=[['#8a8f96','#6b7078','#b9bdc2'],['#9a9ea3','#7a7e84','#d9dde0'],['#6f737a','#5a5e64','#a9adb2']];
function bezier(bz,u,out){const a=1-u;out.set(0,0,0).addScaledVector(bz[0],a*a*a).addScaledVector(bz[1],3*a*a*u).addScaledVector(bz[2],3*a*u*u).addScaledVector(bz[3],u*u*u);return out}
function updateParrots(dt,tm){
  for(const b of ANIMALS.parrots){const g=b.g;
    if(b.st==='perch'){g.position.y=b.perch.y+(b.pigeon?.058:.08)+Math.sin(tm*2.1+b.ph)*.006;g.rotation.y+=(Math.sin(tm*.3+b.ph)>.95?dt*.4:0);for(const w of g.userData.wings)w.rotation.z*=.9;
      if(state.mode==='play'&&Math.hypot(b.perch.x-car.pos.x,b.perch.z-car.pos.z)<5.5&&b.cool<=0)parrotTakeoff(b);b.cool-=dt}
    else if(b.st==='fly'){b.u+=dt/b.dur;const u=Math.min(1,b.u);bezier(b.bz,u,g.position);bezier(b.bz,Math.min(1,u+.01),_ap);_ap.sub(g.position);
      if(_ap.lengthSq()>1e-6){g.rotation.y=Math.atan2(_ap.x,_ap.z);g.rotation.x=-Math.asin(Math.max(-.6,Math.min(.6,_ap.normalize().y)))}
      const fl=Math.sin(tm*55+b.ph)*(u<.2||u>.75?.95:.5);g.userData.wings[0].rotation.z=-fl;g.userData.wings[1].rotation.z=fl;
      if(b.u>=1){b.st='perch';b.cool=3;g.rotation.x=0;g.position.set(b.perch.x,b.perch.y+(b.pigeon?.058:.08),b.perch.z)}}
    else{ // circling high over the forest
      b.a+=dt*b.w;g.position.set(b.cx+Math.cos(b.a)*b.r,b.cy+Math.sin(b.a*2.3)*.6,b.cz+Math.sin(b.a)*b.r);g.rotation.y=Math.atan2(-Math.sin(b.a)*b.w,Math.cos(b.a)*b.w)+(b.w>0?Math.PI/2:-Math.PI/2);g.rotation.z=b.w>0?-.35:.35;
      const glide=Math.sin(tm*.4+b.ph)>.2,fl=glide?Math.sin(tm*2)*.08:Math.sin(tm*34+b.ph)*.7;g.userData.wings[0].rotation.z=-fl;g.userData.wings[1].rotation.z=fl}}}

/* ---------- monkeys ---------- */
function makeMonkey(){const g=new THREE.Group(),fur=amat('#5e4126'),tan=amat('#c9a47c');
  apart(g,ANIMAL_GEO.sph,fur,0,0,0,.11,.13,.1);apart(g,ANIMAL_GEO.sph,tan,0,-.01,.07,.075,.085,.05);
  const head=new THREE.Group();head.position.set(0,.17,.02);apart(head,ANIMAL_GEO.sph,fur,0,0,0,.085);apart(head,ANIMAL_GEO.sph,tan,0,-.01,.065,.06,.055,.04);
  for(const sd of[-1,1]){apart(head,ANIMAL_GEO.sph,tan,sd*.085,.01,0,.03);apart(head,ANIMAL_GEO.sph,amat('#1a1410'),sd*.025,.015,.1,.012)}g.add(head);
  const arms=[];for(const sd of[-1,1]){const a=new THREE.Group();a.position.set(sd*.1,.06,.02);apart(a,ANIMAL_GEO.cylTop,fur,0,0,0,.024,.2,.024);a.rotation.z=sd*.35;g.add(a);arms.push(a);
    apart(g,ANIMAL_GEO.cylTop,fur,sd*.06,-.08,.02,.028,.14,.028,0,0,sd*.15)}
  const tail=new THREE.Mesh(ANIMAL_GEO.tail,fur);tail.scale.setScalar(.11);tail.position.set(0,-.02,-.12);tail.rotation.set(Math.PI/2,0,0);g.add(tail);
  g.userData.head=head;g.userData.arms=arms;g.userData.tail=tail;return g}
function monkeyJump(m,to){m.st='jump';m.u=0;m.from=m.g.position.clone();m.to=to;m.perch=to;m.cool=2.5;ambHoot(m.g.position.x,m.g.position.z)}
function updateMonkeys(dt,tm){
  ANIMALS.hootT-=dt;if(ANIMALS.hootT<=0){ANIMALS.hootT=9+Math.random()*8;const L=ANIMALS.monkeys.filter(m=>Math.hypot(m.g.position.x-car.pos.x,m.g.position.z-car.pos.z)<26);if(L.length){const m=L[Math.floor(Math.random()*L.length)];ambHoot(m.g.position.x,m.g.position.z)}}
  for(const m of ANIMALS.monkeys){const g=m.g,ud=g.userData,dx=car.pos.x-g.position.x,dz=car.pos.z-g.position.z,d=Math.hypot(dx,dz);
    if(m.st==='sit'){m.cool-=dt;
      // turn the head (and a bit of the body) after the car
      const want=d<10?Math.atan2(dx,dz):m.yaw0;let dy=want-g.rotation.y;dy=Math.atan2(Math.sin(dy),Math.cos(dy));const hd=Math.max(-1.1,Math.min(1.1,dy));ud.head.rotation.y+=(hd-ud.head.rotation.y)*Math.min(1,dt*4);
      g.rotation.y+=(dy-hd)*Math.min(1,dt*1.5);ud.tail.rotation.y=Math.sin(tm*1.7+m.ph)*.5;ud.arms[0].rotation.z=-.35+Math.sin(tm*1.1+m.ph)*.1;
      if(m.kind==='liana'){}
      else if(state.mode==='play'&&d<3.4&&m.cool<=0){const L=m.perches.filter(p=>p!==m.perch&&Math.hypot(p.x-g.position.x,p.z-g.position.z)<7&&Math.hypot(p.x-car.pos.x,p.z-car.pos.z)>2.2);
        if(L.length){L.sort((a,b)=>(b.y-a.y)+(Math.random()-.5));monkeyJump(m,L[Math.floor(Math.random()*Math.min(3,L.length))])}}}
    else if(m.st==='jump'){m.u+=dt/.85;const u=Math.min(1,m.u);g.position.lerpVectors(m.from,_ap.set(m.to.x,m.to.y,m.to.z),u);g.position.y+=Math.max(0,1.3*4*u*(1-u))+(m.to.y>m.from.y?0:0);
      g.rotation.y=Math.atan2(m.to.x-m.from.x,m.to.z-m.from.z);ud.arms[0].rotation.z=-2.6;ud.arms[1].rotation.z=2.6;ud.head.rotation.y*=.9;
      if(m.u>=1){m.st='sit';g.position.set(m.to.x,m.to.y,m.to.z);m.yaw0=g.rotation.y;ud.arms[0].rotation.z=-.35;ud.arms[1].rotation.z=.35}}
    if(m.kind==='liana'){const th=.62*Math.sin(tm*2.3+m.ph);m.pivot.rotation.x=th;ud.arms[0].rotation.z=-2.9;ud.arms[1].rotation.z=2.9;g.rotation.x=-th*.25;ud.head.rotation.y=Math.max(-1,Math.min(1,Math.atan2(dx,dz)-m.pivot.rotation.y))*(d<9?1:0)}}}

/* ---------- butterflies (instanced wings) ---------- */
function updateButterflies(dt,tm){const B=ANIMALS.butterflies;if(!B)return;
  for(let i=0;i<B.n;i++){const b=B.list[i];b.a+=dt*b.w;const r=b.r*(1+.3*Math.sin(tm*.7+b.ph));_ap.set(b.x+Math.cos(b.a)*r,b.y+.25+.18*Math.sin(tm*1.3+b.ph)+.06*Math.sin(tm*9+b.ph),b.z+Math.sin(b.a)*r);
    const yaw=Math.atan2(-Math.sin(b.a)*b.w,Math.cos(b.a)*b.w),fl=.25+.95*Math.abs(Math.sin(tm*21+b.ph));
    for(let w=0;w<2;w++){const sd=w?1:-1;_ae.set(0,yaw+Math.PI/2,sd*fl,'YXZ');_aq.setFromEuler(_ae);_as.set(sd*b.s,b.s*.8,1);_am.compose(_ap,_aq,_as);B.im[w].setMatrixAt(i,_am)}}
  B.im[0].instanceMatrix.needsUpdate=true;B.im[1].instanceMatrix.needsUpdate=true}

/* ---------- crabs ---------- */
function makeCrab(){const g=new THREE.Group(),sh=amat('#d8532a');apart(g,ANIMAL_GEO.box,sh,0,.04,0,.16,.06,.11);apart(g,ANIMAL_GEO.box,amat('#a63d1e'),0,.012,0,.3,.012,.1);
  for(const sd of[-1,1])apart(g,ANIMAL_GEO.box,sh,sd*.09,.05,.08,.05,.03,.06);return g}
function updateCrabs(dt,tm){for(const c of ANIMALS.crabs){const g=c.g,dx=g.position.x-car.pos.x,dz=g.position.z-car.pos.z,d=Math.hypot(dx,dz);
  if(c.run<=0&&d<2.6&&state.mode==='play'){c.run=.9;const px=-dz/d,pz=dx/d,sg=Math.random()<.5?1:-1;c.vx=(dx/d*.4+px*sg)*1.5;c.vz=(dz/d*.4+pz*sg)*1.5}
  if(c.run>0){c.run-=dt;g.position.x+=c.vx*dt;g.position.z+=c.vz*dt;g.position.x=Math.max(-34,Math.min(34,g.position.x));g.position.z=Math.max(-34,Math.min(34,g.position.z));g.children[1].rotation.y=Math.sin(tm*40)*.25;g.position.y=H(g.position.x,g.position.z)+.03+Math.abs(Math.sin(tm*30))*.012}
  else g.children[2].rotation.x=Math.sin(tm*1.3+c.ph)*.3}}

/* ---------- the eagle: circles high over the summit, glides most of the time ---------- */
function makeEagle(){const g=new THREE.Group(),dk=amat('#3a2a1c'),wh=amat('#f4f0e6');
  apart(g,ANIMAL_GEO.sph,dk,0,0,0,.13,.1,.3);apart(g,ANIMAL_GEO.sph,wh,0,.06,.27,.085,.075,.1);apart(g,ANIMAL_GEO.cone,amat('#e5a92b'),0,.05,.37,.03,.08,.03,Math.PI/2);
  apart(g,ANIMAL_GEO.box,wh,0,0,-.34,.16,.02,.16);
  const wings=[];for(const sd of[-1,1]){const piv=new THREE.Group();piv.position.set(sd*.08,.04,.02);const w=new THREE.Mesh(ANIMAL_GEO.wing,amat('#4a3626',{side:THREE.DoubleSide}));w.scale.set(sd*.95,.3,1);w.rotation.x=-Math.PI/2;w.castShadow=true;piv.add(w);
    const tip=new THREE.Mesh(ANIMAL_GEO.wing,amat('#2a1e14',{side:THREE.DoubleSide}));tip.scale.set(sd*.3,.26,1);tip.position.set(sd*.95,0,0);tip.rotation.x=-Math.PI/2;piv.add(tip);g.add(piv);wings.push(piv)}
  g.userData.wings=wings;return g}
function buildEagle(at,R){const g=makeEagle();levelGroup.add(g);const cy=H(at[0],at[1])+6.5;ANIMALS.eagle={g,cx:at[0],cz:at[1],cy,r:12+R()*4,a:R()*6.28,w:.16,ph:R()*6.28,cry:20+R()*20}}
function updateEagle(dt,tm){const e=ANIMALS.eagle;if(!e)return;const g=e.g;e.a+=dt*e.w;const r=e.r+2.5*Math.sin(tm*.07+e.ph);
  g.position.set(e.cx+Math.cos(e.a)*r,e.cy+1.8*Math.sin(tm*.11+e.ph),e.cz+Math.sin(e.a)*r);g.rotation.y=Math.atan2(-Math.sin(e.a),Math.cos(e.a))+Math.PI/2;g.rotation.z=-.3;
  const glide=Math.sin(tm*.23+e.ph)>-.3,fl=glide?Math.sin(tm*1.3)*.06:Math.sin(tm*9+e.ph)*.5;g.userData.wings[0].rotation.z=-fl;g.userData.wings[1].rotation.z=fl;
  e.cry-=dt;if(e.cry<=0){e.cry=25+Math.random()*30;if(typeof ambEagle==='function')ambEagle(g.position.x,g.position.z)}}

/* ---------- the bear: ambles between two points at the forest edge, far from the road ---------- */
function makeBear(){const g=new THREE.Group(),fur=amat('#4a3222'),dk=amat('#2a1a10');
  apart(g,ANIMAL_GEO.sph,fur,0,.42,0,.3,.28,.5);apart(g,ANIMAL_GEO.sph,fur,0,.6,.5,.2,.18,.2);apart(g,ANIMAL_GEO.sph,amat('#6b4a32'),0,.54,.68,.1,.08,.1);apart(g,ANIMAL_GEO.sph,dk,0,.57,.77,.04);
  for(const sd of[-1,1]){apart(g,ANIMAL_GEO.sph,fur,sd*.13,.74,.44,.06);apart(g,ANIMAL_GEO.sph,dk,sd*.07,.63,.66,.02)}
  const legs=[];for(const sd of[-1,1])for(const fz of[.28,-.28]){const l=new THREE.Group();l.position.set(sd*.17,.36,fz);apart(l,ANIMAL_GEO.cylTop,fur,0,0,0,.08,.38,.08);g.add(l);legs.push(l)}
  g.userData.legs=legs;return g}
function buildBear(pts,R){const g=makeBear();levelGroup.add(g);const [a,b]=pts;ANIMALS.bear={g,a,b,u:R(),dir:1,wait:0,sp:.32};g.position.set(a[0],H(a[0],a[1]),a[1])}
function updateBear(dt,tm){const b=ANIMALS.bear;if(!b)return;const g=b.g,L=Math.hypot(b.b[0]-b.a[0],b.b[1]-b.a[1]);
  if(b.wait>0){b.wait-=dt;g.children[1].position.y=.6+Math.sin(tm*2.2)*.03;g.children[1].rotation.y=Math.sin(tm*.9)*.4;return}
  b.u+=dt*b.sp/L*b.dir;if(b.u>=1||b.u<=0){b.u=Math.max(0,Math.min(1,b.u));b.dir*=-1;b.wait=4+Math.random()*6;return}
  const x=b.a[0]+(b.b[0]-b.a[0])*b.u,z=b.a[1]+(b.b[1]-b.a[1])*b.u;g.position.set(x,H(x,z),z);g.rotation.y=Math.atan2((b.b[0]-b.a[0])*b.dir,(b.b[1]-b.a[1])*b.dir);
  g.userData.legs.forEach((l,i)=>l.rotation.x=Math.sin(tm*4+(i%2?Math.PI:0)+(i>1?Math.PI/2:0))*.45);g.children[0].position.y=.42+Math.abs(Math.sin(tm*4))*.02}

/* ---------- gulls: sit on the sand, take off and circle when the car comes near ---------- */
function makeGull(){const g=new THREE.Group(),wh=amat('#f4f4f0'),gr=amat('#9aa0a6');
  apart(g,ANIMAL_GEO.sph,wh,0,0,0,.055,.045,.11);apart(g,ANIMAL_GEO.sph,wh,0,.03,.1,.04);apart(g,ANIMAL_GEO.cone,amat('#e5a92b'),0,.025,.15,.012,.04,.012,Math.PI/2);
  const wings=[];for(const sd of[-1,1]){const piv=new THREE.Group();piv.position.set(sd*.03,.02,0);const w=new THREE.Mesh(ANIMAL_GEO.wing,gr);w.material=amat('#dcdcd8',{side:THREE.DoubleSide});w.scale.set(sd*.26,.08,1);w.rotation.x=-Math.PI/2;piv.add(w);
    const tip=new THREE.Mesh(ANIMAL_GEO.wing,amat('#3a3a3a',{side:THREE.DoubleSide}));tip.scale.set(sd*.07,.07,1);tip.position.set(sd*.26,0,0);tip.rotation.x=-Math.PI/2;piv.add(tip);g.add(piv);wings.push(piv)}
  g.userData.wings=wings;return g}
function buildGulls(o,R){const[cx,cz]=o.at;for(let i=0;i<(o.n||6);i++){let x,z,k=0;do{x=cx+(R()-.5)*10;z=cz+(R()-.5)*10;k++}while((WL(x,z)>H(x,z)||surfAt(x,z)!==S.SAND)&&k<30);
    const g=makeGull();g.position.set(x,H(x,z)+.05,z);g.rotation.y=R()*6.28;levelGroup.add(g);ANIMALS.gulls.push({g,st:'sit',hx:x,hz:z,cx,cz,a:R()*6.28,r:2.5+R()*3,w:.6+R()*.4,h:2.5+R()*2,ph:R()*6.28,land:0,t:0})}}
function updateGulls(dt,tm){for(const b of ANIMALS.gulls){const g=b.g,d=Math.hypot(b.hx-car.pos.x,b.hz-car.pos.z);
    if(b.st==='sit'){g.position.y=H(b.hx,b.hz)+.05;g.rotation.y+=Math.sin(tm*.4+b.ph)>.97?dt:0;for(const w of g.userData.wings)w.rotation.z*=.9;
      if(d<7&&state.mode==='play'){b.st='fly';b.t=0;b.land=0;if(typeof ambGull==='function')ambGull(b.hx,b.hz)}}
    else{b.t+=dt;b.a+=dt*b.w;const up=Math.min(1,b.t/2.5);const tx=b.cx+Math.cos(b.a)*b.r,tz=b.cz+Math.sin(b.a)*b.r,ty=H(tx,tz)+b.h+.4*Math.sin(tm*1.7+b.ph);
      const sx=b.hx+(tx-b.hx)*up,sz=b.hz+(tz-b.hz)*up,sy=H(b.hx,b.hz)+.05+(ty-H(b.hx,b.hz)-.05)*up;
      if(b.land>0){b.land-=dt;const k=1-b.land/2.5;g.position.set(g.position.x+(b.hx-g.position.x)*Math.min(1,dt*2),H(b.hx,b.hz)+.05+(g.position.y-H(b.hx,b.hz)-.05)*(1-Math.min(1,dt*1.5)),g.position.z+(b.hz-g.position.z)*Math.min(1,dt*2));if(b.land<=0){b.st='sit';g.position.set(b.hx,H(b.hx,b.hz)+.05,b.hz)}}
      else{g.position.set(sx,sy,sz);if(d>14&&b.t>6&&Math.random()<dt*.3)b.land=2.5}
      g.rotation.y=Math.atan2(-Math.sin(b.a)*b.w,Math.cos(b.a)*b.w)+Math.PI/2;g.rotation.z=-.25;
      const glide=Math.sin(tm*.6+b.ph)>.3,fl=glide?Math.sin(tm*2)*.08:Math.sin(tm*18+b.ph)*.7;g.userData.wings[0].rotation.z=-fl;g.userData.wings[1].rotation.z=fl}}}

/* ---------- grazers: deer and rabbits. They nibble, wander a little, and bolt when the car comes close ---------- */
function makeDeer(){const g=new THREE.Group(),fur=amat('#9a6a3a'),lt=amat('#d9b98a');
  apart(g,ANIMAL_GEO.sph,fur,0,.5,0,.16,.17,.32);apart(g,ANIMAL_GEO.sph,lt,0,.42,-.02,.12,.1,.26);
  const neck=apart(g,ANIMAL_GEO.cylTop,fur,0,.82,.26,.05,.3,.05,.6);const head=new THREE.Group();head.position.set(0,.86,.36);apart(head,ANIMAL_GEO.sph,fur,0,0,0,.07,.07,.12);apart(head,ANIMAL_GEO.sph,amat('#1a1410'),0,.01,.12,.02);
  for(const sd of[-1,1]){apart(head,ANIMAL_GEO.cone,fur,sd*.06,.07,-.02,.02,.08,.02,0,0,sd*.5);apart(head,ANIMAL_GEO.cylTop,amat('#5a4030'),sd*.04,.08,-.04,.012,.2,.012,Math.PI-.3,0,sd*.4)}g.add(head);
  const legs=[];for(const sd of[-1,1])for(const fz of[.2,-.2]){const l=new THREE.Group();l.position.set(sd*.09,.4,fz);apart(l,ANIMAL_GEO.cylTop,fur,0,0,0,.03,.42,.03);g.add(l);legs.push(l)}
  apart(g,ANIMAL_GEO.sph,lt,0,.52,-.32,.03,.05,.03);g.userData.legs=legs;g.userData.head=head;return g}
function makeRabbit(){const g=new THREE.Group(),fur=amat('#8a7a68');apart(g,ANIMAL_GEO.sph,fur,0,.08,0,.07,.07,.1);apart(g,ANIMAL_GEO.sph,fur,0,.15,.08,.05);
  for(const sd of[-1,1])apart(g,ANIMAL_GEO.cylTop,amat('#a89888'),sd*.02,.26,.07,.012,.1,.012);apart(g,ANIMAL_GEO.sph,amat('#f4f0e6'),0,.09,-.1,.025);return g}
// a town cat: long body, round head, two cone ears and a tail; it strolls the pavements like a rabbit, but is slower to bolt
function makeCat(col){const g=new THREE.Group(),fur=amat(col);apart(g,ANIMAL_GEO.sph,fur,0,.11,0,.07,.07,.16);apart(g,ANIMAL_GEO.sph,fur,0,.19,.15,.06);
  for(const sd of[-1,1]){apart(g,ANIMAL_GEO.cone,fur,sd*.035,.25,.15,.018,.045,.018);apart(g,ANIMAL_GEO.sph,amat('#d9e04a'),sd*.025,.2,.2,.01)}
  for(const sd of[-1,1])for(const fz of[.1,-.1])apart(g,ANIMAL_GEO.cylTop,fur,sd*.04,.08,fz,.015,.09,.015);
  apart(g,ANIMAL_GEO.cylTop,fur,0,.14,-.17,.012,.2,.012,2.1);return g}
function buildCats(o,R){const cols=['#2a2622','#c8894a','#8a8580','#e9e4da','#5a4a3a'];for(let i=0;i<(o.n||2);i++){let x,z,k=0;do{x=o.at[0]+(R()-.5)*o.r*2;z=o.at[1]+(R()-.5)*o.r*2;k++}while((LV.dist(x,z)<1.0||WL(x,z)>H(x,z))&&k<40);
    const g=makeCat(cols[i%cols.length]);g.position.set(x,H(x,z),z);g.rotation.y=R()*6.28;levelGroup.add(g);ANIMALS.rabbits.push({g,kind:'cat',hx:o.at[0],hz:o.at[1],hr:o.r,st:'graze',t:R()*3,ph:R()*6.28,sp:0,tx:x,tz:z,flee:2.6,speed:3.4})}}
function buildDeer(o,R){for(let i=0;i<(o.n||3);i++){let x,z,k=0;do{x=o.at[0]+(R()-.5)*o.r*2;z=o.at[1]+(R()-.5)*o.r*2;k++}while((LV.dist(x,z)<3||WL(x,z)>H(x,z)||surfAt(x,z)===S.ROCK)&&k<40);
    const g=makeDeer();g.position.set(x,H(x,z),z);g.rotation.y=R()*6.28;levelGroup.add(g);ANIMALS.deer.push({g,kind:'deer',hx:o.at[0],hz:o.at[1],hr:o.r,st:'graze',t:R()*4,ph:R()*6.28,sp:0,tx:x,tz:z,flee:5.5,speed:3.6})}}
function buildRabbits(o,R){for(let i=0;i<(o.n||4);i++){let x,z,k=0;do{x=o.at[0]+(R()-.5)*o.r*2;z=o.at[1]+(R()-.5)*o.r*2;k++}while((LV.dist(x,z)<1.5||WL(x,z)>H(x,z))&&k<40);
    const g=makeRabbit();g.position.set(x,H(x,z),z);g.rotation.y=R()*6.28;levelGroup.add(g);ANIMALS.rabbits.push({g,kind:'rabbit',hx:o.at[0],hz:o.at[1],hr:o.r,st:'graze',t:R()*3,ph:R()*6.28,sp:0,tx:x,tz:z,flee:3.5,speed:3})}}
function updateGrazers(dt,tm){for(const a of[...ANIMALS.deer,...ANIMALS.rabbits]){const g=a.g,dx=g.position.x-car.pos.x,dz=g.position.z-car.pos.z,d=Math.hypot(dx,dz);
    if(d<a.flee&&state.mode==='play'&&a.st!=='flee'){a.st='flee';a.t=2+Math.random()*2;const ang=Math.atan2(dx,dz)+(Math.random()-.5)*.8;a.tx=g.position.x+Math.sin(ang)*8;a.tz=g.position.z+Math.cos(ang)*8}
    a.t-=dt;
    if(a.st==='flee'){a.sp=a.speed;if(a.t<=0){a.st='graze';a.t=3+Math.random()*4;a.sp=0}}
    else if(a.st==='graze'){a.sp=0;if(a.t<=0){a.st='walk';a.t=2+Math.random()*3;const ang=Math.random()*6.28,r=Math.random()*a.hr;a.tx=a.hx+Math.cos(ang)*r;a.tz=a.hz+Math.sin(ang)*r}}
    else{a.sp=a.speed*.25;if(a.t<=0){a.st='graze';a.t=3+Math.random()*5}}
    if(a.sp>0){const ex=a.tx-g.position.x,ez=a.tz-g.position.z,L=Math.hypot(ex,ez);if(L>.3){const want=Math.atan2(ex,ez);let dy=want-g.rotation.y;dy=Math.atan2(Math.sin(dy),Math.cos(dy));g.rotation.y+=dy*Math.min(1,dt*6);
        const nx=g.position.x+Math.sin(g.rotation.y)*a.sp*dt,nz=g.position.z+Math.cos(g.rotation.y)*a.sp*dt;if(WL(nx,nz)<H(nx,nz)&&Math.abs(nx)<HALF-3&&Math.abs(nz)<HALF-3){g.position.x=nx;g.position.z=nz}}else a.sp=0}
    const hop=a.kind==='rabbit'?Math.abs(Math.sin(tm*(a.sp>0?12:0)+a.ph))*.08*(a.sp>0?1:0):a.kind==='cat'&&a.sp>0?Math.abs(Math.sin(tm*9+a.ph))*.02:0;g.position.y=H(g.position.x,g.position.z)+hop;
    if(a.kind==='deer'){g.userData.legs.forEach((l,i)=>l.rotation.x=a.sp>0?Math.sin(tm*(a.sp>2?14:7)+(i%2?Math.PI:0)+(i>1?Math.PI/2:0))*.5:0);g.userData.head.rotation.x=a.st==='graze'?.9+.1*Math.sin(tm*1.3+a.ph):0}}}

/* ---------- fish: now and then one jumps out of the water with a splash ---------- */
function buildFish(o,R){for(let i=0;i<(o.n||3);i++){const g=new THREE.Group();apart(g,ANIMAL_GEO.sph,amat('#7aa6c0',{roughness:.3,metalness:.3}),0,0,0,.05,.04,.14);apart(g,ANIMAL_GEO.cone,amat('#5a86a0'),0,0,-.16,.04,.07,.02,Math.PI/2);g.visible=false;levelGroup.add(g);
    ANIMALS.fish.push({g,cx:o.at[0],cz:o.at[1],r:o.r||4,t:R()*6,jumping:false,u:0,x:0,z:0,ang:0})}}
function updateFish(dt,tm){for(const f of ANIMALS.fish){f.t-=dt;
    if(!f.jumping){if(f.t<=0){const a=Math.random()*6.28,d=Math.random()*f.r,x=f.cx+Math.cos(a)*d,z=f.cz+Math.sin(a)*d;if(WL(x,z)>H(x,z)+.3){f.jumping=true;f.u=0;f.x=x;f.z=z;f.ang=Math.random()*6.28;f.g.visible=true;f.wl=WL(x,z);if(typeof spawnDust==='function')for(let k=0;k<4;k++)spawnDust(new V3(x,f.wl,z),99,true)}else f.t=.5}continue}
    f.u+=dt/1.1;const u=f.u,h=1.1*4*u*(1-u),along=u*1.4;f.g.position.set(f.x+Math.sin(f.ang)*along,f.wl-.05+h,f.z+Math.cos(f.ang)*along);f.g.rotation.y=f.ang;f.g.rotation.x=-(1-2*u)*1.1;
    if(u>=1){f.jumping=false;f.g.visible=false;f.t=4+Math.random()*9;if(typeof spawnDust==='function')for(let k=0;k<6;k++)spawnDust(f.g.position,99,true)}}}

/* ---------- lizards: sit still on the warm rock, dart away in a flash when the car comes ---------- */
// o.rat=true makes them town rats: brown, a round body and a long thin tail, same darting behaviour
function buildLizards(o,R){for(let i=0;i<(o.n||5);i++){let x,z,k=0;do{x=o.at[0]+(R()-.5)*o.r*2;z=o.at[1]+(R()-.5)*o.r*2;k++}while((LV.dist(x,z)<1.2||WL(x,z)>H(x,z))&&k<40);
    const g=new THREE.Group(),col=amat(o.rat?['#5a4a3a','#6b5a48','#4a4038'][i%3]:['#8a7a3a','#6a7a4a','#a08040'][i%3]);
    if(o.rat){apart(g,ANIMAL_GEO.sph,col,0,.03,0,.04,.035,.07);apart(g,ANIMAL_GEO.sph,col,0,.035,.07,.028,.025,.035);for(const sd of[-1,1])apart(g,ANIMAL_GEO.sph,amat('#c9a0a0'),sd*.02,.06,.07,.012);apart(g,ANIMAL_GEO.cylTop,amat('#c9a0a0'),0,.03,-.07,.006,.14,.006,Math.PI/2+.3)}
    else{apart(g,ANIMAL_GEO.sph,col,0,.02,0,.035,.025,.08);apart(g,ANIMAL_GEO.sph,col,0,.025,.08,.025,.02,.035);apart(g,ANIMAL_GEO.cone,col,0,.015,-.12,.015,.12,.015,-Math.PI/2)}
    g.position.set(x,H(x,z),z);g.rotation.y=R()*6.28;levelGroup.add(g);ANIMALS.lizards.push({g,run:0,vx:0,vz:0,ph:R()*6.28})}}
function updateLizards(dt,tm){for(const l of ANIMALS.lizards){const g=l.g,dx=g.position.x-car.pos.x,dz=g.position.z-car.pos.z,d=Math.hypot(dx,dz);
    if(l.run<=0&&d<2.4&&state.mode==='play'){l.run=.6;const a=Math.atan2(dx,dz)+(Math.random()-.5);l.vx=Math.sin(a)*5;l.vz=Math.cos(a)*5;g.rotation.y=a}
    if(l.run>0){l.run-=dt;g.position.x+=l.vx*dt;g.position.z+=l.vz*dt;g.position.y=H(g.position.x,g.position.z);g.rotation.z=Math.sin(tm*40)*.15}else g.rotation.z=0}}

/* ---------- build / update ---------- */
function clearAnimals(){ANIMALS.parrots=[];ANIMALS.monkeys=[];ANIMALS.butterflies=null;ANIMALS.crabs=[];ANIMALS.eagle=null;ANIMALS.bear=null;ANIMALS.gulls=[];ANIMALS.deer=[];ANIMALS.rabbits=[];ANIMALS.fish=[];ANIMALS.lizards=[]}
function buildAnimals(lv,def){clearAnimals();const A=def.animals;if(!A)return;const R=mulberry32(def.seed+77);if(!lv.perches)lv.perches=[];const hasP=lv.perches.length>0;   // only the birds and monkeys need somewhere to sit
  const pick=L=>L[Math.floor(R()*L.length)];
  // parrots on branches and tree tops
  for(let i=0;i<(A.parrots||0)&&hasP;i++){const p=pick(lv.perches),g=makeParrot(PARROT_COLS[i%PARROT_COLS.length]);g.position.set(p.x,p.y+.08,p.z);g.rotation.y=R()*6.28;levelGroup.add(g);
    ANIMALS.parrots.push({g,st:'perch',perch:p,cool:R()*3,ph:R()*6.28})}
  for(let i=0;i<(A.circling||0)&&hasP;i++){const p=pick(lv.perches),g=makeParrot(PARROT_COLS[(i+1)%PARROT_COLS.length]);levelGroup.add(g);
    ANIMALS.parrots.push({g,st:'circle',cx:p.x,cz:p.z,cy:p.y+5+R()*3,r:4+R()*5,a:R()*6.28,w:(R()<.5?1:-1)*(.35+R()*.25),ph:R()*6.28})}
  // pigeons: grey, small, on lamp posts and roofs (perches of kind 'post' when there are any)
  if(A.pigeons&&hasP){const posts=lv.perches.filter(p=>p.kind==='post'),pool=posts.length?posts:lv.perches;
    for(let i=0;i<A.pigeons;i++){const p=pool[Math.floor(R()*pool.length)],g=makeParrot(PIGEON_COLS[i%PIGEON_COLS.length]);g.scale.setScalar(.72);g.position.set(p.x,p.y+.058,p.z);g.rotation.y=R()*6.28;levelGroup.add(g);
      ANIMALS.parrots.push({g,st:'perch',perch:p,cool:R()*3,ph:R()*6.28,pigeon:true})}}
  // monkeys: on branches near the road, where they can watch the car
  const near=lv.perches.filter(p=>p.kind==='branch'&&lv.dist(p.x,p.z)<7),pool=near.length>=4?near:lv.perches.filter(p=>p.kind==='branch');
  for(let i=0;i<(A.monkeys||0)&&pool.length;i++){const p=pool[Math.floor(R()*pool.length)],g=makeMonkey();g.position.set(p.x,p.y,p.z);g.rotation.y=R()*6.28;levelGroup.add(g);
    const perches=lv.perches.filter(q=>Math.hypot(q.x-p.x,q.z-p.z)<9);ANIMALS.monkeys.push({g,st:'sit',perch:p,perches,cool:0,ph:R()*6.28,yaw0:g.rotation.y,kind:'tree'})}
  // one hanging from a liana over the road
  if(A.liana){const[x,z]=A.liana,y0=H(x,z),top=y0+5.8,len=4.1,t=lv.tOf(x,z),tn=lv.T(t);const piv=new THREE.Group();piv.position.set(x,top,z);piv.rotation.y=Math.atan2(tn.x,tn.z);
    const rope=new THREE.Mesh(ANIMAL_GEO.cylTop,amat('#4f6b2c'));rope.scale.set(.025,len,.025);piv.add(rope);const g=makeMonkey();g.position.set(0,-len-.05,0);piv.add(g);levelGroup.add(piv);
    const arm=new THREE.Mesh(ANIMAL_GEO.cylTop,amat('#4f6b2c'));arm.scale.set(.02,.9,.02);arm.position.y=-len;piv.add(arm);
    {const br=apart(levelGroup,ANIMAL_GEO.cyl,amat('#5a4330'),x,top+.03,z,.07,3.2,.07,0,piv.rotation.y,Math.PI/2);br.rotation.order='YZX';
     for(const[o,sx,c]of[[0,1.1,'#3b7f33'],[1.2,.8,'#2d6b2a'],[-1.1,.85,'#4a8f3a']]){const dx=Math.cos(piv.rotation.y)*o,dz=-Math.sin(piv.rotation.y)*o;apart(levelGroup,ANIMAL_GEO.sph,amat(c),x+dx,top+.35,z+dz,sx,.45,sx)}}   // greina og løvet lianen henger i
    ANIMALS.monkeys.push({g,pivot:piv,st:'sit',perch:null,perches:[],cool:1e9,ph:R()*6.28,yaw0:0,kind:'liana'})}
  // two on a hanging bridge: they hop to the posts when the car arrives
  if(A.bridgeMonkeys){const dk=lv.fx.find(f=>f.type==='deck'&&Math.hypot(f.ax-A.bridgeMonkeys.A[0],f.az-A.bridgeMonkeys.A[1])<.5);
    if(dk){const yAt=t=>dk.y0+(dk.y1-dk.y0)*t-dk.sag*4*t*(1-t),lx=-dk.uz,lz=dk.ux,pt=(t,lat,h)=>({x:dk.ax+dk.ux*dk.len*t+lx*lat,y:yAt(t)+h,z:dk.az+dk.uz*dk.len*t+lz*lat,kind:'post'});
      const posts=[pt(0,dk.hw+.06,1.11),pt(0,-dk.hw-.06,1.11),pt(1,dk.hw+.06,1.11),pt(1,-dk.hw-.06,1.11)];
      for(const[t,sd]of[[.35,1],[.62,-1]]){const p=pt(t,sd*(dk.hw-.05),.6),g=makeMonkey();g.position.set(p.x,p.y,p.z);g.rotation.y=Math.atan2(dk.ux,dk.uz)+sd*Math.PI/2;levelGroup.add(g);
        ANIMALS.monkeys.push({g,st:'sit',perch:p,perches:posts,cool:0,ph:R()*6.28,yaw0:g.rotation.y,kind:'bridge'})}}}
  // butterflies around the flowers
  if(A.butterflies&&lv.flowers&&lv.flowers.length){const n=Math.min(A.butterflies,lv.flowers.length),im=[0,1].map(()=>{const m=new THREE.InstancedMesh(ANIMAL_GEO.bwing,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}),n);m.frustumCulled=false;levelGroup.add(m);return m});
    const cols=['#f2c23a','#3a7ce0','#e0405a','#ffffff','#f08a3a','#8a4ad0'],cc=new THREE.Color(),list=[];
    for(let i=0;i<n;i++){const f=lv.flowers[Math.floor(R()*lv.flowers.length)];list.push({x:f.x,y:f.y,z:f.z,a:R()*6.28,w:(R()<.5?1:-1)*(.8+R()*1.2),r:.3+R()*.7,s:.055+R()*.03,ph:R()*6.28});cc.set(cols[i%cols.length]).convertSRGBToLinear();im[0].setColorAt(i,cc);im[1].setColorAt(i,cc)}
    ANIMALS.butterflies={n,im,list}}
  // crabs on the beach near the start
  const s=A.crabsAt?{x:A.crabsAt[0],z:A.crabsAt[1]}:lv.start.p;for(let i=0;i<(A.crabs||0);i++){let x,z,k=0;do{x=s.x+(R()-.5)*8;z=s.z+(R()-.5)*8;k++}while((surfAt(x,z)!==S.SAND||lv.dist(x,z)<.9||WL(x,z)>H(x,z))&&k<40);
    const g=makeCrab();g.position.set(x,H(x,z)+.03,z);g.rotation.y=R()*6.28;levelGroup.add(g);ANIMALS.crabs.push({g,run:0,vx:0,vz:0,ph:R()*6.28})}
  if(A.eagle)buildEagle(A.eagle,R);if(A.bear)buildBear(A.bear,R);if(A.gulls)buildGulls(A.gulls,R);
  for(const d of(A.deer||[]))buildDeer(d,R);for(const r of(A.rabbits||[]))buildRabbits(r,R);for(const f of(A.fish||[]))buildFish(f,R);for(const l of(A.lizards||[]))buildLizards(l,R);
  for(const r of(A.rats||[]))buildLizards(Object.assign({rat:true},r),R);for(const k of(A.cats||[]))buildCats(k,R)}
function updateAnimals(dt){if(!car)return;const tm=performance.now()*.001;updateParrots(dt,tm);updateMonkeys(dt,tm);updateButterflies(dt,tm);updateCrabs(dt,tm);updateEagle(dt,tm);updateBear(dt,tm);updateGulls(dt,tm);updateGrazers(dt,tm);updateFish(dt,tm);updateLizards(dt,tm)}

/* ---------- the rolling boulder ---------- */
const BLD={m:null,def:null,active:false,done:false,t:0,len:1,ax:new V3()};
function buildBoulder(def){BLD.def=def.boulder||null;BLD.m=null;if(!BLD.def)return;const b=BLD.def;
  const m=new THREE.Mesh(b.col?ANIMAL_GEO.sph:ANIMAL_GEO.rock,amat(b.col||'#4a4541',{roughness:b.col?.6:.95}));m.scale.setScalar(b.r);m.castShadow=true;m.visible=false;levelGroup.add(m);BLD.m=m;   // b.col makes it a ball (the football on Trinnvik)
  BLD.len=Math.hypot(b.to[0]-b.from[0],b.to[1]-b.from[1]);const dx=(b.to[0]-b.from[0])/BLD.len,dz=(b.to[1]-b.from[1])/BLD.len;BLD.ax.set(dz,0,-dx);BLD.dx=dx;BLD.dz=dz;resetBoulder()}
function resetBoulder(){BLD.active=false;BLD.done=false;BLD.t=0;if(BLD.m){BLD.m.visible=false;BLD.m.quaternion.set(0,0,0,1)}}
function boulderShake(){return BLD.active?.006:0}
function updateBoulder(dt){const b=BLD.def;if(!b||!BLD.m||!car)return;
  if(!BLD.active&&!BLD.done&&state.mode==='play'&&Math.hypot(car.pos.x-b.trigger[0],car.pos.z-b.trigger[1])<2.6){BLD.active=true;BLD.t=0;BLD.m.visible=true;toast(b.msg||'⚠ Steinras!',!b.col);if(!b.col)ambRumble(2.6,.22)}
  if(!BLD.active)return;
  const sp=b.speed*(BLD.t<.55?1:Math.max(.25,1-(BLD.t-.55)*1.7));BLD.t+=dt*sp/BLD.len;const t=Math.min(1,BLD.t),x=b.from[0]+(b.to[0]-b.from[0])*t,z=b.from[1]+(b.to[1]-b.from[1])*t;const m=BLD.m;m.position.set(x,H(x,z)+b.r*.9,z);
  _aq.setFromAxisAngle(BLD.ax,-dt*sp/b.r);m.quaternion.premultiply(_aq);
  if(Math.random()<dt*25)spawnDust(m.position,14,true);
  // a shove if it hits the car (no penalty)
  const dx=car.pos.x-x,dz=car.pos.z-z,d=Math.hypot(dx,dz);if(d<b.r+.75){const k=Math.max(0,(b.r+.75-d))*14;car.vel.x+=(BLD.dx*.7+dx/d*.3)*k*dt*60*.05;car.vel.z+=(BLD.dz*.7+dz/d*.3)*k*dt*60*.05;car.vel.y+=k*dt*60*.02}
  if(t>=1){BLD.active=false;BLD.done=true}}
