'use strict';
/* Dyr for tre miljøer, med samme prefiks som vegetasjonen: jungel_*, subtrop_*, arktis_*.
   Hvert dyr har dyr:true og en retning-parameter (radianer; 0 betyr at dyret ser langs +x). Uten retning blir den tilfeldig.
   Forutsetninger om motoren:
   - PG.blob er en enhetskule, så sx/sy/sz er halvakser.
   - out.add tar også imot rotasjonen fra stemBetween når geometrien er PG.blob: kula sentreres mellom de to punktene
     og får halvakse lik avstanden. DYR.el bruker det til avlange, skråstilte kroppsdeler.
   - PM.pels (matt) brukes til pels og fjær, PM.glatt (blank) til øyne, nebb, klør og hud. Se js/props.js. */

const DYR={
  M:{pels:PM.pels,glatt:PM.glatt},
  retning:{v:1,min:0,max:6.28,step:.05,navn:'Retning'},
  // lokal ramme: f = fremover, u = opp, s = sideveis. P gir verdenspunkt, V gir enhetsvektor.
  ramme(x,z,y0,a){const ca=Math.cos(a),sa=Math.sin(a);
    return{P:(f,u,s)=>({x:x+ca*f-sa*s,y:y0+u,z:z+sa*f+ca*s}),
      V:(f,u,s)=>{const l=Math.hypot(f,u,s)||1;return{x:(ca*f-sa*s)/l,y:u/l,z:(sa*f+ca*s)/l}}}},
  // ellipsoide med senter p, halvakse L langs retningen d og r på tvers
  el(out,m,c,p,d,L,r){const h=L/2;out.add(PG.blob,m,stemBetween({x:p.x-d.x*h,y:p.y-d.y*h,z:p.z-d.z*h},{x:p.x+d.x*h,y:p.y+d.y*h,z:p.z+d.z*h},r,{c}))},
  // kule med lik bredde i x og z (trygg uansett retning)
  kule(out,m,c,p,r,ry){out.add(PG.blob,m,{x:p.x,y:p.y,z:p.z,sx:r,sy:ry??r,sz:r,c})},
  ledd(out,m,c,a,b,r){out.add(DG.branch,m,stemBetween(a,b,r,{c}))},
  // myk kjede av ellipsoider gjennom punktene (haler, halser, kropper som bøyer seg); rf(f) gir radius, f = 0..1
  polse(out,m,c,pts,rf){const n=pts.length-1;for(let i=0;i<n;i++){const a=pts[i],b=pts[i+1],dx=b.x-a.x,dy=b.y-a.y,dz=b.z-a.z,l=Math.hypot(dx,dy,dz)||1e-6;
    DYR.el(out,m,typeof c==='function'?c(i):c,{x:(a.x+b.x)/2,y:(a.y+b.y)/2,z:(a.z+b.z)/2},{x:dx/l,y:dy/l,z:dz/l},l*.6,rf(n>1?i/(n-1):0))}},
  // øye på siden med fortegn s: iris (eller helt mørkt øye), pupill og lysglimt
  oye(out,F,f,u,s,r,iris){const sg=Math.sign(s)||1;
    DYR.kule(out,DYR.M.glatt,iris||'#1a1410',F.P(f,u,s),r);
    if(iris)DYR.kule(out,DYR.M.glatt,'#0d0b09',F.P(f+r*.3,u,s+sg*r*.55),r*.6);
    DYR.kule(out,DYR.M.glatt,'#ffffff',F.P(f+r*.45,u+r*.45,s+sg*r*.7),r*.25)},
  // punkt på en ellipsoide langs f: senter (cf,cu), halvakser L og r; x = -1..1 langs kroppen, phi = 0 rett opp, ±π/2 sidene
  flate(F,cf,cu,L,r,x,phi,ut){const q=Math.sqrt(Math.max(0,1-x*x))*r*(ut||1);return F.P(cf+x*L,cu+Math.cos(phi)*q,Math.sin(phi)*q)},
  // Bézier-kurve gjennom lokale kontrollpunkter [f,u,s]
  bue(F,ctrl,n){const pts=[];for(let i=0;i<=n;i++){const t=i/n;let p=ctrl.map(v=>v.slice());
    while(p.length>1){const q=[];for(let j=0;j<p.length-1;j++)q.push(p[j].map((v,k)=>v+(p[j+1][k]-v)*t));p=q}pts.push(F.P(p[0][0],p[0][1],p[0][2]))}return pts},
  blend(a,b,t){const pa=parseInt(a.slice(1),16),pb=parseInt(b.slice(1),16),m=sh=>Math.round(((pa>>sh)&255)*(1-t)+((pb>>sh)&255)*t);
    return'#'+((1<<24)|(m(16)<<16)|(m(8)<<8)|m(0)).toString(16).slice(1)}
};

/* ================= JUNGEL ================= */

/* Jaguar: kraftig kropp med skuldre og hofter, rosetter med lys kjerne, lys buk og hake, svarte ørebaksider,
   gule øyne, værhår og hale med mørke ringer mot tuppen. Svart variant gir svak, «spøkelsesaktig» rosett. */
