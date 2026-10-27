'use strict';
/* Savannen (Løveøya): trær, termittuer, gress og de store dyrene som står i ro. Prefikset er savanne_*.
   De som beveger seg og angriper (løver, geparder, krokodiller), og flokkene som flykter (sebraer, gnuer, gaseller, sjiraffer),
   ligger i js/savannedyr.js. Samme regler som i data/vegetasjon.js og data/dyr.js: place legger kollidere, build tegner. */

/* Akasie (paraplytorn): smal stamme som deler seg i tre-fire greiner som sprer seg skrått ut, og en flat, bred krone
   av mange flate lag. Vevernes reir henger under kronen. */
PROPS.savanne_akasie={
  navn:'Akasie (savanne)',info:'Paraplyformet tornetre med flat krone. c.plant(\'savanne_akasie\',x,z,{s,krone,reir})',
  params:{
    s:{v:1,min:.5,max:1.8,step:.05,navn:'Størrelse'},
    krone:{v:1,min:.6,max:1.6,step:.05,navn:'Kronebredde'},
    reir:{v:3,min:0,max:8,step:1,navn:'Veverreir'}
  },
  LEAF:['#6f8a3a','#5f7a32','#829a48','#7a8a3a'],
  place(x,z,o,env){const p=propParams('savanne_akasie',o,env.rng);env.colliders.push({x,z,r:.12*p.s,anchor:true,y:env.H(x,z)+1*p.s});return Object.assign({x,z},p)},
  build(t,env,out){const R=env.rng,s=t.s,k=s*t.krone,y=footY(env.H,t.x,t.z,.15*s)-.03,bark=shade('#5a4636',(R()-.5)*.12),hue=(R()-.5)*.08,a0=R()*6.28;
    // stammen, litt skjev, til der den deler seg
    const fork={x:t.x+Math.cos(a0)*.12*s,y:y+.9*s,z:t.z+Math.sin(a0)*.12*s};
    out.add(DG.branch,DM.bark,stemBetween({x:t.x,y,z:t.z},fork,.1*s,{c:bark}));
    out.add(PG.blob,DM.bark,{x:t.x,y:y+.04*s,z:t.z,sx:.16*s,sy:.08*s,sz:.16*s,c:bark});   // rotfoten
    const n=3+(R()<.5?1:0),top=y+2.1*s,L=[],ends=[];
    for(let i=0;i<n;i++){const a=a0+i*6.28/n+(R()-.5)*.6,mid={x:fork.x+Math.cos(a)*.45*k,y:fork.y+.6*s,z:fork.z+Math.sin(a)*.45*k},
        end={x:fork.x+Math.cos(a)*(.9+R()*.3)*k,y:top-(R()*.15)*s,z:fork.z+Math.sin(a)*(.9+R()*.3)*k};
      out.add(DG.branch,DM.bark,stemBetween(fork,mid,.065*s,{c:bark}));out.add(DG.branch,DM.bark,stemBetween(mid,end,.04*s,{c:bark}));ends.push(end);
      // kvister ut til kanten
      for(let j=0;j<3;j++){const b=a+(R()-.5)*1.4,e={x:end.x+Math.cos(b)*.35*k,y:end.y+.05*s,z:end.z+Math.sin(b)*.35*k};out.add(DG.branch,DM.bark,stemBetween(end,e,.018*s,{c:bark}))}}
    // kronen: flate lag rundt greinendene, og et tynnere lag over midten
    for(const e of ends)for(let j=0;j<4;j++){const b=R()*6.28,d=R()*.5*k;L.push({x:e.x+Math.cos(b)*d,y:e.y+.08*s+R()*.08*s,z:e.z+Math.sin(b)*d,sx:(.55+R()*.25)*k,sy:(.1+R()*.05)*s,sz:(.55+R()*.25)*k,c:shade(this.LEAF[j],hue+(R()-.5)*.1)})}
    L.push({x:fork.x,y:top+.14*s,z:fork.z,sx:1.1*k,sy:.11*s,sz:1.1*k,c:shade(this.LEAF[2],hue)});
    L.push({x:fork.x,y:top+.04*s,z:fork.z,sx:1.25*k,sy:.07*s,sz:1.25*k,c:shade(this.LEAF[1],hue-.08)});   // mørk underside
    for(const b of L)out.add(DG.canopy,DM.leaf,b);   // DG.canopy: a coarser sphere, there are many of these
    // veverreir: små strå-dråper som henger under kronen
    for(let i=0;i<t.reir;i++){const b=R()*6.28,d=(.4+R()*.6)*k,x=fork.x+Math.cos(b)*d,z=fork.z+Math.sin(b)*d,ny=top-.12*s-R()*.08*s;
      out.add(DG.branch,DM.bark,stemBetween({x,y:top,z},{x,y:ny+.05*s,z},.006*s,{c:'#8a7a4a'}));out.add(PG.blob,DM.leaf,{x,y:ny,z,sx:.06*s,sy:.08*s,sz:.06*s,c:shade('#b8a060',(R()-.5)*.15)})}
    env.perches.push({x:fork.x,y:top+.25*s,z:fork.z,kind:'top'});for(const e of ends)env.perches.push({x:e.x,y:e.y+.2*s,z:e.z,kind:'branch'})}
};

