'use strict';
/* Vegetasjon for tre miljøer. Prefikset i navnet forteller miljøet:
     jungel_*   jungel / regnskog
     subtrop_*  subtropisk / middelhav
     arktis_*   arktisk / tundra
   Alt bygges med de samme hjelperne som bytreet (propParams, footY, shade, dirVec, stemBetween, PG, DG, DM).
   Kolliderens y følger plantens høyde, så ankeret flytter seg når størrelsen endres.
   Lave planter som man går gjennom (dvergbjørk, myrull) får ingen kolliderer. */

const VEG={
  GA:2.39996, // gylne vinkel, gir naturlig spredning i rosetter
  // punkter langs en bue: start p, retning a, stigning e; stigningen synker med droop over lengden
  kurve(p,a,e,len,droop,n){const pts=[p],ca=Math.cos(a),sa=Math.sin(a),st=len/n;let q=p,el=e;
    for(let i=0;i<n;i++){const ce=Math.cos(el);q={x:q.x+ca*ce*st,y:q.y+Math.sin(el)*st,z:q.z+sa*ce*st};pts.push(q);el-=droop/n}return pts},
  // kjede av greinsegmenter gjennom punktene, avsmalnende fra r0 til r1
  stilk(out,pts,r0,r1,mat,c){for(let i=0;i<pts.length-1;i++){const r=r0+(r1-r0)*i/(pts.length-1);out.add(DG.branch,mat,stemBetween(pts[i],pts[i+1],r,{c}))}},
  // bredt blad (banan): flate kuler langs buen, bredest på midten
  blad(out,pts,w,c){for(let i=1;i<pts.length;i++){const t=i/(pts.length-1),ww=w*Math.sin(Math.PI*(.12+.8*t)),p=pts[i];
    out.add(PG.blob,DM.leaf,{x:p.x,y:p.y,z:p.z,sx:ww,sy:ww*.16,sz:ww,c})}},
  // fjærblad (palme, bregne): ribbe med småblad til hver side
  fjaer(out,pts,a,lf,r,c){VEG.stilk(out,pts,r,r*.5,DM.leaf,c);const n=pts.length-1;
    for(let i=1;i<=n;i++){const p=pts[i],q=pts[i-1],el=Math.atan2(p.y-q.y,Math.hypot(p.x-q.x,p.z-q.z)),L=lf*Math.sin(Math.PI*(.15+.75*i/n));
      for(const sg of[-1,1]){const v=dirVec(a+sg*1.2,el-.55);out.add(DG.branch,DM.leaf,stemBetween(p,{x:p.x+v.x*L,y:p.y+v.y*L,z:p.z+v.z*L},L*.14,{c}))}}},
  hoyeste(L){let hi=L[0];for(const b of L)if(b.y+b.sy>hi.y+hi.sy)hi=b;return hi}
};

/* ================= JUNGEL ================= */