PROPS.jungel_jaguar={dyr:true,
  navn:'Jaguar (jungel)',info:'Kraftig storkatt med rosetter i pelsen. c.plant(\'jungel_jaguar\',x,z,{s})',
  params:{
    s:{v:1,min:.5,max:1.6,step:.05,navn:'Størrelse'},
    retning:DYR.retning,
    svart:{v:0,min:0,max:1,step:1,navn:'Svart variant'},
    hale:{v:1,min:0,max:2,step:.05,navn:'Halesving'}
  },
  place(x,z,o,env){const p=propParams('jungel_jaguar',o,env.rng);env.colliders.push({x,z,r:.35*p.s,anchor:false,y:env.H(x,z)+.6*p.s});return Object.assign({x,z},p)},
  build(t,env,out){const R=env.rng,s=t.s,M=DYR.M,F=DYR.ramme(t.x,t.z,footY(env.H,t.x,t.z,.4*s),t.retning),P=F.P,V=F.V,sv=t.svart>=.5;
    const pels=sv?shade('#2b2723',(R()-.5)*.05):shade('#d6a03e',(R()-.5)*.08),lys=sv?'#3a342e':'#efdfbc',fl=sv?'#141210':'#2a1d12',kjerne=sv?'#24201c':'#b8822e',bh=.55*s;
    // kropp, lys buk, skuldre og hofter
    DYR.el(out,M.pels,pels,P(0,bh,0),V(1,0,0),.5*s,.2*s);
    DYR.el(out,M.pels,lys,P(.02*s,bh-.07*s,0),V(1,0,0),.4*s,.15*s);
    DYR.kule(out,M.pels,pels,P(.3*s,bh+.01*s,0),.19*s,.21*s);
    DYR.kule(out,M.pels,pels,P(-.32*s,bh+.01*s,0),.18*s,.19*s);
    // hals og hode
    DYR.el(out,M.pels,pels,P(.47*s,bh+.07*s,0),V(1,.6,0),.15*s,.13*s);
    const hf=.62*s,hu=bh+.15*s;
    DYR.kule(out,M.pels,pels,P(hf,hu,0),.13*s,.115*s);
    DYR.el(out,M.pels,sv?pels:'#e9d7ad',P(hf+.1*s,hu-.04*s,0),V(1,-.25,0),.07*s,.065*s); // snute
    DYR.el(out,M.pels,lys,P(hf+.07*s,hu-.09*s,0),V(1,-.1,0),.06*s,.045*s); // hake
    DYR.kule(out,M.glatt,sv?'#1a1715':'#7a4040',P(hf+.165*s,hu-.025*s,0),.024*s,.018*s); // nese
    DYR.ledd(out,M.glatt,fl,P(hf+.165*s,hu-.04*s,0),P(hf+.15*s,hu-.075*s,0),.004*s); // fure under nesen
    for(const sg of[-1,1]){
      DYR.kule(out,M.pels,pels,P(hf-.03*s,hu+.11*s,sg*.08*s),.045*s,.045*s); // øre
      DYR.kule(out,M.pels,fl,P(hf-.05*s,hu+.115*s,sg*.085*s),.032*s,.035*s); // svart bakside
      DYR.kule(out,M.pels,lys,P(hf-.012*s,hu+.105*s,sg*.075*s),.025*s,.028*s); // lyst innside
      DYR.oye(out,F,hf+.095*s,hu+.03*s,sg*.06*s,.022*s,'#c9a227');
      DYR.kule(out,M.pels,lys,P(hf+.075*s,hu+.055*s,sg*.055*s),.018*s,.01*s); // lys flekk over øyet
      for(let i=0;i<3;i++)DYR.ledd(out,M.glatt,'#f4efe2',P(hf+.13*s,hu-.035*s,sg*.04*s),P(hf+.16*s,hu-.06*s+i*.025*s,sg*.17*s),.0025*s); // værhår
    }
    // bein og poter
    for(const sg of[-1,1]){const ss=sg*.11*s;
      DYR.ledd(out,M.pels,pels,P(.33*s,bh-.08*s,ss),P(.35*s,.2*s,ss),.065*s);
      DYR.ledd(out,M.pels,pels,P(.35*s,.2*s,ss),P(.37*s,.04*s,ss),.05*s);
      DYR.kule(out,M.pels,pels,P(.4*s,.035*s,ss),.06*s,.035*s);
      for(let i=0;i<4;i++)DYR.kule(out,M.pels,lys,P(.445*s,.022*s,ss+(i-1.5)*.022*s),.013*s,.012*s); // tær
      DYR.el(out,M.pels,pels,P(-.33*s,bh-.12*s,ss),V(.35,-1,0),.17*s,.1*s); // lår
      DYR.ledd(out,M.pels,pels,P(-.28*s,.25*s,ss),P(-.38*s,.12*s,ss),.05*s);
      DYR.ledd(out,M.pels,pels,P(-.38*s,.12*s,ss),P(-.34*s,.035*s,ss),.045*s);
      DYR.kule(out,M.pels,pels,P(-.31*s,.035*s,ss),.055*s,.035*s);
      for(let i=0;i<3;i++)DYR.kule(out,M.pels,fl,P(.35*s,(.12+i*.08)*s,ss+sg*.05*s),.014*s); // flekker på forbeina
    }
    // hale med mørke ringer og mørk tupp
    const hs=t.hale,tp=DYR.bue(F,[[-.5*s,bh+.05*s,0],[-.8*s,bh-.05*s,.05*s*hs],[-.95*s,.12*s,.15*s*hs],[-1.05*s,.25*s+.15*s*hs,.25*s*hs]],8);
    DYR.polse(out,M.pels,i=>i>=7||i===5?fl:pels,tp,f=>(.045-.015*f)*s);
    // rosetter: mørk ring med lysere kjerne, på kroppen og over skuldre og hofter
    for(let i=0;i<34;i++){const x=R()*1.8-.9,phi=(R()-.5)*3.6;
      DYR.kule(out,M.pels,fl,DYR.flate(F,0,bh,.5*s,.2*s,x,phi,1),.03*s);
      DYR.kule(out,M.pels,kjerne,DYR.flate(F,0,bh,.5*s,.2*s,x,phi,1.07),.018*s)}
    for(const [cf,r] of[[.3,.19],[-.32,.18]])for(let i=0;i<7;i++){const x=R()*1.6-.8,phi=(R()-.5)*3.4;
      DYR.kule(out,M.pels,fl,DYR.flate(F,cf*s,bh+.01*s,r*s,r*s*1.08,x,phi,1),.026*s);
      DYR.kule(out,M.pels,kjerne,DYR.flate(F,cf*s,bh+.01*s,r*s,r*s*1.08,x,phi,1.07),.015*s)}
    for(let i=0;i<7;i++)DYR.kule(out,M.pels,fl,DYR.flate(F,hf,hu,.13*s,.115*s,R()*.9-.6,(R()-.5)*2,1),.012*s); // prikker på hodet
  }
};

/* Tukan: svart kropp, gul strupe med lys kant, rødt under halen, turkis hud rundt øyet
   og enormt nebb i gult, oransje og grønt med rød spiss. Sitter på en stubbe med sittegrein. */
PROPS.jungel_tukan={dyr:true,
  navn:'Tukan (jungel)',info:'Fugl med enormt, fargerikt nebb, sitter på en stubbe. c.plant(\'jungel_tukan\',x,z,{s})',
  params:{
    s:{v:1,min:.5,max:2,step:.05,navn:'Størrelse'},
    retning:DYR.retning,
    nebb:{v:1,min:.6,max:1.4,step:.05,navn:'Nebblengde'},
    stubbe:{v:1,min:0,max:1,step:1,navn:'Stubbe'}
  },
  place(x,z,o,env){const p=propParams('jungel_tukan',o,env.rng);if(p.stubbe>=.5)env.colliders.push({x,z,r:.06*p.s,anchor:true,y:env.H(x,z)+.9*p.s});return Object.assign({x,z},p)},
  build(t,env,out){const R=env.rng,s=t.s,M=DYR.M,F=DYR.ramme(t.x,t.z,footY(env.H,t.x,t.z,.06*s),t.retning),P=F.P,V=F.V;
    let yb=.02*s;
    if(t.stubbe>=.5){const bark=shade('#5a4632',(R()-.5)*.1),h=.9*s;
      DYR.ledd(out,DM.bark,bark,P(0,-.05*s,0),P(.03*s,h,0),.055*s);
      DYR.ledd(out,DM.bark,bark,P(-.22*s,h-.02*s,0),P(.25*s,h+.01*s,0),.028*s); // sittegrein
      DYR.ledd(out,DM.bark,bark,P(.02*s,h*.6,0),P(.12*s,h*.75,.12*s),.018*s); // kvist
      DYR.kule(out,M.pels,'#4f9a36',P(.13*s,h*.77,.13*s),.045*s,.012*s);
      yb=h+.03*s}
    const blk=shade('#141416',(R()-.5)*.04);
    DYR.el(out,M.pels,blk,P(-.03*s,yb+.14*s,0),V(.3,1,0),.15*s,.085*s); // kropp
    DYR.el(out,M.pels,'#f4d43a',P(.04*s,yb+.2*s,0),V(.3,1,0),.075*s,.06*s); // gul strupe
    DYR.el(out,M.pels,'#fbf3d2',P(.06*s,yb+.25*s,0),V(.3,1,0),.035*s,.045*s); // lys kant mot nebbet
    for(const sg of[-1,1])DYR.el(out,M.pels,'#1d1d22',P(-.06*s,yb+.13*s,sg*.062*s),V(.2,1,0),.13*s,.04*s); // vinger
    DYR.el(out,M.pels,blk,P(-.13*s,yb-.06*s,0),V(-.3,-1,0),.12*s,.035*s); // hale
    DYR.kule(out,M.pels,'#d0302a',P(-.07*s,yb+.01*s,0),.035*s,.03*s); // rødt under halen
    const hf=.04*s,hu=yb+.31*s;DYR.kule(out,M.pels,blk,P(hf,hu,0),.07*s,.065*s);
    for(const sg of[-1,1]){DYR.kule(out,M.glatt,'#4ab8a8',P(hf+.035*s,hu+.008*s,sg*.045*s),.028*s); // turkis hud
      DYR.oye(out,F,hf+.04*s,hu+.01*s,sg*.066*s,.014*s)}
    // nebb
    const L=.2*s*t.nebb,b0=hf+.06*s;
    DYR.kule(out,M.glatt,'#20281a',P(b0,hu,0),.048*s); // mørk nebbrot
    DYR.el(out,M.glatt,'#e8c43a',P(b0+L*.5,hu-L*.03,0),V(1,-.18,0),L*.5,.045*s); // overnebb
    DYR.el(out,M.glatt,'#e8782a',P(b0+L*.45,hu+.026*s-L*.03,0),V(1,-.15,0),L*.42,.022*s); // oransje rygg
    DYR.el(out,M.glatt,'#8ab83a',P(b0+L*.45,hu-.03*s-L*.05,0),V(1,-.28,0),L*.4,.03*s); // grønt undernebb
    DYR.kule(out,M.glatt,'#c8302a',P(b0+L*.96,hu-L*.12,0),.026*s,.022*s); // rød spiss
    // tær rundt greina, to frem og to bak
    for(const sg of[-1,1]){const ss=sg*.03*s;DYR.ledd(out,M.glatt,'#6a7a9a',P(-.03*s,yb+.03*s,ss),P(.02*s,yb-.005*s,ss),.008*s);
      DYR.ledd(out,M.glatt,'#6a7a9a',P(-.03*s,yb+.03*s,ss),P(-.07*s,yb-.005*s,ss),.008*s)}
  }
};

