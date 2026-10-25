'use strict';
/* =================================================================
   SKIER: the alpine skier's physics (no DOM). The skier is a point on the snow with a heading (the skis): gravity pulls
   down the fall line, the edges hold sideways and turn the speed with the skis, snow and air brake. In the air the skier
   flies and can spin; a landing with the skis across the way, or a very hard one, is a crash.
   Used by js/ski.js in the game and by tools/test-levels.js, where an autopilot skis every piste.
   ================================================================= */
const SKI_G=7,SKI_R=.2;   // a bit less gravity than the car gets: the skier floats longer in the air and the runs last longer
// how the skis glide: [friction (part of g), edge grip sideways (per second)]. Groomed snow (TG) glides best, deep snow off the piste brakes.
function skiGlide(surf,groomed){
  if(surf===S.ICE)return[.015,2.4];
  if(surf===S.SNOW)return groomed?[.03,9]:[.065,7];
  if(surf===S.WOOD)return[.25,9];
  return[.5,10]}   // gravel, rock, asphalt …: the skis stop
const groomedAt=(x,z)=>{let i=Math.round((x+HALF)/CELL),j=Math.round((z+HALF)/CELL);if(i<0||j<0||i>=N||j>=N)return false;return TG[j*N+i]===1};
function makeSkier(){return{pos:new V3(),vel:new V3(),vy:0,head:0,air:false,airT:0,spin:0,spinV:0,crashT:0,why:'',land:0,tuck:0,plow:0,skid:0,surf:S.SNOW,groomed:true,speed:0,ev:[]}}
function placeSkier(s,x,z,head){s.pos.set(x,H(x,z),z);s.vel.set(0,0,0);s.vy=0;s.head=head;s.air=false;s.airT=0;s.spin=0;s.spinV=0;s.crashT=0;s.why='';s.land=0;s.tuck=0;s.plow=0;s.skid=0;s.speed=0}
function skiCrash(s,why){if(s.crashT>0)return;s.crashT=1e-4;s.why=why;s.air=false;s.ev.push({type:'crash',why})}
const _sn=new V3();
// inp = {steer:-1…1 (left +), gas:0…1 (stake on the flat, tuck when fast), brake:0…1 (snowplough), jump:true once}
// o.assist: the easy mode: a speed limit and softer landings
function stepSkier(s,inp,dt,o={}){
  const p=s.pos,v=s.vel;
  if(s.crashT>0){   // tumbling: the skier slides to a stop, then the game puts them back
    s.crashT+=dt;const sp=Math.hypot(v.x,v.z),k=sp>1e-3?Math.max(0,sp-7*dt)/sp:0;v.x*=k;v.z*=k;p.x+=v.x*dt;p.z+=v.z*dt;p.y=H(p.x,p.z);s.speed=sp*k;return}
  if(!s.air){
    normalAt(p.x,p.z,_sn);const surf=surfAt(p.x,p.z),gr=groomedAt(p.x,p.z),[mu,grip]=skiGlide(surf,gr);s.surf=surf;s.groomed=gr;
    let sp=Math.hypot(v.x,v.z);
    // turning: quick when slow, wider when fast and in a tuck
    s.tuck+=((inp.gas>.3&&sp>3.2?1:0)-s.tuck)*Math.min(1,dt*6);s.plow+=((inp.brake>.3?1:0)-s.plow)*Math.min(1,dt*8);
    const turn=2.9/(1+sp*.045)*(1-.35*s.tuck);s.head+=inp.steer*turn*dt;
    // gravity down the fall line
    v.x+=SKI_G*_sn.y*_sn.x*dt;v.z+=SKI_G*_sn.y*_sn.z*dt;
    // the edges: speed sideways to the skis is held, and most of it carved into speed along them
    const dx=Math.sin(s.head),dz=Math.cos(s.head),px=dz,pz=-dx;let va=v.x*dx+v.z*dz,vl=v.x*px+v.z*pz;
    const g2=grip*(sp<1?.4:1),vl2=vl*Math.exp(-g2*dt),lost=Math.abs(vl)-Math.abs(vl2);va+=(va<0?-1:1)*lost*.55;vl=vl2;s.skid=Math.abs(vl);
    // stake or skate on the flat
    if(inp.gas>0&&va<3.2&&va>-.5)va+=2.6*inp.gas*dt;
    v.x=dx*va+px*vl;v.z=dz*va+pz*vl;sp=Math.hypot(v.x,v.z);
    // friction, air and the snowplough brake along the way you move
    let dec=mu*SKI_G*_sn.y+(.09-.04*s.tuck)*sp*sp+(gr||surf!==S.SNOW?0:.05*sp)+s.plow*(sp<4?4.5:6.5);
    if(o.assist&&sp>6.2)dec+=(sp-6.2)*4;
    if(sp>1e-4){const k=Math.max(0,sp-dec*dt)/sp;v.x*=k;v.z*=k;sp*=k}
    if((surf===S.ROCK||surf===S.GRAVEL||surf===S.ASPHALT)&&sp>4.5){skiCrash(s,surf===S.ROCK?'Over steinene':'Skiene stoppet');return}
    // move along the ground; leave it where it drops away faster than the skier falls (a lip, a knuckle)
    const nx=p.x+v.x*dt,nz=p.z+v.z*dt,h0=p.y,h1=H(nx,nz),run=Math.hypot(nx-p.x,nz-p.z);
    if(run>1e-5&&(h1-h0)/run>1.1){   // a wall of snow or a rock face: stop, and fall if fast
      if(sp>3.5){skiCrash(s,'Rett i en kant');return}v.x*=-.2;v.z*=-.2;s.vy=0;return}
    const yb=h0+s.vy*dt-.5*SKI_G*dt*dt;
    if(inp.jump&&sp>.5){s.air=true;s.airT=0;s.spin=0;s.spinV=0;s.vy=Math.max(s.vy,0)+2.6;p.x=nx;p.z=nz;p.y=h0+s.vy*dt;s.ev.push({type:'takeoff'})}
    else if(yb>h1+.012&&s.vy>-sp*1.5){s.air=true;s.airT=0;s.spin=0;s.spinV=0;s.vy-=SKI_G*dt;p.x=nx;p.z=nz;p.y=yb;s.ev.push({type:'takeoff'})}
    else{s.vy=Math.min((h1-h0)/dt,sp*.9);p.x=nx;p.z=nz;p.y=h1}
    s.land=Math.max(0,s.land-dt*3);
  }else{
    s.airT+=dt;s.vy-=SKI_G*dt;const k=1-.01*dt;v.x*=k;v.z*=k;
    // spin with left and right
    s.spinV+=(inp.steer*7.2-s.spinV)*Math.min(1,dt*7);s.head+=s.spinV*dt;s.spin+=s.spinV*dt;
    p.x+=v.x*dt;p.z+=v.z*dt;p.y+=s.vy*dt;const h=H(p.x,p.z);
    if(p.y<=h){
      normalAt(p.x,p.z,_sn);const vn=v.x*_sn.x+s.vy*_sn.y+v.z*_sn.z,sp=Math.hypot(v.x,v.z);
      const turns=Math.abs(s.spin)/(2*Math.PI),spins=Math.round(turns),clean=Math.abs(turns-spins)*360<45;
      let d=s.head-Math.atan2(v.x,v.z);d=Math.atan2(Math.sin(d),Math.cos(d));
      p.y=h;s.air=false;
      if(sp>2.5&&Math.abs(d)>.8){skiCrash(s,'Landet på tvers');return}
      if(-vn>(o.assist?9.5:8.2)){skiCrash(s,'For hard landing');return}
      // the snow takes the speed into the slope; the rest goes on along it
      v.x-=_sn.x*vn;v.z-=_sn.z*vn;s.vy=0;s.land=Math.min(1,-vn/7);s.head-=d*.6;
      s.ev.push({type:'land',air:s.airT,spins:clean&&s.airT>.3?spins:0,hard:-vn});s.spin=0;s.spinV=0}
  }
  // trees, huts and masts: a bump when slow, a crash when fast
  const sp=Math.hypot(v.x,v.z);s.speed=sp;
  for(const c of G.colliders){const dx=p.x-c.x,dz=p.z-c.z;if(Math.abs(dx)>4||Math.abs(dz)>4)continue;let nx,nz,pen;
    if(c.w!=null){const cs=Math.cos(c.ry||0),sn=Math.sin(c.ry||0),a=dx*cs-dz*sn,b=dx*sn+dz*cs,hw=c.w/2,hd=c.d/2,ca=Math.max(-hw,Math.min(hw,a)),cb=Math.max(-hd,Math.min(hd,b)),ea=a-ca,eb=b-cb,d=Math.hypot(ea,eb);
      if(d>=SKI_R||d<1e-5)continue;pen=SKI_R-d;nx=(ea*cs+eb*sn)/d;nz=(-ea*sn+eb*cs)/d}
    else{const d=Math.hypot(dx,dz);if(d>=c.r+SKI_R||d<1e-5)continue;pen=c.r+SKI_R-d;nx=dx/d;nz=dz/d}
    if(s.air&&p.y>H(p.x,p.z)+1.4)continue;
    const vn=v.x*nx+v.z*nz;if(vn<-3.2){skiCrash(s,'Rett i '+(c.w!=null?'en vegg':'et tre'));return}
    p.x+=nx*pen;p.z+=nz*pen;if(vn<0){v.x-=nx*vn*1.3;v.z-=nz*vn*1.3}}
  if(!s.air&&WL(p.x,p.z)>p.y+.02){skiCrash(s,'Rett i vannet');return}
  if(Math.abs(p.x)>HALF-1||Math.abs(p.z)>HALF-1){skiCrash(s,'Utenfor kartet');return}
}
/* ---------- a run down a piste: gates, misses, the finish ---------- */
function skiSegX(p1,p2,a,b){const d=(p2.x-p1.x)*(b.z-a.z)-(p2.z-p1.z)*(b.x-a.x);if(Math.abs(d)<1e-9)return false;
  const u=((a.x-p1.x)*(b.z-a.z)-(a.z-p1.z)*(b.x-a.x))/d,v=((a.x-p1.x)*(p2.z-p1.z)-(a.z-p1.z)*(p2.x-p1.x))/d;return u>=0&&u<=1&&v>=0&&v<=1}