/* Kapoktre: kjempetre over jungeltaket. Planterøtter ved foten, nesten vannrette greiner og flat paraplykrone. Lianer henger fra greinene. */
PROPS.jungel_kapok={
  navn:'Kapoktre (jungel)',info:'Kjempetre som rager over jungeltaket. c.plant(\'jungel_kapok\',x,z,{s})',
  params:{
    s:{v:1,min:.6,max:2,step:.05,navn:'Størrelse'},
    stamme:{v:1,min:.7,max:1.5,step:.05,navn:'Stammelengde'},
    krone:{v:1,min:.6,max:1.6,step:.05,navn:'Kronebredde'},
    lianer:{v:2,min:0,max:4,step:1,navn:'Lianer'}
  },
  LEAF:['#2f6b2a','#3a7a30','#285e26'],
  place(x,z,o,env){const p=propParams('jungel_kapok',o,env.rng),h=3.2*p.s*p.stamme;env.colliders.push({x,z,r:.2*p.s,anchor:true,y:env.H(x,z)+h*.6});return Object.assign({x,z},p)},
  build(t,env,out){const R=env.rng,s=t.s,k=s*t.krone,h=3.2*s*t.stamme,r=.14*s;
    const y=footY(env.H,t.x,t.z,r*2.5)-.03,top=y+h,bark=shade('#8a7a66',(R()-.5)*.12),hue=(R()-.5)*.1;
    out.add(PG.trunk,DM.bark,{x:t.x,y:y+h/2,z:t.z,sx:r,sy:h,sz:r,c:bark});
    // planterøtter: støtter fra bakken og opp i stammen
    const a0=R()*6.28;for(let i=0;i<5;i++){const a=a0+i*1.2566+(R()-.5)*.4,d=(.45+R()*.2)*s;
      out.add(DG.branch,DM.bark,stemBetween({x:t.x+Math.cos(a)*d,y,z:t.z+Math.sin(a)*d},{x:t.x+Math.cos(a)*r*.6,y:y+(.7+R()*.3)*s,z:t.z+Math.sin(a)*r*.6},r*.45,{c:shade(bark,-.05)}))}
    // fire greiner ut fra toppen, hver med et flatt løvflak; ett stort flak midt over
    const L=[{x:t.x,y:top+.15*k,z:t.z,sx:.85*k,sy:.26*k,sz:.85*k,c:shade(this.LEAF[0],hue)}],ends=[];
    for(let i=0;i<4;i++){const a=a0+.6+i*1.5708+(R()-.5)*.5,b={x:t.x,y:top-.25*s,z:t.z},v=dirVec(a,.3+R()*.2),bl=(.9+R()*.3)*k,e={x:b.x+v.x*bl,y:b.y+v.y*bl,z:b.z+v.z*bl};
      out.add(DG.branch,DM.bark,stemBetween(b,e,r*.5,{c:bark}));ends.push(e);
      L.push({x:e.x,y:e.y+.12*k,z:e.z,sx:(.55+R()*.15)*k,sy:.22*k,sz:(.55+R()*.15)*k,c:shade(this.LEAF[1+i%2],hue+(R()-.5)*.08)})}
    for(const b of L)out.add(PG.blob,DM.leaf,b);
    // lianer henger fra greinendene med små blad
    for(let i=0;i<Math.min(t.lianer,ends.length);i++){const e=ends[i],len=h*(.35+R()*.3),pts=[];
      for(let j=0;j<=5;j++){const f=j/5;pts.push({x:e.x+Math.sin(f*3+i)*.05*s,y:e.y-len*f,z:e.z+Math.cos(f*3+i)*.05*s})}
      VEG.stilk(out,pts,.018*s,.012*s,DM.bark,'#4d5a2e');
      for(let j=1;j<5;j++)out.add(PG.blob,DM.leaf,{x:pts[j].x,y:pts[j].y,z:pts[j].z,sx:.06*s,sy:.035*s,sz:.06*s,c:shade(this.LEAF[1],.08)})}
    const hi=VEG.hoyeste(L);env.perches.push({x:hi.x,y:hi.y+hi.sy*.9,z:hi.z,kind:'top'})}
};

