'use strict';
/* =================================================================
   SKI: the ski resort in the game (Gautefall). The chairlift that always runs, the skier, and the trip:
   park on the blue square → ride the chairlift → pick a piste at the top → countdown → the run → result.
   Also the ski camera, the ski HUD and the ski sounds. The physics is in js/skier.js.
   Loaded after world.js; uses the globals of game.js and world.js (state, LV, car, camera, toast …) at run time.
   ================================================================= */
const LIFT_SPEED=2.0,CHAIR_GAP=3.0;
const SKI={on:false,phase:'',s:makeSkier(),run:null,k:null,t:0,acc:0,vis:null,ride:0,count:0,fade:null,cam:0,camSnap:true,look:new V3(),jumpPrev:false,result:false,beat:0,pinged:0,
  tracks:[{P:new V3(),surf:S.SNOW,lastTrk:null},{P:new V3(),surf:S.SNOW,lastTrk:null}],snd:null,lastNode:0,help:0};
const skiOn=()=>SKI.on;
const PISTE_COL=['#3fae3a','#3fae3a','#2f6fd6','#d9432f','#1d1c1a'],PISTE_NAME=['','Grønn','Blå','Rød','Svart'];
const skiKey=k=>LEVELS[state.levelIdx].id+'/ski/'+k.id;

/* ---------- the chairlift ---------- */
// The loop: up the line beside the +p cable, round the top bullwheel, down the other cable, round the bottom bullwheel.
let LIFT=null;
function liftCableY(L,d){const n=L.nodes;if(d<=0)return n[0].y;for(let i=1;i<n.length;i++)if(d<=n[i].d){const a=n[i-1],b=n[i];return a.y+(b.y-a.y)*(d-a.d)/(b.d-a.d)}return n[n.length-1].y}
function liftAt(L,u,out){const arc=Math.PI*L.off,tot=2*L.len+2*arc;u=((u%tot)+tot)%tot;let d,s,yaw,ang;
  if(u<L.len){d=u;s=L.off;yaw=L.ry}
  else if(u<L.len+arc){ang=(u-L.len)/L.off;s=L.off*Math.cos(ang);const fw=Math.sin(ang)*L.off;out.set(L.bx+L.px*s+L.ux*fw,liftCableY(L,L.len),L.bz+L.pz*s+L.uz*fw);out.yaw=L.ry+ang;return out}
  else if(u<2*L.len+arc){d=2*L.len+arc-u;s=-L.off;yaw=L.ry+Math.PI}
  else{ang=(u-2*L.len-arc)/L.off;s=-L.off*Math.cos(ang);const bw=Math.sin(ang)*L.off;out.set(L.ax+L.px*s-L.ux*bw,liftCableY(L,0),L.az+L.pz*s-L.uz*bw);out.yaw=L.ry+Math.PI+ang;return out}
  out.set(L.ax+L.ux*d+L.px*s,liftCableY(L,d),L.az+L.uz*d+L.pz*s);out.yaw=yaw;return out}
const chairMat={seat:new THREE.MeshStandardMaterial({color:LIN('#2f6fd6'),roughness:.6}),frame:new THREE.MeshStandardMaterial({color:LIN('#3a3f44'),roughness:.5,metalness:.4})};
function buildLift(lv){LIFT=null;const L=lv.liftDef;if(!L)return;const tot=2*L.len+2*Math.PI*L.off,n=Math.floor(tot/CHAIR_GAP),gap=tot/n,chairs=[];
  // the cable: straight between the sheaves, half circles round the bullwheels
  const segs=[],P=(x,y,z)=>new V3(x,y,z);
  for(const s of[L.off,-L.off])for(let i=0;i<L.nodes.length-1;i++){const a=L.nodes[i],b=L.nodes[i+1];segs.push({a:P(L.ax+L.ux*a.d+L.px*s,a.y,L.az+L.uz*a.d+L.pz*s),b:P(L.ax+L.ux*b.d+L.px*s,b.y,L.az+L.uz*b.d+L.pz*s),r:.016,c:'#26292c'})}
  const _p=new V3();for(const[u0,len]of[[L.len,Math.PI*L.off],[2*L.len+Math.PI*L.off,Math.PI*L.off]])for(let i=0;i<8;i++){const a=liftAt(L,u0+len*i/8,new V3()),b=liftAt(L,u0+len*(i+1)/8,new V3());segs.push({a,b,r:.016,c:'#26292c'})}
  segMesh(segs);
  const H_=L.hang,B=(w,h,d,mat,x,y,z,p)=>{const m=new THREE.Mesh(boxGeo,mat);m.scale.set(w,h,d);m.position.set(x,y,z);m.castShadow=true;p.add(m);return m};
  for(let i=0;i<n;i++){const g=new THREE.Group(),sw=new THREE.Group();g.add(sw);
    B(.1,.08,.16,chairMat.frame,0,-.02,0,sw);B(.03,H_,.03,chairMat.frame,0,-H_/2,-.05,sw);B(.95,.03,.03,chairMat.frame,0,-H_+.42,-.05,sw);
    for(const x of[-.47,.47])B(.03,.42,.03,chairMat.frame,x,-H_+.21,-.05,sw);
    B(.95,.06,.36,chairMat.seat,0,-H_,.12,sw);B(.95,.36,.05,chairMat.seat,0,-H_+.2,-.07,sw);
    B(.9,.03,.03,chairMat.frame,0,-H_+.36,.38,sw);B(.03,.03,.43,chairMat.frame,-.45,-H_+.36,.17,sw);B(.03,.03,.43,chairMat.frame,.45,-H_+.36,.17,sw);   // the safety bar
    B(.7,.03,.12,chairMat.frame,0,-H_-.3,.4,sw);B(.03,.33,.03,chairMat.frame,0,-H_-.14,.38,sw);                                                         // footrest
    levelGroup.add(g);chairs.push({g,sw,u0:i*gap})}
  LIFT={L,chairs,u:0,tot,gap,_p:new V3()}}