/* Pilgiftfrosk: blank hud i tre fargevarianter, svarte flekker eller striper, store øyne,
   tynne bein med tåputer. Sitter på et blad med nerver og stilk. */
PROPS.jungel_giftfrosk={dyr:true,
  navn:'Pilgiftfrosk (jungel)',info:'Liten giftig frosk i sterke farger, sitter på et blad. c.plant(\'jungel_giftfrosk\',x,z,{s})',
  params:{
    s:{v:1,min:.5,max:3,step:.05,navn:'Størrelse'},
    retning:DYR.retning,
    farge:{v:0,min:0,max:2,step:1,navn:'Farge (blå/gul/rød)'},
    blad:{v:1,min:0,max:1,step:1,navn:'Blad'}
  },
  FARGER:[{kropp:'#2a6ad8',flekk:'#0e1424',bein:'#1f4fb0'},{kropp:'#f2d020',flekk:'#141414',bein:'#e0b818'},{kropp:'#d8302a',flekk:'#1a0c0c',bein:'#2a4ab8'}],
  place(x,z,o,env){return Object.assign({x,z},propParams('jungel_giftfrosk',o,env.rng))},
  build(t,env,out){const R=env.rng,s=t.s,M=DYR.M,F=DYR.ramme(t.x,t.z,footY(env.H,t.x,t.z,.15*s),t.retning),P=F.P,V=F.V,C=this.FARGER[Math.round(t.farge)]||this.FARGER[0];
    let yb=0;
    if(t.blad>=.5){const g=shade('#3f8a3a',(R()-.5)*.1),nerve=shade(g,.15);
      DYR.kule(out,M.pels,g,P(-.06*s,.008*s,0),.12*s,.007*s);DYR.kule(out,M.pels,g,P(.07*s,.008*s,0),.1*s,.007*s);DYR.kule(out,M.pels,g,P(.17*s,.008*s,0),.05*s,.006*s);
      DYR.ledd(out,M.glatt,nerve,P(-.17*s,.015*s,0),P(.21*s,.015*s,0),.004*s); // midtnerve
      for(let i=0;i<4;i++){const f=(-.12+i*.08)*s;for(const sg of[-1,1])DYR.ledd(out,M.glatt,nerve,P(f,.015*s,0),P(f+.05*s,.015*s,sg*.075*s),.0025*s)}
      DYR.ledd(out,DM.bark,'#5a6a2a',P(-.17*s,.012*s,0),P(-.25*s,.002*s,0),.006*s); // stilk
      yb=.016*s}
    const k=C.kropp,cu=yb+.035*s;
    DYR.el(out,M.glatt,k,P(0,cu,0),V(1,.3,0),.055*s,.035*s); // kropp
    DYR.kule(out,M.glatt,k,P(.05*s,yb+.045*s,0),.033*s,.026*s); // hode
    DYR.el(out,M.glatt,k,P(.075*s,yb+.04*s,0),V(1,-.3,0),.015*s,.02*s); // snute
    DYR.ledd(out,M.glatt,C.flekk,P(.09*s,yb+.035*s,0),P(.06*s,yb+.03*s,0),.0025*s); // munnlinje
    for(const sg of[-1,1]){
      DYR.kule(out,M.glatt,k,P(.06*s,yb+.06*s,sg*.022*s),.014*s); // øyekuler
      DYR.oye(out,F,.064*s,yb+.064*s,sg*.028*s,.011*s);
      // forbein med tre tær og tåputer
      DYR.ledd(out,M.glatt,C.bein,P(.04*s,yb+.03*s,sg*.025*s),P(.055*s,yb+.015*s,sg*.045*s),.007*s);
      DYR.ledd(out,M.glatt,C.bein,P(.055*s,yb+.015*s,sg*.045*s),P(.07*s,yb+.004*s,sg*.05*s),.006*s);
      for(let i=0;i<3;i++){const e=P(.085*s,yb+.003*s,sg*(.04+i*.012)*s);DYR.ledd(out,M.glatt,C.bein,P(.07*s,yb+.004*s,sg*.05*s),e,.0025*s);DYR.kule(out,M.glatt,C.bein,e,.004*s,.003*s)}
      // bakbein, sammenbrettet: lår, legg og lang fot
      DYR.el(out,M.glatt,C.bein,P(-.02*s,yb+.025*s,sg*.045*s),V(.045,-.01,sg*.03),.03*s,.014*s);
      DYR.ledd(out,M.glatt,C.bein,P(.005*s,yb+.018*s,sg*.06*s),P(-.05*s,yb+.008*s,sg*.065*s),.007*s);
      DYR.ledd(out,M.glatt,C.bein,P(-.05*s,yb+.008*s,sg*.065*s),P(-.015*s,yb+.003*s,sg*.085*s),.005*s);
      for(let i=0;i<3;i++){const e=P(.005*s,yb+.003*s,sg*(.075+i*.012)*s);DYR.ledd(out,M.glatt,C.bein,P(-.015*s,yb+.003*s,sg*.085*s),e,.0025*s);DYR.kule(out,M.glatt,C.bein,e,.004*s,.003*s)}
    }
    // mønster: striper for gul variant, flekker ellers
    if(Math.round(t.farge)===1){for(const phi of[-.8,0,.8])DYR.el(out,M.glatt,C.flekk,DYR.flate(F,0,cu,.055*s,.035*s,0,phi,1),V(1,.3,0),.05*s,.008*s)}
    else for(let i=0;i<14;i++)DYR.kule(out,M.glatt,C.flekk,DYR.flate(F,0,cu,.055*s,.035*s,R()*1.6-.8,(R()-.5)*2.6,1),(.006+R()*.005)*s);
  }
};

