'use strict';
/* =================================================================
   CORE: terrain, levels and crawler physics (no DOM)
   1 world unit ≈ 8.5 cm in real life (a 1:24 crawler is ~2 units long)
   ================================================================= */
const V3=THREE.Vector3, Q4=THREE.Quaternion, YAX=new V3(0,1,0);
const UNIT_CM=8.5;
const WORLD=70, N=241, CELL=WORLD/(N-1), HALF=WORLD/2;
const TH=new Float32Array(N*N), TB=new Float32Array(N*N), TS=new Uint8Array(N*N), TC=new Float32Array(N*N*3), TCF=new Uint8Array(N*N);
const S={SAND:0,ROCK:1,DIRT:2,GRASS:3,WOOD:4,MUD:5,BOOK:6,BARK:7,PENCIL:8,KEY:9,GRAVEL:10,PAPER:11,FLOOR:12,BOG:13,ASH:14,LAVA:15};
const GRIP=[0.85,1.25,1.0,0.95,0.92,0.62,1.05,1.1,0.95,1.0,1.0,0.88,0.9,0.7,0.88,0.6];
// mud drag per wheel: [constant, viscous] as fractions of m·g. Low gear pushes through; high gear bogs down.
const MUDDRAG={5:[.05,.012],13:[.12,.025]};
const G={noise:null,def:null,outside:null,colliders:[],waterAt:null,decks:[],lavas:[]};
function WL(x,z){return G.waterAt?G.waterAt(x,z):-1e9}

function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
function makeNoise(seed){
  const r=mulberry32(seed),p=new Uint16Array(256),perm=new Uint16Array(512),val=new Float32Array(256);
  for(let i=0;i<256;i++){p[i]=i;val[i]=r()}
  for(let i=255;i>0;i--){const j=Math.floor(r()*(i+1)),t=p[i];p[i]=p[j];p[j]=t}
  for(let i=0;i<512;i++)perm[i]=p[i&255];
  const h=(a,b)=>val[perm[(a&255)+perm[b&255]]];
  return (x,z)=>{const xi=Math.floor(x),zi=Math.floor(z),xf=x-xi,zf=z-zi,u=xf*xf*(3-2*xf),v=zf*zf*(3-2*zf);
    const A=h(xi,zi),B=h(xi+1,zi),C=h(xi,zi+1),D=h(xi+1,zi+1);return (A+(B-A)*u)*(1-v)+(C+(D-C)*u)*v;};
}
function fbm(n,x,z,o=4){let s=0,a=1,f=1,t=0;for(let i=0;i<o;i++){s+=(n(x*f+i*17.3,z*f-i*9.1)-.5)*a;t+=a*.5;a*=.5;f*=2.03}return s/t}

/* ---------- height queries ---------- */
function Hterr(x,z){
  let fx=(x+HALF)/CELL,fz=(z+HALF)/CELL;
  if(G.outside!==null&&(fx<0||fz<0||fx>N-1||fz>N-1))return G.outside;
  fx=fx<0?0:fx>N-1.0001?N-1.0001:fx; fz=fz<0?0:fz>N-1.0001?N-1.0001:fz;
  const i=fx|0,j=fz|0,u=fx-i,v=fz-j,k=j*N+i;
  const a=TH[k],b=TH[k+1],c=TH[k+N],d=TH[k+N+1];
  return (a+(b-a)*u)*(1-v)+(c+(d-c)*u)*v;
}
// suspension bridges are analytic decks laid on top of the terrain: height = max(terrain, deck)
function deckAt(x,z){let best=-1e9;
  for(const k of G.decks){if(x<k.x0||x>k.x1||z<k.z0||z>k.z1)continue;
    const rx=x-k.ax,rz=z-k.az,a=rx*k.ux+rz*k.uz;if(a<0||a>k.len)continue;const b=Math.abs(rx*k.uz-rz*k.ux);if(b>k.hw)continue;
    const t=a/k.len;let y=k.y0+(k.y1-k.y0)*t-k.sag*4*t*(1-t);const e=k.hw-b;if(e<.16)y+=.15*Math.min(1,(.16-e)/.05); // low plank rail at the edge
    if(y>best)best=y}
  return best}
function H(x,z){const h=Hterr(x,z);if(G.decks.length){const d=deckAt(x,z);if(d>h)return d}return h}
function surfAt(x,z){let i=Math.round((x+HALF)/CELL),j=Math.round((z+HALF)/CELL);i=i<0?0:i>N-1?N-1:i;j=j<0?0:j>N-1?N-1:j;
  if(G.decks.length){const d=deckAt(x,z);if(d>-1e8&&d>=Hterr(x,z))return S.WOOD}return TS[j*N+i]}