function updateLift(dt){if(!LIFT)return;LIFT.u+=LIFT_SPEED*dt;const L=LIFT.L,p=LIFT._p,tm=performance.now()*.001,cx=camera.position.x,cz=camera.position.z;
  for(let i=0;i<LIFT.chairs.length;i++){const c=LIFT.chairs[i];liftAt(L,LIFT.u+c.u0,p);c.g.position.copy(p);c.g.rotation.y=p.yaw;
    c.sw.rotation.x=.04*Math.sin(tm*1.3+i*1.7);c.g.visible=Math.abs(p.x-cx)+Math.abs(p.z-cz)<90}}
// the u of chair 0 now, and where it is
const riderChair=()=>LIFT.chairs[0];

/* ---------- gates, start and finish on the pistes ---------- */
function buildPisteGates(lv){if(!lv.pistes)return;const flagGeo2=new THREE.PlaneGeometry(.42,.3);flagGeo2.translate(.21,0,0);
  for(const k of lv.pistes){const grp=new THREE.Group();
    k.gates.forEach((g,i)=>{const col=g.finish?'#1d1c1a':g.col,poleM=new THREE.MeshStandardMaterial({color:LIN(col),roughness:.5}),tall=k.kind==='slalom'&&!g.finish?1.05:2.5;   // banners high enough for the camera to pass under
      for(const e of[g.a,g.b]){const y=H(e.x,e.z),m=new THREE.Mesh(cylGeo,poleM);m.scale.set(.03,tall,.03);m.position.set(e.x,y+tall/2,e.z);m.castShadow=true;grp.add(m);
        if(k.kind==='slalom'&&!g.finish){const f=new THREE.Mesh(flagGeo2,new THREE.MeshStandardMaterial({color:LIN(col),side:THREE.DoubleSide,roughness:.6}));f.position.set(e.x,y+tall-.2,e.z);f.rotation.y=Math.atan2(g.tan.x,g.tan.z)+(e===g.a?-Math.PI/2:Math.PI/2);grp.add(f)}}
      if(g.finish){const ya=H(g.a.x,g.a.z),yb=H(g.b.x,g.b.z),w=Math.hypot(g.a.x-g.b.x,g.a.z-g.b.z),ban=new THREE.Mesh(new THREE.PlaneGeometry(w,.42),finishBanner());ban.position.set(g.c.x,Math.max(ya,yb)+2.3,g.c.z);ban.rotation.y=Math.atan2(g.tan.x,g.tan.z)+Math.PI;grp.add(ban)}
      else if(k.kind!=='slalom'){const w=Math.hypot(g.a.x-g.b.x,g.a.z-g.b.z),ya=H(g.a.x,g.a.z),yb=H(g.b.x,g.b.z),ban=new THREE.Mesh(boxGeo,new THREE.MeshStandardMaterial({color:LIN(PISTE_COL[k.def.color??k.diff]),roughness:.6}));
        ban.scale.set(w,.22,.03);ban.position.set(g.c.x,Math.max(ya,yb)+2.4,g.c.z);ban.rotation.y=Math.atan2(g.tan.x,g.tan.z);grp.add(ban)}});
    // the start: a banner over the line and a wand to push through
    const p=k.start.p,tn=k.start.tan,s=k.side(0),y=H(p.x,p.z),sp=new THREE.Mesh(new THREE.PlaneGeometry(k.hw*2,.4),startBanner(k));sp.position.set(p.x,y+2.3,p.z);sp.rotation.y=Math.atan2(tn.x,tn.z)+Math.PI;grp.add(sp);   // readable from the start hut
    for(const sd of[-1,1]){const m=new THREE.Mesh(cylGeo,postMat);m.scale.set(.04,2.5,.04);m.position.set(p.x+s.x*sd*k.hw,H(p.x+s.x*sd*k.hw,p.z+s.z*sd*k.hw)+1.25,p.z+s.z*sd*k.hw);grp.add(m)}
    levelGroup.add(grp)}}
function startBanner(k){const c=document.createElement('canvas');c.width=512;c.height=96;const x=c.getContext('2d');x.fillStyle=PISTE_COL[k.def.color??k.diff];x.fillRect(0,0,512,96);x.fillStyle='#f2e8d0';x.fillRect(6,6,500,84);
  x.fillStyle='#14120E';x.textAlign='center';x.textBaseline='middle';x.font='54px "Saira Stencil One", Impact, sans-serif';x.fillText('START · '+k.name.toUpperCase(),256,52);
  const t=new THREE.CanvasTexture(c);t.encoding=THREE.sRGBEncoding;return new THREE.MeshStandardMaterial({map:t,side:THREE.DoubleSide,roughness:.7})}