/* Dovendyr: henger opp ned under en grein med lange armer og krumme klør, algegrønn pels med totter,
   lys ansiktsmaske med mørke øyestriper og et lite smil. Kan ha en unge på magen. */
PROPS.jungel_dovendyr={dyr:true,
  navn:'Dovendyr (jungel)',info:'Henger opp ned fra en grein, med algegrønn pels. c.plant(\'jungel_dovendyr\',x,z,{s})',
  params:{
    s:{v:1,min:.5,max:1.6,step:.05,navn:'Størrelse'},
    retning:DYR.retning,
    alger:{v:.5,min:0,max:1,step:.05,navn:'Alger i pelsen'},
    unge:{v:0,min:0,max:1,step:1,navn:'Unge på magen'}
  },
  place(x,z,o,env){const p=propParams('jungel_dovendyr',o,env.rng);env.colliders.push({x,z,r:.1*p.s,anchor:true,y:env.H(x,z)+1.3*p.s});return Object.assign({x,z},p)},
  build(t,env,out){const R=env.rng,s=t.s,M=DYR.M,F=DYR.ramme(t.x,t.z,footY(env.H,t.x,t.z,.6*s),t.retning),P=F.P,V=F.V;
    const bark=shade('#5a4632',(R()-.5)*.1),gy=1.3*s,gb=f=>gy-.01*s+(f+.7*s)*.06/1.42;
    // stativ: to skrå stolper og en tverrgrein med noen blader
    DYR.ledd(out,DM.bark,bark,P(-.55*s,-.05*s,.15*s),P(-.6*s,gb(-.6*s),0),.04*s);
    DYR.ledd(out,DM.bark,bark,P(.6*s,-.05*s,-.15*s),P(.62*s,gb(.62*s),0),.04*s);
    DYR.ledd(out,DM.bark,bark,P(-.7*s,gb(-.7*s),0),P(.72*s,gb(.72*s),0),.035*s);
    for(let i=0;i<5;i++){const f=(-.6+R()*1.2)*s;DYR.kule(out,M.pels,shade('#3f8a3a',(R()-.5)*.15),P(f,gb(f)+.045*s,(R()-.5)*.1*s),.06*s,.012*s)}
    const pels=shade(DYR.blend('#8a7a62','#6e7a4e',t.alger),(R()-.5)*.06),lys='#d8ccb0',mork='#3a2a1e',klo='#d8cba8',by=gy-.3*s;
    // kropp med pelstotter
    DYR.el(out,M.pels,pels,P(0,by,0),V(1,.08,0),.27*s,.14*s);
    for(let i=0;i<22;i++)DYR.kule(out,M.pels,shade(pels,(R()-.5)*.18),DYR.flate(F,0,by,.27*s,.14*s,R()*1.8-.9,R()*6.28,1),(.03+R()*.02)*s,(.02+R()*.015)*s);
    // hode med maske
    const hf=.3*s,hu=by-.02*s;
    DYR.kule(out,M.pels,pels,P(hf,hu,0),.1*s);
    DYR.kule(out,M.pels,lys,P(hf+.07*s,hu-.01*s,0),.07*s,.065*s);
    for(const sg of[-1,1]){DYR.el(out,M.pels,mork,P(hf+.1*s,hu+.002*s,sg*.042*s),V(-1,.2,sg*.5),.035*s,.016*s); // øyestripe
      DYR.oye(out,F,hf+.133*s,hu+.008*s,sg*.036*s,.011*s)}
    DYR.kule(out,M.glatt,mork,P(hf+.143*s,hu-.022*s,0),.02*s,.015*s); // nese
    DYR.el(out,M.glatt,mork,P(hf+.128*s,hu-.048*s,0),V(0,0,1),.02*s,.004*s); // smil
    // armer og bein opp til greina, med tre krumme klør hver
    for(const sg of[-1,1])for(const [sf,gf,r] of[[.17,.24,.045],[-.2,-.28,.05]]){const a=P(sf*s,by+.03*s,sg*.11*s),gf2=gf*s,g=P(gf2,gb(gf2)-.03*s,sg*.1*s);
      DYR.polse(out,M.pels,pels,[a,g],()=>r*s);DYR.kule(out,M.pels,shade(pels,-.05),g,.04*s);
      for(let i=0;i<3;i++){const ss=sg*.1*s+(i-1)*.018*s,m=P(gf2+.025*s,gb(gf2)+.045*s,ss);
        DYR.ledd(out,M.glatt,klo,P(gf2,gb(gf2)-.02*s,ss),m,.006*s);DYR.ledd(out,M.glatt,klo,m,P(gf2+.06*s,gb(gf2)+.015*s,ss),.004*s)}}
    // unge på magen (oppsiden, mot greina)
    if(t.unge>=.5){const uf=.05*s,uu=by+.15*s;DYR.kule(out,M.pels,shade(pels,.08),P(uf,uu,0),.08*s,.06*s);
      DYR.kule(out,M.pels,shade(pels,.08),P(uf+.1*s,uu+.015*s,0),.05*s);DYR.kule(out,M.pels,lys,P(uf+.135*s,uu+.012*s,0),.033*s,.03*s);
      for(const sg of[-1,1])DYR.oye(out,F,uf+.158*s,uu+.02*s,sg*.016*s,.006*s)}
    const pp=P(-.66*s,gb(-.66*s)+.035*s,0);env.perches.push({x:pp.x,y:pp.y,z:pp.z,kind:'top'})}
};

/* ================= SUBTROPISK ================= */

/* Flamingo: rosa kropp med dypere rosa vinger og svarte svingfjær, S-formet hals, knekt nebb med svart tupp,
   gule øyne, ledd på beina og svømmehud. Står gjerne på ett bein. */
