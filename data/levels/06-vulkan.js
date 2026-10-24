// Bane 6: Vulkanen
// Jungelstrand → stien bak fossen → spiralvei opp en vulkan med lavaelver og hengebroer.
// Vulkanen ligger i (8,6). Veien går 1,25 runder opp mot krateret. Tre lavaelver renner rett ned fra kraterkanten og krysser veien, og i krateret ligger en lavasjø.
// Snarvei: etter port 9 kan du kjøre en smal bro rett over i stedet for den lange runden sør om (se `shortcut`).
(function(){
const C=[8,6], DEG=Math.PI/180;
const pol=(r,d)=>[C[0]+r*Math.cos(d*DEG), C[1]+r*Math.sin(d*DEG)];
// radius til veien ved vinkel d (grader): jevn stigning, én lang sving ut mot jungelen (hovedruten sør om) og en lang, slak bue inn igjen
const RK=[[225,19],[405,13.4],[430,20.4],[450,20.4],[600,8.0],[630,6.6],[675,5.0]];
const rS=d=>{for(let i=1;i<RK.length;i++)if(d<=RK[i][0]){const a=RK[i-1],b=RK[i],u=(d-a[0])/(b[0]-a[0]);return a[1]+(b[1]-a[1])*u}return 5};
const smt=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x)};
const RW=r=>.85+.04*(r-4);                          // halv bredde på lavaelva ved avstand r fra krateret
const rOf=(x,z)=>Math.hypot(x-C[0],z-C[1]);

// Hvor veien krysser en elv: a = elvas retning (grader), rb = avstand fra krateret, hw = halv bredde på broa
const cross=(a,rb,hw)=>{const X=pol(rb,a),tau=[-Math.sin(a*DEG),Math.cos(a*DEG)],Lh=RW(rb)+.8,pad=Lh+3.4;
  return{a,rb,hw,X,tau,Lh,A:[X[0]-tau[0]*Lh,X[1]-tau[1]*Lh],B:[X[0]+tau[0]*Lh,X[1]+tau[1]*Lh],
    pre:[X[0]-tau[0]*pad,X[1]-tau[1]*pad],post:[X[0]+tau[0]*pad,X[1]+tau[1]*pad]}};
const b1=cross(270,rS(270),1.1), b2=cross(355,rS(355),1.0), b3=cross(90,20.4,1.0), b5=cross(270,rS(630),.9);
const sc=cross(90,11.0,.8);                          // den smale snarveisbroa

// Elvene: a = retning (grader fra krateret), end = sluttradius, x = radiene der veien eller snarveien krysser
const RIVERS=[{a:270,end:23,x:[b1.rb,b5.rb]},{a:355,end:21,x:[b2.rb]},{a:90,end:22.8,x:[b3.rb,sc.rb]}];
const riverPts=rv=>{const out=[];for(let r=4.3;r<=rv.end+.01;r+=1){const env=rv.x.reduce((e,rc)=>e*(1-Math.exp(-(((r-rc)/2.2)**2))),1),w=.9*Math.sin(.55*r+rv.a)*env,p=pol(r,rv.a);
  out.push([p[0]-Math.sin(rv.a*DEG)*w,p[1]+Math.cos(rv.a*DEG)*w])}return out};