// lava: returns the lava surface height at (x,z), or -1e9 if there is none. m widens the area.
function lavaAt(x,z,m=0){let best=-1e9,bd=1e9;for(const L of G.lavas)for(const p of L.s){const dx=p.x-x,dz=p.z-z,d=Math.sqrt(dx*dx+dz*dz)-p.hw-m;if(d<0&&d<bd){bd=d;best=p.y}}return best}
function normalAt(x,z,out){const e=.15;return out.set(H(x-e,z)-H(x+e,z),2*e,H(x,z-e)-H(x,z+e)).normalize()}

/* ---------- stamping ---------- */
const _cc={};
function col(h){if(_cc[h])return _cc[h];const c=new THREE.Color(h);if(c.convertSRGBToLinear)c.convertSRGBToLinear();return _cc[h]=[c.r,c.g,c.b]}
function mix(a,b,t){const A=col(a),B=col(b);t=Math.max(0,Math.min(1,t));return[A[0]+(B[0]-A[0])*t,A[1]+(B[1]-A[1])*t,A[2]+(B[2]-A[2])*t]}
function setC(k,h){const c=typeof h==='string'?col(h):h;TC[k*3]=c[0];TC[k*3+1]=c[1];TC[k*3+2]=c[2];TCF[k]=1}
function cellsIn(x0,z0,x1,z1,fn){
  const i0=Math.max(0,Math.floor((x0+HALF)/CELL)),i1=Math.min(N-1,Math.ceil((x1+HALF)/CELL));
  const j0=Math.max(0,Math.floor((z0+HALF)/CELL)),j1=Math.min(N-1,Math.ceil((z1+HALF)/CELL));
  for(let j=j0;j<=j1;j++)for(let i=i0;i<=i1;i++)fn(j*N+i,-HALF+i*CELL,-HALF+j*CELL);
}
function rock(x,z,r,h,o={}){
  const sharp=o.sharp??.55,nz=o.nz??.35,surf=o.surf??S.ROCK,ax=o.ax??1,an=o.ang??0,ca=Math.cos(an),sa=Math.sin(an),R=r*Math.max(ax,1),n=G.noise,sd=x*3.7+z*1.3;
  cellsIn(x-R,z-R,x+R,z+R,(k,px,pz)=>{const dx=px-x,dz=pz-z,lx=(dx*ca-dz*sa)/(r*ax),lz=(dx*sa+dz*ca)/r,d2=lx*lx+lz*lz;if(d2>=1)return;
    const b=h*Math.pow(1-d2,sharp)*(1-nz*.5+nz*n(px*1.9+sd,pz*1.9-sd));if(b<=0)return;TH[k]+=b;if(b>.035){TS[k]=surf;TCF[k]=0}});
}
function shape(cx,cz,ang,len,wid,hf,surf,cf){
  const dx=Math.sin(ang),dz=Math.cos(ang),R=Math.hypot(len,wid)/2+CELL;
  cellsIn(cx-R,cz-R,cx+R,cz+R,(k,px,pz)=>{const rx=px-cx,rz=pz-cz,a=rx*dx+rz*dz,b=rx*dz-rz*dx;
    if(Math.abs(a)>len/2||Math.abs(b)>wid/2)return;const h=hf(a,b);if(h==null)return;const nh=TB[k]+h;
    if(nh>=TH[k]-1e-4){TH[k]=nh;if(surf!=null)TS[k]=surf;if(cf)setC(k,cf(a,b))}});
}
function disc(x,z,r,top,surf,c){cellsIn(x-r,z-r,x+r,z+r,(k,px,pz)=>{if(Math.hypot(px-x,pz-z)>r)return;const nh=TB[k]+top;if(nh>=TH[k]){TH[k]=nh;TS[k]=surf;if(c)setC(k,c)}})}
function log(ax,az,bx,bz,r,surf,cf){
  const ex=bx-ax,ez=bz-az,L2=ex*ex+ez*ez||1e-6,R=r*1.8;
  cellsIn(Math.min(ax,bx)-R,Math.min(az,bz)-R,Math.max(ax,bx)+R,Math.max(az,bz)+R,(k,px,pz)=>{
    let t=((px-ax)*ex+(pz-az)*ez)/L2;t=t<0?0:t>1?1:t;const dx=px-(ax+ex*t),dz=pz-(az+ez*t),d=Math.hypot(dx,dz);let p;
    if(d<r)p=r+Math.sqrt(r*r-d*d);else if(d<1.7*r)p=r*(1-(d-r)/(.7*r));else return;
    const nh=TB[k]+p;if(nh>TH[k]){TH[k]=nh;if(d<r*1.05){TS[k]=surf;if(cf)setC(k,cf(t,d/r));else TCF[k]=0}}});
}
function paint(x,z,r,surf,skip){cellsIn(x-r,z-r,x+r,z+r,(k,px,pz)=>{if(Math.hypot(px-x,pz-z)>r)return;if(skip!=null&&TS[k]===skip)return;if(TS[k]===S.ROCK||TS[k]===S.BARK)return;TS[k]=surf})}