PROPS.subtrop_flamingo={dyr:true,
  navn:'Flamingo (subtropisk)',info:'Rosa vadefugl på ett bein, med S-formet hals. c.plant(\'subtrop_flamingo\',x,z,{s})',
  params:{
    s:{v:1,min:.5,max:1.6,step:.05,navn:'Størrelse'},
    retning:DYR.retning,
    ettbein:{v:1,min:0,max:1,step:1,navn:'Står på ett bein'},
    farge:{v:.7,min:0,max:1,step:.05,navn:'Rosafarge'}
  },
  place(x,z,o,env){const p=propParams('subtrop_flamingo',o,env.rng);env.colliders.push({x,z,r:.12*p.s,anchor:false,y:env.H(x,z)+1.2*p.s});return Object.assign({x,z},p)},
  build(t,env,out){const R=env.rng,s=t.s,M=DYR.M,F=DYR.ramme(t.x,t.z,footY(env.H,t.x,t.z,.1*s),t.retning),P=F.P,V=F.V;
    const rosa=shade(DYR.blend('#f2d6d6','#f06a84',t.farge),(R()-.5)*.05),dyp=DYR.blend('#e8b0b0','#e0405e',t.farge),bein=DYR.blend('#d8b0b0','#e07a8a',t.farge),by=.85*s;
    DYR.el(out,M.pels,rosa,P(0,by,0),V(1,.12,0),.2*s,.105*s); // kropp
    DYR.el(out,M.pels,rosa,P(.1*s,by-.01*s,0),V(1,.6,0),.08*s,.08*s); // bryst
    for(const sg of[-1,1]){DYR.el(out,M.pels,dyp,P(-.03*s,by+.035*s,sg*.07*s),V(1,.05,0),.17*s,.05*s); // vinge
      DYR.el(out,M.pels,'#18181a',P(-.19*s,by+.035*s,sg*.06*s),V(-1,.25,-sg*.15),.07*s,.025*s)} // svarte svingfjær
    DYR.el(out,M.pels,rosa,P(-.22*s,by+.02*s,0),V(-1,.3,0),.06*s,.04*s); // hale
    for(let i=0;i<10;i++)DYR.kule(out,M.pels,shade(rosa,(R()-.5)*.12),DYR.flate(F,0,by,.2*s,.105*s,R()*1.6-.8,(R()-.5)*3,1),.025*s,.015*s); // fjærtotter
    // S-formet hals og hode
    const hf=.2*s,hu=by+.6*s,hp=DYR.bue(F,[[.16*s,by+.04*s,0],[.34*s,by+.2*s,0],[.0,by+.38*s,0],[.12*s,by+.62*s,0],[hf,hu,0]],12);
    DYR.polse(out,M.pels,rosa,hp,f=>(.035-.013*f)*s);
    DYR.kule(out,M.pels,rosa,P(hf,hu,0),.045*s,.04*s);
    DYR.el(out,M.glatt,'#f4dcd2',P(hf+.06*s,hu-.005*s,0),V(1,-.3,0),.04*s,.022*s); // lys del av nebbet
    DYR.el(out,M.glatt,'#151515',P(hf+.095*s,hu-.05*s,0),V(.4,-1,0),.035*s,.018*s); // knekt, svart tupp
    for(const sg of[-1,1]){DYR.kule(out,M.glatt,'#f4dcd2',P(hf+.035*s,hu,sg*.022*s),.02*s);DYR.oye(out,F,hf+.02*s,hu+.012*s,sg*.035*s,.009*s,'#f0c030')}
    // bein
    const foot=(f,ss)=>{DYR.kule(out,M.glatt,bein,P(f+.05*s,.008*s,ss),.04*s,.004*s); // svømmehud
      for(let i=0;i<3;i++)DYR.ledd(out,M.glatt,bein,P(f,.02*s,ss),P(f+.1*s,.006*s,ss+(i-1)*.03*s),.006*s)};
    const staa=(ss)=>{DYR.ledd(out,M.glatt,bein,P(0,by-.07*s,ss),P(.01*s,.45*s,ss),.011*s);DYR.kule(out,M.glatt,shade(bein,-.06),P(.01*s,.45*s,ss),.017*s);
      DYR.ledd(out,M.glatt,bein,P(.01*s,.45*s,ss),P(.02*s,.03*s,ss),.01*s);foot(.02*s,ss)};
    staa(.035*s);
    if(t.ettbein>=.5){const kn=P(.06*s,.58*s,-.04*s);DYR.ledd(out,M.glatt,bein,P(-.01*s,by-.07*s,-.035*s),kn,.011*s);DYR.kule(out,M.glatt,shade(bein,-.06),kn,.017*s);
      DYR.ledd(out,M.glatt,bein,kn,P(-.12*s,.72*s,-.05*s),.01*s);DYR.kule(out,M.glatt,bein,P(-.135*s,.73*s,-.05*s),.025*s,.018*s)}
    else staa(-.035*s);
  }
};

/* Landskilpadde: høyt skjold med midtplater, sideplater og kantplater (mørk kant og lysere kjerne),
   skjoldkant, stumpe bein med klør, skjellete hode med øyne og munnlinje. Hodet kan trekkes inn. */
PROPS.subtrop_skilpadde={dyr:true,
  navn:'Landskilpadde (subtropisk)',info:'Langsom skilpadde med høyt, mønstret skjold. c.plant(\'subtrop_skilpadde\',x,z,{s})',
  params:{
    s:{v:1,min:.4,max:2,step:.05,navn:'Størrelse'},
    retning:DYR.retning,
    hode:{v:1,min:0,max:1,step:1,navn:'Hodet ute'},
    alder:{v:.5,min:0,max:1,step:.05,navn:'Alder (mørkere skjold)'}
  },
  place(x,z,o,env){const p=propParams('subtrop_skilpadde',o,env.rng);env.colliders.push({x,z,r:.28*p.s,anchor:false,y:env.H(x,z)+.3*p.s});return Object.assign({x,z},p)},
  build(t,env,out){const R=env.rng,s=t.s,M=DYR.M,F=DYR.ramme(t.x,t.z,footY(env.H,t.x,t.z,.25*s),t.retning),P=F.P,V=F.V,yc=.12*s,rx=.26*s,ry=.2*s;
    const skjold=shade(DYR.blend('#a08850','#5e4a2e',t.alder),(R()-.5)*.06),kant=shade(skjold,-.14),kjerne=shade(skjold,.16),hud=shade('#8a8466',(R()-.5)*.06),hudm=shade(hud,-.12);
    // bein og klør
    for(const [f,sg] of[[.15,1],[.15,-1],[-.15,1],[-.15,-1]]){const g=P(f*s*1.1,.02*s,sg*.19*s);
      DYR.ledd(out,M.pels,hud,P(f*s,.09*s,sg*.17*s),g,.05*s);DYR.kule(out,M.pels,hud,g,.055*s,.025*s);
      for(let i=0;i<3;i++)DYR.kule(out,M.glatt,'#3a3428',P(f*s*1.1+Math.sign(f)*.045*s,.012*s,sg*.19*s+(i-1)*.022*s),.009*s,.007*s);
      for(let i=0;i<3;i++)DYR.kule(out,M.pels,hudm,P(f*s*1.05,(.04+i*.02)*s,sg*.21*s),.012*s,.008*s)} // skjell på beina
    // skjold og kant
    DYR.kule(out,M.pels,kant,P(0,.075*s,0),.28*s,.05*s);
    DYR.kule(out,M.pels,skjold,P(0,yc,0),rx,ry);
    const pt=(lat,lon,ut)=>P(Math.sin(lat)*Math.cos(lon)*rx*ut,yc+Math.cos(lat)*ry*ut,Math.sin(lat)*Math.sin(lon)*rx*ut);
    const plate=(lat,lon,r)=>{DYR.kule(out,M.pels,kant,pt(lat,lon,.99),r);DYR.kule(out,M.pels,kjerne,pt(lat,lon,1.06),r*.62)};
    for(const lat of[-.95,-.48,0,.48,.95])plate(lat,0,.085*s); // midtplater
    for(const sg of[-1,1])for(const lon of[.55,1.15,1.95,2.55])plate(.88,sg*lon,.09*s); // sideplater
    for(let i=0;i<18;i++)DYR.kule(out,M.pels,i%2?kant:shade(kant,.06),pt(1.38,i*.349,1),.045*s,.035*s); // kantplater
    // hode
    if(t.hode>=.5){DYR.polse(out,M.pels,hud,[P(.2*s,.08*s,0),P(.27*s,.1*s,0),P(.33*s,.125*s,0)],()=>.04*s);
      const hf=.37*s,hu=.135*s;DYR.kule(out,M.pels,hud,P(hf,hu,0),.05*s,.042*s);
      DYR.el(out,M.pels,hud,P(hf+.04*s,hu-.008*s,0),V(1,-.2,0),.025*s,.03*s); // snute
      DYR.ledd(out,M.glatt,'#2a2620',P(hf+.06*s,hu-.02*s,0),P(hf+.01*s,hu-.03*s,0),.003*s); // munnlinje
      for(const sg of[-1,1]){DYR.oye(out,F,hf+.018*s,hu+.015*s,sg*.036*s,.01*s);DYR.kule(out,M.glatt,'#2a2620',P(hf+.065*s,hu+.004*s,sg*.008*s),.004*s)} // øyne og nesebor
      for(let i=0;i<4;i++)DYR.kule(out,M.pels,hudm,DYR.flate(F,hf,hu,.05*s,.042*s,R()*.8-.6,(R()-.5)*2,1),.012*s,.008*s)} // skjell på hodet
    else{DYR.kule(out,M.pels,hud,P(.24*s,.09*s,0),.04*s);for(const sg of[-1,1])DYR.oye(out,F,.27*s,.1*s,sg*.022*s,.007*s)}
    DYR.el(out,M.pels,hud,P(-.28*s,.06*s,0),V(-1,-.4,0),.04*s,.02*s); // hale
  }
};

