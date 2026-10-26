'use strict';
/* =================================================================
   PROPS: plants and animals you place one by one with c.plant(name,x,z,{...}).
   The content lives in data/vegetasjon.js and data/dyr.js. Each entry is PROPS[name]={navn,info,params,place,build}:
     params            {key:{v,min,max,step,navn}}; v is the default. propParams() reads them.
     place(x,z,o,env)  runs at once (in build(c)): reads the params and pushes colliders. Returns the prop's data t.
     build(t,env,out)  runs after c.finish(), when the terrain is final: out.add(geometry,material,instance) draws it.
   env = {H, rng, colliders, perches}. All props of a level are drawn as a handful of instanced meshes (one per geometry and material).
   ================================================================= */
const PROPS={};
// geometries: PG.blob is a unit sphere (sx/sy/sz are half axes), PG.trunk a centred cylinder of height 1 (the same as DG.trunk)
const PG={blob:new THREE.SphereGeometry(1,10,7),trunk:DG.trunk};
// materials: all white, the colour comes from each instance. DM.bark is brown, so props that ask for it get PM.bark instead.
const PM={
  bark:new THREE.MeshStandardMaterial({color:0xffffff,roughness:1,flatShading:true}),
  pels:new THREE.MeshStandardMaterial({color:0xffffff,roughness:.95,flatShading:true}),
  glatt:new THREE.MeshStandardMaterial({color:0xffffff,roughness:.4,metalness:.05})
};
const PROP_MAT=new Map([[DM.bark,PM.bark]]);

// the params of a prop: o[key] if given (clamped to min..max), otherwise the default. A direction (retning) that is not given is random.
function propParams(name,o,rng){const P=PROPS[name].params,r={};
  for(const k in P){const d=P[k];let v=o[k];if(v==null)v=k==='retning'?rng()*(d.max??6.28):d.v;if(d.min!=null)v=Math.max(d.min,v);if(d.max!=null)v=Math.min(d.max,v);r[k]=v}
  return r}
// ground height under a footprint of radius r: the lowest point, so nothing floats on a slope
function footY(Hf,x,z,r){let m=Hf(x,z);for(let i=0;i<8;i++){const a=i*Math.PI/4;m=Math.min(m,Hf(x+Math.cos(a)*r,z+Math.sin(a)*r))}return m}
// lighter (a>0) or darker (a<0) hex colour
function shade(hex,a){const n=parseInt(hex.slice(1),16),f=v=>Math.round(a>=0?v+(255-v)*a:v*(1+a)),r=f(n>>16&255),g=f(n>>8&255),b=f(n&255);
  return'#'+((1<<24)|(r<<16)|(g<<8)|b).toString(16).slice(1)}
// unit vector: a = angle in the ground plane (0 = +x, towards +z), e = elevation
function dirVec(a,e){const ce=Math.cos(e);return{x:Math.cos(a)*ce,y:Math.sin(e),z:Math.sin(a)*ce}}
// an instance from a to b with radius r: DG.branch grows from a (radius r) to b (radius .55r). With PG.blob it becomes an ellipsoid
// centred between a and b, with half axis |b-a| along the line and r across. extra is merged in (colour c).
function stemBetween(a,b,r,extra){const dx=b.x-a.x,dy=b.y-a.y,dz=b.z-a.z,l=Math.hypot(dx,dy,dz)||1e-6,ux=dx/l,uy=dy/l,uz=dz/l,s=Math.hypot(ux,uz);
  let rx=0,ry=0,rz=0;
  if(s<1e-9){if(uy<0)rx=Math.PI}
  else{// rotation that turns +y onto u (axis y×u, angle acos uy), as XYZ Euler angles
    const kx=uz/s,kz=-ux/s,t=1-uy,m11=uy+t*kx*kx,m12=ux,m13=t*kx*kz,m22=uy,m23=-uz,m32=uz,m33=uy+t*kz*kz;
    ry=Math.asin(Math.max(-1,Math.min(1,m13)));
    if(Math.abs(m13)<.9999999){rx=Math.atan2(-m23,m33);rz=Math.atan2(-m12,m11)}else{rx=Math.atan2(m32,m22)}}
  return Object.assign({x:a.x,y:a.y,z:a.z,sx:r,sy:l,sz:r,rx,ry,rz,ord:'XYZ',_u:[ux,uy,uz]},extra)}

function propEnv(c){return c._penv||(c._penv={H,rng:mulberry32(((G.def&&G.def.seed)|0)*31+7),colliders:c.colliders,perches:c.perches})}
// c.plant: place now, draw later (c.plants, called by genLevel after build)
function plantProp(c,name,x,z,o={}){const P=PROPS[name];if(!P)throw new Error('Ukjent plante eller dyr: '+name);
  const t=P.place(x,z,o,propEnv(c));c.plantList.push({name,t});return t}
function buildProps(c){const env=propEnv(c),groups=new Map();
  const out={add(geo,mat,o){mat=PROP_MAT.get(mat)||mat;
    if(geo===PG.blob&&o._u){const h=o.sy/2;o.x+=o._u[0]*h;o.y+=o._u[1]*h;o.z+=o._u[2]*h}   // a blob from stemBetween: centre it between the two points
    let g=groups.get(geo);if(!g)groups.set(geo,g=new Map());let L=g.get(mat);if(!L)g.set(mat,L=[]);L.push(o)}};
  for(const p of c.plantList)PROPS[p.name].build(p.t,env,out);
  for(const[geo,g]of groups)for(const[mat,L]of g)instanced(geo,mat,L,c.decor);
  c.plantList=[]}
// a free spot for a prop of radius r: on land and out of the water, clear of lines, gates, the start, blocked areas and other colliders
function propSpotOK(c,x,z,r){if(c.dist(x,z)<r+3||c.nearGate(x,z,r+2.5)||c.nearStart(x,z,r+3)||!c.onLand(x,z)||!c.free(x,z,r)||WL(x,z)>H(x,z)-.05)return false;
  for(const q of c.colliders){const qr=q.r??Math.hypot(q.w,q.d)/2;if(Math.hypot(q.x-x,q.z-z)<qr+r)return false}return true}
// c.sow: up to n props of one kind at random free spots within rad of at=[x,z]. o.r = footprint, o.gap = distance between them,
// o.ok(x,z) = extra test, o.p = params (an object, or a function of the random generator). Uses the props' own random generator,
// so the rest of the level stays the same. Returns how many were planted.
function sowProps(c,name,n,at,rad,o={}){const R=propEnv(c).rng,r=o.r??.5,gap=o.gap??1.5,done=[];
  for(let i=0;i<n*80&&done.length<n;i++){const a=R()*6.283,d=Math.sqrt(R())*rad,x=at[0]+Math.cos(a)*d,z=at[1]+Math.sin(a)*d;
    if(done.some(q=>Math.hypot(q[0]-x,q[1]-z)<gap)||(o.ok&&!o.ok(x,z))||!propSpotOK(c,x,z,r))continue;
    plantProp(c,name,x,z,typeof o.p==='function'?o.p(R):Object.assign({},o.p));done.push([x,z])}
  return done.length}