/* ---------- shared decor geometry ---------- */
const DG={
  peb:new THREE.IcosahedronGeometry(1,0), tuft:new THREE.ConeGeometry(1,1,4,1,true), trunk:new THREE.CylinderGeometry(1,1.14,1,10),
  fern:new THREE.ConeGeometry(1,1,6), cone:new THREE.SphereGeometry(1,6,5)
};
DG.tuft.translate(0,.5,0); DG.fern.translate(0,.5,0);
const DM={
  white:new THREE.MeshStandardMaterial({color:0xffffff,roughness:.9,flatShading:true}),
  tuft:new THREE.MeshStandardMaterial({color:0xffffff,roughness:1,side:THREE.DoubleSide,flatShading:true}),
  bark:new THREE.MeshStandardMaterial({color:0x5d4330,roughness:1,flatShading:true})
};
function instanced(geo,mat,list,grp,shadow=true){
  if(!list.length)return null;const im=new THREE.InstancedMesh(geo,mat,list.length),m4=new THREE.Matrix4(),q=new Q4(),s=new V3(),p=new V3(),e=new THREE.Euler(),cc=new THREE.Color();
  list.forEach((o,i)=>{p.set(o.x,o.y,o.z);e.set(o.rx||0,o.ry||0,o.rz||0);q.setFromEuler(e);s.set(o.sx,o.sy??o.sx,o.sz??o.sx);m4.compose(p,q,s);im.setMatrixAt(i,m4);if(o.c&&im.setColorAt){if(Array.isArray(o.c))cc.setRGB(o.c[0],o.c[1],o.c[2]);else{cc.set(o.c);if(cc.convertSRGBToLinear)cc.convertSRGBToLinear()}im.setColorAt(i,cc)}});
  im.castShadow=shadow;im.receiveShadow=true;grp.add(im);return im;
}

/* ---------- surface colour ---------- */
function surfColor(s,x,z,n,def){
  const v=n(x*.45+50,z*.45),w=n(x*2.7,z*2.7-40);
  switch(s){
    case S.SAND:return mix('#d4c6a8','#eee5d0',v*.7+w*.3);
    case S.ROCK:{const b=col(def.rockCol||'#9a948a'),f=.76+w*.32+v*.12;return[b[0]*f,b[1]*f,b[2]*f]}
    case S.GRAVEL:return mix('#776f62','#a1998b',v*.5+w*.5);
    case S.DIRT:return mix('#5b412b','#80603f',v*.6+w*.4);
    case S.GRASS:return mix('#4b6629','#7f9441',v*.7+w*.3);
    case S.MUD:return mix('#3c2f22','#574431',w);
    case S.BOG:return mix('#2a2016','#3f3024',w*.6+v*.4);
    case S.BARK:return mix('#47321f','#6c4b31',w);
    case S.WOOD:{const g=Math.sin(x*1.25+fbm(n,x*.07,z*.6,3)*9)*.5+.5;return mix('#77482a','#a86f3f',g*.75+w*.25)}
    case S.ASH:return mix('#26221f','#4a433d',v*.5+w*.5);
    case S.LAVA:return mix('#2a0d06','#5a1a08',w);
    case S.FLOOR:return mix('#241c16','#2f251d',w);
    default:return mix('#8a8a8a','#9a9a9a',w);
  }
}

/* ---------- levels ---------- */
const LEVELS=[]; // fylles av data/levels/*.js

function benchPts(P,hw,blend){
  const hs=P.map(p=>Hterr(p.x,p.z)),sm=hs.map((_,i)=>{let a=0,m=0;for(let k=-8;k<=8;k++){const j=i+k;if(j>=0&&j<hs.length){a+=hs[j];m++}}return a/m});
  const best=new Float32Array(N*N).fill(1e9),bi=new Int32Array(N*N).fill(-1),R=hw+blend;
  for(let i=0;i<P.length;i+=2){const p=P[i];cellsIn(p.x-R,p.z-R,p.x+R,p.z+R,(k,px,pz)=>{const d=Math.hypot(px-p.x,pz-p.z);if(d<best[k]){best[k]=d;bi[k]=i}})}
  for(let k=0;k<N*N;k++){if(bi[k]<0||best[k]>=R)continue;const d=best[k],f=d<=hw?1:1-(d-hw)/blend,w=f*f*(3-2*f);TH[k]+=(sm[bi[k]]-TH[k])*w}}