// ---------- løypa ----------
const jungle=[[-26,-26],[-25.5,-19],[-25.2,-12.5],[-23.8,-8.9],[-21.2,-7.9],[-18,-7.9],[-14.8,-7.9],[-11.5,-7.9],[-8.3,-7.8]];
const A=pol(rS(390),390);                           // port 9: her kan du velge snarvei
const B=pol(rS(510),510);                           // port 10: her møtes snarveien og hovedveien igjen
const FIN=[12.6,2.6];
const ev=[{tp:270,w:26,pts:[b1.pre,b1.X,b1.post]},{tp:355,w:26,pts:[b2.pre,b2.X,b2.post]},{tp:450,w:46,pts:[[19.6,17.8],[17.9,22.4],[15.6,25.3],b3.pre,b3.X,b3.post,pol(rS(480),480),pol(rS(495),495)]},{tp:630,w:36,pts:[b5.pre,b5.X,b5.post,FIN]}];
const path=jungle.slice();
for(let d=225;d<=660;d+=15){const e=ev.find(e=>Math.abs(d-e.tp)<=e.w);if(e){if(!e.done){e.done=true;path.push(...e.pts)}continue}path.push(pol(rS(d),d))}
const spiralStart=pol(rS(225),225);
const bt=[-Math.sin(510*DEG),Math.cos(510*DEG)];
const shortcut=[A,[17.0,15.2],[12.6,16.8],sc.A,sc.X,sc.B,[2.6,16.4],[-1.8,15.2],B,[B[0]+bt[0]*1.8,B[1]+bt[1]*1.8]];
const dShort=(x,z)=>{let m=1e9;for(let i=0;i<shortcut.length-1;i++){const a=shortcut[i],b=shortcut[i+1],ex=b[0]-a[0],ez=b[1]-a[1],L2=ex*ex+ez*ez;let t=((x-a[0])*ex+(z-a[1])*ez)/L2;t=t<0?0:t>1?1:t;m=Math.min(m,Math.hypot(x-a[0]-ex*t,z-a[1]-ez*t))}return m};

