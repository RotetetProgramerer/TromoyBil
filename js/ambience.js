'use strict';
/* =================================================================
   AMBIENCE: jungle sounds made with WebAudio (no sound files)
   Insects, birds, the waterfall, the volcano's rumble, parrot squawks, monkey hoots and the boulder.
   A level turns it on with  ambience:'jungle'.  Volume follows def.zone (jungle → volcano) and distance to the waterfall.
   Loaded before game.js; uses game.js globals (AC, state, LV, camera, fxAnim, ZL) only inside functions, at run time.
   ================================================================= */
let AMB=null,birdT=2,insT=0;
function noiseBuf(ac,sec=2){const n=ac.sampleRate*sec,b=ac.createBuffer(1,n,ac.sampleRate),d=b.getChannelData(0);for(let i=0;i<n;i++)d[i]=Math.random()*2-1;return b}
function noiseSrc(ac,buf){const s=ac.createBufferSource();s.buffer=buf;s.loop=true;s.start();return s}
function initAmbience(){if(AMB||!AC)return;try{const ac=AC,buf=noiseBuf(ac);
  const master=ac.createGain();master.gain.value=0;master.connect(ac.destination);
  const mk=(type,freq,Q,g0)=>{const f=ac.createBiquadFilter();f.type=type;f.frequency.value=freq;f.Q.value=Q;const g=ac.createGain();g.gain.value=g0;noiseSrc(ac,buf).connect(f);f.connect(g);g.connect(master);return{f,g}};
  const ins=mk('bandpass',4300,7,0);                 // cicadas: a narrow hiss …
  const trem=ac.createGain();trem.gain.value=.5;const lfo=ac.createOscillator();lfo.frequency.value=17;const lg=ac.createGain();lg.gain.value=.5;lfo.connect(lg);lg.connect(trem.gain);lfo.start();
  ins.g.disconnect();ins.g.connect(trem);trem.connect(master);ins.g.gain.value=1;ins.out=trem;      // … pulsing 17 times a second
  const wf=mk('lowpass',700,.7,0),wf2=mk('highpass',1800,.5,0);                                    // waterfall: a deep rush and a bright spray
  const rum=mk('lowpass',85,.8,0),hiss=mk('bandpass',2400,1.2,0);                                   // volcano: rumble and a hiss of steam
  AMB={ac,master,ins,trem,wf,wf2,rum,hiss}}catch(e){AMB=null}}
function ambPan(x,z){if(!camera)return 0;const dx=x-camera.position.x,dz=z-camera.position.z,d=Math.hypot(dx,dz)||1;const e=camera.matrixWorld.elements;return Math.max(-1,Math.min(1,(dx*e[0]+dz*e[2])/d))}
function ambVoice(x,z,dist){if(!AMB)return null;const ac=AMB.ac,g=ac.createGain(),d=Math.hypot(x-camera.position.x,z-camera.position.z),vol=Math.max(0,1-d/dist);if(vol<=0||!(state.sound))return null;
  let out=g;try{const p=ac.createStereoPanner();p.pan.value=ambPan(x,z);g.connect(p);p.connect(AMB.master);out=g}catch(e){g.connect(AMB.master)}return{g,vol,t:ac.currentTime}}
// a parrot taking off
function ambSquawk(x,z){initAmbience();const v=ambVoice(x,z,28);if(!v)return;const ac=AMB.ac,o=ac.createOscillator();o.type='sawtooth';const f=ac.createBiquadFilter();f.type='bandpass';f.frequency.value=1600;f.Q.value=2;o.connect(f);f.connect(v.g);
  const t=v.t,n=2+Math.floor(Math.random()*2);for(let i=0;i<n;i++){const t0=t+i*.17;o.frequency.setValueAtTime(900+Math.random()*300,t0);o.frequency.linearRampToValueAtTime(1500,t0+.05);o.frequency.linearRampToValueAtTime(800,t0+.14);
    v.g.gain.setValueAtTime(0,t0);v.g.gain.linearRampToValueAtTime(.09*v.vol,t0+.02);v.g.gain.linearRampToValueAtTime(0,t0+.15)}o.start(t);o.stop(t+n*.17+.05)}