function carveLava(s){
  const best=new Float32Array(N*N).fill(1e9),bi=new Int32Array(N*N).fill(-1);
  s.forEach((p,i)=>{const R=p.hw+.8;cellsIn(p.x-R,p.z-R,p.x+R,p.z+R,(k,px,pz)=>{const d=Math.hypot(px-p.x,pz-p.z)-p.hw;if(d<best[k]){best[k]=d;bi[k]=i}})});
  for(let k=0;k<N*N;k++){if(bi[k]<0||best[k]>=.6)continue;const p=s[bi[k]],d=best[k],floor=p.y-.3;let nh;
    if(d<=0)nh=floor;else{const f=d/.6,sf=f*f*(3-2*f);nh=floor+(TH[k]-floor)*sf}
    if(nh<TH[k]){TH[k]=nh;TCF[k]=0;TS[k]=d<=.12?S.LAVA:S.ASH}}}

function genLevel(def){
  const rng=mulberry32(def.seed),n=makeNoise(def.seed*7+3);
  G.noise=n;G.def=def;G.outside=def.outside??null;G.decks=[];G.lavas=[];TCF.fill(0);
  for(let j=0;j<N;j++)for(let i=0;i<N;i++){const k=j*N+i,x=-HALF+i*CELL,z=-HALF+j*CELL;TH[k]=def.base(x,z,n);TS[k]=def.surf(x,z,n)}
  TB.set(TH);
  const curve=new THREE.CatmullRomCurve3(def.path.map(p=>new V3(p[0],0,p[1])),false,'centripetal');
  const pts=curve.getSpacedPoints(500);
  const blocks=[];
  const c={rng,noise:n,curve,pts,colliders:[],decor:new THREE.Group(),gates:[],
    P:t=>curve.getPointAt(t), T:t=>{const v=curve.getTangentAt(t);v.y=0;return v.normalize()},
    side:t=>{const v=c.T(t);return new V3(v.z,0,-v.x)}, ang:t=>{const v=c.T(t);return Math.atan2(v.x,v.z)},
    dist:(x,z)=>{let m=1e9;for(let i=0;i<pts.length;i+=2){const dx=pts[i].x-x,dz=pts[i].z-z,d=dx*dx+dz*dz;if(d<m)m=d}return Math.sqrt(m)},
    nearGate:(x,z,m)=>c.gates.some(g=>Math.hypot(g.c.x-x,g.c.z-z)<m),
    nearStart:(x,z,m)=>Math.hypot(pts[0].x-x,pts[0].z-z)<m,
    block:(x,z,r)=>blocks.push({x,z,r}), free:(x,z,r)=>!blocks.some(b=>Math.hypot(b.x-x,b.z-z)<b.r+r),
    pools:[],fx:[],vents:[],extra:[],bonuses:[],
    bonus:(x,z,r,nuts,msg)=>c.bonuses.push({x,z,r,nuts,msg}),
    tOf:(x,z)=>{let m=1e9,bi=0;for(let i=0;i<pts.length;i++){const dx=pts[i].x-x,dz=pts[i].z-z,d=dx*dx+dz*dz;if(d<m){m=d;bi=i}}return bi/(pts.length-1)},
    lavaNear:(x,z,m)=>lavaAt(x,z,m)>-1e8,
    crate:(x,z)=>c.extra.push({x,z}),vent:(x,z)=>c.vents.push({x,z,y:H(x,z)}),
    smoke:(x,z,y)=>c.fx.push({type:'smoke',x,z,y}),
    fall:(x,z,ang,w,top,bot)=>c.fx.push({type:'fall',x,z,ang,w,top,bot}),
    // dig a pond into the base terrain and fill it; mud rim around it
    pond(x,z,r,dep,o={}){const i=Math.round((x+HALF)/CELL),j=Math.round((z+HALF)/CELL);let hc=TB[j*N+i];
      const R=r*1.25;cellsIn(x-R,z-R,x+R,z+R,(k,px,pz)=>{const d=Math.hypot(px-x,pz-z);if(d>R)return;const f=1-(d/R)**2,nh=hc-dep*f*(1-.15*G.noise(px*2,pz*2))+(TB[k]-hc)*(1-f);
        if(nh<TH[k]){TH[k]=nh;TCF[k]=0;TS[k]=d<r*1.18?(o.bed??S.MUD):S.MUD}});
      c.pools.push({x,z,r:r*1.06,level:hc-dep*(o.fill??.32)});if(o.bog)paint(x,z,r*.9,S.BOG)},
    // dirt ramp with a drop at the end: a jump in high gear
    ramp(t,h=.55,len=3.2,wid=2.6){const p=c.P(t),an=c.ang(t);c.block(p.x,p.z,3);
      shape(p.x,p.z,an,len,wid,(a,b)=>{const u=(a+len/2)/len;if(u<.08)return u/.08*.02;if(u<.88)return .02+(u-.08)/.8*h;return null},S.DIRT,(a,b)=>mix('#6d4b2d','#8d6a44',G.noise(a*3,b*3)*.7+(Math.abs(b)>wid/2-.18?.5:0)))},
    // level the ground along the path between t0 and t1 so the car does not drive on a steep side slope
    bench(t0,t1,hw=1.5,blend=1.8){const i0=Math.round(t0*(pts.length-1)),i1=Math.round(t1*(pts.length-1));benchPts(pts.slice(i0,i1+1),hw,blend)},
    // the same along any polyline [[x,z],...] (for example a shortcut)
    benchLine(poly,hw=1.3,blend=1.6){const d=[];for(let i=0;i<poly.length-1;i++){const a=poly[i],b=poly[i+1],L=Math.hypot(b[0]-a[0],b[1]-a[1]),m=Math.max(1,Math.ceil(L/.33));for(let k=0;k<m;k++){const u=k/m;d.push({x:a[0]+(b[0]-a[0])*u,z:a[1]+(b[1]-a[1])*u})}}d.push({x:poly[poly.length-1][0],z:poly[poly.length-1][1]});benchPts(d,hw,blend)},
    // a lava river along a polyline (from the source outwards). hwFn(x,z) = half width. The surface follows the terrain downhill.
    lava(poly,hwFn,o={}){const d=[];for(let i=0;i<poly.length-1;i++){const a=poly[i],b=poly[i+1],L=Math.hypot(b[0]-a[0],b[1]-a[1]),m=Math.max(1,Math.ceil(L/.5));for(let k=0;k<m;k++){const u=k/m;d.push([a[0]+(b[0]-a[0])*u,a[1]+(b[1]-a[1])*u])}}
      d.push(poly[poly.length-1]);let lv=1e9;const s=d.map(p=>{const y=Math.min(lv,Hterr(p[0],p[1])-(o.drop??.55));lv=y;return{x:p[0],z:p[1],y,hw:hwFn(p[0],p[1])}});
      for(let pass=0;pass<2;pass++)for(let i=0;i<s.length;i++){let a=0,m=0;for(let k=-3;k<=3;k++){const j=i+k;if(j>=0&&j<s.length){a+=s[j].y;m++}}s[i].ny=a/m}
      s.forEach(p=>p.y=p.ny);carveLava(s);G.lavas.push({s});c.fx.push({type:'lava',s});return s},
    lavaPool(x,z,r,level){const s=[{x,z,y:level,hw:r}];carveLava(s);G.lavas.push({s});c.fx.push({type:'lavadisc',x,z,r,y:level})},
    // a suspension bridge from A to B (hw = half width). Both ends must lie on solid ground.
    bridge(ax,az,bx,bz,hw,o={}){const len=Math.hypot(bx-ax,bz-az),ux=(bx-ax)/len,uz=(bz-az)/len,y0=H(ax,az),y1=H(bx,bz),px=-uz*hw,pz=ux*hw,xs=[ax+px,ax-px,bx+px,bx-px],zs=[az+pz,az-pz,bz+pz,bz-pz];
      const dk={ax,az,bx,bz,ux,uz,len,hw,y0,y1,sag:o.sag??.22,x0:Math.min(...xs)-.02,x1:Math.max(...xs)+.02,z0:Math.min(...zs)-.02,z1:Math.max(...zs)+.02};
      G.decks.push(dk);c.fx.push(Object.assign({type:'deck'},dk));c.block((ax+bx)/2,(az+bz)/2,len/2+1);return dk},
    finish(){for(let j=0;j<N;j++)for(let i=0;i<N;i++){const k=j*N+i;if(TCF[k])continue;const cc=surfColor(TS[k],-HALF+i*CELL,-HALF+j*CELL,n,def);TC[k*3]=cc[0];TC[k*3+1]=cc[1];TC[k*3+2]=cc[2]}c._done=true},
    pebbles(cnt,cols,smin,smax){const L=[];for(let i=0;i<cnt;i++){const x=(rng()-.5)*66,z=(rng()-.5)*66;if(def.water!=null&&H(x,z)<def.water+.02)continue;const s=smin+rng()*(smax-smin);
      L.push({x,y:H(x,z)+s*.2,z,sx:s,sy:s*.6,sz:s*(.8+rng()*.5),rx:rng()*3,ry:rng()*3,c:cols[i%cols.length]})}instanced(DG.peb,DM.white,L,c.decor,false)},
    tufts(cnt,cols){const L=[];for(let i=0;i<cnt;i++){const x=(rng()-.5)*66,z=(rng()-.5)*66;if(c.dist(x,z)<1.8)continue;for(let k=0;k<5;k++){const s=.05+rng()*.05;
      L.push({x:x+(rng()-.5)*.5,y:H(x,z)-.02,z:z+(rng()-.5)*.5,sx:s,sy:.35+rng()*.45,sz:s,rx:(rng()-.5)*.6,rz:(rng()-.5)*.6,c:cols[k%cols.length]})}}instanced(DG.tuft,DM.tuft,L,c.decor,false)}
  };
  const gl=def.gateT?def.gateT(c):null,NG=gl?gl.length:def.gates;
  for(let k=1;k<=NG;k++){const t=gl?gl[k-1]:.03+.95*k/NG,p=c.P(t),tn=c.T(t),s=c.side(t);
    c.gates.push({t,c:p,tan:tn,side:s,a:{x:p.x+s.x*1.25,z:p.z+s.z*1.25},b:{x:p.x-s.x*1.25,z:p.z-s.z*1.25},finish:k===NG})}
  G.waterAt=(x,z)=>{let w=-1e9;if(def.water!=null&&(!def.waterBand||def.waterBand(x,z)))w=def.water;for(const p of c.pools){if((x-p.x)*(x-p.x)+(z-p.z)*(z-p.z)<p.r*p.r&&p.level>w)w=p.level}return w};
  def.build(c);
  if(!c._done)c.finish();
  c.start={p:c.P(0),tan:c.T(.004)};
  // supply crates: beside the line, never in water
  c.crates=[];for(let k=0;k<6;k++){const t=.09+.8*k/5+(rng()-.5)*.04,p=c.P(t),s=c.side(t);let placed=false;
    for(const sg of(k%2?[1,-1]:[-1,1])){const off=sg*(1.3+rng()*.7),x=p.x+s.x*off,z=p.z+s.z*off,y=H(x,z);if(WL(x,z)>y-.05||lavaAt(x,z,1.1)>-1e8||c.nearGate(x,z,1.1)||Math.abs(y-H(p.x,p.z))>.9)continue;c.crates.push({x,z,y:y+.16,t});placed=true;break}
    if(!placed)c.crates.push({x:p.x,z:p.z,y:H(p.x,p.z)+.16,t})}
  for(const e of c.extra)c.crates.push({x:e.x,z:e.z,y:H(e.x,e.z)+.16,t:c.tOf(e.x,e.z)});
  G.colliders=c.colliders;
  return c;
}

