// Kjør:  node tools/test-levels.js
// Laster spillets fysikk uten nettleser og lar en autopilot kjøre hver bane i begge gir.
// Bruk dette når du har laget en ny bane: alle rader bør vise "prog 0.99", "drown 0" og få velt.
require('./sim-shim.js');
const fs=require('fs'),path=require('path'),vm=require('vm');
const root=path.join(__dirname,'..');
const load=f=>vm.runInThisContext(fs.readFileSync(path.join(root,f),'utf8'),{filename:f});
load('js/core.js');load('data/parts.js');load('data/cars.js');
for(const f of fs.readdirSync(path.join(root,'data/levels')).filter(f=>f.endsWith('.js')).sort())load('data/levels/'+f);
const dt=1/240,only=process.argv[2];
for(const def of LEVELS){
  if(only&&def.id!==only)continue;
  const lv=genLevel(def);
  for(const low of[true,false]){
    const car=makeCar(CARS[1]);car.assist=false;car.low=low;const s=lv.start;placeCar(car,s.p.x,s.p.z,Math.atan2(s.tan.x,s.tan.z));
    for(let i=0;i<480;i++)stepCar(car,dt);
    let pt=0,flips=0,maxDepth=-9,flood=0,drown=0,t=0,stuck=0,lastProg=0,jumps=0,air=0;
    for(let i=0;i<240*160;i++){
      let best=1e9,bt=pt;for(let k=0;k<=60;k++){const tt=Math.min(1,pt+k*.002),p=lv.P(tt),d=Math.hypot(p.x-car.pos.x,p.z-car.pos.z);if(d<best){best=d;bt=tt}}pt=bt;
      const tg=lv.P(Math.min(1,pt+.012)),dx=tg.x-car.pos.x,dz=tg.z-car.pos.z,fw=car.fw,lf=car.lf,ang=Math.atan2(dx*lf.x+dz*lf.z,dx*fw.x+dz*fw.z);
      car.steer=Math.max(-.6,Math.min(.6,ang*1.5));car.throttle=1;stepCar(car,dt);
      if(!isFinite(car.pos.x)){console.log(def.id,'FEIL: fysikken eksploderte');break}
      maxDepth=Math.max(maxDepth,car.depth);if(car.depth>car.tune.wade)flood+=dt;else flood=Math.max(0,flood-dt*2);
      if(flood>1.4){drown++;flood=0;const p=lv.P(Math.min(1,pt+.02)),tn=lv.T(Math.min(1,pt+.02));placeCar(car,p.x,p.z,Math.atan2(tn.x,tn.z))}
      if(car.wheels.every(w=>!w.contact)&&car.pos.y>H(car.pos.x,car.pos.z)+.3)air+=dt;else{if(air>.32)jumps++;air=0}
      if(car.up.y<.2){flips++;placeCar(car,car.pos.x,car.pos.z,Math.atan2(fw.x,fw.z))}
      if(i%2400===0){if(pt-lastProg<.004){stuck++;const p=lv.P(Math.min(1,pt+.02)),tn=lv.T(Math.min(1,pt+.02));placeCar(car,p.x,p.z,Math.atan2(tn.x,tn.z))}lastProg=pt}
      if(pt>.985){t=i*dt;break}
    }
    console.log(def.id.padEnd(8),low?'LAV ':'HØY ','prog',pt.toFixed(2),'tid',(t||0).toFixed(0).padStart(3)+'s','velt',flips,'fast',stuck,'maksDybde',maxDepth.toFixed(2),'drown',drown,'hopp',jumps,'kasser',lv.crates.length);
  }
}