// a monkey calling
function ambHoot(x,z){initAmbience();const v=ambVoice(x,z,30);if(!v)return;const ac=AMB.ac,o=ac.createOscillator();o.type='triangle';o.connect(v.g);const t=v.t,n=2+Math.floor(Math.random()*3);
  for(let i=0;i<n;i++){const t0=t+i*.28;o.frequency.setValueAtTime(420,t0);o.frequency.exponentialRampToValueAtTime(760,t0+.1);o.frequency.exponentialRampToValueAtTime(380,t0+.25);
    v.g.gain.setValueAtTime(0,t0);v.g.gain.linearRampToValueAtTime(.11*v.vol,t0+.04);v.g.gain.linearRampToValueAtTime(0,t0+.26)}o.start(t);o.stop(t+n*.28+.05)}
// a bird somewhere in the trees
function ambChirp(){if(!AMB||!state.sound)return;const ac=AMB.ac,o=ac.createOscillator();o.type='sine';const g=ac.createGain();g.gain.value=0;let out=g;try{const p=ac.createStereoPanner();p.pan.value=Math.random()*2-1;g.connect(p);p.connect(AMB.master)}catch(e){g.connect(AMB.master)}
  o.connect(g);const t=ac.currentTime,base=1800+Math.random()*2200,n=2+Math.floor(Math.random()*4),vol=.025+Math.random()*.03;
  for(let i=0;i<n;i++){const t0=t+i*(.09+Math.random()*.08);o.frequency.setValueAtTime(base,t0);o.frequency.linearRampToValueAtTime(base*(1.25+Math.random()*.4),t0+.04);o.frequency.linearRampToValueAtTime(base*.9,t0+.08);
    g.gain.setValueAtTime(0,t0);g.gain.linearRampToValueAtTime(vol,t0+.015);g.gain.linearRampToValueAtTime(0,t0+.085)}o.start(t);o.stop(t+n*.17+.1)}
// a short rumble (the boulder)
function ambRumble(dur,vol){initAmbience();if(!AMB||!state.sound)return;try{const ac=AMB.ac,s=noiseSrc(ac,noiseBuf(ac,1)),f=ac.createBiquadFilter();f.type='lowpass';f.frequency.value=120;const g=ac.createGain(),t=ac.currentTime;
  vol*=state.volAmb/70;g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(vol,t+.3);g.gain.setValueAtTime(vol,t+dur-.6);g.gain.linearRampToValueAtTime(0,t+dur);s.connect(f);f.connect(g);g.connect(ac.destination);s.stop(t+dur+.1)}catch(e){}}
function updateAmbience(dt){if(!AC||!LV)return;initAmbience();if(!AMB)return;const def=LEVELS[state.levelIdx],ac=AMB.ac,t=ac.currentTime,S_=(g,v)=>g.gain.setTargetAtTime(v,t,.25);
  const on=state.sound&&def.ambience==='jungle'&&(state.mode==='play'||state.mode==='menu'||state.mode==='pause'),vol=(state.mode==='play'?1:.45)*(state.volAmb/70);
  S_(AMB.master,on?vol:0);if(!on)return;
  const k=ZL.on?Math.max(0,ZL.k):0,jungle=1-k;                                        // 0 = jungle, 1 = volcano
  // cicadas: louder in the jungle, swelling and fading
  insT+=dt;S_(AMB.ins.out,.028*jungle*(.6+.4*Math.sin(insT*.5)));
  // birds
  birdT-=dt*(0.4+jungle);if(birdT<=0){birdT=1.2+Math.random()*3.5;if(Math.random()<.85*jungle+.1)ambChirp()}
  // waterfall: by distance to the nearest fall
  let wv=0;for(const f of fxAnim.falls){const d=Math.hypot(f.x-car.pos.x,f.z-car.pos.z);wv=Math.max(wv,Math.pow(Math.max(0,1-d/22),1.6))}
  S_(AMB.wf.g,.34*wv);S_(AMB.wf2.g,.05*wv);
  // volcano
  S_(AMB.rum.g,.16*k+(ERU.phase?.1:0));S_(AMB.hiss.g,.02*k)}
