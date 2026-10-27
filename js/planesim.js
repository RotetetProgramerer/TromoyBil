'use strict';
/* =================================================================
   PLANESIM: the small plane from Trinnvik airport, in fixed 60 Hz steps (BSTEP, js/boatsim.js). No DOM, no three.js,
   so tools/test-flights.js can fly it in node. The same sea and scale as the boat race: north is −z, heading a=0 is north
   and a grows to the left, pitch p > 0 is nose up, roll r > 0 is the left wing down.
   On the ground: gas = full throttle, rev = brake, steer = the nose wheel. Fast enough and still on the gas, it lifts off.
   In the air: gas = climb, rev = dive, steer = bank and turn, jump = full power. The engine holds the cruise speed by itself;
   climbing costs speed and diving gains it. Touch down gently (wings level, slow sink) and it rolls; anything harder is a crash.
   W.ground(x,z) → {h, water, runway}: the top of whatever is under the plane (the browser asks the island meshes, the test a sketch).
   ================================================================= */
const PCFG={cruise:2.3,turbo:3.4,lift:1.7,stall:1.2,accel:.03,brake:.05,roll:.004,pitchRate:.016,pitchMax:.5,pitchMin:-.65,bankMax:.95,bankRate:.07,turn:.03,taxiTurn:.025,
  gear:3.2,ceil:900,sinkOk:.9,crashFrames:110,ringR:30,kts:16};
function makePlane(x,y,z,a){return{x,y,z,a,p:0,r:0,s:0,vy:0,ground:true,crash:0,crashes:0,ring:0,done:false,air:0,ev:[]}}
const pClamp=(v,a,b)=>v<a?a:v>b?b:v;
function stepPlane(pl,inp,W){
  if(pl.crash>0){pl.crash--;if(!pl.crash)pl.ev.push({type:'respawn'});return}
  const gas=pClamp(inp.gas||0,0,1),rev=pClamp(inp.rev||0,0,1),steer=pClamp(inp.steer||0,-1,1);
  if(pl.ground){
    // rolling: throttle and brake, the nose wheel, and the nose comes up once it is fast enough
    const g0=W.ground(pl.x,pl.z);
    if(gas>0)pl.s+=PCFG.accel*gas*(1-pl.s/PCFG.turbo);pl.s-=rev?PCFG.brake*rev:PCFG.roll;if(pl.s<0)pl.s=0;
    pl.a+=steer*PCFG.taxiTurn*Math.min(1,.35+pl.s/1.2);pl.r*=.8;
    pl.p+=((gas>0&&pl.s>PCFG.lift*.85?.14:0)-pl.p)*.08;
    pl.x+=-Math.sin(pl.a)*pl.s;pl.z+=-Math.cos(pl.a)*pl.s;
    const g=W.ground(pl.x,pl.z);
    if(g.water||g.h>g0.h+1.5){pl.ev.push({type:'crash',water:g.water});pl.crash=PCFG.crashFrames;pl.crashes++;pl.s=0;return}   // off the edge, or into something
    pl.y=g.h+PCFG.gear;pl.vy=0;
    if(gas>0&&pl.s>PCFG.lift&&pl.p>.1){pl.ground=false;pl.vy=.3;pl.ev.push({type:'takeoff'})}
    return}
  // flying
  pl.air++;
  const want=gas-rev;pl.p+=want*PCFG.pitchRate;if(!want)pl.p*=.985;
  if(pl.s<PCFG.stall)pl.p-=.012;                                   // too slow: the nose drops
  pl.p=pClamp(pl.p,PCFG.pitchMin,pl.s<PCFG.lift?.22:PCFG.pitchMax);   // and it will not climb steeply until it has speed
  pl.r+=(steer*PCFG.bankMax-pl.r)*PCFG.bankRate;
  pl.a+=Math.sin(pl.r)*PCFG.turn*Math.min(1,pl.s/PCFG.cruise);
  const target=inp.jump?PCFG.turbo:PCFG.cruise;pl.s+=(target-pl.s)*.012-Math.sin(pl.p)*.018;pl.s=pClamp(pl.s,.6,PCFG.turbo+1);
  const cp=Math.cos(pl.p),sink=Math.max(0,PCFG.lift-pl.s)*.5;pl.vy=Math.sin(pl.p)*pl.s-sink;
  pl.x+=-Math.sin(pl.a)*cp*pl.s;pl.z+=-Math.cos(pl.a)*cp*pl.s;pl.y+=pl.vy;
  if(pl.y>PCFG.ceil){pl.y=PCFG.ceil;if(pl.p>0)pl.p*=.9}
  // the edge of the sea: the plane is turned back towards the islands
  const B=W.bound-60;if(Math.abs(pl.x)>B||Math.abs(pl.z)>B){pl.x=pClamp(pl.x,-B,B);pl.z=pClamp(pl.z,-B,B);const home=Math.atan2(pl.x,pl.z);pl.a+=Math.max(-.05,Math.min(.05,bWrap(home-pl.a)));if(!pl.edgeT)pl.ev.push({type:'edge'});pl.edgeT=60}
  if(pl.edgeT)pl.edgeT--;
  const g=W.ground(pl.x,pl.z);
  if(pl.y-PCFG.gear<=g.h){
    if(!g.water&&pl.vy>-PCFG.sinkOk&&Math.abs(pl.r)<.4&&pl.p>-.2&&pl.p<.4){pl.ground=true;pl.y=g.h+PCFG.gear;pl.p=0;pl.vy=0;pl.ev.push({type:'land',runway:!!g.runway})}
    else{pl.ev.push({type:'crash',water:g.water});pl.crash=PCFG.crashFrames;pl.crashes++;pl.y=g.h+1}}}