/* Baobab: tykk, flaskeformet stamme med folder i barken, korte stumpe greiner øverst som ligner røtter,
   og bare noen få bladdusker (tørketid). Kan ha en hule nederst. */
PROPS.savanne_baobab={
  navn:'Baobab (savanne)',info:'Apebrødtre med tykk flaskestamme. c.plant(\'savanne_baobab\',x,z,{s,blad})',
  params:{
    s:{v:1,min:.6,max:1.8,step:.05,navn:'Størrelse'},
    tykk:{v:1,min:.7,max:1.4,step:.05,navn:'Tykkelse'},
    blad:{v:.4,min:0,max:1,step:.05,navn:'Blader'}
  },
  place(x,z,o,env){const p=propParams('savanne_baobab',o,env.rng);env.colliders.push({x,z,r:.5*p.s*p.tykk,anchor:true,y:env.H(x,z)+1*p.s});return Object.assign({x,z},p)},
  build(t,env,out){const R=env.rng,s=t.s,w=.48*s*t.tykk,y=footY(env.H,t.x,t.z,w)-.05,bark=shade('#9a8678',(R()-.5)*.1),dk=shade(bark,-.25),h=2.1*s;
    // stammen: stablede kuler, bredest nede, smalere opp mot toppen
    out.add(PG.blob,PM.bark,{x:t.x,y:y+.55*s,z:t.z,sx:w*1.05,sy:.75*s,sz:w*1.05,c:bark});                         // den tykke buken
    out.add(DG.trunk,PM.bark,{x:t.x,y:y+h*.62,z:t.z,sx:w*.66,sy:h*.75,sz:w*.66,c:bark});                         // halsen opp mot greinene
    // folder i barken: svake, loddrette ribber rundt stammen
    for(let i=0;i<7;i++){const a=i*.9+(R()-.5)*.2;out.add(DG.branch,PM.bark,stemBetween({x:t.x+Math.cos(a)*w*.95,y:y+.12*s,z:t.z+Math.sin(a)*w*.95},{x:t.x+Math.cos(a)*w*.62,y:y+h*.9,z:t.z+Math.sin(a)*w*.62},.05*s,{c:shade(bark,-.08)}))}
    // hulen nede på den ene siden
    {const a=R()*6.28;out.add(PG.blob,PM.glatt,{x:t.x+Math.cos(a)*w*.9,y:y+.3*s,z:t.z+Math.sin(a)*w*.9,sx:.1*s,sy:.2*s,sz:.1*s,c:'#2a1e16'})}
    // greinene: korte og stumpe, delt to ganger
    const top={x:t.x,y:y+h,z:t.z},tips=[];
    for(let i=0;i<6;i++){const a=i*1.05+(R()-.5)*.4,e=dirVec(a,.35+R()*.35),l=(.45+R()*.3)*s,m={x:top.x+e.x*l,y:top.y+e.y*l,z:top.z+e.z*l};
      out.add(DG.branch,PM.bark,stemBetween({x:top.x+Math.cos(a)*w*.3,y:top.y-.1*s,z:top.z+Math.sin(a)*w*.3},m,.1*s,{c:bark}));
      for(let j=0;j<2;j++){const b=a+(j?.5:-.5),e2=dirVec(b,.6),l2=(.25+R()*.2)*s,q={x:m.x+e2.x*l2,y:m.y+e2.y*l2,z:m.z+e2.z*l2};out.add(DG.branch,PM.bark,stemBetween(m,q,.045*s,{c:bark}));tips.push(q)}}
    for(const q of tips)if(R()<t.blad)out.add(PG.blob,DM.leaf,{x:q.x,y:q.y+.06*s,z:q.z,sx:.22*s,sy:.14*s,sz:.22*s,c:shade('#6a8a3a',(R()-.5)*.15)});
    env.perches.push({x:top.x,y:top.y+.1*s,z:top.z,kind:'top'})}
};