LEVELS.push(
{ id:'vulkan', name:'Vulkanen', diff:3, seed:211, gates:14,
  desc:'Fra jungelstranda, bak en foss og opp en vulkan. Lavaelver, hengebroer og en risikabel snarvei. Vulkanen kan rumle!',
  sky:['#3b4a86','#f2b37a'], fog:0xd99f78, fogNear:22, fogFar:80, sun:0xffc690, sunI:1.0, hemi:[0xffdcb4,0x3a2418,.62], sunDir:[-20,15,-14], rockCol:'#3b3733',
  water:.3, waterCol:'#2f7f86', waterBand:(x,z)=>Math.hypot(x+36,z+36)<12, ash:true, erupt:[14,24],
  path, shortcut, shortcutGates:[8,9],
  gateT:c=>[[-25.4,-18],[-22.6,-8.3],[-18,-7.9],[-11.5,-7.9],b1.pre,b1.post,pol(rS(315),315),b2.pre,A,B,pol(rS(555),555),b5.pre,b5.post,FIN].map(p=>c.tOf(p[0],p[1])),
  base(x,z,n){const rr=rOf(x,z);
    let h=1.0+.5*fbm(n,x*.045,z*.045,3)+.1*fbm(n,x*.3,z*.3,2);
    h-=1.6*smt((12-Math.hypot(x+36,z+36))/5);                       // havet i hjørnet
    h+=2.4*smt((z+6.65)/.9)*smt((-6-x)/6);                           // klippen foran fossen
    let b=0;if(rr<19){const u=Math.min(1,(19-rr)/15);b=5.6*u*u*(3-2*u);if(rr<4.2)b=5.6-1.8*(1-(rr/4.2)**2);b+=.22*fbm(n,x*.22,z*.22,3)*smt((19-rr)/6)}
    return h+b},
  surf(x,z,n){const rr=rOf(x,z);if(Math.hypot(x+36,z+36)<15.5)return S.SAND;if(rr<15.5)return S.ASH;if(rr<18.5)return n(x*.5,z*.5)>.5?S.ASH:S.DIRT;return n(x*.4+5,z*.4)>.64?S.MUD:S.GRASS},
  build(c){const R=c.rng,def=this;
    // --- fossen: stupebasseng foran klippen, vanndammer på toppen ---
    c.pond(-18,-12.6,3.8,.7,{fill:.75});const pool=c.pools[c.pools.length-1];
    c.pond(-18,-1.2,3.1,.45,{fill:.6});c.pond(-24,2.5,2,.3,{fill:.6});
    // --- stien: jord i jungelen, mørk, våt stein på hyllen bak fossen ---
    for(let i=0;i<c.pts.length;i+=2){const p=c.pts[i];if(rOf(p.x,p.z)>17.8)paint(p.x,p.z,1.3,S.DIRT,S.MUD)}
    for(let x=-23;x<=-9;x+=.6)paint(x,-7.9,1.45,S.ROCK);
    // --- veien jevnes ut så bilen ikke kjører på skrå, så kommer elvene ---
    c.bench(c.tOf(spiralStart[0],spiralStart[1]),1,1.5,1.8);
    c.benchLine(shortcut,1.2,1.6);
    for(const rv of RIVERS){c.lava(riverPts(rv),(x,z)=>RW(rOf(x,z)));const p=pol(4.3,rv.a);c.vent(p[0],p[1])}
    c.lavaPool(C[0],C[1],2.5,H(C[0],C[1])-.6);c.vent(C[0],C[1]);
    for(const b of[b1,b2,b3,b5])c.bridge(b.A[0],b.A[1],b.B[0],b.B[1],b.hw,{sag:.2});
    c.bridge(sc.A[0],sc.A[1],sc.B[0],sc.B[1],sc.hw,{sag:.24});
    // snarveiskasser midt på den smale broa (belønning for å tørre)
    c.crate(sc.X[0]+sc.tau[0]*.6,sc.X[1]+sc.tau[1]*.6);c.crate(sc.X[0]-sc.tau[0]*.6,sc.X[1]-sc.tau[1]*.6);
    c.bonus(sc.X[0],sc.X[1],1.0,40,'Modig snarvei! +40 ⚙');
    // skilt ved snarveien
    {const sx=18.4,sz=12.0,ang=Math.atan2(b2.post[0]-sx,b2.post[1]-sz);c.fx.push({type:'sign',x:sx,z:sz,ang,text:'SNARVEI',sub:'smal bro over lava'})}
    // --- steiner ---
    for(let i=0;i<150;i++){const x=(R()-.5)*62,z=(R()-.5)*62,r=.5+R()*1.5,h=.4+R()*1.2,rr=rOf(x,z);
      if(rr<5.2||c.dist(x,z)<r+1.5||dShort(x,z)<r+1.8||c.nearGate(x,z,r+1.6)||c.nearStart(x,z,r+3)||c.lavaNear(x,z,r+1.3)||!c.free(x,z,r+.8)||c.pools.some(p=>Math.hypot(p.x-x,p.z-z)<p.r+r+.6))continue;
      if(Math.abs(z+7.9)<2.4&&x>-24&&x<-9)continue;rock(x,z,r,h*(rr<17?1:.6),{ang:R()*6.3,ax:1+R()*.6})}
    for(let i=0;i<28;i++){const t=.2+R()*.76,p=c.P(t),s=c.side(t),b=(R()-.5)*2.2;if(c.nearGate(p.x,p.z,1.4)||c.lavaNear(p.x,p.z,3.5))continue;rock(p.x+s.x*b,p.z+s.z*b,.3+R()*.3,.16+R()*.18,{ang:R()*6.3})}
    for(const x of[-21.5,-20.2,-15.8,-14.5])rock(x,-9.6+R()*.4,.4+R()*.3,.3+R()*.2,{sharp:.5,nz:.2});   // steiner ved bassenget
    c.finish();
    // --- pynt ---
    const hL=H(-18,-7.9),topY=hL+2.45;
    // fossen: overheng av stein over stien, planter som henger ned
    {const roof=[];for(let i=0;i<7;i++){const x=-21+i*1.0+(R()-.5)*.4,z=-10.7+R()*4.2;roof.push({x,y:hL+2.55+R()*.25,z,sx:1.0+R()*.5,sy:.55,sz:1.0+R()*.6,rx:R()*3,ry:R()*3,c:mix('#3b3733','#57504a',R())})}
     instanced(DG.peb,DM.white,roof,c.decor);
     const vines=[];for(let i=0;i<16;i++){const x=-21.5+R()*7,z=-10.5+R()*3.4,l=.8+R()*1.4;vines.push({x,y:hL+2.3-l/2,z,sx:.02,sy:l,sz:.02,c:['#2f6a2a','#3f8a34'][i%2]})}
     instanced(DG.trunk,DM.white,vines,c.decor,false)}
    c.fall(-18,-10.4,0,4.6,topY,pool.level);
    c.smoke(C[0],C[1],H(C[0],C[1])+.2);
    // palmer
    const palms=[];
    for(let i=0;i<1400&&palms.length<75;i++){const x=(R()-.5)*62,z=(R()-.5)*62,rr=rOf(x,z);
      if(rr<17.5||c.dist(x,z)<2.5||dShort(x,z)<2.5||c.nearGate(x,z,2.5)||c.nearStart(x,z,2.6)||c.lavaNear(x,z,3)||!c.free(x,z,1.2)||c.pools.some(p=>Math.hypot(p.x-x,p.z-z)<p.r+1.6))continue;
      if(Math.abs(H(x+.5,z)-H(x-.5,z))+Math.abs(H(x,z+.5)-H(x,z-.5))>.3||H(x,z)<.6)continue;
      if(palms.some(q=>Math.hypot(q.x-x,q.z-z)<2.4))continue;palms.push({x,z,h:2.8+R()*1.8,lean:(R()-.5)*.35})}
    const trunks=[],fronds=[];
    for(const q of palms){const y=H(q.x,q.z),th=q.h,tx=q.x-Math.sin(q.lean)*th,ty=y+Math.cos(q.lean)*th;c.colliders.push({x:q.x,z:q.z,r:.17});
      trunks.push({x:q.x-Math.sin(q.lean)*th/2,y:y+Math.cos(q.lean)*th/2,z:q.z,sx:.12,sy:th,sz:.12,rz:q.lean,c:mix('#8a7048','#a58a5a',R())});
      const k0=R()*6.3;for(let k=0;k<8;k++)fronds.push({x:tx,y:ty,z:q.z,sx:.2,sy:1.5+R()*.3,sz:.55,ry:k0+k*.785,rz:1.0+R()*.35,c:['#2d7a2b','#3f9a3a','#25682a'][k%3]})}
    instanced(DG.trunk,DM.white,trunks,c.decor);instanced(DG.tuft,DM.tuft,fronds,c.decor);
    // bregner, store blader og blomster
    const ferns=[],flowers=[];
    for(let i=0;i<1600&&ferns.length<330;i++){const x=(R()-.5)*64,z=(R()-.5)*64;if(rOf(x,z)<13.5||c.dist(x,z)<1.7||dShort(x,z)<1.5||c.lavaNear(x,z,1.2)||c.pools.some(p=>Math.hypot(p.x-x,p.z-z)<p.r))continue;const s=.3+R()*.5;
      ferns.push({x,y:H(x,z)-.02,z,sx:s*.9,sy:s*1.1,sz:s*.9,ry:R()*6,c:['#2f7a2c','#3e8f35','#1f6a2a','#58a03a'][i%4]});
      if(R()<.22)flowers.push({x:x+(R()-.5)*.4,y:H(x,z)+s*.9,z:z+(R()-.5)*.4,sx:.07,sy:.07,sz:.07,c:['#e0405a','#f08a3a','#f2d24a','#d35aa8'][i%4]})}
    instanced(DG.fern,DM.tuft,ferns,c.decor);instanced(DG.cone,DM.white,flowers,c.decor,false);
    c.pebbles(500,['#3a3631','#524b45','#2b2724'],.04,.11);
    c.tufts(60,['#4d7a2f','#6b9a3c']);
  }}
);
})();