// the rings of a flight: fly through them in order; the last one is the finish
function planeRing(pl,course){if(pl.done||pl.crash||pl.ring>=course.rings.length)return null;const q=course.rings[pl.ring];
  if(Math.hypot(pl.x-q.x,pl.y-q.y,pl.z-q.z)>PCFG.ringR)return null;pl.ring++;if(pl.ring>=course.rings.length){pl.done=true;return{type:'finish'}}return{type:'ring',i:pl.ring-1}}
// the airport at sea: AIRPORT (data/flights.js) moved out to where Trinnvik lies
let AIRSEA=null;
function airSea(){if(AIRSEA)return AIRSEA;const I=seaIslands().find(i=>i.id===AIRPORT.island),A=AIRPORT,o=(p)=>({x:I.x+p[0],z:I.z+p[1]});
  AIRSEA={island:I,land:{x0:I.x+A.land.x0,x1:I.x+A.land.x1,z0:I.z+A.land.z0,z1:I.z+A.land.z1},rwy:{x0:I.x+A.rwy.x-A.rwy.w/2,x1:I.x+A.rwy.x+A.rwy.w/2,z0:I.z+A.rwy.z0,z1:I.z+A.rwy.z1,x:I.x+A.rwy.x},
    top:8,start:{x:I.x+A.rwy.x,y:8+PCFG.gear,z:I.z+A.start.dz,a:0},hangar:o(A.hangar),tower:o(A.tower),terminal:o(A.terminal),sock:o(A.sock)};return AIRSEA}
const onRunway=(x,z)=>{const R=airSea().rwy;return x>=R.x0&&x<=R.x1&&z>=R.z0&&z<=R.z1};
// a flight from data/flights.js with its rings turned to face the way through (yaw), and where you start: lined up on the runway
function flightRoute(f){const st=airSea().start,pts=[{x:st.x,y:st.y,z:st.z}];const rings=(f?f.rings:[]).map(([x,y,z])=>({x,y,z}));
  rings.forEach((q,i)=>{const a=i?rings[i-1]:pts[0],b=rings[i+1]||q;const dx=(b===q?q.x-a.x:b.x-a.x),dz=(b===q?q.z-a.z:b.z-a.z);q.yaw=Math.atan2(dx,dz)});
  return{flight:f,rings,start:st}}