/* Termittue: høy, rødbrun tue av leire med flere spir, furer og små hull. */
PROPS.savanne_termitt={
  navn:'Termittue (savanne)',info:'Rødbrun termittue med spir. c.plant(\'savanne_termitt\',x,z,{s,spir})',
  params:{
    s:{v:1,min:.4,max:1.8,step:.05,navn:'Størrelse'},
    spir:{v:3,min:1,max:6,step:1,navn:'Spir'}
  },
  place(x,z,o,env){const p=propParams('savanne_termitt',o,env.rng);env.colliders.push({x,z,r:.32*p.s,anchor:true,y:env.H(x,z)+.5*p.s});return Object.assign({x,z},p)},
  build(t,env,out){const R=env.rng,s=t.s,y=footY(env.H,t.x,t.z,.35*s)-.04,col=shade('#a0522d',(R()-.5)*.12);
    out.add(PG.blob,PM.pels,{x:t.x,y,z:t.z,sx:.42*s,sy:.22*s,sz:.4*s,c:shade(col,-.08)});                         // foten
    out.add(PG.blob,PM.pels,{x:t.x,y:y+.35*s,z:t.z,sx:.3*s,sy:.45*s,sz:.28*s,c:col});                             // hoveddelen
    for(let i=0;i<t.spir;i++){const a=R()*6.28,d=i?(.1+R()*.14)*s:0,hh=(i?.6+R()*.5:1.25+R()*.3)*s,b={x:t.x+Math.cos(a)*d,y:y+.2*s,z:t.z+Math.sin(a)*d};
      out.add(DG.branch,PM.pels,stemBetween(b,{x:b.x+(R()-.5)*.05*s,y:y+hh,z:b.z+(R()-.5)*.05*s},(i?.09:.13)*s,{c:shade(col,(R()-.5)*.1)}));
      out.add(PG.blob,PM.pels,{x:b.x,y:y+hh,z:b.z,sx:(i?.05:.07)*s,sy:.06*s,sz:(i?.05:.07)*s,c:shade(col,.05)})}
    for(let i=0;i<6;i++){const a=R()*6.28,u=R()*.5;out.add(PG.blob,PM.glatt,{x:t.x+Math.cos(a)*.27*s,y:y+(.15+u)*s,z:t.z+Math.sin(a)*.25*s,sx:.025*s,sy:.035*s,sz:.025*s,c:'#2a1810'})}   // hull
    for(let i=0;i<5;i++){const a=R()*6.28,d=(.45+R()*.2)*s;out.add(PG.blob,PM.pels,{x:t.x+Math.cos(a)*d,y:y+.01,z:t.z+Math.sin(a)*d,sx:.09*s,sy:.04*s,sz:.08*s,c:shade(col,-.12)})}}   // leirklumper rundt
};

/* Elefantgress: høy dusk av tørt, gyllent gress. Ingen kollider: bilen kjører gjennom. */
PROPS.savanne_gress={
  navn:'Elefantgress (savanne)',info:'Høy dusk av tørt gress, uten kollider. c.plant(\'savanne_gress\',x,z,{s})',
  params:{s:{v:1,min:.4,max:1.8,step:.05,navn:'Størrelse'}},
  COL:['#c9a84a','#b8963c','#d8bc66','#a88a38','#9a8a3c'],
  place(x,z,o,env){return Object.assign({x,z},propParams('savanne_gress',o,env.rng))},
  build(t,env,out){const R=env.rng,s=t.s,y=env.H(t.x,t.z)-.02,n=8+Math.floor(R()*6);
    for(let i=0;i<n;i++){const a=R()*6.28,d=R()*.18*s,lean=.15+R()*.35;
      out.add(DG.tuft,DM.tuft,{x:t.x+Math.cos(a)*d,y:y+.32*s,z:t.z+Math.sin(a)*d,sx:.03*s,sy:(.5+R()*.35)*s,sz:.03*s,rx:Math.sin(a)*lean,rz:-Math.cos(a)*lean,c:this.COL[i%this.COL.length]});
      if(R()<.4)out.add(DG.leaf,DM.leaf,{x:t.x+Math.cos(a)*(d+.1*s),y:y+(.7+R()*.2)*s,z:t.z+Math.sin(a)*(d+.1*s),sx:.025*s,sy:.09*s,sz:.025*s,c:'#d8c27a'})}}   // frøaks
};