/* ---------- the skier ---------- */
// boxes set between two joints (bones), so the pose can be written as joint positions in the skier's own frame:
// feet on the snow at the origin, +z forward, +x to the left
const _ba=new V3(),_bb=new V3(),_bd=new V3();
function bone(m,a,b,t){_bd.copy(b).sub(a);const L=_bd.length()||1e-4;m.position.copy(a).add(b).multiplyScalar(.5);m.quaternion.setFromUnitVectors(YAX,_bd.divideScalar(L));m.scale.set(t,L,t)}
function buildSkierVis(){if(SKI.vis){SKI.vis.root.parent||scene.add(SKI.vis.root);return SKI.vis}
  const mat=c=>new THREE.MeshStandardMaterial({color:LIN(c),roughness:.6}),jacket=mat('#d9432f'),pants=mat('#1f2a3a'),white=mat('#f2f2ee'),skiM=mat('#f2c230'),dark=mat('#1d1c1a'),skin=mat('#d9a07a'),gog=new THREE.MeshStandardMaterial({color:LIN('#ff9a2a'),roughness:.1,metalness:.6});
  const root=new THREE.Group(),body=new THREE.Group();root.add(body);
  const M_=(m,geo)=>{const o=new THREE.Mesh(geo||boxGeo,m);o.castShadow=true;body.add(o);return o};
  const v={root,body,jacket,shinL:M_(pants),shinR:M_(pants),thighL:M_(pants),thighR:M_(pants),torso:M_(jacket),bib:M_(white),uaL:M_(jacket),uaR:M_(jacket),faL:M_(jacket),faR:M_(jacket),
    poleL:M_(dark),poleR:M_(dark),skiL:M_(skiM),skiR:M_(skiM),tipL:M_(skiM),tipR:M_(skiM),bootL:M_(dark),bootR:M_(dark),
    head:M_(skin,new THREE.SphereGeometry(1,12,10)),helmet:M_(white,new THREE.SphereGeometry(1,12,8,0,Math.PI*2,0,Math.PI*.55)),goggles:M_(gog),gloveL:M_(dark),gloveR:M_(dark)};
  v.head.scale.setScalar(.062);v.helmet.scale.setScalar(.071);root.visible=false;scene.add(root);SKI.vis=v;return v}
// pose: c = crouch 0…1, tk = tuck 0…1, plant = pole swing −1…1, seated = sitting in the chair
function poseSkier(v,c,tk,plant,seated){const J=(x,y,z)=>new V3(x,y,z);let ankL,ankR,kneeL,kneeR,hipL,hipR,neck,tilt,hL,hR,tipL,tipR,skiZ0,skiZ1,skiY;
  if(seated){ankL=J(.075,-.3,.34);ankR=J(-.075,-.3,.34);kneeL=J(.075,.03,.3);kneeR=J(-.075,.03,.3);hipL=J(.06,.04,0);hipR=J(-.06,.04,0);tilt=-.08;
    neck=J(0,.04+.27,-.02);hL=J(.16,.3,.3);hR=J(-.16,.3,.3);tipL=J(.2,-.25,.3);tipR=J(-.2,-.25,.3);skiZ0=-.2;skiZ1=.75;skiY=-.34}
  else{const cr=Math.max(c,tk*.9);ankL=J(.075,.055,0);ankR=J(-.075,.055,0);kneeL=J(.075,.2-.05*cr,.07+.07*cr);kneeR=J(-.075,.2-.05*cr,.07+.07*cr);
    const hy=.34-.12*cr,hz=-.02-.07*cr;hipL=J(.06,hy,hz);hipR=J(-.06,hy,hz);tilt=.22+.3*c+.85*tk;neck=J(0,hy+.26*Math.cos(tilt),hz+.26*Math.sin(tilt));
    if(tk>.5){hL=J(.05,neck.y-.14,neck.z+.1);hR=J(-.05,neck.y-.14,neck.z+.1);tipL=J(.12,hL.y+.06,hL.z-.55);tipR=J(-.12,hR.y+.06,hR.z-.55)}
    else{const sw=plant*.12;hL=J(.15,hy+.1,hz+.2+sw);hR=J(-.15,hy+.1,hz+.2+sw);tipL=J(.18,.02,hL.z-.22-sw*1.2);tipR=J(-.18,.02,hR.z-.22-sw*1.2)}
    skiZ0=-.42;skiZ1=.5;skiY=.012}
  bone(v.shinL,ankL,kneeL,.07);bone(v.shinR,ankR,kneeR,.07);bone(v.thighL,kneeL,hipL,.08);bone(v.thighR,kneeR,hipR,.08);
  const pel=_ba.copy(hipL).add(hipR).multiplyScalar(.5);bone(v.torso,pel,neck,.15);v.torso.scale.z=.1;
  const bibA=pel.clone().lerp(neck,.3),bibB=pel.clone().lerp(neck,.75),fw=J(0,-Math.sin(tilt),Math.cos(tilt)).multiplyScalar(.052);bone(v.bib,bibA.add(fw),bibB.add(fw),.1);v.bib.scale.z=.01;
  const hd=neck.clone().add(J(0,.075*Math.cos(tilt*.5),.075*Math.sin(tilt*.5)));v.head.position.copy(hd);v.helmet.position.copy(hd).add(J(0,.01,-.004));v.goggles.position.copy(hd).add(J(0,.012,.055));v.goggles.scale.set(.1,.035,.03);v.goggles.rotation.x=tilt*.5;
  const shL=neck.clone().add(J(.1,-.03,0)),shR=neck.clone().add(J(-.1,-.03,0)),elL=shL.clone().lerp(hL,.5).add(J(.04,-.04,0)),elR=shR.clone().lerp(hR,.5).add(J(-.04,-.04,0));
  bone(v.uaL,shL,elL,.06);bone(v.uaR,shR,elR,.06);bone(v.faL,elL,hL,.055);bone(v.faR,elR,hR,.055);v.gloveL.position.copy(hL);v.gloveR.position.copy(hR);v.gloveL.scale.setScalar(.05);v.gloveR.scale.setScalar(.05);
  bone(v.poleL,hL,tipL,.018);bone(v.poleR,hR,tipR,.018);
  for(const[ski,tip,boot,a]of[[v.skiL,v.tipL,v.bootL,ankL],[v.skiR,v.tipR,v.bootR,ankR]]){ski.position.set(a.x,skiY,(skiZ0+skiZ1)/2+a.z*(seated?1:0));ski.scale.set(.075,.018,skiZ1-skiZ0);ski.quaternion.identity();
    tip.position.set(a.x,skiY+.03,skiZ1+.04+(seated?a.z:0));tip.scale.set(.075,.018,.12);tip.rotation.set(-.5,0,0);boot.position.set(a.x,a.y-.005,a.z+.02);boot.scale.set(.08,.1,.15);boot.rotation.set(0,0,0)}}
