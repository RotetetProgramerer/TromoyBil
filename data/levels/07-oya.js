// Bane 7: Øya
// En øy med et snødekt fjell i midten. Start på stranden i sør, opp gjennom regnskogen, over hengebroa ved fossen,
// og en spiralvei 1,5 runder rundt fjellet til toppen: først grus og bart fjell, så snø og is. Snøvær og vind på toppen.
// Bekken renner fra tjernet som en trapp av kulper ned østsiden, over en klippe (fossen) og ut i havet.
// Snarvei: etter port 5 går hovedveien en lang sløyfe ut mot kysten og vader bekken. De modige tar den smale hengebroa over juvet (40 muttere ekstra).
(function(){
const C=[0,1], DEG=Math.PI/180;
const pol=(r,d)=>[C[0]+r*Math.cos(d*DEG), C[1]+r*Math.sin(d*DEG)];
const rOf=(x,z)=>Math.hypot(x-C[0],z-C[1]);
const angOf=(x,z)=>Math.atan2(z-C[1],x-C[0])/DEG;
const smt=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x)};
const lineD=(L,x,z)=>{let m=1e9;for(let i=0;i<L.length-1;i++){const a=L[i],b=L[i+1],ex=b[0]-a[0],ez=b[1]-a[1],L2=ex*ex+ez*ez;let t=((x-a[0])*ex+(z-a[1])*ez)/L2;t=t<0?0:t>1?1:t;m=Math.min(m,Math.hypot(x-a[0]-ex*t,z-a[1]-ez*t))}return m};
// radius til spiralveien ved vinkel d (grader fra sentrum): 1,5 runder fra jungelen (r=22) til toppen (r=4.6)
const RK=[[255,22],[330,19.6],[420,16.2],[520,13.2],[620,10.2],[700,7.6],[760,5.8],[800,4.6]];
const rS=d=>{for(let i=1;i<RK.length;i++)if(d<=RK[i][0]){const a=RK[i-1],b=RK[i],u=(d-a[0])/(b[0]-a[0]);return a[1]+(b[1]-a[1])*u}return 4.6};
// fjellet: høyde etter avstand fra toppen
const mount=r=>{const u=Math.max(0,Math.min(1,(22-r)/19));return 8.2*(u*u*(3-2*u)*.25+u*.75)+1.2*smt((3.5-r)/3.5)};   // jevn stigning (~43 %) og en liten topp
// øya: strandlinjen ligger ved r≈31, litt buktet
const isl=(x,z)=>31+.9*Math.sin(angOf(x,z)*3*DEG+1)+.7*Math.sin(angOf(x,z)*7*DEG);
// bekken: fra tjernet oppe i snøen, ned østsiden, over en klippe (fossen) og ut i havet
const TARN=pol(9.6,102);
const STREAM=[TARN,pol(10.8,92),pol(12.2,80),pol(13.2,68),pol(13.8,60),pol(15,56),pol(17,53),pol(19.5,50),pol(22.5,46),pol(26,42),pol(30,38),pol(34,36),pol(38,35)];
const CLIFF=(x,z)=>{const r=rOf(x,z),a=angOf(x,z);return smt((14-r)/1.4)*smt((r-12.4)/1.0)*smt((a-30)/12)*smt((92-a)/12)};   // klippehyllen fossen faller over
const FORD=pol(24.2,44), FORD_R=3.2;                                     // vadestedet på hovedveien
const fordF=(x,z)=>smt(1-Math.hypot(x-FORD[0],z-FORD[1])/FORD_R);
// hengebroa over juvet (snarveien), rett nedenfor fossen
const BX=pol(16.2,60),btau=[-Math.sin(55*DEG),Math.cos(55*DEG)];       // retning på tvers av bekken ≈ langs veien
const BR={A:[BX[0]-btau[0]*3.3,BX[1]-btau[1]*3.3],B:[BX[0]+btau[0]*3.3,BX[1]+btau[1]*3.3],hw:1.05};
// ---------- løypa ----------
const beach=[[12,-26.2],[7,-26.8],[2,-26.3],[-4,-26.9],[-9,-26.5],[-13.5,-24.5]];       // stranden, vestover
const jungle=[[-16,-22],[-17.6,-19.5],[-16.8,-17.5]];                                 // inn i regnskogen og opp
const path=[...beach,...jungle];
// port 5 (SA): hovedveien svinger ut til kysten, vader bekken og kommer tilbake til spiralen ved port 6 (SB)
const SA=pol(rS(380),380),SB=pol(rS(470),470);
const DETOUR=[SA,pol(21,30),FORD,pol(24.6,60),pol(23.4,78),pol(20.5,94),SB];
for(let d=255;d<380;d+=12)path.push(pol(rS(d),d));
path.push(...DETOUR);
for(let d=482;d<=800;d+=12)path.push(pol(rS(d),d));
path.push(pol(3.2,815),pol(1.6,840));
// snarveien: rett fram over hengebroa
const pre=[BX[0]-btau[0]*5.4,BX[1]-btau[1]*5.4],post=[BX[0]+btau[0]*5.4,BX[1]+btau[1]*5.4];
const shortcut=[SA,pre,BR.A,BX,BR.B,post,pol(rS(452),452),SB,pol(rS(482),482)];
const dShort=(x,z)=>lineD(shortcut,x,z);