/* Perleøgle: lang, bukket kropp som smalner mot halen, grønn rygg med svart nett, blå perleflekker med mørk kant på sidene,
   lys underkjeve, øreåpning, spredte bein med fem tær og kløftet tunge. Soler seg på en stein. */
PROPS.subtrop_perleogle={dyr:true,
  navn:'Perleøgle (subtropisk)',info:'Grønn øgle med blå perleflekker, soler seg på en stein. c.plant(\'subtrop_perleogle\',x,z,{s})',
  params:{
    s:{v:1,min:.5,max:2.5,step:.05,navn:'Størrelse'},
    retning:DYR.retning,
    bukt:{v:1,min:0,max:2,step:.05,navn:'Kroppsbukt'},
    tunge:{v:1,min:0,max:1,step:1,navn:'Tunge ute'},
    stein:{v:1,min:0,max:1,step:1,navn:'Stein'}
  },
  place(x,z,o,env){const p=propParams('subtrop_perleogle',o,env.rng);if(p.stein>=.5)env.colliders.push({x,z,r:.3*p.s,anchor:false,y:env.H(x,z)+.12*p.s});return Object.assign({x,z},p)},
  build(t,env,out){const R=env.rng,s=t.s,M=DYR.M,F=DYR.ramme(t.x,t.z,footY(env.H,t.x,t.z,.3*s),t.retning),P=F.P,V=F.V;
    let yb=.005*s;
    if(t.stein>=.5){const g=shade('#8a8680',(R()-.5)*.1);
      DYR.kule(out,DM.bark,g,P(0,.03*s,0),.4*s,.09*s);DYR.kule(out,DM.bark,shade(g,.06),P(.14*s,.04*s,.14*s),.2*s,.07*s);DYR.kule(out,DM.bark,shade(g,-.05),P(-.22*s,.02*s,-.12*s),.18*s,.06*s);
      yb=.115*s}
    const gronn=shade('#5a9a3a',(R()-.5)*.06),hale=shade('#6a7a3a',(R()-.5)*.06),buk='#c8c890',svart='#18200f',bla='#2a78d8';
    // ryggrad fra halespiss (0) til nakke (n), med sideveis bukt
    const n=16,sp=[];for(let i=0;i<=n;i++){const q=i/n;sp.push([(-.48+.6*q)*s,yb+(.01+.02*Math.min(1,i/9))*s,.045*s*t.bukt*Math.sin(q*6.9+.5)])}
    const rf=f=>(f<.55?.005+.025*Math.pow(f/.55,1.2):f<.88?.032:.027)*s;
    DYR.polse(out,M.pels,i=>i<8?hale:gronn,sp.map(p=>P(p[0],p[1],p[2])),rf);
    // hode i egen ramme som følger nakkens retning
    const a1=sp[n-1],a2=sp[n],hw=P(a2[0],a2[1],a2[2]),H=DYR.ramme(hw.x,hw.z,hw.y,t.retning+Math.atan2(a2[2]-a1[2],a2[0]-a1[0]));
    DYR.el(out,M.pels,gronn,H.P(.035*s,.004*s,0),H.V(1,-.05,0),.042*s,.025*s);
    DYR.el(out,M.pels,gronn,H.P(.075*s,-.002*s,0),H.V(1,-.15,0),.022*s,.015*s); // snute
    DYR.el(out,M.pels,buk,H.P(.05*s,-.013*s,0),H.V(1,-.1,0),.04*s,.015*s); // lys underkjeve
    for(const sg of[-1,1]){DYR.oye(out,H,.055*s,.011*s,sg*.02*s,.007*s,'#c8862a');DYR.kule(out,M.glatt,svart,H.P(.012*s,.002*s,sg*.024*s),.006*s)} // øyne og øreåpning
    if(t.tunge>=.5){const r='#c8304a',tp=H.P(.13*s,-.01*s,0);DYR.ledd(out,M.glatt,r,H.P(.09*s,-.008*s,0),tp,.0025*s);
      for(const sg of[-1,1])DYR.ledd(out,M.glatt,r,tp,H.P(.145*s,-.006*s,sg*.008*s),.0018*s)}
    // bein: ut til siden, ned til foten, fem tær i vifte
    for(const [idx,fr] of[[13,1],[9,-1]])for(const sg of[-1,1]){const b=sp[idx],f=b[0],y=b[1],sb=b[2],r=rf(idx/(n-1));
      const el=P(f+.02*s*fr,y-.003*s,sb+sg*(r+.05*s)),ft=P(f+(fr>0?.035:-.01)*s,yb+.003*s,sb+sg*(r+.07*s));
      DYR.ledd(out,M.pels,gronn,P(f,y,sb+sg*r*.6),el,.009*s);DYR.ledd(out,M.pels,gronn,el,ft,.007*s);
      for(let i=0;i<5;i++){const a=(fr>0?.2:-.9)+i*.32,ff=f+(fr>0?.035:-.01)*s;
        DYR.ledd(out,M.pels,gronn,ft,P(ff+Math.cos(a)*.025*s,yb+.002*s,sb+sg*(r+.07*s+Math.sin(a)*.025*s)),.0025*s)}}
    // blå perleflekker med mørk kant langs sidene, svart nett på ryggen
    for(let i=9;i<=14;i++)for(const sg of[-1,1])for(const d of[0,.5]){const q=Math.min(n-1,i+d),a=sp[Math.floor(q)],r=rf(q/(n-1));
      DYR.kule(out,M.pels,svart,P(a[0],a[1]+.004*s,a[2]+sg*r*.93),.012*s);DYR.kule(out,M.glatt,bla,P(a[0],a[1]+.004*s,a[2]+sg*r*1.02),.009*s)}
    for(let i=0;i<28;i++){const q=4+R()*(n-5),j=Math.floor(q),a=sp[j],r=rf(j/(n-1));
      DYR.kule(out,M.pels,svart,P(a[0]+(R()-.5)*.02*s,a[1]+r*.88,a[2]+(R()-.5)*r),.006*s,.004*s)}
  }
};

/* ================= ARKTISK ================= */

/* Isbjørn: gulhvit pels med totter og frynser under buken, skulderpukkel, lang hals, svart nese, munnlinje og øyne,
   små runde ører, store poter med svarte klør. Kan senke hodet for å snuse og ha en unge med seg. */
