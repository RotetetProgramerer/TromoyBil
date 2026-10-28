'use strict';
/* =================================================================
   Felles for elementene i js/props/ (trær, palmer, gran, busker, bregner, lykter). Hvert element er en oppføring i PROPS
   (se js/props.js), så både spillet og props.html bruker samme oppskrift, og du kan finpusse ett element alene.
   Her ligger geometrien og hjelperne bare elementene bruker. propParams, footY, stemBetween og propRng står i js/props.js.
   Ingen DOM her: tools/test-levels.js laster filene i node.
   ================================================================= */

// geometri for elementene (i tillegg til PG.blob og PG.trunk i js/props.js og DG i core.js). Lavpolygonalt og flatskygget som resten av spillet.
PG.taper=new THREE.CylinderGeometry(.7,1,1,9);        // stamme som smalner oppover, sentrert
PG.stem=new THREE.CylinderGeometry(.82,1,1,7);        // grein eller palmeledd, foten i y=0
PG.crown=new THREE.IcosahedronGeometry(1,1);          // trekrone: litt rundere enn DG.canopy
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

// rotasjon som peker lokal +Y i retningen med asimut phi (fra +X mot +Z) og vinkel theta fra loddrett
const dirRot=(phi,theta)=>({ry:-phi,rz:-theta,ord:'YZX'});
// enhetsvektoren for samme retning (phi fra +X mot +Z, theta fra loddrett)
const tiltVec=(phi,theta)=>({x:Math.sin(theta)*Math.cos(phi),y:Math.cos(theta),z:Math.sin(theta)*Math.sin(phi)});
// en farge litt lysere eller mørkere (f=±0.1 betyr ±10 %), som [r,g,b]
const tint=(c,f)=>{const a=Array.isArray(c)?c:col(c);return[a[0]*(1+f),a[1]*(1+f),a[2]*(1+f)]};