function applySkierColor(){if(!SKI.vis)return;const p=PAINTS[prof.paint]||PAINTS[0];SKI.vis.jacket.color.set(p.c).convertSRGBToLinear()}

/* ---------- the trip ---------- */
function fadeTo(cb,hold=.15){$('fade').classList.add('on');SKI.fade={t:0,cb,hold}}
function skiStart(){if(!LIFT)return;SKI.on=true;state.mode='ski';buildSkierVis();applySkierColor();car.vel.set(0,0,0);car.w.set(0,0,0);car.throttle=0;
  $('hud').classList.add('ski');$('sName').textContent='Stolheisen';$('sTime').textContent='–';$('sGate').textContent='–';$('sPen').textContent='–';$('sPenL').textContent='Straff';
  SKI.phase='board';fadeTo(()=>{SKI.phase='lift';LIFT.u=-.3;SKI.ride=-.3;SKI.lastNode=0;SKI.vis.root.visible=true;SKI.camSnap=true;showHelp('Stolheisen tar deg til toppen · <kbd>Enter</kbd> hopper over turen',4)})}
// at the top: the skier steps off beside the top station and picks a piste
function skiToTop(){SKI.phase='top';SKI.run=null;SKI.k=null;fadeTo(()=>{const L=LIFT.L,x=L.bx+L.ux*1.6,z=L.bz+L.uz*1.6;placeSkier(SKI.s,x,z,Math.atan2(L.ux,L.uz));SKI.vis.root.visible=true;SKI.camSnap=true;
  $('sName').textContent='Toppen';openAsk('skiPick')})}
function skiPick(id){const k=(LV.pistes||[]).find(p=>p.id===id);if(!k)return;SKI.k=k;SKI.phase='count';SKI.run=makeSkiRun(k);
  fadeTo(()=>{const s=SKI.s;placeSkier(s,k.start.p.x-k.start.tan.x*.3,k.start.p.z-k.start.tan.z*.3,Math.atan2(k.start.tan.x,k.start.tan.z));SKI.count=3.2;SKI.beat=4;SKI.camSnap=true;SKI.vis.root.visible=true;
    $('sName').textContent=k.name;$('sGate').textContent='0/'+(k.gates.length-1);$('sTime').textContent='0:00.0';$('sPenL').textContent=k.kind==='hopp'?'Poeng':'Straff';$('sPen').textContent=k.kind==='hopp'?'0':'0 s';
    showHelp(k.kind==='hopp'?'<kbd>←</kbd> <kbd>→</kbd> sving, og snurr i lufta · <kbd>↓</kbd> brems · <kbd>↑</kbd> fart · land med skiene rett fram':'<kbd>←</kbd> <kbd>→</kbd> sving · <kbd>↓</kbd> brems (plog) · <kbd>↑</kbd> stake og hockestilling · <kbd>mellomrom</kbd> hopp',5)})}
function skiExit(){SKI.phase='exit';fadeTo(()=>{SKI.on=false;SKI.phase='';SKI.run=null;SKI.k=null;if(SKI.vis){SKI.vis.root.visible=false;scene.add(SKI.vis.root)}$('hud').classList.remove('ski');$('count').hidden=true;$('sHelp').hidden=true;beacon.visible=false;
  state.mode='play';state.askCool='ski';camSnap=true;showHud();toast('Tilbake ved bilen');skiSoundOff()})}
function showHelp(html,sec){const el=$('sHelp');el.innerHTML=html;el.hidden=false;SKI.help=sec}