/* Bananplante: grønn skinnstamme, store hengende blader, to unge blader som står rett opp, valgfri bananklase med lilla blomst. */
PROPS.jungel_banan={
  navn:'Bananplante (jungel)',info:'Lav plante med store, hengende blader. c.plant(\'jungel_banan\',x,z,{s})',
  params:{
    s:{v:1,min:.5,max:1.8,step:.05,navn:'Størrelse'},
    blader:{v:7,min:4,max:10,step:1,navn:'Antall blader'},
    klase:{v:1,min:0,max:1,step:1,navn:'Bananklase'}
  },
  LEAF:['#5fae3e','#4f9a36','#8aa83e'],
  place(x,z,o,env){const p=propParams('jungel_banan',o,env.rng);env.colliders.push({x,z,r:.1*p.s,anchor:true,y:env.H(x,z)+.9*p.s});return Object.assign({x,z},p)},
  build(t,env,out){const R=env.rng,s=t.s,h=1.25*s,r=.085*s;
    const y=footY(env.H,t.x,t.z,r)-.03,top=y+h,stem=shade('#7d9a4c',(R()-.5)*.1),a0=R()*6.28;
    out.add(PG.trunk,DM.bark,{x:t.x,y:y+h/2,z:t.z,sx:r,sy:h,sz:r,c:stem});
    for(let i=0;i<t.blader;i++){const a=a0+i*VEG.GA,ung=i>=t.blader-2,e=ung?1.25:.75+R()*.25,len=(ung?.55:.95+R()*.25)*s;
      const pts=VEG.kurve({x:t.x,y:top-.05*s,z:t.z},a,e,len,ung?.6:2.1+R()*.4,9);
      VEG.stilk(out,pts.slice(0,3),.018*s,.014*s,DM.leaf,stem);
      VEG.blad(out,pts.slice(1),(ung?.09:.17)*s,shade(this.LEAF[i%3],(R()-.5)*.08))}
    if(t.klase>=.5){const pts=VEG.kurve({x:t.x,y:top,z:t.z},a0+1.1,.6,.45*s,2.6,6);VEG.stilk(out,pts,.02*s,.016*s,DM.leaf,stem);
      const m=pts[3];for(let j=0;j<6;j++){const b=j*1.05;out.add(PG.blob,DM.leaf,{x:m.x+Math.cos(b)*.05*s,y:m.y-.03*s-j*.025*s,z:m.z+Math.sin(b)*.05*s,sx:.05*s,sy:.035*s,sz:.05*s,c:'#9cb84a'})}
      const e=pts[pts.length-1];out.add(PG.blob,DM.leaf,{x:e.x,y:e.y-.05*s,z:e.z,sx:.045*s,sy:.08*s,sz:.045*s,c:'#6a2a48'})}}
};

/* Bregnetre: slank, ru stamme med svak helning, rosett av fjærblader og to sammenrullede nye blad i midten. */
PROPS.jungel_bregnetre={
  navn:'Bregnetre (jungel)',info:'Slank stamme med en rosett av fjærblader. c.plant(\'jungel_bregnetre\',x,z,{s})',
  params:{
    s:{v:1,min:.5,max:1.8,step:.05,navn:'Størrelse'},
    stamme:{v:1,min:.6,max:1.6,step:.05,navn:'Stammelengde'},
    krone:{v:1,min:.6,max:1.5,step:.05,navn:'Kronestørrelse'},
    blader:{v:9,min:6,max:13,step:1,navn:'Antall blader'}
  },
  LEAF:['#3f8a3a','#4b9a40','#2f7430'],
  place(x,z,o,env){const p=propParams('jungel_bregnetre',o,env.rng),h=1.8*p.s*p.stamme;env.colliders.push({x,z,r:.08*p.s,anchor:true,y:env.H(x,z)+h*.7});return Object.assign({x,z},p)},
  build(t,env,out){const R=env.rng,s=t.s,k=s*t.krone,h=1.8*s*t.stamme,r=.07*s;
    const y=footY(env.H,t.x,t.z,r)-.03,bark=shade('#4a3828',(R()-.5)*.12),hue=(R()-.5)*.1,lean=R()*6.28,ln=(.1+R()*.15)*s;
    const sp=[];for(let i=0;i<=5;i++){const f=i/5;sp.push({x:t.x+Math.cos(lean)*ln*f*f,y:y+h*f,z:t.z+Math.sin(lean)*ln*f*f})}
    VEG.stilk(out,sp,r*1.15,r*.85,DM.bark,bark);
    for(let i=1;i<5;i++){const p=sp[i];out.add(PG.blob,DM.bark,{x:p.x,y:p.y,z:p.z,sx:r*1.35,sy:r*.9,sz:r*1.35,c:shade(bark,(R()-.5)*.1)})} // gamle bladfester
    const top=sp[5];out.add(PG.blob,DM.bark,{x:top.x,y:top.y,z:top.z,sx:r*1.5,sy:r*1.1,sz:r*1.5,c:bark});
    for(let i=0;i<t.blader;i++){const a=i*6.28/t.blader+(R()-.5)*.3,pts=VEG.kurve(top,a,.75+R()*.2,(.85+R()*.2)*k,1.9+R()*.4,7);
      VEG.fjaer(out,pts,a,.2*k,.014*s,shade(this.LEAF[i%3],hue))}
    for(let i=0;i<2;i++){const a=i*3.1+R(),p={x:top.x+Math.cos(a)*.06*s,y:top.y+.12*s,z:top.z+Math.sin(a)*.06*s};
      out.add(DG.branch,DM.leaf,stemBetween(top,p,.012*s,{c:'#6a8a3a'}));out.add(PG.blob,DM.leaf,{x:p.x,y:p.y+.02*s,z:p.z,sx:.035*s,sy:.035*s,sz:.035*s,c:'#7a9a42'})}
    env.perches.push({x:top.x,y:top.y+.06*s,z:top.z,kind:'top'})}
};

