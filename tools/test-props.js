// Kjør:  node tools/test-props.js [bane]
// Genererer banene uten nettleser og ser etter pynt som svever: bokser og sylindre (c.box, c.cyl, lykter, hus …) som står
// over bakken uten at noe annet holder dem oppe. Bruk den når du har flyttet eller lagt til ting på en bane.
// Ting som med vilje henger i lufta (skilt på vegger, tak på stolper) holdes oppe av noe og blir ikke meldt.
require('./sim-shim.js');
const fs=require('fs'),path=require('path'),vm=require('vm');
const root=path.join(__dirname,'..');
const load=f=>vm.runInThisContext(fs.readFileSync(path.join(root,f),'utf8'),{filename:f});
load('js/core.js');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
for(const m of html.matchAll(/<script src="(js\/props\/[^"]+|data\/levels\/[^"]+)\.js"/g))load(m[1]+'.js');
const only=process.argv[2],GAP=.04,MAXGAP=.6;

// fang opp alle delene banen lager (core.js kaller instanced() for alt som tegnes)
let parts=[];const realInstanced=instanced;
global.instanced=instanced=(geo,mat,list,grp,shadow)=>{
  const kind=geo===DG.root?'box':(geo===DG.trunk||geo===PG.stem)?'cyl':null;
  if(kind)for(const o of list)if(!o.rx&&!o.rz)parts.push({kind,o,stem:geo===PG.stem});
  return realInstanced(geo,mat,list,grp,shadow)};

// bunn, topp og fotavtrykk for én del (bare dreid om loddrett akse)
function shapeOf(p){const o=p.o,sy=o.sy??o.sx,y0=p.stem?o.y:o.y-sy/2,y1=y0+sy,ry=o.ry||0,c=Math.cos(ry),s=Math.sin(ry);
  const hx=p.kind==='box'?o.sx/2:o.sx,hz=p.kind==='box'?(o.sz??o.sx)/2:(o.sz??o.sx);
  const pts=[[0,0],[-hx,-hz],[hx,-hz],[-hx,hz],[hx,hz]].map(([a,b])=>[o.x+a*c+b*s,o.z-a*s+b*c]);
  return{y0,y1,pts,x:o.x,z:o.z,r:Math.hypot(hx,hz)}}
const overlaps=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z)<a.r+b.r;

let total=0;
for(const def of LEVELS){if(only&&def.id!==only)continue;parts=[];genLevel(def);
  const S=parts.map(shapeOf),bad=[];
  for(let i=0;i<S.length;i++){const a=S[i],ground=Math.max(...a.pts.map(([x,z])=>H(x,z))),gap=a.y0-ground;
    if(gap<GAP||gap>MAXGAP)continue;                                                   // på bakken, eller så høyt at det er meningen (skilt, tak)
    if(WL(a.x,a.z)>a.y0)continue;                                                       // flyter i vann (båter)
    const held=S.some((b,j)=>j!==i&&b.y1>=a.y0-.06&&b.y0<a.y0+.02&&overlaps(a,b));     // noe under som holder den oppe
    if(!held)bad.push({x:a.x,z:a.z,gap})}
  bad.sort((p,q)=>q.gap-p.gap);total+=bad.length;
  console.log(def.id.padEnd(12),bad.length?bad.length+' svever':'OK',bad.slice(0,12).map(b=>`(${b.x.toFixed(1)}, ${b.z.toFixed(1)}) +${b.gap.toFixed(2)}`).join('  '))}
console.log(total?`\n${total} deler svever mer enn ${GAP} over bakken uten noe under seg.`:'\nIngen svevende deler.');