/* ---------- the ask dialog: start, pick a piste, pause ---------- */
function skiAsk(k){const L=LV.pistes||[];$('aYes').hidden=false;$('aList').hidden=true;$('aBest').textContent='';
  if(k==='ski'){const done=L.filter(p=>best[skiKey(p)]).length;$('aKind').textContent='Gautefall skisenter';$('aName').textContent='Stolheisen';
    $('aDesc').textContent='Parker bilen her og ta stolheisen til toppen. Der velger du en av '+L.length+' nedfarter: '+L.map(p=>p.name).join(', ')+'.';
    $('aBest').textContent=done?'Du har kjørt '+done+' av '+L.length+' nedfarter.':'Første tur gir bonus på hver nedfart.';$('aQ').textContent='Vil du stå på ski?';$('aNo').textContent='NEI, kjør videre';$('ask').hidden=false;$('aYes').focus();return}
  const item=(id,nm,sub,pr)=>`<button data-ski="${id}"><span><span class="nm">${nm}</span><span class="sub">${sub}</span></span><span class="pr">${pr}</span></button>`;
  if(k==='skiPick'){$('aKind').textContent='Toppen av Gautefall';$('aName').textContent='Velg nedfart';$('aDesc').textContent='Porter, tid og muttere. Treffer du et tre eller lander på tvers, starter du igjen fra forrige port.';
    $('aList').innerHTML=L.map(p=>{const b=best[skiKey(p)],st=b?'★'.repeat(b.s)+'☆'.repeat(3-b.s):'☆☆☆';
      const sub=p.desc+(b?' Beste: '+(p.kind==='hopp'?b.pts+' poeng':fmtTime(b.t)):'');return item('pick:'+p.id,`<i class="pdot" style="background:${PISTE_COL[p.def.color??p.diff]}"></i>${p.name} <small>${PISTE_NAME[p.def.color??p.diff]}</small>`,sub,st)}).join('');
    $('aList').hidden=false;$('aYes').hidden=true;$('aQ').textContent='';$('aNo').textContent='Ta heisen ned til bilen';$('ask').hidden=false;const f=$('aList').querySelector('button');if(f)f.focus();return}
  if(k==='skiPause'){$('aKind').textContent=SKI.k?SKI.k.name:'Gautefall';$('aName').textContent='Pause';$('aDesc').textContent='';
    $('aList').innerHTML=(SKI.k?item('restart','Start løypa på nytt','Tilbake til starten av '+SKI.k.name+'.',''):'')+item('pick','Velg en annen nedfart','Opp til toppen igjen.','')+item('car','Tilbake til bilen','Heisen ned til parkeringsplassen.','');
    $('aList').hidden=false;$('aYes').hidden=true;$('aQ').textContent='';$('aNo').textContent='Fortsett';$('ask').hidden=false;$('aNo').focus()}}
function skiAnswer(k,yes){
  if(k==='ski'){if(yes)skiStart();else{state.mode='play';state.askCool='ski';toast('Kjør videre når du vil')}return}
  state.mode='ski';const a=yes&&yes.ski;
  if(k==='skiPick'){if(a&&a.startsWith('pick:'))skiPick(a.slice(5));else skiExit();return}
  if(k==='skiPause'){if(a==='restart')skiPick(SKI.k.id);else if(a==='pick')skiToTop();else if(a==='car')skiExit()}}

/* ---------- the result ---------- */
function skiFinish(){const k=SKI.k,run=SKI.run,hopp=k.kind==='hopp',t=run.time,tt=t+run.pen,par=k.def.par||[1e9,1e9];SKI.phase='done';SKI.t=0;
  const stars=hopp?(run.points>=par[0]?3:run.points>=par[1]?2:1):(tt<=par[0]&&!run.missed?3:tt<=par[1]?2:1);
  const key=skiKey(k),prev=best[key];let isBest=false;
  if(!prev||(hopp?run.points>prev.pts:tt<prev.t)){best[key]={t:tt,p:run.pen,s:Math.max(stars,prev?prev.s:0),pts:run.points};store.set('best',best);isBest=true}else if(stars>prev.s){prev.s=stars;store.set('best',best)}
  let e=run.passed*5;const el=[run.passed+' porter +'+run.passed*5];
  if(!run.missed&&!hopp){e+=25;el.push('ingen bom +25')}
  if(hopp&&run.points){const n=Math.round(run.points/10);e+=n;el.push(run.points+' poeng +'+n)}
  if(!prev){e+=60;el.push('første tur +60')}else if(isBest){e+=20;el.push('ny rekord +20')}
  prof.nuts+=e;saveProf();
  $('rLevel').textContent=LEVELS[state.levelIdx].name+' · '+k.name;$('rTitle').textContent=hopp?(run.points>=par[0]?'Storslått!':'I mål!'):(!run.missed&&!run.crashes?'Feilfri tur!':'I mål!');
  $('rTime').textContent=fmtTime(tt);$('rPenL').textContent=hopp?'Poeng':'Straff';$('rPen').textContent=hopp?run.points:'+'+run.pen+' s';$('rGatesL').textContent='Porter';$('rGates').textContent=run.passed+'/'+(k.gates.length-1);
  $('rStars').innerHTML=[0,1,2].map(i=>`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l2.9 6.6 7.1.6-5.4 4.7 1.6 7-6.2-3.7-6.2 3.7 1.6-7L2 9.2l7.1-.6z" fill="${i<stars?'#E5A92B':'rgba(242,232,208,.15)'}"/></svg>`).join('');$('rStars').setAttribute('aria-label',stars+' av 3 stjerner');
  const items=[];if(run.missed)items.push(`<li><b>${run.missed} bom:</b> +${run.missed*5} sekunder</li>`);if(run.crashes)items.push(`<li><b>${run.crashes} fall:</b> tilbake til forrige port</li>`);
  if(run.jumps.length)items.push(`<li><b>${run.jumps.length} hopp,</b> lengste ${Math.max(...run.jumps.map(j=>j.air)).toFixed(1).replace('.',',')} s i lufta${run.jumps.some(j=>j.spins)?', '+run.jumps.filter(j=>j.spins).map(j=>j.spins*360+'°').join(' og '):''}</li>`);
  items.push(`<li><b>Toppfart:</b> ${Math.round(run.top*9)} km/t</li>`);
  if(!hopp)items.push(`<li><b>Mål for stjerner:</b> ${fmtTime(par[0])} uten bom gir tre, ${fmtTime(par[1])} gir to</li>`);else items.push(`<li><b>Mål for stjerner:</b> ${par[0]} poeng gir tre, ${par[1]} gir to. Snurr 360° i lufta for +150</li>`);
  if(isBest&&prev)items.push('<li><b>Ny personlig rekord i denne løypa.</b></li>');
  $('rLog').innerHTML=items.join('');$('rNuts').textContent='+'+fmtN(e);$('rNutsNote').textContent=el.join(' · ');
  $('rNext').textContent='Velg ny nedfart';$('rRetry').textContent='Prøv igjen';$('rMenu').textContent='Tilbake til bilen';$('rGarage').hidden=true;
  SKI.result=true;setTimeout(()=>{if(SKI.result&&SKI.phase==='done'){$('result').hidden=false;$('rRetry').focus()}},1100);toast('Mål! '+fmtTime(tt))}