/* ================= SUBTROPISK ================= */

/* Kokospalme: ringet stamme som bøyer seg, krone av fjærblader og kokosnøtter under toppen. */
PROPS.subtrop_palme={
  navn:'Kokospalme (subtropisk)',info:'Bøyd, ringet stamme med fjærblader. c.plant(\'subtrop_palme\',x,z,{s})',
  params:{
    s:{v:1,min:.5,max:2,step:.05,navn:'Størrelse'},
    stamme:{v:1,min:.6,max:1.6,step:.05,navn:'Stammelengde'},
    krone:{v:1,min:.6,max:1.5,step:.05,navn:'Kronestørrelse'},
    helning:{v:1,min:0,max:2,step:.05,navn:'Helning'},
    notter:{v:3,min:0,max:6,step:1,navn:'Kokosnøtter'}
  },
  LEAF:['#4f8f3a','#5c9c42','#43803a'],
  place(x,z,o,env){const p=propParams('subtrop_palme',o,env.rng),h=2.6*p.s*p.stamme;env.colliders.push({x,z,r:.1*p.s,anchor:true,y:env.H(x,z)+h*.5});return Object.assign({x,z},p)},
  build(t,env,out){const R=env.rng,s=t.s,k=s*t.krone,h=2.6*s*t.stamme,r=.085*s;
    const y=footY(env.H,t.x,t.z,r)-.03,a=R()*6.28,ln=.55*s*t.helning,bark=shade('#9a8466',(R()-.5)*.1),hue=(R()-.5)*.1;
    const sp=[];for(let i=0;i<=8;i++){const f=i/8;sp.push({x:t.x+Math.cos(a)*ln*f*f,y:y+h*f,z:t.z+Math.sin(a)*ln*f*f})}
    for(let i=0;i<8;i++)out.add(DG.branch,DM.bark,stemBetween(sp[i],sp[i+1],r*(1.15-.35*i/8),{c:shade(bark,i%2?.04:-.04)})); // ringer
    const top=sp[8];out.add(PG.blob,DM.bark,{x:top.x,y:top.y,z:top.z,sx:r*1.2,sy:r*1.4,sz:r*1.2,c:shade(bark,-.08)});
    for(let i=0;i<9;i++){const fa=i*.698+(R()-.5)*.3,pts=VEG.kurve(top,fa,.55+R()*.3,(1+R()*.25)*k,2.2+R()*.5,7);
      VEG.fjaer(out,pts,fa,.28*k,.016*s,shade(this.LEAF[i%3],hue))}
    for(let i=0;i<t.notter;i++){const b=i*2.3+R();out.add(PG.blob,DM.bark,{x:top.x+Math.cos(b)*.09*s,y:top.y-.08*s-R()*.04*s,z:top.z+Math.sin(b)*.09*s,sx:.06*s,sy:.065*s,sz:.06*s,c:shade('#6a4a2a',(R()-.5)*.1)})}
    env.perches.push({x:top.x,y:top.y+.08*s,z:top.z,kind:'top'})}
};