PROPS.arktis_isbjorn={dyr:true,
  navn:'Isbjørn (arktisk)',info:'Stor, gulhvit bjørn med lang hals, gjerne med unge. c.plant(\'arktis_isbjorn\',x,z,{s})',
  params:{
    s:{v:1,min:.5,max:1.5,step:.05,navn:'Størrelse'},
    retning:DYR.retning,
    snus:{v:0,min:0,max:1,step:.05,navn:'Senker hodet'},
    unge:{v:1,min:0,max:1,step:1,navn:'Unge'}
  },
  place(x,z,o,env){const p=propParams('arktis_isbjorn',o,env.rng);env.colliders.push({x,z,r:.45*p.s,anchor:false,y:env.H(x,z)+.8*p.s});
    if(p.unge>=.5){const ca=Math.cos(p.retning),sa=Math.sin(p.retning),f=-1.05*p.s,sd=.55*p.s,ux=x+ca*f-sa*sd,uz=z+sa*f+ca*sd;env.colliders.push({x:ux,z:uz,r:.2*p.s,anchor:false,y:env.H(ux,uz)+.35*p.s})}
    return Object.assign({x,z},p)},
  build(t,env,out){const R=env.rng,M=DYR.M,a=t.retning;
    const bjorn=(F,s,sn)=>{const P=F.P,V=F.V,pels=shade('#f1ecdc',(R()-.5)*.04),skygge=shade(pels,-.08),svart='#151515',bh=.62*s;
      DYR.el(out,M.pels,pels,P(0,bh,0),V(1,0,0),.55*s,.28*s);
      DYR.kule(out,M.pels,pels,P(.25*s,bh+.06*s,0),.27*s,.28*s); // skulderpukkel
      DYR.kule(out,M.pels,pels,P(-.32*s,bh+.04*s,0),.27*s); // bakpart
      DYR.el(out,M.pels,skygge,P(0,bh-.2*s,0),V(1,0,0),.42*s,.1*s); // frynser under buken
      for(let i=0;i<16;i++)DYR.kule(out,M.pels,shade(pels,(R()-.5)*.1),DYR.flate(F,0,bh,.55*s,.28*s,R()*1.7-.85,(R()-.5)*3.6,1),(.06+R()*.03)*s,(.04+R()*.02)*s); // pelstotter
      // hals og hode; sn senker hodet mot bakken
      const hf=(.78-.06*sn)*s,hu=bh+(.12-.45*sn)*s,dl=Math.hypot(1,.15+.5*sn),df=1/dl,du=-(.15+.5*sn)/dl;
      DYR.polse(out,M.pels,pels,[P(.4*s,bh+.08*s,0),P(.58*s,bh+(.1-.22*sn)*s,0),P(hf-.04*s,hu,0)],f=>(.2-.05*f)*s);
      DYR.kule(out,M.pels,pels,P(hf,hu,0),.14*s,.125*s);
      DYR.el(out,M.pels,pels,P(hf+.12*s*df,hu+.12*s*du,0),V(df,du,0),.1*s,.075*s); // snute
      DYR.kule(out,M.glatt,svart,P(hf+.215*s*df,hu+.215*s*du+.012*s,0),.035*s,.028*s); // nese
      DYR.ledd(out,M.glatt,svart,P(hf+.2*s*df,hu+.2*s*du-.035*s,0),P(hf+.1*s*df,hu+.1*s*du-.05*s,0),.004*s); // munnlinje
      for(const sg of[-1,1]){DYR.oye(out,F,hf+.08*s,hu+.04*s,sg*.075*s,.016*s);
        DYR.kule(out,M.pels,pels,P(hf-.05*s,hu+.12*s,sg*.09*s),.045*s,.04*s); // øre
        DYR.kule(out,M.pels,skygge,P(hf-.035*s,hu+.12*s,sg*.09*s),.025*s,.022*s)}
      // bein, poter og klør
      for(const sg of[-1,1]){
        DYR.polse(out,M.pels,pels,[P(.3*s,bh-.05*s,sg*.17*s),P(.34*s,.3*s,sg*.18*s),P(.37*s,.08*s,sg*.18*s)],f=>(.12-.03*f)*s);
        DYR.polse(out,M.pels,pels,[P(-.32*s,bh-.05*s,sg*.16*s),P(-.38*s,.3*s,sg*.17*s),P(-.33*s,.08*s,sg*.17*s)],f=>(.15-.05*f)*s);
        for(const pf of[.42,-.3]){DYR.kule(out,M.pels,pels,P(pf*s,.06*s,sg*.18*s),.1*s,.06*s);
          for(let i=0;i<5;i++)DYR.ledd(out,M.glatt,svart,P((pf+.08)*s,.045*s,sg*.18*s+(i-2)*.035*s),P((pf+.12)*s,.008*s,sg*.18*s+(i-2)*.037*s),.007*s)}}
      DYR.kule(out,M.pels,pels,P(-.62*s,bh+.04*s,0),.06*s); // hale
    };
    bjorn(DYR.ramme(t.x,t.z,footY(env.H,t.x,t.z,.5*t.s),a),t.s,t.snus);
    if(t.unge>=.5){const ca=Math.cos(a),sa=Math.sin(a),f=-1.05*t.s,sd=.55*t.s,ux=t.x+ca*f-sa*sd,uz=t.z+sa*f+ca*sd;
      bjorn(DYR.ramme(ux,uz,footY(env.H,ux,uz,.2*t.s),a+.35),t.s*.42,.2)}}
};

/* Snøugle: rund, hvit kropp og hode, ansiktsskive, store gule øyne med mørk kant, svart krokete nebb,
   fjærkledde føtter med svarte klør og tverrbånd (hunnen har mange flere). Hodet kan vris. Sitter på en snøhaug. */
