// Kjør:  node tools/test-boats.js            (alle båtløpene)
//        node tools/test-boats.js skilso v   (ett løp, med hendelser)
// Laster båtfysikken uten nettleser og lar en autopilot kjøre hvert båtløp fra marinaen: først uten pirater, så med pirater fem ganger.
// Sjekker også at bøyene og etappene mellom dem holder god avstand til øyene. Bruk dette når du har flyttet bøyer eller øyer i data/boats.js.
const fs=require('fs'),path=require('path'),vm=require('vm');
const root=path.join(__dirname,'..');
const load=f=>vm.runInThisContext(fs.readFileSync(path.join(root,f),'utf8'),{filename:f});
load('data/archipelago.js');load('data/boats.js');load('js/boatsim.js');
const only=process.argv[2],verbose=process.argv[3]==='v';
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
const segD=(px,pz,a,b)=>{const dx=b.x-a.x,dz=b.z-a.z,l2=dx*dx+dz*dz||1;const t=Math.max(0,Math.min(1,((px-a.x)*dx+(pz-a.z)*dz)/l2));return Math.hypot(px-a.x-dx*t,pz-a.z-dz*t)};
const isl=seaIslands(),W={islands:isl,hulls:[],bound:SEA.bound};
// the route: legs at least 60 from every island, buoys at least 100, everything inside the sea
function checkRoute(race,route){const bad=[];
  for(let i=0;i<route.pts.length-1;i++)for(const o of isl){const d=segD(o.x,o.z,route.pts[i],route.pts[i+1])-o.r;if(d<60)bad.push('etappe '+(i+1)+' går '+d.toFixed(0)+' fra '+o.id)}
  route.buoys.forEach((g,i)=>{for(const o of isl){const d=Math.hypot(g.x-o.x,g.z-o.z)-o.r;if(d<100)bad.push('bøye '+(i+1)+' ligger '+d.toFixed(0)+' fra '+o.id)}if(Math.abs(g.x)>SEA.bound-100||Math.abs(g.z)>SEA.bound-100)bad.push('bøye '+(i+1)+' er for nær kanten av havet')});
  const len=route.pts.reduce((s,p,i,P)=>i?s+Math.hypot(p.x-P[i-1].x,p.z-P[i-1].z):0,0);
  console.log(race.id.padEnd(8),'RUTE   ',bad.length?'FEIL '+bad.join(', '):'OK  ','lengde',len.toFixed(0),'bøyer',route.buoys.length,'mål',race.finish);return bad.length===0}
// the autopilot: full gas towards the next buoy (round an island in the way), slow down into the dock
function pilot(b,route){const t=boatTarget(b,route);let tx=t.x,tz=t.z;const dist=Math.hypot(tx-b.x,tz-b.z);
  for(const o of isl){const near=o.r+45;if(segD(o.x,o.z,b,{x:tx,z:tz})>=near||Math.hypot(o.x-b.x,o.z-b.z)>dist)continue;
    const dx=o.x-b.x,dz=o.z-b.z,d=Math.hypot(dx,dz),side=Math.sign((tx-b.x)*dz-(tz-b.z)*dx)||1,off=Math.asin(Math.min(1,near/Math.max(d,near))),a=bAng(dx,dz)+side*off;tx=b.x-Math.sin(a)*200;tz=b.z-Math.cos(a)*200;break}
  const err=bWrap(bAng(tx-b.x,tz-b.z)-b.a),steer=Math.max(-1,Math.min(1,err*3));
  if(b.gate>=route.buoys.length&&dist<220){const want=dist<70?.8:1.6;return{gas:b.speed<want?1:0,rev:b.speed>want+.15?1:0,steer}}
  return{gas:Math.abs(err)>1.4?.35:1,rev:0,steer}}
function run(race,route,seed){const rng=mulberry32(seed),s=startSlot(route,0,1),b=makeBoat(s.x,s.z,s.a),pir=seed?makePirates(route,race.pirates,rng):[],barrels=makeBarrels(route,mulberry32(7)),balls=[],vol=race.lava?makeVolcano():null;
  let t=0,bumps=0,fires=0,lava=0;const ev=[],gateT=[];
  for(;t<60*240&&!b.done;t++){const inp=pilot(b,route);W.hulls=pir;stepBoat(b,inp,W);stepPirates(pir,[b],W,balls,rng).forEach(()=>fires++);if(vol&&stepVolcano(vol,[b],balls,rng))lava++;stepBalls(balls,[b]);stepBarrels(barrels,[b],t);
    const e=boatCheck(b,route);if(e&&e.type==='buoy')gateT.push((t/60).toFixed(1));
    for(const x of b.ev){if(x.type==='bump'){bumps++;ev.push('støt('+x.what+')@'+b.x.toFixed(0)+','+b.z.toFixed(0))}if(x.type==='hit')ev.push('truffet('+x.what+')@'+b.x.toFixed(0)+','+b.z.toFixed(0))}b.ev.length=0}
  return{done:b.done,time:t/60,bumps,hits:b.hits,barrels:b.barrels,fires,lava,ev,gateT,gate:b.gate}}
let fail=0;
for(const race of BOAT_RACES){if(only&&race.id!==only)continue;const route=raceRoute(race);if(!checkRoute(race,route))fail++;
  const r0=run(race,route,0);console.log(race.id.padEnd(8),'UTEN PIRATER',r0.done?'MÅL ':'FEIL','tid',r0.time.toFixed(1)+'s','støt',r0.bumps,'turbo',r0.barrels,'bøyer',r0.gateT.join(' '));if(!r0.done)fail++;
  if(verbose&&r0.ev.length)console.log('   hendelser:',r0.ev.join(' '));
  const R=[1,2,3,4,5].map(seed=>run(race,route,seed));
  for(const r of R){if(!r.done)fail++;if(verbose&&r.ev.length)console.log('   hendelser:',r.ev.join(' '))}
  const ok=R.filter(r=>r.done),avg=k=>(ok.reduce((s,r)=>s+r[k],0)/Math.max(1,ok.length));
  console.log(race.id.padEnd(8),'MED PIRATER ',ok.length+'/5 i mål','snittid',avg('time').toFixed(1)+'s','truffet',R.map(r=>r.hits).join(','),'skudd',R.map(r=>r.fires).join(','),race.lava?'lava '+R.map(r=>r.lava).join(','):'','par',race.par.join('/'))}
if(fail)process.exitCode=1;