/* Knokler: hodeskalle med horn og en rad ribbein som stikker opp av gresset. Ingen kollider. */
PROPS.savanne_knokler={
  navn:'Knokler (savanne)',info:'Bleke knokler etter et gammelt bytte. c.plant(\'savanne_knokler\',x,z,{s})',
  params:{s:{v:1,min:.5,max:1.6,step:.05,navn:'Størrelse'},retning:DYR.retning},
  place(x,z,o,env){return Object.assign({x,z},propParams('savanne_knokler',o,env.rng))},
  build(t,env,out){const s=t.s,M=DYR.M,F=DYR.ramme(t.x,t.z,env.H(t.x,t.z),t.retning),P=F.P,ben='#ebe3cf';
    for(let i=0;i<6;i++){const f=-.3*s+i*.09*s;for(const sg of[-1,1])DYR.polse(out,M.glatt,ben,[P(f,.02*s,0),P(f,.14*s,sg*.1*s),P(f,.1*s,sg*.18*s)],()=>.012*s)}
    DYR.ledd(out,M.glatt,ben,P(-.35*s,.02*s,0),P(.25*s,.03*s,0),.02*s);                           // ryggraden
    DYR.el(out,M.glatt,ben,P(.4*s,.06*s,0),V0(F),.14*s,.06*s);                                    // hodeskallen
    for(const sg of[-1,1]){DYR.kule(out,M.glatt,'#2a2420',P(.42*s,.08*s,sg*.04*s),.018*s);DYR.polse(out,M.glatt,'#cfc2a2',[P(.36*s,.1*s,sg*.05*s),P(.36*s,.16*s,sg*.14*s),P(.42*s,.24*s,sg*.17*s)],()=>.014*s)}}
};
function V0(F){return F.V(1,0,0)}

/* Elefant: stor grå kropp, store ører, snabel som henger (eller går ned i vannet når den drikker), støttenner, hale med dusk.
   unge:1 tegner en kalv ved siden av. */