function makeSkiRun(k){return{k,next:0,passed:0,missed:0,pen:0,time:0,done:false,cp:{x:k.start.p.x,z:k.start.p.z,h:Math.atan2(k.start.tan.x,k.start.tan.z)},jumps:[],points:0,crashes:0,top:0}}
// returns a list of {type:'gate'|'miss'|'finish', i}. A gate skipped, or a slalom gate passed on the wrong side of a pole, costs 5 seconds.
function skiGates(run,p1,p2){const out=[],G2=run.k.gates;
  for(let i=run.next;i<G2.length&&!run.done;i++){const g=G2[i];
    const E=g.finish?3:run.k.kind==='slalom'?2.2:0,hit=skiSegX(p1,p2,g.a,g.b),wide=!hit&&E>0&&i===run.next&&skiSegX(p1,p2,{x:g.a.x+g.side.x*E,z:g.a.z+g.side.z*E},{x:g.b.x-g.side.x*E,z:g.b.z-g.side.z*E});
    if(!hit&&!wide)continue;
    for(let j=run.next;j<i;j++){run.missed++;run.pen+=5;out.push({type:'miss',i:j})}
    run.next=i+1;
    if(g.finish){run.done=true;out.push({type:'finish',i});break}
    if(hit){run.passed++;run.cp={x:g.c.x,z:g.c.z,h:Math.atan2(g.tan.x,g.tan.z)};out.push({type:'gate',i})}
    else{run.missed++;run.pen+=5;out.push({type:'miss',i})}
    break}
  return out}
// points for a jump in Big Jumps: airtime and full spins with a clean landing
function skiJumpPoints(air,spins){return Math.round(air*120)+spins*150}
