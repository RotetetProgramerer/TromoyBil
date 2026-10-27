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
// the wheel for a car: the standard wheel, scaled up for a car with its own wheel size (cfg.wr radius, cfg.tireW tire width)
function carWheel(cfg,side,rear){if(cfg.style==='sport')return buildSportWheel(cfg,side,rear);const w=buildWheel(WR,side),k=(cfg.wr||WR)/WR;if(cfg.wr||cfg.tireW)w.spin.scale.set((cfg.tireW||.19)/.19,k,k);return w}
function buildBody(cfg){if(cfg.style==='monster')return buildMonster(cfg);if(cfg.style==='sport')return buildSport(cfg);
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
  if(X.includes('crates')){bx(.22,.14,.2,M.blue,-.2,ry+.08,rc-.18,g);bx(.2,.12,.22,M.green,.1,ry+.07,rc-.18,g);bx(.18,.1,.14,M.orange,.26,ry+.06,rc+.1,g)}
  if(X.includes('tarp')){bx(.5,.1,.36,M.canvas,0,ry+.06,rc-.05,g);for(const dz of[-.12,.12])bx(.54,.012,.02,M.blkC,0,ry+.115,rc-.05+dz,g)}
  if(X.includes('spade'))spade(1);if(X.includes('axe'))axe(-1);
  // spare
  const sp=buildWheel(.2,1);sp.root.scale.set(.85,.85,.85);
  if(cfg.spare==='rear'){sp.root.position.set(0,y0+.24,rz-.12);sp.root.rotation.y=Math.PI/2}
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
/* ---------- the monster truck: a wide shell high over big wheels, fenders over the tyres, a short cab and bed, and the black chassis with shocks and bumpers underneath ---------- */
function buildMonster(cfg){
  const g=new THREE.Group(),L=cfg.L,wb=cfg.wb,tr=cfg.track||TRACK,yB=.42,fz=.95,rz=-.95,fw=tr/2+(cfg.tireW||.19)/2-.48;   // yB: the beltline over the fenders; fw: how far a fender reaches out past the shell
  // chassis: the tub, skid plates, bumpers with struts, the shocks down to the axles
  bx(.5,.1,1.9,M.blkC,0,-.1,0,g);for(const sz of[1,-1]){bx(.42,.03,.3,M.steel,0,-.15,sz*.95,g);bx(1.02,.08,.08,M.blkC,0,-.03,sz*(L/2-.05),g);for(const sx of[1,-1])bx(.04,.14,.18,M.blkC,sx*.22,-.02,sz*(L/2-.17),g)}
  for(const sx of[1,-1])for(const wz of[wb/2,-wb/2])for(const dz of[-.07,.07]){const s=cyl(.03,.5,M.steel,sx*.44,.08,wz+dz,g,null,8);s.rotation.z=sx*.35;const b=cyl(.042,.22,M.red,sx*.4,.2,wz+dz,g,null,8);b.rotation.z=sx*.35}
  // the shell: sides between the wheels, fenders over the tyres and steps between them, all in the paint
  bx(.96,.3,1.9,M.yel,0,yB-.17,0,g);
  for(const sx of[1,-1]){const fx=sx*(.48+fw/2);
    for(const wz of[wb/2,-wb/2]){bx(fw,.04,.86,M.yel,fx,yB,wz,g);bx(.04,.07,.88,M.blkC,sx*(.48+fw),yB-.01,wz,g);for(const dz of[-.43,.43])bx(fw,.14,.04,M.yel,fx,yB-.07,wz+dz,g)}
    bx(fw,.04,wb-.86,M.yel,fx,yB,0,g);bx(.04,.05,wb-.86,M.blkC,sx*(.48+fw),yB-.01,0,g);
    // graphics on the flanks: a black stripe and three slashes, the sticker
    bx(.012,.04,1.8,M.blkC,sx*.486,.18,0,g);for(let i=0;i<3;i++){const m=bx(.012,.2,.05,M.blkC,sx*.486,.3,-.55+i*.12,g);m.rotation.x=.6}
    const p=new THREE.Mesh(new THREE.PlaneGeometry(.32,.16),decalMat);p.position.set(sx*.487,.3,.35);p.rotation.y=sx>0?Math.PI/2:-Math.PI/2;g.add(p)}
  // hood, grille and lights
  bx(.96,.1,.52,M.yel,0,yB+.05,fz-.26,g);bx(.5,.03,.36,M.blkC,0,yB+.11,fz-.28,g);   // the hood with a black scoop
  bx(.8,.22,.02,M.blkC,0,.27,fz+.01,g);for(let i=0;i<4;i++)bx(.6,.012,.022,M.steel,0,.2+i*.045,fz+.016,g);
  for(const sx of[1,-1]){cyl(.055,.03,M.lamp,sx*.32,.32,fz+.02,g,'z');bx(.06,.03,.015,M.amber,sx*.32,.2,fz+.016,g);bx(.06,.09,.015,M.tail,sx*.38,.32,rz-.008,g);
    const beam=new THREE.Mesh(new THREE.ConeGeometry(.55,4,14,1,true),M.beam);beam.rotation.x=-Math.PI/2+.13;beam.position.set(sx*.32,.32-.26,fz+1.98);beam.castShadow=false;g.add(beam)}
  // the cab: windows all round, a roof with four lamps on a bar
  const cz0=-.3,cz1=.43,cl=cz1-cz0,cc=(cz0+cz1)/2,gh=.22,gy=yB+gh/2;
  bx(.9,gh,cl,M.yel,0,gy,cc,g);bx(.94,.03,cl+.04,M.yel,0,yB+gh+.015,cc,g);
  bx(.78,gh-.07,.012,M.glass,0,gy+.01,cz1+.006,g);bx(.7,gh-.09,.012,M.glass,0,gy+.01,cz0-.006,g);
  for(const sx of[1,-1]){bx(.012,gh-.08,cl-.14,M.glass,sx*.456,gy+.01,cc,g);bx(.03,.06,.05,M.blkC,sx*.5,yB+.06,cz1-.04,g)}   // side windows and mirrors
  bx(.6,.04,.04,M.blkC,0,yB+gh+.05,cz1-.06,g);for(let i=0;i<4;i++)cyl(.028,.025,M.lamp,-.21+i*.14,yB+gh+.06,cz1-.035,g,'z');
  // the bed: floor, walls and tailgate
  const bl=cz0-rz,bc=(cz0+rz)/2;bx(.9,.02,bl,M.blkC,0,yB+.01,bc,g);for(const sx of[1,-1])bx(.04,.1,bl,M.yel,sx*.46,yB+.05,bc,g);bx(.96,.1,.04,M.yel,0,yB+.05,rz+.02,g);
  bx(.2,.1,.008,M.plate,0,.2,rz-.004,g);
  const hd=new THREE.Mesh(new THREE.PlaneGeometry(.3,.15),decalMat);hd.rotation.x=-Math.PI/2;hd.position.set(0,yB+.101,fz-.12);g.add(hd);
  return g;
}
/* ---------- the sports car (911 Turbo): a smooth shell lofted through real cross sections, with glass, intakes and trim laid on the same surface ----------
   SP911 is the real car in millimetres. One row per station along the car:
   [s back from the nose, floor, half width, height of the widest point, shoulder, crest x, crest y, edge x, edge y, top centre]
   crest: the fender top at the front, the window line along the cabin, the rear haunch at the back.
   edge:  the hood edge, the A-pillar, the roof edge, the rear window and the engine lid. The model is scaled so the wheelbase matches cfg.wb. */
const SP911={axF:1000,axR:3450,arch:408,len:4535,rows:[
  [0,   400,420,460,510,300,530,160,540,540],
  [15,  300,600,450,545,430,570,230,575,572],
  [45,  230,745,445,590,545,615,285,612,602],
  [130, 180,840,450,645,640,672,320,652,642],
  [320, 155,895,470,705,690,748,350,692,682],
  [650, 145,918,490,775,700,812,370,732,722],
  [1000,140,922,500,805,700,845,380,765,760],
  [1350,135,915,510,830,735,862,430,810,805],
  [1650,130,905,520,850,780,880,640,885,870],
  [1900,125,900,520,855,785,890,610,1030,1045],
  [2150,125,900,520,860,780,900,580,1170,1190],
  [2400,125,905,530,865,775,910,565,1245,1268],
  [2650,125,915,540,870,775,920,560,1268,1300],
  [2950,130,930,560,885,780,935,560,1252,1288],
  [3200,135,945,590,905,785,955,565,1215,1250],
  [3450,150,952,620,930,775,980,560,1150,1185],
  [3700,170,948,640,955,740,1000,545,1085,1112],
  [3950,200,932,650,965,700,1010,540,1040,1060],
  [4200,240,905,650,960,670,1000,540,1012,1030],
  [4400,270,865,640,940,620,975,520,985,1002],
  [4500,290,820,620,905,560,940,480,950,965],
  [4535,320,760,600,860,500,890,420,925,938]]};
// one station between the rows: cubic Hermite through the rows, so the body has no kinks where the rows meet
function spRow(T,s){const R=T.rows,n=R.length;let i=0;while(i<n-2&&R[i+1][0]<s)i++;const a=R[i],b=R[i+1],h=b[0]-a[0],t=Math.min(1,Math.max(0,(s-a[0])/h)),t2=t*t,t3=t2*t,out=[];
  const m=(j,k)=>{const p=R[Math.max(0,j-1)],q=R[Math.min(n-1,j+1)];return(q[k]-p[k])/(q[0]-p[0])};
  for(let k=1;k<a.length;k++)out.push((2*t3-3*t2+1)*a[k]+(t3-2*t2+t)*h*m(i,k)+(3*t2-2*t3)*b[k]+(t3-t2)*h*m(i+1,k));
  return out}
let spMats=null;
function sportMats(){if(spMats)return spMats;
  const c=document.createElement('canvas');c.width=512;c.height=64;const x=c.getContext('2d');x.fillStyle='#e9e6df';x.textAlign='center';x.textBaseline='middle';x.font='700 44px "Barlow Condensed", Arial, sans-serif';
  if('letterSpacing'in x)x.letterSpacing='18px';x.fillText('PORSCHE',256,34);const t=new THREE.CanvasTexture(c);t.encoding=THREE.sRGBEncoding;t.anisotropy=4;
  spMats={well:new THREE.MeshStandardMaterial({color:M.blk.color.clone(),roughness:.9,side:THREE.DoubleSide}),badge:new THREE.MeshStandardMaterial({map:t,transparent:true,roughness:.3,metalness:.6})};
  return spMats}
function buildSport(cfg){
  const T=SP911,mm=(T.axR-T.axF)/cfg.wb,yG=restWheelY(cfg)-(cfg.wr||WR),zF=cfg.wb/2+T.axF/mm,g=new THREE.Group(),SM=sportMats();   // mm per unit; yG the ground under the car at rest; zF the nose
  // the half section at s as a closed curve through both halves (so the top and the floor meet the centre line flat); u = 0 floor centre … 3 shoulder … 6 top centre
  const cache=new Map(),curve=s=>{const key=Math.round(s*4);let c=cache.get(key);if(c)return c;const[yb,w,ym,ysh,x4,y4,x5,y5,y6]=spRow(T,s),
    P=[[0,yb],[w*.92,yb+12],[w,ym],[w-22,ysh],[x4,y4],[x5,y5],[0,y6]];
    c=new THREE.CatmullRomCurve3(P.concat(P.slice(1,6).reverse().map(p=>[-p[0],p[1]])).map(p=>new THREE.Vector3(p[0],p[1],0)),true,'centripetal');cache.set(key,c);return c};
  const _c=new THREE.Vector3(),_a=new THREE.Vector3(),_b=new THREE.Vector3(),_d=new THREE.Vector3();
  const pt=(u,s,o)=>{curve(s).getPoint(u/12,_c);return o.set(_c.x/mm,_c.y/mm+yG,zF-s/mm)};
  const nrm=(u,s,o)=>{pt(u+.01,s,_a);pt(u-.01,s,_d);_a.sub(_d);pt(u,s+2,_b);pt(u,s-2,_d);_b.sub(_d);return o.crossVectors(_b,_a).normalize()};
  // a sheet of the surface on both sides: cols are stations {s}, us(col) the u values down that station; off lifts it off the paint (glass, trim). Two cols on the same s are a cut (the wheel arches).
  const sheet=(cols,us,mat,off=0)=>{const P=[],N=[],I=[],p=new THREE.Vector3(),n=new THREE.Vector3(),A=new THREE.Vector3(),B=new THREE.Vector3(),C=new THREE.Vector3();
    for(const sx of[1,-1]){const base=P.length/3;let nu=0;
      for(const c of cols){const U=us(c);nu=U.length;for(const u of U){nrm(u,c.s,n);pt(u,c.s,p).addScaledVector(n,off);P.push(p.x*sx,p.y,p.z);N.push(n.x*sx,n.y,n.z)}}
      for(let j=0;j<cols.length-1;j++){if(cols[j+1].s===cols[j].s)continue;for(let i=0;i<nu-1;i++){const v=base+j*nu+i,q=[[v,v+nu,v+nu+1],[v,v+nu+1,v+1]];
        for(const[a,b,c]of q){A.fromArray(P,a*3);B.fromArray(P,b*3).sub(A);C.fromArray(P,c*3).sub(A);const f=B.cross(C);if(f.lengthSq()<1e-14)continue;
          n.set(N[a*3]+N[b*3]+N[c*3],N[a*3+1]+N[b*3+1]+N[c*3+1],N[a*3+2]+N[b*3+2]+N[c*3+2]);if(f.dot(n)<0)I.push(a,c,b);else I.push(a,b,c)}}}}
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(P,3));geo.setAttribute('normal',new THREE.Float32BufferAttribute(N,3));geo.setIndex(I);
    const m=new THREE.Mesh(geo,mat);m.castShadow=!off;m.receiveShadow=true;g.add(m);return m};
  const span=(a,b,n)=>Array.from({length:n},(_,i)=>a+(b-a)*i/(n-1));
  const patch=(u0,u1,s0,s1,mat,off,nu=6,ns=8)=>sheet(span(s0,s1,ns).map(s=>({s})),()=>span(u0,u1,nu),mat,off);
  // the wheel arches: circles round the wheel centres, cut out of the lower body
  const R=T.arch,yc=(cfg.wr||WR)*mm,axS=[T.axF,T.axR];
  const uAt=(s,y)=>{let a=1,b=3;for(let k=0;k<30;k++){const m=(a+b)/2;pt(m,s,_a);((_a.y-yG)*mm<y)?a=m:b=m}return Math.min(2.9,(a+b)/2)};   // u on the flank at height y (mm above ground), 1 at the floor corner
  const S=new Set(span(0,T.len,96).map(Math.round));for(const r of T.rows)S.add(r[0]);
  const cols=[];for(const s of[...S].sort((a,b)=>a-b)){if(axS.some(a=>Math.abs(Math.abs(s-a)-R)<1))continue;cols.push({s,ax:axS.find(a=>Math.abs(s-a)<R)})}
  for(const a of axS)for(const e of[-1,1]){const s=a+e*R,i=cols.findIndex(c=>c.s>s);cols.splice(i,0,...(e<0?[{s},{s,ax:a}]:[{s,ax:a},{s}]))}   // the arch edge: the same station twice, outside and inside the arch
  sheet(cols,c=>c.ax===undefined?span(0,3,12):span(uAt(c.s,yc+Math.sqrt(Math.max(0,R*R-(c.s-c.ax)**2))),3,12),M.yel);   // floor and flanks (the same number of points in every station)
  sheet(cols.filter(c=>c.ax===undefined||Math.abs(c.s-c.ax)<R),()=>span(3,6,24),M.yel);   // shoulders, hood, roof and deck
  for(const a of axS)sheet(cols.filter(c=>c.ax===a),c=>{const yl=yc-Math.sqrt(Math.max(0,R*R-(c.s-c.ax)**2));return span(1,Math.max(1,uAt(c.s,yl)),8)},M.yel);   // the bumper and sill corners round the bottom of the arches
  // the nose and the tail: flat caps on the first and last station
  for(const[s,dz]of[[0,1],[T.len,-1]]){const ring=[];for(const u of span(0,6,36)){pt(u,s,_a);ring.push(_a.clone())}const full=ring.concat(ring.slice(1,-1).reverse().map(v=>new THREE.Vector3(-v.x,v.y,v.z)));
    const c=full.reduce((a,v)=>a.add(v),new THREE.Vector3()).multiplyScalar(1/full.length),P=[];
    for(let i=0;i<full.length;i++){const a=full[i],b=full[(i+1)%full.length];if(dz<0)P.push(c.x,c.y,c.z,b.x,b.y,b.z,a.x,a.y,a.z);else P.push(c.x,c.y,c.z,a.x,a.y,a.z,b.x,b.y,b.z)}
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(P,3));geo.computeVertexNormals();const m=new THREE.Mesh(geo,M.yel);m.castShadow=true;m.receiveShadow=true;g.add(m)}
  // glass with black frames: windshield, side windows (they end in the 911's point where the roof meets the window line) and the rear window
  patch(5,6,1650,2415,M.blkC,.0012,8,16);patch(5.07,6,1672,2392,M.glass,.0024,8,16);
  patch(4,5,1660,3640,M.blkC,.0012,6,40);patch(4.1,4.9,1695,3600,M.glass,.0024,6,40);patch(3.98,5.02,2915,2945,M.blkC,.0032,6,2);
  patch(5.06,6,3140,3760,M.blkC,.0012,8,14);patch(5.16,6,3170,3730,M.glass,.0024,8,14);
  // black trim: side skirts, door shut lines, door handles, the Turbo's intakes in the rear wings, the front intakes, the engine grille and the diffuser
  patch(.98,1.4,1430,3020,M.blkC,.0015,4,24);
  for(const s of[1600,2880])patch(1.15,3.99,s,s+8,M.blkC,.002,10,2);
  patch(3.5,3.68,2560,2690,M.blkC,.002,3,3);
  patch(2.2,2.95,2925,3085,M.blkC,.0018,6,6);
  patch(0,.72,12,118,M.blkC,.0018,6,6);patch(1.12,1.95,18,150,M.blkC,.0018,6,6);
  patch(5.28,6,3800,4120,M.blkC,.0015,6,6);patch(5.45,6,3777,3791,M.tail,.002,4,2);
  patch(0,1.05,4385,4535,M.blkC,.0015,6,4);
  // under the car: floor pan, and the wheel wells (liner and inner wall)
  const yfl=yG+140/mm,tr=(cfg.track||TRACK)/2,xi=tr-Math.max(cfg.tireW||.19,cfg.tireWr||0)/2-.025,Ru=R/mm,ycu=yG+yc/mm;
  bx(xi*2,.02,(T.axR-T.axF+2*R)/mm,M.blkC,0,yfl+.012,zF-(T.axF+T.axR)/2/mm,g);
  for(const a of axS){const z=zF-a/mm,xo=pt(2,a,_a).x-.004,yb=yG+Math.max(spRow(T,a-R)[0],spRow(T,a+R)[0])/mm+.004,t0=Math.asin(Math.max(-1,(yb-ycu)/Ru));for(const sx of[1,-1]){   // t0: where the liner meets the floor
    const ln=new THREE.Mesh(new THREE.CylinderGeometry(Ru,Ru,xo-xi,28,1,true,t0,Math.PI-2*t0),SM.well);ln.rotation.z=Math.PI/2;ln.position.set(sx*(xi+xo)/2,ycu,z);g.add(ln);
    bx(.008,ycu+Ru-yb,2*Ru,SM.well,sx*xi,(yb+ycu+Ru)/2,z,g)}}
  // headlights on the front fenders (oval, with a black bezel) and their beams
  const n=new THREE.Vector3(),q=new THREE.Quaternion(),Y=new THREE.Vector3(0,1,0),h=new THREE.Vector3();
  for(const sx of[1,-1]){pt(3.72,300,h);nrm(3.72,300,n);const hl=new THREE.Group();hl.position.set(sx*h.x,h.y,h.z);hl.quaternion.copy(q.setFromUnitVectors(Y,n.set(n.x*sx,n.y,n.z)));g.add(hl);
    const bz=new THREE.Mesh(new THREE.SphereGeometry(1,16,8),M.blkC);bz.scale.set(128/mm,30/mm,178/mm);hl.add(bz);
    const lm=new THREE.Mesh(new THREE.SphereGeometry(1,16,10),M.lamp);lm.scale.set(112/mm,36/mm,158/mm);lm.position.y=.002;hl.add(lm);
    const beam=new THREE.Mesh(new THREE.ConeGeometry(.55,4,14,1,true),M.beam);beam.rotation.x=-Math.PI/2+.13;beam.position.set(sx*h.x,h.y-.26,h.z+1.98);beam.castShadow=false;g.add(beam)}
  // the tail: the light band across the whole car, the lettering, plate, tailpipes
  const zT=zF-T.len/mm,yL=830,xL=pt(uAt(T.len,yL),T.len,_a).x-.018;
  bx(xL*2+.01,62/mm,.008,M.blkC,0,yG+(yL-10)/mm,zT-.002,g);bx(xL*2,26/mm,.012,M.tail,0,yG+yL/mm,zT-.004,g);for(const sx of[1,-1])bx(.03,52/mm,.012,M.tail,sx*(xL-.015),yG+(yL-14)/mm,zT-.005,g);
  const bd=new THREE.Mesh(new THREE.PlaneGeometry(.34,.0425),SM.badge);bd.rotation.y=Math.PI;bd.position.set(0,yG+772/mm,zT-.003);g.add(bd);
  bx(520/mm,110/mm,.006,M.plate,0,yG+520/mm,zT-.004,g);bx(1300/mm,105/mm,.006,M.blkC,0,yG+385/mm,zT-.002,g);   // plate, black diffuser
  for(const sx of[1,-1]){cyl(.024,.03,M.steel,sx*.25,yG+385/mm,zT-.01,g,'z',12);cyl(.016,.032,M.blk,sx*.25,yG+385/mm,zT-.012,g,'z',10)}
  bx(520/mm,110/mm,.006,M.plate,0,yG+468/mm,zF+.003,g);
  // the Turbo's rear wing, raised on two struts over the engine lid
  {const s=4310,deck=pt(6,s,_a).y,wy=yG+1115/mm,wz=zF-s/mm;const wg=bx(1440/mm,22/mm,300/mm,M.yel,0,wy,wz,g);wg.rotation.x=.08;bx(1440/mm,16/mm,12/mm,M.yel,0,wy+.012,wz-.07,g);
    for(const sx of[1,-1])bx(.014,wy-deck,.05,M.blkC,sx*.2,(wy+deck)/2,wz+.01,g)}
  // door mirrors at the foot of the A-pillars
  for(const sx of[1,-1]){pt(4,1730,_a);bx(.03,.012,.014,M.blkC,sx*(_a.x+.012),_a.y+.02,_a.z,g);bx(.055,.03,.04,M.yel,sx*(_a.x+.045),_a.y+.026,_a.z,g);bx(.045,.022,.004,M.glass,sx*(_a.x+.045),_a.y+.026,_a.z-.021,g)}
  return g;
}
/* ---------- the sports car's wheels: low-profile road tyres, five double spokes, brake disc and a yellow caliper that steers but does not spin ---------- */
function buildSportWheel(cfg,side,rear){
  const r=cfg.wr||WR,w=rear&&cfg.tireWr||cfg.tireW||.19,rr=r*.74,root=new THREE.Group(),spin=new THREE.Group();root.add(spin);
  const prof=[[rr,w/2-.004],[r*.93,w/2],[r-.008,w/2-.006],[r,w/2-.02],[r,-w/2+.02],[r-.008,-w/2+.006],[r*.93,-w/2],[rr,-w/2+.004]].map(p=>new THREE.Vector2(p[0],p[1]));
  const tire=new THREE.Mesh(new THREE.LatheGeometry(prof,36),M.tire);tire.rotation.z=Math.PI/2;tire.castShadow=true;spin.add(tire);
  const brl=new THREE.Mesh(new THREE.CylinderGeometry(rr,rr,w-.01,24,1,true),sportMats().well);brl.rotation.z=Math.PI/2;spin.add(brl);   // the dark rim barrel, open so the brake shows
  const fx=side*(w/2-.006),lip=new THREE.Mesh(new THREE.TorusGeometry(rr*.96,.008,6,36),M.steel);lip.rotation.y=Math.PI/2;lip.position.x=fx;spin.add(lip);cyl(rr*.97,.006,M.blk,side*(w/2-.055),0,0,spin,'x',24);   // the rim lip, the dark back of the wheel
  cyl(.7*rr,.008,M.steel,side*(w/2-.03),0,0,spin,'x',24);                                                    // brake disc
  for(let i=0;i<5;i++)for(const d of[-.13,.13]){const a=i/5*Math.PI*2+d,sp=bx(.01,rr*.72,.016,M.steel,fx+side*.004,Math.cos(a)*rr*.5,Math.sin(a)*rr*.5,spin);sp.rotation.x=a}
  cyl(rr*.26,.014,M.steel,fx+side*.006,0,0,spin,'x',16);cyl(rr*.1,.02,M.blk,fx+side*.01,0,0,spin,'x',6);          // hub and centre lock
  const cal=bx(.02,rr*.42,rr*.24,M.cal,side*(w/2-.03),0,0,root);cal.position.set(side*(w/2-.03),Math.cos(.6)*rr*.62,-Math.sin(.6)*rr*.62);cal.rotation.x=.6;
  return{root,spin};
}