function skiCloseResult(){SKI.result=false;$('result').hidden=true;$('rGarage').hidden=false;$('rMenu').textContent='Til menyen';$('rPenL').textContent='Straff';$('rGatesL').textContent='Porter'}
function skiResultBtn(b){if(!SKI.result)return false;skiCloseResult();if(b==='next')skiToTop();else if(b==='retry')skiPick(SKI.k.id);else skiExit();return true}

/* ---------- grooves the skis cut in the snow ---------- */
const GRV_N=900,grvGeo=new THREE.PlaneGeometry(.045,.3);grvGeo.rotateX(-Math.PI/2);
const grooves=new THREE.InstancedMesh(grvGeo,new THREE.MeshBasicMaterial({color:LIN('#8fa6b8'),transparent:true,opacity:.32,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-3,polygonOffsetUnits:-3}),GRV_N);
grooves.count=0;grooves.frustumCulled=false;grooves.renderOrder=1;scene.add(grooves);let grvI=0;
function layGroove(w,dx,dz){if(!w.lastTrk)w.lastTrk=new V3(1e9,0,1e9);if(w.lastTrk.distanceTo(w.P)<.2)return;w.lastTrk.copy(w.P);normalAt(w.P.x,w.P.z,_nT);_pT.copy(w.P).addScaledVector(_nT,.012);
  _qN.setFromUnitVectors(YAX,_nT);_qY.setFromAxisAngle(YAX,Math.atan2(dx,dz));_qN.multiply(_qY);_sT.set(1,1,1);_m4.compose(_pT,_qN,_sT);grooves.setMatrixAt(grvI,_m4);grvI=(grvI+1)%GRV_N;grooves.count=Math.max(grooves.count,grvI||GRV_N);grooves.instanceMatrix.needsUpdate=true}

/* ---------- every frame ---------- */
function skiKeyDown(k){if(SKI.fade)return;
  if(SKI.result)return;
  if(k==='escape'||k==='p'){if(SKI.phase==='run'||SKI.phase==='count'||SKI.phase==='lift')openAsk('skiPause');return}
  if(SKI.phase==='lift'&&(k==='enter'||k===' ')){SKI.phase='skip';fadeTo(()=>skiArrive());return}
  if(k==='c'){SKI.cam=(SKI.cam+1)%2;toast(SKI.cam?'Kamera: langt bak':'Kamera: nært');SKI.camSnap=true}
  if(k==='m')setSound(!state.sound)}
