'use strict';
/* =================================================================
   PROPS: enkeltelementer (trær, palmer, gran …), ett element per fil i js/props/.
   Hvert element er en oppskrift som både spillet og props.html bruker, så du kan finpusse det alene.

   PROPS[navn] = {
     navn, info,                       tekst i props.html
     params:{key:{v,min,max,step,navn}} innstillingene. v er standardverdien; [a,b] betyr «tilfeldig mellom a og b».
     place(x,z,p,env) -> rec           kalles når banen plasserer elementet (før c.finish): kollidere og annet som trengs tidlig
     build(rec,env,out)                kalles etter c.finish, når bakken er ferdig: lager delene med out.add(...)
   }
   env = {H(x,z), rng(), colliders:[], perches:[]}. I spillet er det banens egne; i props.html en prøvebakke.
   Ingen DOM her: tools/test-levels.js laster filene i node.
   ================================================================= */
const PROPS={};

// felles geometri for elementene (i tillegg til DG i core.js). Alt er lavpolygonalt og flatskygget som resten av spillet.
const PG={
  trunk:new THREE.CylinderGeometry(.7,1,1,9),         // stamme som smalner oppover, sentrert
  stem:new THREE.CylinderGeometry(.82,1,1,7),         // grein eller palmeledd, foten i y=0
  blob:new THREE.IcosahedronGeometry(1,1)              // trekrone: litt rundere enn DG.canopy
};
PG.stem.translate(0,.5,0);
// støtterot: en kile, høy inn mot stammen og spiss ut mot bakken. Lokal x er utover (-.5 inne, .5 ute), y opp (0..1), z tykkelse.
PG.fin=(()=>{const A=[-.5,0],B=[-.5,1],C=[.5,0],P=[],q=(p,z)=>[p[0],p[1],z];
  P.push(...q(A,.5),...q(C,.5),...q(B,.5), ...q(A,-.5),...q(B,-.5),...q(C,-.5));                          // sidene
  for(const[a,b]of[[B,C],[A,B],[C,A]])P.push(...q(a,.5),...q(b,.5),...q(b,-.5),...q(a,.5),...q(b,-.5),...q(a,-.5));   // skråkant, innside, bunn
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(P,3));g.computeVertexNormals();return g})();

// blad (palme, bregne): en lang stripe langs +X som stiger litt og så henger ned, brettet langs midtribben. Lengde 1, foten i origo.
PG.frond=(()=>{const T=[0,.12,.3,.5,.72,1],P=[];
  const spine=t=>[t,.62*t-1.0*t*t],wid=t=>.17*Math.pow(Math.sin(Math.PI*Math.min(1,t*1.08)),.6);
  const pt=(t,side)=>{const[x,y]=spine(t),w=wid(t);return side?[x,y-w*.45,side*w]:[x,y,0]};
  for(let i=0;i<T.length-1;i++){const a=T[i],b=T[i+1];for(const sd of[-1,1]){const A0=pt(a,0),A1=pt(a,sd),B0=pt(b,0),B1=pt(b,sd);P.push(...A0,...A1,...B1,...A0,...B1,...B0)}}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(P,3));g.computeVertexNormals();return g})();

// samler deler per (geometri, materiale, skygge) og lager én InstancedMesh for hver gruppe
function propBatch(){const m=new Map(),ids=new Map(),id=o=>ids.get(o)??(ids.set(o,ids.size+1),ids.size);return{
  add(geo,mat,o,shadow=true){const k=id(geo)+'|'+id(mat)+'|'+shadow;let b=m.get(k);if(!b)m.set(k,b={geo,mat,shadow,list:[]});b.list.push(o)},
  flush(grp){const out=[];for(const b of m.values()){const im=instanced(b.geo,b.mat,b.list,grp,b.shadow);if(im)out.push(im)}m.clear();return out}}}

// innstillingene for ett element: o (fra banen eller props.html) foran standardverdiene. Tilfeldige verdier trekkes i rekkefølgen i params.
function propParams(kind,o,rng){const P=PROPS[kind].params,r={};
  for(const k in P){const v=P[k].v;r[k]=o[k]!==undefined?o[k]:Array.isArray(v)?v[0]+rng()*(v[1]-v[0]):v}return r}

// egen tilfeldighetsrekke for ett element, ut fra posisjonen: samme tre ser likt ut hver gang, uansett hva som ellers er på banen
const propRng=(x,z,seed=0)=>mulberry32((Math.round(x*100)*73856093^Math.round(z*100)*19349663^seed*83492791)|0);
// rotasjon som peker lokal +Y i retningen med asimut phi (fra +X mot +Z) og vinkel theta fra loddrett
const dirRot=(phi,theta)=>({ry:-phi,rz:-theta,ord:'YZX'});
// enhetsvektoren for samme retning
const dirVec=(phi,theta)=>({x:Math.sin(theta)*Math.cos(phi),y:Math.cos(theta),z:Math.sin(theta)*Math.sin(phi)});
// laveste bakke rundt foten, så stammen ikke svever på skrå bakke
const footY=(H,x,z,r)=>Math.min(H(x,z),H(x+r,z),H(x-r,z),H(x,z+r),H(x,z-r));
// en farge litt lysere eller mørkere (f=±0.1 betyr ±10 %)
const shade=(c,f)=>{const a=Array.isArray(c)?c:col(c);return[a[0]*(1+f),a[1]*(1+f),a[2]*(1+f)]};
// et stykke mellom to punkter: sylinder (PG.stem, foten i a) fra a til b med radius ra
function stemBetween(a,b,ra,extra){const dx=b.x-a.x,dy=b.y-a.y,dz=b.z-a.z,L=Math.hypot(dx,dy,dz)||1e-6;
  return Object.assign({x:a.x,y:a.y,z:a.z,sx:ra,sy:L,sz:ra},dirRot(Math.atan2(dz,dx),Math.acos(Math.max(-1,Math.min(1,dy/L)))),extra)}
