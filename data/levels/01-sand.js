// Bane: se README for hva feltene betyr. Rekkefølgen i menyen følger rekkefølgen i index.html.
LEVELS.push(
{ id:'sand', name:'Sandklitten', diff:1, seed:11, gates:10,
  desc:'Lyse klitter, en oase, et sandhopp og en vannpytt. Fin bane for å lære lavgiret.',
  sky:['#4f95d6','#d9ecf7'], fog:0xd3e5ee, fogNear:28, fogFar:88, sun:0xfff2da, sunI:1.1, hemi:[0xd6ebff,0xd0bf9c,.62], sunDir:[-16,28,14], rockCol:'#cbc4b4', waterCol:'#4fb0b6',
  path:[[-27,-27],[-16,-22],[-8,-26],[2,-20],[6,-10],[-2,-2],[-12,4],[-14,15],[-6,24],[8,24],[18,15],[22,4],[27,-6],[24,-18],[28,-27]],
  base:(x,z,n)=>2+.9*Math.sin(x*.13+1.3)*Math.cos(z*.11)+.7*Math.sin((x+z)*.07)+fbm(n,x*.05,z*.05,4)*2.4+.03*Math.sin(x*2.2+z*.9),
  surf:()=>S.SAND,
  build(c){const R=c.rng;
    for(let i=0;i<90;i++){const x=(R()-.5)*64,z=(R()-.5)*64,r=1.1+R()*2.3,h=.7+R()*1.9;if(c.dist(x,z)<r+1.5||c.nearGate(x,z,r+2)||c.nearStart(x,z,r+4))continue;rock(x,z,r,h,{ang:R()*6.3,ax:1+R()*.7,sharp:.45+R()*.3})}
    for(let i=0;i<120;i++){const x=(R()-.5)*64,z=(R()-.5)*64;let r=.35+R()*.7,h=.18+R()*.5;if(c.dist(x,z)<1.8){h=Math.min(h,.36);r=Math.min(r,.8)}if(c.nearGate(x,z,r+.8)||c.nearStart(x,z,3.5))continue;rock(x,z,r,h,{ang:R()*6.3,ax:1+R()*.5})}
    for(const t of[.17,.36,.65,.83]){const p=c.P(t),tn=c.T(t),s=c.side(t);for(let i=0;i<9;i++){const a=(R()-.5)*4.4,b=(R()-.5)*3;rock(p.x+tn.x*a+s.x*b,p.z+tn.z*a+s.z*b,.4+R()*.5,.2+R()*.3,{ang:R()*6.3,ax:1+R()*.6})}}
    {const t=.553,p=c.P(t),s=c.side(t);for(let b=-3.2;b<=3.21;b+=.8)rock(p.x+s.x*b,p.z+s.z*b,.95,.5,{sharp:.5,nz:.2})}
    // oasis beside the line, a shallow puddle on it, and a sand jump
    {const t=.45,p=c.P(t),s=c.side(t);c.pond(p.x+s.x*3.6,p.z+s.z*3.6,2.6,.7,{bed:S.MUD})}
    {const t=.72,p=c.P(t);c.pond(p.x,p.z,1.7,.26,{fill:.4})}
    c.ramp(.3,.45,3,2.8);
    c.finish();
    c.pebbles(900,['#bdb6a6','#d2cbbb','#a59e90'],.04,.13);
    c.tufts(110,['#b9a467','#a89558','#c9b77d']);
    {const t=.45,p=c.P(t),s=c.side(t),L=[];const R2=c.rng;for(let i=0;i<40;i++){const a=R2()*6.28,d=2.5+R2()*1.1,x=p.x+s.x*3.6+Math.cos(a)*d,z=p.z+s.z*3.6+Math.sin(a)*d;
      L.push({x,y:H(x,z)-.02,z,sx:.06,sy:.5+R2()*.5,sz:.06,rx:(R2()-.5)*.5,rz:(R2()-.5)*.5,c:['#4f7a2c','#6c9a3a'][i%2]})}instanced(DG.tuft,DM.tuft,L,c.decor,false)}
  }}
);
