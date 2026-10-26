'use strict';
/* =================================================================
   CAR MODEL: wheels and the body with all its details (racks, cans, hoop lights, ladder, pickup bed …)
   Everything is boxes and cylinders from game.js's bx()/cyl() and the shared materials M. extras in data/cars.js choose the load.
   Loaded after game.js; only functions, called at run time.
   ================================================================= */
function buildWheel(r,side){
  const root=new THREE.Group(),spin=new THREE.Group();root.add(spin);
  const tire=new THREE.Mesh(new THREE.CylinderGeometry(r*.93,r*.93,.19,18),M.tire);tire.rotation.z=Math.PI/2;tire.castShadow=true;spin.add(tire);
  const lugG=new THREE.BoxGeometry(.09,.06,.075);
  for(let i=0;i<18;i++){const a=i/18*Math.PI*2;for(const sx of[-1,1]){const m=new THREE.Mesh(lugG,M.tire);const off=(i%2?.02:-.02)*sx;
    m.position.set(sx*.05+off,Math.cos(a)*(r-.026),Math.sin(a)*(r-.026));m.rotation.x=a;m.castShadow=true;spin.add(m)}}
  cyl(.135,.2,M.rim,0,0,0,spin,'x',16);
  cyl(.148,.022,M.blk,side*.095,0,0,spin,'x',16);
  cyl(.045,.215,M.blk,0,0,0,spin,'x',8);cyl(.03,.04,M.blk,side*.12,0,0,spin,'x',6);   // centre nut
  for(let i=0;i<5;i++){const a=i/5*Math.PI*2;cyl(.018,.03,M.blk,side*.1,Math.cos(a)*.085,Math.sin(a)*.085,spin,'x',6)}
  return{root,spin};
}
function buildBody(cfg){
  const g=new THREE.Group(),L=cfg.L,W=.92,y0=.08,lh=.34,gh=cfg.gh,hood=cfg.hood,yT=y0+lh,fz=L/2,rz=-L/2;
  bx(.5,.06,L*.86,M.blkC,0,-.02,0,g);
  bx(W,lh,L,M.yel,0,y0+lh/2,0,g);
  bx(W+.012,.05,L*.98,M.blkC,0,y0+.025,0,g);
  const bedL=cfg.style==='pickup'?(L-cfg.hood)*.5:0;
  const gz0=rz+.03+bedL,gz1=fz-hood,gl=gz1-gz0,gc=(gz0+gz1)/2,gy=yT+gh/2,ghW=cfg.style==='glass'?W-.06:W-.04;
  bx(ghW,gh,gl,M.yel,0,gy,gc,g);
  if(bedL){const bz=rz+.03+bedL/2;bx(W-.04,.04,bedL-.06,M.blkC,0,yT+.02,bz,g);for(const sx of[1,-1]){bx(.03,.14,bedL-.06,M.yel,sx*(W/2-.035),yT+.07,bz,g);bx(.04,.02,bedL-.04,M.blkC,sx*(W/2-.035),yT+.15,bz,g)}bx(W-.04,.14,.03,M.yel,0,yT+.07,rz+.045,g);bx(W-.02,.02,.04,M.blkC,0,yT+.15,rz+.045,g);   // the bed, side walls and tailgate
    bx(.14,.12,.2,M.can,.2,yT+.1,bz+.1,g);bx(.14,.12,.2,M.red,.02,yT+.1,bz+.1,g);bx(.26,.1,.16,M.red,-.15,yT+.09,bz-.15,g);bx(.27,.015,.17,M.blkC,-.15,yT+.145,bz-.15,g);   // cans and a toolbox in the bed
    for(const sx of[1,-1])bx(.025,.42,.025,M.blkC,sx*(W/2-.1),yT+.25,gz0-.06,g);bx(W-.2,.025,.025,M.blkC,0,yT+.46,gz0-.06,g);for(let i=0;i<3;i++)cyl(.028,.025,M.lamp,-.16+i*.16,yT+.5,gz0-.04,g,'z')}   // hoop behind the cab with lights
  bx(ghW-.12,gh-.08,.012,M.glass,0,gy+.005,gz1+.006,g);
  bx(ghW-.2,gh-.1,.012,M.glass,0,gy+.01,gz0-.006,g);
  const nw=cfg.win,seg=gl/nw;
  for(let i=0;i<nw;i++){const zc=gz1-seg*(i+.5),ww=cfg.style==='glass'?seg-.035:seg-.07;for(const sx of[1,-1])bx(.012,gh-(cfg.style==='glass'?.06:.09),ww,M.glass,sx*(ghW/2+.006),gy+.01,zc,g)}
  let roofY=yT+gh;if(cfg.style==='pickup'){roofY+=.0}else{bx(ghW+.02,.03,gl+.02,M.yel,0,roofY+.015,gc,g);roofY+=.03}
  let rackZ0=gz0+.02,rackZ1=gz1+.06;
  if(cfg.style==='step'){const sl=gl*.55,sc=gz0+sl/2;bx(ghW-.02,.07,sl,M.yel,0,roofY+.035,sc,g);
    for(const sx of[1,-1])bx(.012,.035,sl-.1,M.glass,sx*((ghW-.02)/2+.006),roofY+.035,sc,g);bx(ghW-.1,.035,.012,M.glass,0,roofY+.035,sc+sl/2+.006,g);roofY+=.07}
  bx(W-.22,.022,hood-.08,M.yel,0,yT+.011,fz-hood/2,g);
  bx(W-.16,.17,.02,M.blkC,0,y0+.2,fz+.01,g);
  for(let i=0;i<4;i++)bx(W-.3,.012,.022,M.steel,0,y0+.14+i*.04,fz+.015,g);
  for(const sx of[1,-1]){cyl(.055,.03,M.lamp,sx*.33,y0+.21,fz+.022,g,'z');bx(.05,.03,.015,M.amber,sx*.33,y0+.12,fz+.015,g);bx(.05,.1,.015,M.tail,sx*.4,y0+.22,rz-.008,g);
    const beam=new THREE.Mesh(new THREE.ConeGeometry(.55,4,14,1,true),M.beam);beam.rotation.x=-Math.PI/2+.13;beam.position.set(sx*.33,y0+.21-.26,fz+1.98);beam.castShadow=false;g.add(beam);
    const mir=bx(.03,.07,.05,M.blkC,sx*(W/2+.06),yT+.08,gz1-.05,g);mir.castShadow=false;bx(.012,.05,.035,M.glass,sx*(W/2+.075),yT+.08,gz1-.05,g);
    bx(.012,.014,.12,M.blkC,sx*(W/2+.006),y0+.1,gz1-.42,g)}
  bx(W+.1,.08,.1,M.blkC,0,y0+.01,fz+.06,g);bx(.2,.07,.08,M.steel,0,y0+.01,fz+.13,g);
  for(const sx of[1,-1])bx(.03,.24,.03,M.blkC,sx*.22,y0+.16,fz+.11,g);bx(.47,.03,.03,M.blkC,0,y0+.27,fz+.11,g);
  bx(W+.06,.08,.09,M.blkC,0,y0+.01,rz-.05,g);
  bx(.2,.1,.008,M.plate,0,y0+.08,rz-.098,g);
  for(const sx of[1,-1])for(const wz of[cfg.wb/2,-cfg.wb/2])bx(.05,.05,.56,M.blkC,sx*(W/2+.02),y0+.08,wz,g);
  if(cfg.snorkel||(cfg.tune&&cfg.tune.snorkel)){cyl(.025,gh+.2,M.blkC,-(W/2+.03),yT+gh/2+.03,gz1+.03,g);cyl(.03,.2,M.blkC,-(W/2+.03),yT-.03,gz1+.12,g,'z',8);cyl(.055,.07,M.blkC,-(W/2+.03),yT+gh+.14,gz1+.03,g,'z',10);bx(.06,.03,.06,M.steel,-(W/2+.03),yT+gh+.185,gz1+.03,g)}
  if(cfg.winch||(cfg.tune&&cfg.tune.lv.gear>=2)){bx(.22,.09,.1,M.steel,0,y0+.12,fz+.12,g);cyl(.02,.2,M.blkC,0,y0+.12,fz+.12,g,'x',8);if(cfg.winch||cfg.tune.lv.gear>=3){cyl(.045,.16,M.blkC,0,y0+.13,fz+.12,g,'x',10);cyl(.05,.12,M.trim,0,y0+.13,fz+.12,g,'x',10);bx(.04,.04,.06,M.steel,0,y0+.13,fz+.2,g);bx(.05,.02,.05,M.red,0,y0+.13,fz+.24,g)}}
  // ---- details on every car: window frames, door handles, rock sliders, fender flares, tow hooks, front plate, light bar on a hoop, rear bumper, ladder, antenna ----
  const X=cfg.extras||[];
  for(let i=0;i<nw;i++){const zc=gz1-seg*(i+.5),ww=cfg.style==='glass'?seg-.035:seg-.07,wh=gh-(cfg.style==='glass'?.06:.09);for(const sx of[1,-1]){const fx=sx*(ghW/2+.004);
    bx(.008,.012,ww+.02,M.trim,fx,gy+.01+wh/2,zc,g);bx(.008,.012,ww+.02,M.trim,fx,gy+.01-wh/2,zc,g);bx(.008,wh,.012,M.trim,fx,gy+.01,zc-ww/2,g);bx(.008,wh,.012,M.trim,fx,gy+.01,zc+ww/2,g);
    if(i<2)bx(.014,.022,.09,M.blkC,sx*(W/2+.007),yT-.05,zc-ww/2+.1,g)}}                                                       // frames and handles
  for(const sx of[1,-1]){bx(.06,.04,L*.5,M.blkC,sx*(W/2+.05),y0-.02,0,g);for(let k=-1;k<=1;k++)bx(.05,.03,.03,M.blkC,sx*(W/2+.03),y0,k*L*.18,g)}   // rock sliders
  for(const sx of[1,-1])for(const wz of[cfg.wb/2,-cfg.wb/2]){bx(.04,.07,.7,M.blkC,sx*(W/2+.012),y0+.18,wz,g);bx(.03,.22,.05,M.blkC,sx*(W/2+.012),y0+.06,wz+.34,g);bx(.03,.22,.05,M.blkC,sx*(W/2+.012),y0+.06,wz-.34,g)}   // fender flares
  for(const sx of[1,-1]){bx(.05,.05,.08,M.red,sx*.3,y0+.03,fz+.1,g);bx(.05,.05,.08,M.red,sx*.3,y0+.03,rz-.09,g)}           // tow hooks
  bx(.26,.08,.01,M.plate,0,y0+.1,fz+.115,g);
  {const hy=yT+gh*.35,hz=fz-hood+.06;for(const sx of[1,-1])bx(.025,.22,.025,M.blkC,sx*(W/2-.12),yT+.11,hz,g);bx(W-.2,.025,.025,M.blkC,0,hy+.08,hz,g);   // hoop over the hood
    if(X.includes('lightbar')){bx(W-.3,.05,.04,M.blkC,0,hy+.12,hz+.01,g);bx(W-.36,.03,.012,M.lamp,0,hy+.12,hz+.035,g)}else for(let i=0;i<4;i++){cyl(.03,.025,M.lamp,-.24+i*.16,hy+.13,hz+.02,g,'z');cyl(.034,.02,M.blkC,-.24+i*.16,hy+.13,hz-.002,g,'z')}}
  bx(W+.06,.04,.04,M.blkC,0,y0+.26,rz-.1,g);for(const sx of[1,-1])bx(.06,.05,.02,M.tail,sx*.3,y0+.26,rz-.125,g);          // rear bumper bar and lamps
  if(X.includes('ladder')){const lx=W/2+.04,n=Math.max(3,Math.round((roofY-y0)/.12));for(const dz of[-.07,.07])bx(.02,roofY-y0+.1,.02,M.blkC,lx,(roofY+y0)/2+.05,rz+.18+dz,g);for(let k=0;k<n;k++)bx(.02,.02,.17,M.blkC,lx,y0+.1+k*.12,rz+.18,g)}
  {const az=gz0+.1;cyl(.008,.55,M.blkC,-(W/2-.06),roofY+.25,az,g);const ball=new THREE.Mesh(new THREE.SphereGeometry(.025,8,6),M.red);ball.position.set(-(W/2-.06),roofY+.53,az);g.add(ball)}   // antenna
  if(X.includes('sandLadders'))for(const sx of[1,-1]){const m=bx(.03,.2,.9,M.orange,sx*(W/2+.07),yT-.02,gz0+.5,g);for(let k=0;k<6;k++)bx(.035,.03,.06,M.blkC,sx*(W/2+.07),yT-.02,gz0+.1+k*.16,g)}   // sand ladders on the flanks
  if(X.includes('jack'))bx(.05,.3,.08,M.red,W/2+.06,yT+.04,gz0+1.1,g);
  // roof rack
  const ry=roofY+.07,rl=rackZ1-rackZ0,rc=(rackZ0+rackZ1)/2,rw=W-.08;
  for(const sx of[1,-1]){bx(.025,.025,rl,M.blkC,sx*rw/2,ry,rc,g);bx(.025,.08,.025,M.blkC,sx*rw/2,ry-.04,rackZ0+.03,g);bx(.025,.08,.025,M.blkC,sx*rw/2,ry-.04,rackZ1-.03,g)}
  for(let z=rackZ0;z<=rackZ1+.001;z+=Math.max(.14,rl/8))bx(rw,.014,.02,M.blkC,0,ry-.004,z,g);
  bx(rw-.08,.05,.05,M.blkC,0,ry+.04,rackZ1-.01,g);
  if(cfg.tune&&cfg.tune.led){bx(rw-.1,.045,.04,M.blkC,0,ry+.045,rackZ1+.01,g);bx(rw-.16,.025,.012,M.lamp,0,ry+.045,rackZ1+.032,g)}   // the LED bar from the garage sits on the rack; the hoop lights are standard
  const can=(x,z,mat)=>{bx(.14,.12,.2,mat,x,ry+.07,rc+z,g);bx(.03,.02,.12,M.blkC,x,ry+.14,rc+z,g)};
  const spade=(sx)=>{cyl(.012,.6,M.wood,sx*(rw/2+.03),ry+.02,rc,g,'z',6);bx(.02,.09,.12,M.steel,sx*(rw/2+.03),ry+.02,rc+.33,g)};
  const axe=(sx)=>{cyl(.011,.42,M.wood,sx*(rw/2+.03),ry+.05,rc-.1,g,'z',6);bx(.025,.08,.07,M.steel,sx*(rw/2+.035),ry+.07,rc+.13,g)};
  if(X.includes('cans2')){can(.17,-.15,M.can);can(-.02,-.15,M.red)}
  if(X.includes('cans3')){can(.2,-.2,M.can);can(.02,-.2,M.red);can(-.16,-.2,M.can)}
  if(X.includes('box')){bx(.4,.14,.3,M.blkC,-.1,ry+.08,rc+.22,g);bx(.42,.02,.32,M.steel,-.1,ry+.155,rc+.22,g)}
  if(X.includes('toolbox')){bx(.26,.1,.16,M.red,.12,ry+.06,rc+.2,g);bx(.27,.015,.17,M.blkC,.12,ry+.115,rc+.2,g)}
  if(X.includes('tent')){cyl(.07,.52,M.orange,0,ry+.08,rc+.25,g,'x',10);for(const dx of[-.18,.18])bx(.02,.16,.16,M.blkC,dx,ry+.08,rc+.25,g)}
  if(X.includes('crates')){const r=cfg.spare==='rack';bx(.22,.14,.2,M.blue,r?.13:-.2,ry+.08,r?rc-.22:rc-.18,g);bx(.2,.12,.22,M.green,r?.13:.1,ry+.07,r?rc+.01:rc-.18,g);bx(.18,.1,.14,M.orange,r?.31:.26,ry+.06,r?rc-.12:rc+.1,g)}   // beside the spare when it lies on the rack
  if(X.includes('tarp')){const tz=rc+.48;bx(.5,.1,.36,M.canvas,0,ry+.06,tz,g);for(const dz of[-.12,.12])bx(.54,.012,.02,M.blkC,0,ry+.115,tz+dz,g)}   // in front of the cans and the toolbox
  if(X.includes('spade'))spade(1);if(X.includes('axe'))axe(-1);
  // spare
  const sp=buildWheel(.2,1);sp.root.scale.set(.85,.85,.85);
  if(cfg.spare==='rear'){sp.root.position.set(0,y0+.24,rz-.21);sp.root.rotation.y=Math.PI/2;bx(.05,.05,.1,M.blkC,0,y0+.24,rz-.13,g)}   // behind the bumper bar, on a short bracket
  else if(cfg.spare==='hood'){sp.root.position.set(0,yT+.09,fz-hood/2);sp.root.rotation.z=Math.PI/2}
  else{sp.root.position.set(-.18,ry+.08,rc-.1);sp.root.rotation.z=Math.PI/2}
  g.add(sp.root);
  for(const sx of[1,-1]){const p=new THREE.Mesh(new THREE.PlaneGeometry(.32,.16),decalMat);p.position.set(sx*(W/2+.004),y0+.2,gz1-.28);p.rotation.y=sx>0?Math.PI/2:-Math.PI/2;g.add(p)}
  const hd=new THREE.Mesh(new THREE.PlaneGeometry(.3,.15),decalMat);hd.rotation.x=-Math.PI/2;hd.position.set(0,yT+.024,fz-hood/2);if(cfg.spare!=='hood')g.add(hd);
  // driver + navigator
  for(const sx of cfg.win>1?[1,-1]:[1]){const h=new THREE.Mesh(new THREE.SphereGeometry(.06,12,10),M.skin);h.position.set(sx*.2,yT+.13,gz1-.3);g.add(h);
    const cap=new THREE.Mesh(new THREE.SphereGeometry(.062,12,8,0,Math.PI*2,0,Math.PI/2),M.blkC);cap.position.copy(h.position);cap.position.y+=.01;g.add(cap);
    bx(.17,.14,.12,M.shirt,sx*.2,yT+.02,gz1-.32,g)}
  return g;
}