/* Oliventre: lav, vridd stamme med knuter, tre grove greiner og en luftig sølvgrønn krone av mange små kuler. */
PROPS.subtrop_oliven={
  navn:'Oliventre (subtropisk)',info:'Lavt, knudrete tre med sølvgrønn krone. c.plant(\'subtrop_oliven\',x,z,{s})',
  params:{
    s:{v:1,min:.5,max:1.8,step:.05,navn:'Størrelse'},
    krone:{v:1,min:.6,max:1.5,step:.05,navn:'Kronestørrelse'},
    alder:{v:1,min:.5,max:1.5,step:.05,navn:'Alder'}
  },
  LEAF:['#8a9a6a','#7a8c5e','#9aa87a'],
  place(x,z,o,env){const p=propParams('subtrop_oliven',o,env.rng);env.colliders.push({x,z,r:.12*p.s,anchor:true,y:env.H(x,z)+.7*p.s});return Object.assign({x,z},p)},
  build(t,env,out){const R=env.rng,s=t.s,k=s*t.krone,g=t.alder,r=.1*s*(.8+.3*g);
    const y=footY(env.H,t.x,t.z,r*1.5)-.03,bark=shade('#6e6252',(R()-.5)*.12),hue=(R()-.5)*.08,a0=R()*6.28;
    // vridd stamme: tre knekker, mer forskjøvet jo eldre treet er
    const sp=[{x:t.x,y,z:t.z}];for(let i=1;i<=3;i++){const a=a0+i*2.1,o=.12*s*g*(i<3?1:.5);sp.push({x:t.x+Math.cos(a)*o,y:y+.95*s*i/3,z:t.z+Math.sin(a)*o})}
    VEG.stilk(out,sp,r*1.2,r*.9,DM.bark,bark);
    for(let i=1;i<3;i++){const q=sp[i];out.add(PG.blob,DM.bark,{x:q.x,y:q.y,z:q.z,sx:r*1.1,sy:r*.9,sz:r*1.1,c:shade(bark,.04)})} // knuter
    const top=sp[3],L=[];
    for(let i=0;i<3;i++){const a=a0+i*2.09+(R()-.5)*.5,v=dirVec(a,.55+R()*.3),bl=(.55+R()*.2)*k,e={x:top.x+v.x*bl,y:top.y+v.y*bl,z:top.z+v.z*bl};
      out.add(DG.branch,DM.bark,stemBetween(top,e,r*.55,{c:bark}));
      for(let j=0;j<3;j++){const b=a+(R()-.5)*1.6,d=R()*.22*k;L.push({x:e.x+Math.cos(b)*d,y:e.y+(R()-.2)*.18*k,z:e.z+Math.sin(b)*d,sx:(.3+R()*.12)*k,sy:(.18+R()*.06)*k,sz:(.3+R()*.12)*k,c:shade(this.LEAF[j],hue+(R()-.5)*.1)})}}
    L.push({x:top.x,y:top.y+.35*k,z:top.z,sx:.4*k,sy:.22*k,sz:.4*k,c:shade(this.LEAF[0],hue)});
    for(const b of L)out.add(PG.blob,DM.leaf,b);
    const hi=VEG.hoyeste(L);env.perches.push({x:hi.x,y:hi.y+hi.sy*.9,z:hi.z,kind:'top'})}
};

/* Sypress: smal, mørk søyle av stablede lag, bredest litt under midten, spiss topp. */
PROPS.subtrop_sypress={
  navn:'Sypress (subtropisk)',info:'Smal, mørk søyle langs veier og gårdsplasser. c.plant(\'subtrop_sypress\',x,z,{s})',
  params:{
    s:{v:1,min:.5,max:2,step:.05,navn:'Størrelse'},
    hoyde:{v:1,min:.6,max:1.8,step:.05,navn:'Høyde'},
    bredde:{v:1,min:.6,max:1.5,step:.05,navn:'Bredde'}
  },
  LEAF:['#2f5a32','#365f36','#284f2c'],
  place(x,z,o,env){const p=propParams('subtrop_sypress',o,env.rng),h=3*p.s*p.hoyde;env.colliders.push({x,z,r:.18*p.s*p.bredde,anchor:true,y:env.H(x,z)+h*.5});return Object.assign({x,z},p)},
  build(t,env,out){const R=env.rng,s=t.s,h=3*s*t.hoyde,w=.32*s*t.bredde,r=.06*s;
    const y=footY(env.H,t.x,t.z,r)-.03,hue=(R()-.5)*.08;
    out.add(PG.trunk,DM.bark,{x:t.x,y:y+.2*s,z:t.z,sx:r,sy:.4*s,sz:r,c:'#5a4634'});
    const n=7,L=[];for(let i=0;i<n;i++){const f=i/(n-1),ww=w*(.75+.25*Math.sin(f*Math.PI*1.2))*(1-.75*f*f),j=.03*s;
      L.push({x:t.x+(R()-.5)*j,y:y+.35*s+f*(h-.5*s),z:t.z+(R()-.5)*j,sx:ww,sy:(h/n)*.85,sz:ww,c:shade(this.LEAF[i%3],hue+(R()-.5)*.05)})}
    const tp=L[n-1];L.push({x:tp.x,y:tp.y+tp.sy*.8,z:tp.z,sx:w*.1,sy:h*.08,sz:w*.1,c:shade(this.LEAF[0],hue+.03)});
    for(const b of L)out.add(PG.blob,DM.leaf,b);
    const hi=L[L.length-1];env.perches.push({x:hi.x,y:hi.y+hi.sy*.9,z:hi.z,kind:'top'})}
};