PROPS.savanne_elefant={dyr:true,
  navn:'Elefant (savanne)',info:'Afrikansk elefant, eventuelt med kalv. c.plant(\'savanne_elefant\',x,z,{s,drikker,unge})',
  params:{
    s:{v:1,min:.6,max:1.4,step:.05,navn:'Størrelse'},
    retning:DYR.retning,
    drikker:{v:0,min:0,max:1,step:1,navn:'Drikker'},
    unge:{v:0,min:0,max:1,step:1,navn:'Med kalv'}
  },
  place(x,z,o,env){const p=propParams('savanne_elefant',o,env.rng);env.colliders.push({x,z,r:.75*p.s,anchor:true,y:env.H(x,z)+1*p.s});
    if(p.unge>=.5){const a=p.retning+1.9;env.colliders.push({x:x+Math.cos(a)*1.1*p.s,z:z+Math.sin(a)*1.1*p.s,r:.4*p.s})}return Object.assign({x,z},p)},
  one(env,out,x,z,a,s,drikker,R){const M=DYR.M,F=DYR.ramme(x,z,footY(env.H,x,z,.5*s),a),P=F.P,V=F.V,hud=shade('#7d7570',(R()-.5)*.06),dk=shade(hud,-.18),bh=1.15*s;
    DYR.el(out,M.pels,hud,P(0,bh,0),V(1,.04,0),.85*s,.48*s);                                   // kroppen
    DYR.kule(out,M.pels,hud,P(.38*s,bh+.12*s,0),.45*s,.42*s);DYR.kule(out,M.pels,hud,P(-.42*s,bh+.02*s,0),.42*s,.4*s);   // skuldre og hofter
    for(const sg of[-1,1])for(const f of[.4,-.42]){DYR.ledd(out,M.pels,hud,P(f*s,bh-.15*s,sg*.25*s),P(f*s,.06*s,sg*.25*s),.17*s);DYR.kule(out,M.pels,dk,P(f*s,.06*s,sg*.25*s),.18*s,.07*s)}   // bein og føtter
    const hf=.95*s,hu=bh+.22*s;DYR.kule(out,M.pels,hud,P(hf,hu,0),.34*s,.36*s);                 // hodet
    for(const sg of[-1,1]){
      DYR.el(out,M.pels,shade(hud,-.05),P(hf-.2*s,hu+.02*s,sg*.34*s),V(-.2,0,sg),.06*s,.36*s);  // ørene
      DYR.oye(out,F,hf+.2*s,hu+.08*s,sg*.25*s,.03*s);
      DYR.polse(out,M.glatt,'#efe6d0',[P(hf+.22*s,hu-.22*s,sg*.14*s),P(hf+.42*s,hu-.35*s,sg*.17*s),P(hf+.6*s,hu-.28*s,sg*.15*s)],()=>.04*s)}   // støttenner
    const trunk=drikker?[P(hf+.3*s,hu-.1*s,0),P(hf+.5*s,hu-.5*s,0),P(hf+.65*s,.4*s,0),P(hf+.75*s,.05*s,0)]:[P(hf+.3*s,hu-.1*s,0),P(hf+.44*s,hu-.5*s,0),P(hf+.46*s,.5*s,0),P(hf+.52*s,.25*s,0)];
    DYR.polse(out,M.pels,hud,trunk,f=>(.12-.07*f)*s);
    DYR.polse(out,M.pels,dk,[P(-.85*s,bh+.1*s,0),P(-.95*s,bh-.3*s,0),P(-.95*s,bh-.6*s,0)],()=>.025*s);DYR.kule(out,M.pels,'#2a2420',P(-.95*s,bh-.66*s,0),.04*s,.07*s)},   // halen
  build(t,env,out){const R=env.rng;this.one(env,out,t.x,t.z,t.retning,t.s,t.drikker>=.5,R);
    if(t.unge>=.5){const a=t.retning+1.9;this.one(env,out,t.x+Math.cos(a)*1.1*t.s,t.z+Math.sin(a)*1.1*t.s,t.retning+.3,t.s*.45,false,R)}}
};

/* Flodhest i vannet: bare ryggen, hodet med nesebor, øyne og små ører stikker opp. */
PROPS.savanne_flodhest={dyr:true,
  navn:'Flodhest (savanne)',info:'Flodhest som ligger i vannet med bare ryggen og hodet over. c.plant(\'savanne_flodhest\',x,z,{s,y})',
  params:{s:{v:1,min:.6,max:1.4,step:.05,navn:'Størrelse'},retning:DYR.retning,y:{v:.3,min:-2,max:5,step:.01,navn:'Vannflaten'}},
  place(x,z,o,env){const p=propParams('savanne_flodhest',o,env.rng);env.colliders.push({x,z,r:.55*p.s});return Object.assign({x,z},p)},
  build(t,env,out){const R=env.rng,s=t.s,M=DYR.M,F=DYR.ramme(t.x,t.z,t.y,t.retning),P=F.P,V=F.V,hud=shade('#6e5a60',(R()-.5)*.06),rosa='#b88a86';
    DYR.el(out,M.glatt,hud,P(0,-.08*s,0),V(1,0,0),.7*s,.36*s);                                  // ryggen
    DYR.el(out,M.glatt,hud,P(.6*s,0,0),V(1,0,0),.32*s,.2*s);                                    // hodet
    DYR.el(out,M.glatt,rosa,P(.84*s,-.02*s,0),V(1,0,0),.16*s,.16*s);                             // snuten
    for(const sg of[-1,1]){DYR.kule(out,M.glatt,'#2a1e1e',P(.95*s,.1*s,sg*.06*s),.025*s);DYR.oye(out,F,.6*s,.15*s,sg*.11*s,.03*s);DYR.kule(out,M.glatt,hud,P(.48*s,.2*s,sg*.11*s),.035*s,.05*s)}
    for(let i=0;i<4;i++){const a=R()*6.28,d=(.8+R()*.4)*s;out.add(PG.blob,PM.glatt,{x:t.x+Math.cos(a)*d,y:t.y+.005,z:t.z+Math.sin(a)*d,sx:.18*s,sy:.01,sz:.06*s,ry:R()*3,c:'#cfe4e8'})}}   // ringer i vannet
};