/* ---------- cars ---------- */
const CARS=[]; // fylles av data/cars.js
const TRAVEL=.22, WR=.24, TRACK=.9, MOUNT_Y=-.02;
const SAMPLES=[[-.8,0],[-.5,0],[-.2,0],[0,0],[.2,0],[.5,0],[.8,0],[0,.07],[0,-.07]];
// PARTS og PAINTS ligger i data/parts.js
function tuneFrom(parts){const g=k=>parts[k]||0,t=g('tyres'),s=g('susp'),mo=g('motor'),w=g('weight'),ge=g('gear');
  return{grip:[1,1.1,1.2,1.3][t],vlow:[1,1.05,1.1,1.15][mo],vhigh:[1,.96,.92,.88][t]*[1,1.12,1.25,1.4][mo]*[1,.97,.94,.9][w],fmot:[1,1.2,1.4,1.65][mo],
    travel:[.22,.26,.3,.34][s],lift:[0,0,.008,.015][s],right:[0,.35,.7,1][w],wade:ge>=1?.22:.06,winch:ge>=2?2:5,led:ge>=3,snorkel:ge>=1,lv:{tyres:t,susp:s,motor:mo,weight:w,gear:ge}}}
const TUNE0=tuneFrom({});

function makeCar(cfg,tune){
  tune=tune||TUNE0;
  const m=cfg.mass,L=cfg.L,W=.92,car={cfg,m,tune,pos:new V3(),vel:new V3(),q:new Q4(),w:new V3(),steer:0,throttle:0,low:true,assist:true,speedScale:1,
    depth:-1,I:new V3(m/12*(.55*.55+L*L)*1.1,m/12*(W*W+L*L)*1.1,m/12*(W*W+.55*.55)*1.6),wheels:[],pts:[],up:new V3(0,1,0),fw:new V3(0,0,1),lf:new V3(1,0,0)};
  car.K=m*9.8/4/(.4*TRAVEL);car.C=2*Math.sqrt(car.K*m/4)*[.5,.65,.8,.9][tune.lv?tune.lv.susp:0];
  for(const fz of[1,-1])for(const sx of[1,-1])car.wheels.push({mount:new V3(sx*TRACK/2,MOUNT_Y+(tune.travel-TRAVEL)-tune.lift,fz*cfg.wb/2),front:fz>0,left:sx>0,comp:0,prev:0,had:false,contact:false,center:new V3(),spin:0,vl:0,slip:0,surf:0,P:new V3()});
  const roof=.08+.34+cfg.gh+.12;
  for(const sx of[1,-1]){for(const sz of[1,-1]){car.pts.push(new V3(sx*.44,-.06,sz*L*.47),new V3(sx*.42,roof,sz*L*.42),new V3(sx*.42,.03,sz*(L/2+.09)),new V3(sx*.47,.3,sz*L*.3))}}
  car.pts.push(new V3(0,-.14,0),new V3(0,-.13,cfg.wb*.3),new V3(0,-.13,-cfg.wb*.3));
  return car;
}
function placeCar(car,x,z,heading){
  car.q.setFromAxisAngle(YAX,heading);let mh=-1e9;
  for(const dx of[-.6,0,.6])for(const dz of[-1,0,1]){const c=Math.cos(heading),s=Math.sin(heading);mh=Math.max(mh,H(x+dx*c+dz*s,z-dx*s+dz*c))}
  car.pos.set(x,mh+.5,z);car.vel.set(0,0,0);car.w.set(0,0,0);car.steer=0;car.throttle=0;
  for(const w of car.wheels){w.prev=0;w.had=false;w.comp=0}
}