/* Agave: rosett av tykke, spisse blader. Kan få en høy blomsterstilk med gule dusker, som duene kan sitte på. */
PROPS.subtrop_agave={
  navn:'Agave (subtropisk)',info:'Rosett av spisse blader, eventuelt med blomsterstilk. c.plant(\'subtrop_agave\',x,z,{s})',
  params:{
    s:{v:1,min:.5,max:1.8,step:.05,navn:'Størrelse'},
    blader:{v:16,min:8,max:26,step:1,navn:'Antall blader'},
    stilk:{v:0,min:0,max:1,step:1,navn:'Blomsterstilk'}
  },
  LEAF:['#6f9a8a','#7fa898','#a7b45a'],
  place(x,z,o,env){const p=propParams('subtrop_agave',o,env.rng);env.colliders.push({x,z,r:.35*p.s,anchor:true,y:env.H(x,z)+(p.stilk>=.5?1.6:.4)*p.s});return Object.assign({x,z},p)},
  build(t,env,out){const R=env.rng,s=t.s,y=footY(env.H,t.x,t.z,.2*s)-.02,hue=(R()-.5)*.08,gul=R()<.35;
    out.add(PG.blob,DM.leaf,{x:t.x,y:y+.06*s,z:t.z,sx:.16*s,sy:.12*s,sz:.16*s,c:shade(this.LEAF[0],hue-.05)});
    for(let i=0;i<t.blader;i++){const f=i/t.blader,a=i*VEG.GA,e=.25+f*1.05,len=(.75-.35*f)*s*(.9+R()*.2),v=dirVec(a,e),
      b={x:t.x+Math.cos(a)*.04*s,y:y+.06*s,z:t.z+Math.sin(a)*.04*s},tip={x:b.x+v.x*len,y:b.y+v.y*len,z:b.z+v.z*len},
      c=shade(this.LEAF[gul&&i%2?2:i%2],hue+(R()-.5)*.06),te=len*.18;
      out.add(DG.branch,DM.leaf,stemBetween(b,tip,.07*s*(1-.3*f),{c}));
      out.add(DG.branch,DM.leaf,stemBetween(tip,{x:tip.x+v.x*te,y:tip.y+v.y*te,z:tip.z+v.z*te},.035*s*(1-.3*f),{c:shade(c,-.1)}))} // spiss
    if(t.stilk>=.5){const hs=2.4*s,base={x:t.x,y:y+.1*s,z:t.z},top={x:t.x+(R()-.5)*.1*s,y:y+hs,z:t.z+(R()-.5)*.1*s};
      out.add(DG.branch,DM.bark,stemBetween(base,top,.035*s,{c:'#7a8a4a'}));
      for(let i=0;i<5;i++){const f=.55+i*.09,b={x:base.x+(top.x-base.x)*f,y:base.y+(top.y-base.y)*f,z:base.z+(top.z-base.z)*f},v=dirVec(i*VEG.GA,.35),bl=(.28-.03*i)*s,e={x:b.x+v.x*bl,y:b.y+v.y*bl,z:b.z+v.z*bl};
        out.add(DG.branch,DM.bark,stemBetween(b,e,.012*s,{c:'#7a8a4a'}));out.add(PG.blob,DM.leaf,{x:e.x,y:e.y+.03*s,z:e.z,sx:.07*s,sy:.05*s,sz:.07*s,c:'#e0c040'})}
      env.perches.push({x:top.x,y:top.y,z:top.z,kind:'top'})}}
};