PROPS.arktis_snougle={dyr:true,
  navn:'Snøugle (arktisk)',info:'Hvit ugle med gule øyne; hunnen har mørke tverrbånd. c.plant(\'arktis_snougle\',x,z,{s})',
  params:{
    s:{v:1,min:.5,max:2,step:.05,navn:'Størrelse'},
    retning:DYR.retning,
    hunn:{v:0,min:0,max:1,step:1,navn:'Hunn (mer mønster)'},
    hodevri:{v:0,min:-2.4,max:2.4,step:.05,navn:'Hodevri'},
    snohaug:{v:1,min:0,max:1,step:1,navn:'Snøhaug'}
  },
  place(x,z,o,env){return Object.assign({x,z},propParams('arktis_snougle',o,env.rng))},
  build(t,env,out){const R=env.rng,s=t.s,M=DYR.M,y0=footY(env.H,t.x,t.z,.2*s),F=DYR.ramme(t.x,t.z,y0,t.retning),P=F.P,V=F.V;
    let yb=0;if(t.snohaug>=.5){DYR.kule(out,M.pels,'#eef3f7',P(0,0,0),.38*s,.13*s);DYR.kule(out,M.pels,'#e4ecf2',P(.15*s,0,.12*s),.2*s,.08*s);yb=.1*s}
    const hvit='#f7f7f2',band='#3a3630',hunn=t.hunn>=.5;
    DYR.kule(out,M.pels,hvit,P(0,yb+.21*s,0),.17*s,.22*s); // kropp
    DYR.kule(out,M.pels,hvit,P(.05*s,yb+.15*s,0),.15*s); // bryst
    for(const sg of[-1,1])DYR.el(out,M.pels,shade(hvit,-.03),P(-.03*s,yb+.2*s,sg*.135*s),V(-.25,-1,0),.18*s,.065*s); // vinger
    DYR.el(out,M.pels,hvit,P(-.15*s,yb+.06*s,0),V(-1,-.5,0),.08*s,.045*s); // hale
    // tverrbånd på kropp og vinger, aldri i ansiktet
    for(let i=0;i<(hunn?40:10);i++){const th=Math.acos(R()*1.6-.7),ph=R()*6.28,X=Math.sin(th)*Math.cos(ph),Z=Math.sin(th)*Math.sin(ph),Y=Math.cos(th);
      DYR.kule(out,M.pels,band,P(.17*s*X*1.01,yb+.21*s+.22*s*Y*1.01,.17*s*Z*1.01),.02*s,.008*s)}
    for(const sg of[-1,1])for(let i=0;i<(hunn?12:4);i++){const q=R()*1.6-.8;
      DYR.kule(out,M.pels,band,P(-.03*s-.24*q*.17*s,yb+.2*s-.97*q*.17*s,sg*(.135*s+.064*s*Math.sqrt(1-q*q))),.02*s,.008*s)}
    // hode i egen ramme, så det kan vris
    const hc=P(.02*s,yb+.46*s,0),H=DYR.ramme(hc.x,hc.z,hc.y,t.retning+t.hodevri);
    DYR.kule(out,M.pels,hvit,hc,.135*s,.12*s);
    DYR.kule(out,M.pels,'#fbfbf8',H.P(.07*s,-.01*s,0),.09*s,.085*s); // ansiktsskive
    for(const sg of[-1,1]){DYR.kule(out,M.glatt,'#2a2a2a',H.P(.125*s,.012*s,sg*.042*s),.027*s); // mørk øyekant
      DYR.oye(out,H,.135*s,.012*s,sg*.042*s,.024*s,'#f2c21a');
      DYR.kule(out,M.pels,'#f0f0ea',H.P(.125*s,.042*s,sg*.045*s),.03*s,.012*s)} // fjær over øynene
    DYR.el(out,M.glatt,'#2a2a2a',H.P(.15*s,-.02*s,0),H.V(.4,-1,0),.022*s,.012*s); // nebb
    for(let i=0;i<(hunn?10:3);i++)DYR.kule(out,M.pels,band,H.P((-.06+R()*.09)*s,.1*s,(R()-.5)*.15*s),.012*s,.006*s); // prikker på isse
    // fjærkledde føtter med klør
    for(const sg of[-1,1]){DYR.kule(out,M.pels,hvit,P(.09*s,yb+.02*s,sg*.06*s),.045*s,.03*s);
      for(let i=0;i<3;i++)DYR.ledd(out,M.glatt,'#1a1a1a',P(.12*s,yb+.015*s,sg*.06*s+(i-1)*.02*s),P(.145*s,yb-.008*s,sg*.06*s+(i-1)*.022*s),.004*s)}
  }
};

/* Fjellrev: kompakt kropp, kort snute, små runde ører, kinnpels, gylne øyne, værhår og stor busket hale.
   Vinterpels er hvit; sommerpels er brungrå med lys buk og mørkere bein og halespiss. */
PROPS.arktis_fjellrev={dyr:true,
  navn:'Fjellrev (arktisk)',info:'Liten rev med tett pels og stor busket hale. c.plant(\'arktis_fjellrev\',x,z,{s})',
  params:{
    s:{v:1,min:.5,max:2,step:.05,navn:'Størrelse'},
    retning:DYR.retning,
    vinter:{v:1,min:0,max:1,step:.05,navn:'Vinterpels'},
    hale:{v:1,min:0,max:1.5,step:.05,navn:'Halesving'}
  },
  place(x,z,o,env){const p=propParams('arktis_fjellrev',o,env.rng);env.colliders.push({x,z,r:.12*p.s,anchor:false,y:env.H(x,z)+.35*p.s});return Object.assign({x,z},p)},
  build(t,env,out){const R=env.rng,s=t.s,M=DYR.M,F=DYR.ramme(t.x,t.z,footY(env.H,t.x,t.z,.2*s),t.retning),P=F.P,V=F.V,w=t.vinter;
    const pels=shade(DYR.blend('#6a5a48','#f4f2ec',w),(R()-.5)*.04),buk=DYR.blend('#cbbba2','#ffffff',w),mork=DYR.blend('#3a3026','#e2e0da',w),bh=.28*s;
    DYR.el(out,M.pels,pels,P(0,bh,0),V(1,.05,0),.22*s,.11*s); // kropp
    DYR.el(out,M.pels,buk,P(.01*s,bh-.05*s,0),V(1,0,0),.17*s,.07*s); // buk
    DYR.kule(out,M.pels,buk,P(.17*s,bh+.01*s,0),.1*s); // bryst
    for(let i=0;i<12;i++)DYR.kule(out,M.pels,shade(pels,(R()-.5)*.1),DYR.flate(F,0,bh,.22*s,.11*s,R()*1.6-.8,(R()-.5)*3.4,1),.028*s,.02*s); // pelstotter
    DYR.polse(out,M.pels,pels,[P(.2*s,bh+.04*s,0),P(.3*s,bh+.13*s,0)],()=>.075*s); // hals
    const hf=.35*s,hu=bh+.17*s;
    DYR.kule(out,M.pels,pels,P(hf,hu,0),.08*s,.07*s);
    DYR.el(out,M.pels,buk,P(hf+.075*s,hu-.025*s,0),V(1,-.2,0),.055*s,.035*s); // snute
    DYR.kule(out,M.glatt,'#1a1a1a',P(hf+.13*s,hu-.032*s,0),.014*s); // nese
    DYR.ledd(out,M.glatt,'#2a2420',P(hf+.12*s,hu-.048*s,0),P(hf+.07*s,hu-.05*s,0),.003*s); // munnlinje
    for(const sg of[-1,1]){
      DYR.kule(out,M.pels,buk,P(hf-.01*s,hu-.03*s,sg*.055*s),.045*s); // kinnpels
      DYR.oye(out,F,hf+.06*s,hu+.02*s,sg*.04*s,.011*s,'#a87a30');
      DYR.kule(out,M.pels,pels,P(hf-.02*s,hu+.075*s,sg*.045*s),.03*s,.035*s); // øre
      DYR.kule(out,M.pels,DYR.blend('#a08070','#e8d8d4',w),P(hf-.008*s,hu+.075*s,sg*.045*s),.018*s,.022*s); // innside
      for(let i=0;i<3;i++)DYR.ledd(out,M.glatt,'#2a2420',P(hf+.1*s,hu-.03*s,sg*.025*s),P(hf+.12*s,hu-.04*s+i*.015*s,sg*.11*s),.0018*s); // værhår
      // bein
      DYR.ledd(out,M.pels,mork,P(.18*s,bh-.06*s,sg*.06*s),P(.2*s,.03*s,sg*.06*s),.028*s);
      DYR.el(out,M.pels,pels,P(-.16*s,bh-.04*s,sg*.06*s),V(.3,-1,0),.09*s,.055*s); // lår
      DYR.ledd(out,M.pels,mork,P(-.14*s,.12*s,sg*.06*s),P(-.17*s,.03*s,sg*.06*s),.025*s);
      for(const pf of[.215,-.15])DYR.kule(out,M.pels,mork,P(pf*s,.02*s,sg*.06*s),.032*s,.02*s)} // poter
    // stor busket hale, mørk spiss om sommeren
    const h=t.hale,tp=DYR.bue(F,[[-.2*s,bh+.02*s,0],[-.42*s,bh-.02*s,.02*s*h],[-.5*s,.1*s,.15*s*h],[-.35*s,.06*s,.32*s*h]],8);
    DYR.polse(out,M.pels,i=>i>=6?mork:pels,tp,f=>(.035+.06*Math.sin(f*Math.PI*.9))*s);
  }
};