LEVELS.push(
{ id:'oya', name:'Øya', diff:3, seed:317, gates:16,
  desc:'Fra stranden gjennom regnskogen og opp et snødekt fjell. Hengebro ved fossen, is på toppen og en bratt snarvei for de modige.',
  // lys på fjellet (kaldt, hvitt, tett snøtåke) …
  sky:['#3f7cc4','#d4e4f0'], fog:0xdde5ec, fogNear:12, fogFar:52, sun:0xf4f6ff, sunI:.85, hemi:[0xe8eef5,0x5a6068,.7], sunDir:[-14,22,-18], rockCol:'#6f6c68',
  // … og nede ved stranden og i jungelen (varmt, klart)
  alt:{fog:0xcfe0e6, fogNear:30, fogFar:110, sun:0xfff0d0, sunI:1.1, hemi:[0xd6ebff,0x4e5a3a,.6]},
  zone:(x,z)=>smt((16-rOf(x,z))/8),
  water:.3, waterCol:'#1f6f86', waterOpacity:.85,
  waterBand:(x,z)=>rOf(x,z)>isl(x,z)-6||lineD(STREAM,x,z)<2.6||Math.hypot(x-TARN[0],z-TARN[1])<3,
  snow:true, precip:(x,z)=>smt((11.5-rOf(x,z))/5), wind:true, ambience:'jungle',
  path, shortcut, shortcutGates:[4,5],
  gateT:c=>[[2,-26.3],[-9,-26.5],[-17.6,-19.5],pol(rS(300),300),SA,SB,pol(rS(530),530),pol(rS(590),590),pol(rS(650),650),pol(rS(710),710),pol(rS(760),760),pol(3.2,815)].map(p=>c.tOf(p[0],p[1])),
  animals:{parrots:10,circling:3,monkeys:7,butterflies:30,crabs:8},
  base(x,z,n){const r=rOf(x,z),ri=isl(x,z),ds=lineD(STREAM,x,z);
    let h=1.0+.45*fbm(n,x*.05,z*.05,3)+.08*fbm(n,x*.4,z*.4,2);
    h-=2.2*smt((r-ri+1)/3.5);                                                 // havet rundt øya
    h+=mount(r)+.3*fbm(n,x*.2,z*.2,3)*smt((22-r)/5)+.18*Math.max(0,Math.sin(r*1.7+n(x*.3,z*.3)))*smt((17-r)/3)*smt((r-7)/3);   // fjellet med lagdelte hyller
    h+=1.7*CLIFF(x,z);                                                        // klippen fossen faller over
    {const ff=fordF(x,z);h+=(1.0-h)*ff;                                             // flatt ved vadestedet
    if(ds<2.6&&r>10.5)h-=(.9+.5*smt((r-19.5)/2))*(1-(ds/2.6)**2)*(1-.5*CLIFF(x,z))*(1-.42*ff)}   // bekkedalen: dyp nede ved kysten, grunn ved vadestedet
    {const d=Math.hypot(x-TARN[0],z-TARN[1]);if(d<3.2)h-=.6*(1-(d/3.2)**2)}       // tjernet
    return h},
  surf(x,z,n){const r=rOf(x,z),ri=isl(x,z);
    if(r>ri-7)return S.SAND;
    if(lineD(STREAM,x,z)<2.8)return S.GRAVEL;
    if(r<9.5+1.2*n(x*.5,z*.5)){return r<8.5&&n(x*.7+3,z*.7)>.66?S.ICE:S.SNOW}
    if(r<13.5)return n(x*.5,z*.5)>.5?S.ROCK:S.GRAVEL;
    if(r<16)return n(x*.4+5,z*.4)>.55?S.GRAVEL:S.DIRT;
    return n(x*.4+5,z*.4)>.66?S.MUD:S.GRASS},
  build(c){const R=c.rng,def=this,T=(x,z)=>c.tOf(x,z);
    // --- stien: jord i jungelen; på fjellet lar vi underlaget stå (grus, stein, snø, is) ---
    for(let i=0;i<c.pts.length;i+=2){const p=c.pts[i],r=rOf(p.x,p.z);if(r>16&&r<isl(p.x,p.z)-7&&lineD(STREAM,p.x,p.z)>2.8)paint(p.x,p.z,1.3,S.DIRT,S.MUD)}
    // --- veien jevnes ut så bilen ikke kjører på skrå; snarveien også ---
    c.benchLine(shortcut.slice(0,3),1.1,1.5);c.benchLine(shortcut.slice(4),1.1,1.5);   // snarveien først, så hovedveien vinner der de møtes
    {const a=pol(21,30),b=pol(24.6,60);c.bench(0,T(a[0],a[1]),1.2,1.7);c.bench(T(b[0],b[1]),1,1.2,1.7)}   // ikke over vadestedet, så bekken beholder dybden
    // --- tjernet på toppen, og bekken som en trapp av kulper ned til fossen ---
    c.pond(TARN[0],TARN[1],2.4,.3,{fill:.7,bed:S.GRAVEL});
    for(let i=1;i<STREAM.length-1;i++){const a=STREAM[i],b=STREAM[i+1],L=Math.hypot(b[0]-a[0],b[1]-a[1]);for(let k=0;k<L;k+=2.6){const u=k/L,x=a[0]+(b[0]-a[0])*u,z=a[1]+(b[1]-a[1])*u,r=rOf(x,z);
      if(r<11||r>20.5||CLIFF(x,z)>.05||Math.hypot(x-BX[0],z-BX[1])<2.2)continue;c.pond(x,z,1.1,.22,{fill:.55,bed:S.GRAVEL})}}
    {const f=pol(12.3,61);c.pond(f[0],f[1],1.6,.3,{fill:.6,bed:S.GRAVEL})}   // kulpen under fossen
    // --- gjørmestien i jungelen: hjulspor, søledammer, røtter ---
    c.ruts(T(-13.5,-24.5),T(-16.8,-17.5),.04);
    for(const[t,off,r]of[[.255,.3,.8],[.28,-.4,.7],[.305,.3,.9],[.33,-.3,.8]]){const p=c.P(t),s=c.side(t);if(c.nearGate(p.x+s.x*off,p.z+s.z*off,1.3))continue;c.pond(p.x+s.x*off,p.z+s.z*off,r,.13,{fill:.55,mud:true,bed:S.MUD})}
    {const t=T(-17.2,-19);const p=c.P(t),s=c.side(t);log(p.x-s.x*2.2,p.z-s.z*2.2,p.x+s.x*2.2,p.z+s.z*2.2,.13,S.BARK,(u,d)=>d>.8?'#3d2a1a':mix('#5a3f28','#7a5638',G.noise(u*30,d*4)))}   // veltet stamme
    for(let i=0;i<30;i++){const t=.22+R()*.14,p=c.P(t),s=c.side(t),b=(R()-.5)*2.4;if(c.nearGate(p.x,p.z,1.3))continue;const a=R()*6.28,len=.5+R()*1.2,x0=p.x+s.x*b,z0=p.z+s.z*b;
      if(R()<.5)log(x0,z0,x0+Math.sin(a)*len,z0+Math.cos(a)*len,.035+R()*.03,S.BARK,()=>'#4e3a28');else rock(x0,z0,.2+R()*.25,.1+R()*.14,{ang:R()*6.3})}
    // --- hengebroa over bekken ---
    c.bridge(BR.A[0],BR.A[1],BR.B[0],BR.B[1],BR.hw,{sag:.2});
    // --- snarveien: skilt ved avkjøringen, to kasser midt på broa og bonus ---
    {const ang=Math.atan2(pre[0]-SA[0],pre[1]-SA[1]),sx=SA[0]-Math.cos(380*DEG)*2.2,sz=SA[1]-Math.sin(380*DEG)*2.2;c.fx.push({type:'sign',x:sx,z:sz,ang,text:'SNARVEI',sub:'smal bro over juvet'})}
    c.crate(BX[0]+btau[0]*.6,BX[1]+btau[1]*.6);c.crate(BX[0]-btau[0]*.6,BX[1]-btau[1]*.6);
    c.bonus(BX[0],BX[1],1.0,40,'Modig snarvei! +40 ⚙');
    // skjulte kasser: ved tjernet og bak fossen
    c.crate(TARN[0]+2.6,TARN[1]+1.2);c.crate(pol(12.6,74)[0],pol(12.6,74)[1]);
    // --- steiner: store på fjellsiden og i jungelen, små på veien ---
    const near=(x,z,m)=>c.dist(x,z)<m||dShort(x,z)<m;
    for(let i=0;i<170;i++){const x=(R()-.5)*62,z=(R()-.5)*62,r=.5+R()*1.5,h=.4+R()*1.2,rr=rOf(x,z),ax=1+R()*.6,Rx=r*ax;
      if(rr<2.6||rr>isl(x,z)-6||near(x,z,Rx+1.6)||c.nearGate(x,z,Rx+1.6)||c.nearStart(x,z,Rx+3)||!c.free(x,z,Rx+.8)||c.pools.some(p=>Math.hypot(p.x-x,p.z-z)<p.r+Rx+.6)||lineD(STREAM,x,z)<Rx+2.6)continue;
      rock(x,z,r,h*(rr<14?1.1:.7),{ang:R()*6.3,ax,surf:rr<9?S.SNOW:S.ROCK})}
    for(let i=0;i<34;i++){const t=.3+R()*.68,p=c.P(t),s=c.side(t),b=(R()-.5)*2.2;if(c.nearGate(p.x,p.z,1.4)||Math.abs(p.x-BX[0])+Math.abs(p.z-BX[1])<7)continue;rock(p.x+s.x*b,p.z+s.z*b,.3+R()*.3,.14+R()*.18,{ang:R()*6.3})}
    // skavler i snøen: lave, myke rygger på tvers av veien
    for(let i=0;i<10;i++){const t=.82+R()*.15,p=c.P(t),tn=c.T(t);if(c.nearGate(p.x,p.z,1.4))continue;rock(p.x+tn.x*(R()-.5),p.z+tn.z*(R()-.5),.9+R()*.6,.06+R()*.05,{ang:c.ang(t)+1.57,ax:2.2,sharp:1.2,nz:.15,surf:S.SNOW})}
    // steiner i bekken, og elvesteiner ved vadestedet
    for(let i=0;i<14;i++){const q=STREAM[2+Math.floor(R()*7)],a=R()*6.28,d=1+R()*1.6,x=q[0]+Math.cos(a)*d,z=q[1]+Math.sin(a)*d;if(near(x,z,1.6)||c.pools.some(p=>Math.hypot(p.x-x,p.z-z)<p.r+.4))continue;rock(x,z,.3+R()*.3,.3+R()*.3,{sharp:.5,nz:.2})}
    for(let i=0;i<9;i++){const a=R()*6.28,d=2.2+R()*2.2,x=FORD[0]+Math.cos(a)*d,z=FORD[1]+Math.sin(a)*d;if(c.dist(x,z)<1.4)continue;rock(x,z,.3+R()*.3,.3+R()*.3,{sharp:.5,nz:.2})}
    // --- trær: regnskog nede, ingen over r=14 ---
    const trunkOK=(x,z,r,minPath)=>!(near(x,z,minPath)||c.nearGate(x,z,2.2)||c.nearStart(x,z,3)||rOf(x,z)<14||rOf(x,z)>isl(x,z)-7.5||lineD(STREAM,x,z)<3.2||Math.hypot(x-BX[0],z-BX[1])<5||c.pools.some(p=>Math.hypot(p.x-x,p.z-z)<p.r+1.2)||c.trees.some(t=>Math.hypot(t.x-x,t.z-z)<r+t.r+1.6)||Math.abs(H(x+.5,z)-H(x-.5,z))+Math.abs(H(x,z+.5)-H(x,z-.5))>.4);
    for(let i=0;i<5000&&c.trees.length<110;i++){const x=(R()-.5)*66,z=(R()-.5)*66;if(!trunkOK(x,z,.3,2.4))continue;c.tree(x,z,{h:4.5+R()*4,r:.2+R()*.18})}
    c.finish();
    c.forest();
    // --- fossen: bekken faller over klippen på østsiden, rett ovenfor broa ---
    {const top=pol(13.9,60),pool=c.pools.find(p=>Math.hypot(p.x-pol(12.3,61)[0],p.z-pol(12.3,61)[1])<.1),yT=H(top[0],top[1])+.1,ang=Math.atan2(pol(12.3,61)[0]-top[0],pol(12.3,61)[1]-top[1]);c.fall(top[0],top[1],ang,2.6,yT,pool.level,{spray:false})}
    // --- grantrær på fjellsiden (r 11–16): stamme og tre kjegler ---
    const trunks=[],cones=[];
    for(let i=0;i<2500&&trunks.length<60;i++){const x=(R()-.5)*50,z=(R()-.5)*50,rr=rOf(x,z);if(rr<10.5||rr>16.5||near(x,z,2.4)||c.nearGate(x,z,2.4)||lineD(STREAM,x,z)<3||Math.hypot(x-BX[0],z-BX[1])<5||!c.free(x,z,1)||trunks.some(q=>Math.hypot(q.x-x,q.z-z)<1.8)||c.trees.some(t=>Math.hypot(t.x-x,t.z-z)<1.8))continue;
      if(Math.abs(H(x+.5,z)-H(x-.5,z))+Math.abs(H(x,z+.5)-H(x,z-.5))>.5)continue;const y=H(x,z),h=1.8+R()*1.6;trunks.push({x,z,y,h});c.colliders.push({x,z,r:.12});
      for(let k=0;k<3;k++){const u=k/3,s=.55*(1-u*.55)+R()*.1;cones.push({x,y:y+.4+h*u*.5,z,sx:s,sy:h*.5,sz:s,ry:R()*6,c:rr>9.5?['#2b5a30','#346a36','#254d2b'][k%3]:'#dfe8ee'})}}
    instanced(DG.trunk,DM.bark,trunks.map(q=>({x:q.x,y:q.y+q.h*.3,z:q.z,sx:.07,sy:q.h*.6,sz:.07,c:'#4a3826'})),c.decor);instanced(DG.fern,DM.tuft,cones,c.decor);
    // --- palmer og bregner i jungelen og på stranden ---
    const palms=[];
    for(let i=0;i<1400&&palms.length<40;i++){const x=(R()-.5)*66,z=(R()-.5)*66,rr=rOf(x,z);
      if(rr<17||rr>isl(x,z)-4.5||near(x,z,2.5)||c.nearGate(x,z,2.5)||c.nearStart(x,z,2.6)||!c.free(x,z,1.2)||c.pools.some(p=>Math.hypot(p.x-x,p.z-z)<p.r+1.6)||lineD(STREAM,x,z)<3)continue;
      if(Math.abs(H(x+.5,z)-H(x-.5,z))+Math.abs(H(x,z+.5)-H(x,z-.5))>.3||H(x,z)<def.water+.3)continue;
      if(palms.some(q=>Math.hypot(q.x-x,q.z-z)<2.4)||c.trees.some(t=>Math.hypot(t.x-x,t.z-z)<1.6))continue;palms.push({x,z,h:2.8+R()*1.8,lean:(R()-.5)*.35})}
    const ptr=[],fronds=[];
    for(const q of palms){const y=H(q.x,q.z),th=q.h,tx=q.x-Math.sin(q.lean)*th,ty=y+Math.cos(q.lean)*th;c.colliders.push({x:q.x,z:q.z,r:.17});
      ptr.push({x:q.x-Math.sin(q.lean)*th/2,y:y+Math.cos(q.lean)*th/2,z:q.z,sx:.12,sy:th,sz:.12,rz:q.lean,c:mix('#8a7048','#a58a5a',R())});
      c.perches.push({x:tx,y:ty+.5,z:q.z,kind:'top'});
      const k0=R()*6.3;for(let k=0;k<8;k++)fronds.push({x:tx,y:ty,z:q.z,sx:.2,sy:1.5+R()*.3,sz:.55,ry:k0+k*.785,rz:1.0+R()*.35,c:['#2d7a2b','#3f9a3a','#25682a'][k%3]})}
    instanced(DG.trunk,DM.white,ptr,c.decor);instanced(DG.tuft,DM.tuft,fronds,c.decor);
    const ferns=[],flowers=[],leaves=[];c.flowers=[];
    for(let i=0;i<2400&&ferns.length<360;i++){const x=(R()-.5)*64,z=(R()-.5)*64,rr=rOf(x,z);if(rr<14||rr>isl(x,z)-7||near(x,z,1.6)||lineD(STREAM,x,z)<2.6||c.pools.some(p=>Math.hypot(p.x-x,p.z-z)<p.r))continue;const s=.3+R()*.5;
      ferns.push({x,y:H(x,z)-.02,z,sx:s*.9,sy:s*1.1,sz:s*.9,ry:R()*6,c:['#2f7a2c','#3e8f35','#1f6a2a','#58a03a'][i%4]});
      if(R()<.4)leaves.push({x:x+(R()-.5)*.8,y:H(x,z)+.02,z:z+(R()-.5)*.8,sx:.28+R()*.2,sy:.6+R()*.6,sz:.1,rx:.5+R()*.6,ry:R()*6.28,c:['#2a7a3a','#3f9a4a','#1e6a30'][i%3],ord:'YXZ'});
      if(R()<.22){const f={x:x+(R()-.5)*.4,y:H(x,z)+s*.9,z:z+(R()-.5)*.4};flowers.push({...f,sx:.07,sy:.07,sz:.07,c:['#e0405a','#f08a3a','#f2d24a','#d35aa8'][i%4]});c.flowers.push(f)}}
    instanced(DG.fern,DM.tuft,ferns,c.decor);instanced(DG.leaf,DM.leaf,leaves,c.decor,false);instanced(DG.cone,DM.white,flowers,c.decor,false);
    // --- drivved og campingtelt på stranden (viser skalaen) ---
    for(let i=0;i<10;i++){const x=(R()-.5)*40,z=-29+R()*3;if(c.dist(x,z)<1.6||H(x,z)<def.water+.1)continue;const a=R()*6.28,len=.8+R()*1.4;log(x,z,x+Math.sin(a)*len,z+Math.cos(a)*len,.06+R()*.05,S.BARK,()=>'#9a8468')}
    {const tents=[];for(const[x,z,col]of[[13.5,-23.5,'#e04a3a'],[15.3,-22,'#3a7ad8'],[12.1,-21.6,'#f2c23a']]){const y=H(x,z);tents.push({x,y:y+.3,z,sx:.5,sy:.6,sz:.5,ry:R()*6,c:col});c.colliders.push({x,z,r:.45})}instanced(DG.fern,DM.leaf,tents,c.decor)}
    // --- snøtåke og skyer rundt toppen ---
    for(let i=0;i<40;i++){const a=R()*6.28,d=4+R()*9,x=C[0]+Math.cos(a)*d,z=C[1]+Math.sin(a)*d;c.fx.push({type:'mist',x,z,y:H(x,z)+.8+R()*.8,s:4+R()*5})}
    for(let i=0;i<24;i++){const x=(R()-.5)*66,z=(R()-.5)*66;if(rOf(x,z)<16||rOf(x,z)>isl(x,z)-6)continue;c.fx.push({type:'mist',x,z,y:H(x,z)+.9+R()*.6,s:5+R()*5})}
    c.pebbles(600,['#6f6a63','#8a847a','#4f4a44'],.04,.11);
    c.tufts(70,['#4d7a2f','#6b9a3c']);
  }}
);
})();