/* ================= ARKTISK ================= */

/* Dvergbjørk: lav, krypende busk med rødbrune kvister og små blad som blir røde og oransje om høsten. Ingen kolliderer. */
PROPS.arktis_dvergbjork={
  navn:'Dvergbjørk (arktisk)',info:'Lav, krypende busk på tundraen. c.plant(\'arktis_dvergbjork\',x,z,{s})',
  params:{
    s:{v:1,min:.5,max:1.8,step:.05,navn:'Størrelse'},
    bredde:{v:1,min:.6,max:1.8,step:.05,navn:'Bredde'},
    host:{v:.7,min:0,max:1,step:.05,navn:'Høstfarge'}
  },
  LEAF:['#5f8a3a','#c45a2a','#d98a2a'],
  place(x,z,o,env){return Object.assign({x,z},propParams('arktis_dvergbjork',o,env.rng))},
  build(t,env,out){const R=env.rng,s=t.s,y=footY(env.H,t.x,t.z,.2*s)-.02,bark='#6a3a2a';
    for(let i=0;i<7;i++){const a=i*VEG.GA+R()*.4,pts=VEG.kurve({x:t.x,y,z:t.z},a,.55+R()*.35,(.35+R()*.15)*s*t.bredde,.6+R()*.4,3);
      VEG.stilk(out,pts,.018*s,.01*s,DM.bark,bark);
      for(let j=1;j<pts.length;j++){const p=pts[j],hf=R()<t.host,ci=R()<.5?1:2,c=hf?this.LEAF[ci]:this.LEAF[0];
        out.add(PG.blob,DM.leaf,{x:p.x+(R()-.5)*.05*s,y:p.y+.02*s,z:p.z+(R()-.5)*.05*s,sx:(.07+R()*.04)*s,sy:.045*s,sz:(.07+R()*.04)*s,c:shade(c,(R()-.5)*.1)})}}}
};

/* Snøgran: smal gran i lag, med hengende tupper og snø på hvert lag. Snømengde 0 gir sommergran. */
PROPS.arktis_gran={
  navn:'Snøgran (arktisk)',info:'Smal gran med snø på hvert lag. c.plant(\'arktis_gran\',x,z,{s})',
  params:{
    s:{v:1,min:.5,max:2,step:.05,navn:'Størrelse'},
    hoyde:{v:1,min:.6,max:1.8,step:.05,navn:'Høyde'},
    sno:{v:.8,min:0,max:1,step:.05,navn:'Snømengde'}
  },
  LEAF:['#2a4a36','#30533c','#24412f'],SNO:'#eef3f7',
  place(x,z,o,env){const p=propParams('arktis_gran',o,env.rng),h=2.6*p.s*p.hoyde;env.colliders.push({x,z,r:.14*p.s,anchor:true,y:env.H(x,z)+h*.5});return Object.assign({x,z},p)},
  build(t,env,out){const R=env.rng,s=t.s,h=2.6*s*t.hoyde,r=.06*s,y=footY(env.H,t.x,t.z,r)-.03,hue=(R()-.5)*.06,sno=t.sno>.05;
    out.add(PG.trunk,DM.bark,{x:t.x,y:y+h*.45,z:t.z,sx:r,sy:h*.9,sz:r,c:'#4a3a2c'});
    const L=[];for(let i=0;i<6;i++){const f=i/6,w=(.62*(1-f)+.1)*s,yy=y+.3*s+f*(h-.45*s),th=.16*s*(1-f*.3),a0=R()*6.28,jx=(R()-.5)*.03*s,jz=(R()-.5)*.03*s;
      L.push({x:t.x,y:yy,z:t.z,sx:w,sy:th,sz:w,c:shade(this.LEAF[i%3],hue)});
      for(let j=0;j<5;j++){const a=a0+j*1.2566;out.add(PG.blob,DM.leaf,{x:t.x+Math.cos(a)*w*.85,y:yy-th*.6,z:t.z+Math.sin(a)*w*.85,sx:w*.28,sy:th*.6,sz:w*.28,c:shade(this.LEAF[(i+1)%3],hue-.05)})} // hengende tupper
      if(sno)out.add(PG.blob,DM.leaf,{x:t.x+jx,y:yy+th*.55,z:t.z+jz,sx:w*(.55+.3*t.sno),sy:th*.55*t.sno,sz:w*(.55+.3*t.sno),c:this.SNO})}
    L.push({x:t.x,y:y+h-.15*s,z:t.z,sx:.08*s,sy:.22*s,sz:.08*s,c:shade(this.LEAF[0],hue)});
    for(const b of L)out.add(PG.blob,DM.leaf,b);
    if(sno)out.add(PG.blob,DM.leaf,{x:t.x,y:y+h-.05*s,z:t.z,sx:.06*s,sy:(.07*t.sno+.02)*s,sz:.06*s,c:this.SNO});
    env.perches.push({x:t.x,y:y+h+.06*s,z:t.z,kind:'top'})}
};