function skiArrive(){SKI.phase='top';const L=LIFT.L,x=L.bx+L.ux*1.6,z=L.bz+L.uz*1.6;placeSkier(SKI.s,x,z,Math.atan2(L.ux,L.uz));SKI.camSnap=true;$('sName').textContent='Toppen';openAsk('skiPick')}
const _sp=new V3(),_sq=new Q4(),_se=new THREE.Euler();
function updateSki(dt){if(!SKI.on)return;
  // fades: dark, then the change, then light again
  if(SKI.fade){const f=SKI.fade;f.t+=dt;if(f.t>.9&&!f.done){f.done=true;f.cb()}if(f.t>.9+f.hold){$('fade').classList.remove('on');SKI.fade=null}}
  if(SKI.help>0){SKI.help-=dt;if(SKI.help<=0)$('sHelp').hidden=true}
  const s=SKI.s,v=SKI.vis,inp=state.inp||{gas:0,rev:0,steer:0,jump:false},act=state.mode==='ski';
  if(SKI.phase==='lift'&&act){SKI.ride=LIFT.u;const L=LIFT.L;
    for(const n of L.nodes)if(n.d>SKI.lastNode+.01&&SKI.ride>=n.d&&n.d>0&&n.d<L.len){SKI.lastNode=n.d;skiTick()}
    if(SKI.ride>=L.len-.25){SKI.phase='skip';fadeTo(()=>skiArrive(),.1)}}
  if(SKI.phase==='count'&&act&&!SKI.fade){SKI.count-=dt;const n=Math.ceil(SKI.count-.2);const el=$('count');
    if(n<SKI.beat&&n>=1){SKI.beat=n;el.hidden=false;el.textContent=String(n);el.style.animation='none';void el.offsetWidth;el.style.animation='';skiBeep(640,.12)}
    if(SKI.count<=0){SKI.phase='run';const st=SKI.k.start.tan;SKI.s.vel.set(st.x*1.6,0,st.z*1.6);el.textContent='KJØR!';skiBeep(980,.35);clearTimeout(el._t);el._t=setTimeout(()=>{el.hidden=true},900)}}
  if((SKI.phase==='run'||SKI.phase==='done')&&act){const run=SKI.run,k=SKI.k,jump=inp.jump&&!SKI.jumpPrev;SKI.jumpPrev=inp.jump;
    const auto=SKI.phase==='done',I={steer:auto?0:inp.steer,gas:auto?0:inp.gas,brake:auto?1:inp.rev,jump:!auto&&jump};
    SKI.acc+=dt;let n=0;const p1={x:s.pos.x,z:s.pos.z};
    while(SKI.acc>=FIXED&&n<20){stepSkier(s,I,FIXED,{assist:state.assist});I.jump=false;SKI.acc-=FIXED;n++;
      for(const e of s.ev)skiEvent(e);s.ev.length=0;
      if(!auto)for(const e of skiGates(run,p1,s.pos))skiGateEvent(e);p1.x=s.pos.x;p1.z=s.pos.z;if(SKI.phase!=='run'&&!auto)break}
    if(n>=20)SKI.acc=0;
    if(!auto){run.time+=dt;run.top=Math.max(run.top||0,s.speed)}
    if(s.crashT>1.3){if(!auto){const cp=run.cp;placeSkier(s,cp.x,cp.z,cp.h);SKI.camSnap=true}else{s.crashT=0;s.vel.set(0,0,0)}}
    // snow spray when the edges bite or the plough brakes, tracks in the snow
    if(!s.air&&s.crashT===0&&(s.skid>.9||(s.plow>.5&&s.speed>1.2))&&Math.random()<dt*40){_sp.copy(s.pos);spawnDust(_sp,99,s.skid>2)}
    if(!s.air&&s.crashT===0&&s.speed>.4&&tracks.visible){const dx=Math.sin(s.head),dz=Math.cos(s.head);for(let i=0;i<2;i++){const w=SKI.tracks[i],sd=i?-.075:.075;w.P.set(s.pos.x+dz*sd,s.pos.y,s.pos.z-dx*sd);layGroove(w,dx,dz)}}
    // the HUD
    $('sTime').textContent=fmtTime(run.time);$('sGate').textContent=Math.min(run.passed,k.gates.length-1)+'/'+(k.gates.length-1);$('sPen').textContent=k.kind==='hopp'?String(run.points):run.pen+' s';$('sSpeed').textContent=Math.round(s.speed*9)+' km/t';
    if(auto){SKI.t+=dt}}
  // the skier's place and pose
  if(v&&v.root.visible){
    if(SKI.phase==='lift'||(SKI.phase==='skip'&&SKI.fade)){const c=riderChair();c.g.updateMatrixWorld(true);v.root.position.set(.24,-LIFT.L.hang+.03,.06);c.sw.add(v.root);v.root.rotation.set(0,0,0);v.body.rotation.set(0,0,0);poseSkier(v,0,0,0,true)}
    else{if(v.root.parent!==scene)scene.add(v.root);const dx=Math.sin(s.head),dz=Math.cos(s.head);
      const slope=s.air?Math.atan2(s.vy,Math.max(1,s.speed))*.6:Math.atan2(H(s.pos.x+dx*.3,s.pos.z+dz*.3)-H(s.pos.x-dx*.3,s.pos.z-dz*.3),.6);
      const lean=s.air?0:Math.max(-.55,Math.min(.55,-inp.steer*Math.min(1,s.speed/5)*.5*(SKI.phase==='run'?1:0)));
      v.root.position.copy(s.pos);v.root.position.y-=s.land*.03;v.root.rotation.set(-slope,s.head,0,'YXZ');
      if(s.crashT>0){const k2=Math.min(1,s.crashT*3);v.body.rotation.set(-k2*1.2,0,k2*1.3);poseSkier(v,1,0,0,false)}
      else{v.body.rotation.set(0,0,lean);const plant=inp.gas>.3&&s.speed<3.2&&!s.air&&SKI.phase==='run'?Math.sin(performance.now()*.012):0;poseSkier(v,Math.min(1,s.plow*.5+s.land+(s.air?.4:.15)),s.tuck,plant,false)}}}
  // the next gate glows
  if(SKI.phase==='run'&&SKI.run){const g=SKI.k.gates[SKI.run.next];if(g){beacon.visible=true;beacon.position.set(g.c.x,H(g.c.x,g.c.z),g.c.z);beacon.userData.ring.scale.setScalar(g.w/1.2*(1+.08*Math.sin(performance.now()*.005)))}else beacon.visible=false}else beacon.visible=false;
  arrow.visible=false;
  updateSkiSound(dt)}
function skiEvent(e){const run=SKI.run,s=SKI.s;if(!run)return;
  if(e.type==='crash'){run.crashes=(run.crashes||0)+1;toast(e.why+'! Tilbake til forrige port',true);ambThump(1);for(let i=0;i<10;i++)spawnDust(s.pos,99,true);landShake=.04}
  if(e.type==='land'){if(e.hard>3)ambThump(Math.min(1,e.hard/8));if(e.hard>4.5)landShake=Math.min(.04,e.hard*.005);for(let i=0;i<Math.min(10,e.hard*1.5|0);i++)spawnDust(s.pos,99,true);
    if(e.air>.35){run.jumps.push(e);if(SKI.k.kind==='hopp'){const p=skiJumpPoints(e.air,e.spins);run.points+=p;toast((e.spins?e.spins*360+'°! ':'Hopp! ')+e.air.toFixed(1).replace('.',',')+' s · +'+p+' poeng')}
      else if(e.air>.5)toast('Hopp! '+e.air.toFixed(1).replace('.',',')+' s')}}}
function skiGateEvent(e){const run=SKI.run,k=SKI.k;
  if(e.type==='gate'){ambGate();if(k.kind!=='slalom')toast('Port '+(e.i+1)+' ✓')}
  if(e.type==='miss'){toast('Bom på port '+(e.i+1)+' · +5 s',true);skiBeep(180,.25)}
  if(e.type==='finish'){skiBeep(1180,.25);setTimeout(()=>skiBeep(1480,.4),180);skiFinish()}}