const _f=new V3(),_tq=new V3(),_M=new V3(),_C0=new V3(),_wf=new V3(),_ff=new V3(),_fs=new V3(),_P=new V3(),_n=new V3(),_ng=new V3(),_r=new V3(),_rc=new V3(),
      _vp=new V3(),_tF=new V3(),_tS=new V3(),_t=new V3(),_iq=new Q4(),_wq=new Q4();
function stepCar(car,dt){
  const m=car.m,g=9.8,q=car.q,inv=1/dt,meff=m*.125;
  const up=car.up.set(0,1,0).applyQuaternion(q),fw=car.fw.set(0,0,1).applyQuaternion(q),lf=car.lf.set(1,0,0).applyQuaternion(q);
  _f.set(0,-g*m,0);_tq.set(0,0,0);
  const TU=car.tune||TUNE0,TRV=TU.travel;
  const low=car.low,vmax=(low?1.7*TU.vlow:5.6*TU.vhigh)*(car.speedScale||1),fmot=(low?.62:.15)*TU.fmot*m*g,vt=car.throttle*vmax,gripMul=(car.assist?1.12:1)*TU.grip;
  const dy=Math.max(.35,up.y);
  for(const wh of car.wheels){
    _M.copy(wh.mount).applyQuaternion(q).add(car.pos);
    _C0.copy(up).multiplyScalar(-TRV).add(_M);
    const st=wh.front?car.steer:0,cs=Math.cos(st),sn=Math.sin(st);
    _wf.copy(fw).multiplyScalar(cs).addScaledVector(lf,sn);
    _ff.set(_wf.x,0,_wf.z);if(_ff.lengthSq()<1e-4)_ff.set(up.x,0,up.z);_ff.normalize();_fs.set(_ff.z,0,-_ff.x);
    let best=-1e9,bx=0,bz=0,bh=0;
    for(const s of SAMPLES){const a=s[0]*WR,b=s[1],px=_C0.x+_ff.x*a+_fs.x*b,pz=_C0.z+_ff.z*a+_fs.z*b,gh=H(px,pz),pen=gh-(_C0.y-Math.sqrt(Math.max(0,WR*WR-a*a)));
      if(pen>best){best=pen;bx=px;bz=pz;bh=gh}}
    if(best>0){
      const comp=best/dy;wh.contact=true;
      let cv=wh.had?(comp-wh.prev)*inv:0;cv=Math.max(-2.5,Math.min(2.5,cv));wh.prev=comp;wh.had=true;
      let spring=car.K*Math.min(comp,TRV)+car.C*cv;if(comp>TRV)spring+=car.K*30*(comp-TRV)+car.C*2*cv;spring=Math.max(0,spring);
      wh.comp=Math.min(comp,TRV+.04);
      _P.set(bx,bh,bz);
      _n.set(_C0.x,_C0.y+best,_C0.z).sub(_P).normalize();normalAt(bx,bz,_ng);
      _n.multiplyScalar(.6).addScaledVector(_ng,.4).normalize();if(_n.y<.15)_n.copy(_ng);
      const Nf=Math.min(spring/Math.max(.35,_n.dot(up)),m*g*3);
      _r.copy(_P).sub(car.pos);_vp.copy(car.w).cross(_r).add(car.vel);
      _tF.copy(_wf).addScaledVector(_n,-_wf.dot(_n)).normalize();_tS.crossVectors(_n,_tF);
      const vl=_vp.dot(_tF),vs=_vp.dot(_tS),surf=surfAt(bx,bz),wd=WL(bx,bz)-bh,lim=GRIP[surf]*gripMul*(wd>0?.82:1)*Nf;
      const fm=Math.min(fmot,lim);let fl=(vt-vl)*meff*inv;fl=Math.max(-fm,Math.min(fm,fl));
      let fs=-vs*meff*inv;fs=Math.max(-lim,Math.min(lim,fs));
      const mag=Math.hypot(fl,fs);if(mag>lim&&mag>0){const k=lim/mag;fl*=k;fs*=k}
      // mud and water resistance (opposes wheel velocity, never reverses it)
      const md=MUDDRAG[surf],spd=Math.hypot(vl,vs);
      if((md||wd>0)&&spd>1e-3){let dr=0;if(md)dr+=(md[0]+md[1]*spd)*m*g;if(wd>0)dr+=Math.min(wd,.5)*.09*spd*m*g;dr=Math.min(dr,spd*meff*inv*.9);fl-=vl/spd*dr;fs-=vs/spd*dr}
      _t.copy(_n).multiplyScalar(Nf).addScaledVector(_tF,fl).addScaledVector(_tS,fs);
      _f.add(_t);_rc.crossVectors(_r,_t);_tq.add(_rc);
      wh.vl=vl;wh.slip=Math.abs(car.throttle)>.05?Math.abs(vt-vl):0;wh.surf=surf;wh.P.copy(_P);wh.wd=wd;
    }else{wh.contact=false;wh.had=false;wh.comp=0;wh.prev=0;wh.slip=0;wh.wd=-1}
    wh.center.copy(_M).addScaledVector(up,-(TRV-Math.min(wh.comp,TRV)));
  }
  // body vs ground
  for(const bp of car.pts){
    _P.copy(bp).applyQuaternion(q).add(car.pos);const pen=H(_P.x,_P.z)-_P.y;if(pen<=0)continue;
    normalAt(_P.x,_P.z,_ng);_r.copy(_P).sub(car.pos);_vp.copy(car.w).cross(_r).add(car.vel);
    const vn=_vp.dot(_ng);const Nf=Math.max(0,300*m*Math.min(pen,.3)-(vn<0?17*m*vn:0));
    _t.copy(_vp).addScaledVector(_ng,-vn);const tl=_t.length();
    let ft=tl*meff*inv;ft=Math.min(ft,.6*Nf);
    _t.multiplyScalar(tl>1e-6?-ft/tl:0).addScaledVector(_ng,Nf);
    _f.add(_t);_rc.crossVectors(_r,_t);_tq.add(_rc);
  }
  // body in water: buoyancy and drag
  const wl=WL(car.pos.x,car.pos.z);car.depth=wl-car.pos.y;
  const sub=Math.max(0,Math.min(1,(wl-(car.pos.y-.16))/.5));
  if(sub>0){_f.y+=sub*m*g*.88;car.vel.multiplyScalar(1-2.4*sub*dt);car.w.multiplyScalar(1-3*sub*dt)}
  car.vel.addScaledVector(_f,dt/m);
  _iq.copy(q).invert();_t.copy(_tq).applyQuaternion(_iq);_t.set(_t.x/car.I.x,_t.y/car.I.y,_t.z/car.I.z).applyQuaternion(q);
  car.w.addScaledVector(_t,dt);
  if(car.assist&&up.y<.8&&up.y>-.2){_t.crossVectors(up,YAX);car.w.addScaledVector(_t,dt*7*(.8-up.y))}
  if(TU.right>0&&up.y<.985&&up.y>-.2){_t.crossVectors(up,YAX);car.w.addScaledVector(_t,dt*9*TU.right*(.985-up.y))}
  car.w.multiplyScalar(1-(.6+.5*TU.right)*dt);car.vel.multiplyScalar(1-.04*dt);
  car.pos.addScaledVector(car.vel,dt);
  _wq.set(car.w.x,car.w.y,car.w.z,0).multiply(q);q.x+=.5*dt*_wq.x;q.y+=.5*dt*_wq.y;q.z+=.5*dt*_wq.z;q.w+=.5*dt*_wq.w;q.normalize();
  for(const c of G.colliders){const dx=car.pos.x-c.x,dz=car.pos.z-c.z,d=Math.hypot(dx,dz),R=c.r+.62;
    if(d<R&&d>1e-4){const nx=dx/d,nz=dz/d;car.pos.x=c.x+nx*R;car.pos.z=c.z+nz*R;const vn=car.vel.x*nx+car.vel.z*nz;if(vn<0){car.vel.x-=nx*vn*1.2;car.vel.z-=nz*vn*1.2}}}
  for(const wh of car.wheels){const target=wh.contact&&wh.slip<.3?wh.vl:vt;wh.spin+=target/WR*dt}
}