/* Myrull: mosetue med grasstrå og hvite bomullsdotter. Ingen kolliderer. */
PROPS.arktis_myrull={
  navn:'Myrull (arktisk)',info:'Mosetue med hvite dotter, vokser i myr. c.plant(\'arktis_myrull\',x,z,{s})',
  params:{
    s:{v:1,min:.5,max:2,step:.05,navn:'Størrelse'},
    tetthet:{v:12,min:4,max:30,step:1,navn:'Antall dotter'}
  },
  LEAF:['#7a7a4a','#6a7a40','#8a8450'],
  place(x,z,o,env){return Object.assign({x,z},propParams('arktis_myrull',o,env.rng))},
  build(t,env,out){const R=env.rng,s=t.s,y=footY(env.H,t.x,t.z,.15*s)-.02,hue=(R()-.5)*.08;
    out.add(PG.blob,DM.leaf,{x:t.x,y:y+.03*s,z:t.z,sx:.26*s,sy:.11*s,sz:.26*s,c:shade(this.LEAF[0],hue)});
    for(let i=0;i<3;i++){const a=R()*6.28,d=.14*s;out.add(PG.blob,DM.leaf,{x:t.x+Math.cos(a)*d,y:y+.02*s,z:t.z+Math.sin(a)*d,sx:.13*s,sy:.07*s,sz:.13*s,c:shade(this.LEAF[1+i%2],hue+(R()-.5)*.1)})}
    for(let i=0;i<14;i++){const a=R()*6.28,d=R()*.15*s,b={x:t.x+Math.cos(a)*d,y:y+.08*s,z:t.z+Math.sin(a)*d},v=dirVec(a,1.1+R()*.3),L=(.12+R()*.1)*s;
      out.add(DG.branch,DM.leaf,stemBetween(b,{x:b.x+v.x*L,y:b.y+v.y*L,z:b.z+v.z*L},.008*s,{c:shade('#8a9a4a',(R()-.5)*.15)}))} // grasstrå
    for(let i=0;i<t.tetthet;i++){const a=R()*6.28,d=R()*.18*s,b={x:t.x+Math.cos(a)*d,y:y+.08*s,z:t.z+Math.sin(a)*d},v=dirVec(a,1.35+R()*.2),L=(.28+R()*.14)*s,e={x:b.x+v.x*L,y:b.y+v.y*L,z:b.z+v.z*L};
      out.add(DG.branch,DM.leaf,stemBetween(b,e,.005*s,{c:'#6a7a40'}));
      out.add(PG.blob,DM.leaf,{x:e.x,y:e.y+.025*s,z:e.z,sx:.035*s,sy:.045*s,sz:.035*s,c:'#f6f6f0'})}}
};