/* ---------- the ski camera ---------- */
const _cA=new V3(),_cB=new V3();
function skiCamera(dt){const s=SKI.s;let snap=SKI.camSnap;SKI.camSnap=false;
  if(SKI.phase==='lift'||SKI.phase==='board'||(SKI.phase==='skip'&&SKI.fade&&!SKI.fade.done)){const L=LIFT.L,c=riderChair().g.position;
    _cA.set(c.x-L.ux*2.4-L.px*1.1,c.y-.15,c.z-L.uz*2.4-L.pz*1.1);_cB.set(c.x+L.ux*2.2,c.y-.6,c.z+L.uz*2.2);camera.fov=52}
  else if(SKI.phase==='top'&&state.mode==='ask'){const a=performance.now()*.00015;_cA.set(s.pos.x+Math.sin(a)*3.4,s.pos.y+1.6,s.pos.z+Math.cos(a)*3.4);_cB.copy(s.pos).add(_c2.set(0,.5,0));camera.fov=46}
  else{const sp=s.speed;let dx=Math.sin(s.head),dz=Math.cos(s.head);if(sp>1.2&&!s.air){const vx=s.vel.x/sp,vz=s.vel.z/sp;dx=dx*.35+vx*.65;dz=dz*.35+vz*.65;const l=Math.hypot(dx,dz)||1;dx/=l;dz/=l}
    if(s.air||s.crashT>0){dx=SKI.camDir?SKI.camDir.x:dx;dz=SKI.camDir?SKI.camDir.z:dz}SKI.camDir={x:dx,z:dz};
    const D=SKI.cam?4.6:2.5;_cA.set(s.pos.x-dx*D,s.pos.y+.75+D*.32,s.pos.z-dz*D);_cA.y=Math.max(_cA.y,H(_cA.x,_cA.z)+.45);_cB.set(s.pos.x+dx*1.4,s.pos.y+.3,s.pos.z+dz*1.4);camera.fov=56+Math.min(14,sp*1.6)}
  if(snap){camera.position.copy(_cA);SKI.look.copy(_cB)}else{const k=1-Math.exp(-dt*(SKI.phase==='lift'?6:5.5));camera.position.lerp(_cA,k);SKI.look.lerp(_cB,1-Math.exp(-dt*10))}
  camera.up.set(0,1,0);camera.lookAt(SKI.look);camera.updateProjectionMatrix()}

/* ---------- sounds: the swish of the skis, the scrape of the edges, the wind; beeps and ticks ---------- */
function skiSound(){if(SKI.snd||!AC||typeof noiseBuf!=='function')return SKI.snd;try{const ac=AC,buf=noiseBuf(ac),mk=(type,f,Q)=>{const fl=ac.createBiquadFilter();fl.type=type;fl.frequency.value=f;fl.Q.value=Q;const g=ac.createGain();g.gain.value=0;noiseSrc(ac,buf).connect(fl);fl.connect(g);g.connect(ac.destination);return{f:fl,g}};
  SKI.snd={swish:mk('bandpass',900,.9),scrape:mk('highpass',2800,.8),wind:mk('lowpass',420,.6)}}catch(e){SKI.snd=null}return SKI.snd}
function updateSkiSound(){const S_=skiSound();if(!S_)return;const t=AC.currentTime,s=SKI.s,on=state.sound&&SKI.on&&state.mode==='ski'&&(SKI.phase==='run'||SKI.phase==='done'),vol=state.volCar/70,set=(g,v)=>g.gain.setTargetAtTime(v,t,.08);
  if(!on){set(S_.swish.g,0);set(S_.scrape.g,0);set(S_.wind.g,SKI.on&&state.sound&&SKI.phase==='lift'?.03*vol:0);return}
  const sp=s.speed,gnd=!s.air&&s.crashT===0;S_.swish.f.frequency.setTargetAtTime(500+sp*150,t,.1);
  set(S_.swish.g,gnd?.07*Math.min(1,sp/6)*vol:0);set(S_.scrape.g,gnd?Math.min(.08,(Math.max(0,s.skid-.5)*.03+(s.surf===S.ICE?.025*Math.min(1,sp/4):0)+s.plow*.03*Math.min(1,sp/3)))*vol:0);
  set(S_.wind.g,(.012+.05*Math.min(1,sp/8))*vol*(s.air?1.6:1))}
function skiSoundOff(){if(!SKI.snd||!AC)return;const t=AC.currentTime;for(const k in SKI.snd)SKI.snd[k].g.gain.setTargetAtTime(0,t,.1)}
function skiBeep(f,d){if(!AC||!state.sound)return;const t=AC.currentTime,o=AC.createOscillator(),g=AC.createGain();o.type='triangle';o.frequency.value=f;o.connect(g);g.connect(AC.destination);const v=.08*state.volAmb/70;
  g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(v,t+.01);g.gain.setValueAtTime(v,t+d*.7);g.gain.linearRampToValueAtTime(0,t+d);o.start(t);o.stop(t+d+.02)}
function skiTick(){if(!AC||!state.sound)return;const t=AC.currentTime;for(const dd of[0,.09]){const o=AC.createOscillator(),g=AC.createGain();o.type='square';o.frequency.value=140;o.connect(g);g.connect(AC.destination);g.gain.setValueAtTime(.03*state.volAmb/70,t+dd);g.gain.exponentialRampToValueAtTime(.0005,t+dd+.06);o.start(t+dd);o.stop(t+dd+.07)}}

// the level is (re)built: the chairlift and the gates of the pistes
function buildSki(lv){LIFT=null;grooves.count=0;grvI=0;if(SKI.vis&&SKI.vis.root.parent&&SKI.vis.root.parent!==scene)scene.add(SKI.vis.root);if(SKI.vis)SKI.vis.root.visible=false;SKI.on=false;buildLift(lv);buildPisteGates(lv)}
