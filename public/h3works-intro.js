(() => {
  const splash = document.getElementById('h3LaunchSplash');
  if (!splash) {
    document.body.classList.remove('h3-intro-running');
    return;
  }

  const lockup = splash.querySelector('.h3-launch-inner');
  const mark = splash.querySelector('.h3-launch-mark');
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const PLANE_SRC = 'data:image/webp;base64,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';

  const canvas = document.createElement('canvas');
  canvas.className = 'h3-motion-canvas';
  const ctx = canvas.getContext('2d');
  const plane = document.createElement('img');
  plane.className = 'h3-flight-plane';
  plane.alt = '';
  plane.src = PLANE_SRC;
  splash.insertBefore(canvas, lockup);
  splash.insertBefore(plane, lockup);

  let w = 0, h = 0, dpr = 1, targetX = 0, targetY = 0;
  let trail = [];
  let particles = [];
  let soundStarted = false;
  let audioCtx = null;
  const startedAt = performance.now();
  const DURATION = reduced ? 1150 : 4900;

  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  const smooth = (v) => { const x = clamp01(v); return x*x*x*(x*(x*6-15)+10); };
  const bezier = (a,b,c,d,t) => {
    const u = 1-t;
    return u*u*u*a + 3*u*u*t*b + 3*u*t*t*c + t*t*t*d;
  };

  function resize() {
    w = window.innerWidth;
    h = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(w*dpr);
    canvas.height = Math.round(h*dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(dpr,0,0,dpr,0,0);
    const r = mark.getBoundingClientRect();
    targetX = r.left + r.width/2;
    targetY = r.top + r.height/2;
  }
  resize();
  window.addEventListener('resize', resize, { passive:true });

  function positionAt(ms) {
    const min = Math.min(w,h);
    const start = { x:-170, y:h*.78 };
    const orbitEntry = { x:targetX-min*.20, y:targetY+min*.17 };
    if (ms <= 1550) {
      const u = smooth((ms-180)/(1550-180));
      return {
        x: bezier(start.x, w*.08, w*.34, orbitEntry.x, u),
        y: bezier(start.y, h*.72, h*.49, orbitEntry.y, u)
      };
    }
    const orbitR0 = min*.235;
    const orbitR1 = min*.115;
    const theta0 = 170*Math.PI/180;
    if (ms <= 3550) {
      const u = smooth((ms-1550)/2000);
      const theta = theta0 - Math.PI*2*u;
      const radius = orbitR0 + (orbitR1-orbitR0)*u;
      return { x:targetX + radius*Math.cos(theta), y:targetY + radius*Math.sin(theta) };
    }
    const orbitEnd = { x:targetX + orbitR1*Math.cos(theta0-Math.PI*2), y:targetY + orbitR1*Math.sin(theta0-Math.PI*2) };
    const u = smooth((ms-3550)/(4050-3550));
    return {
      x: bezier(orbitEnd.x, targetX+34, targetX+10, targetX, u),
      y: bezier(orbitEnd.y, targetY+72, targetY+18, targetY, u)
    };
  }

  function emit(x,y,ms) {
    if (ms < 180 || ms > 4080) return;
    const count = ms < 1550 ? 1 : ms < 3550 ? 3 : 5;
    for (let i=0;i<count;i++) {
      const a = Math.random()*Math.PI*2;
      const speed = 10 + Math.random()*34;
      const life = 340 + Math.random()*620;
      particles.push({ x:x+(Math.random()-.5)*16, y:y+(Math.random()-.5)*16, vx:Math.cos(a)*speed, vy:Math.sin(a)*speed, life, max:life, size:1.4+Math.random()*3.8 });
    }
    if (particles.length > 260) particles.splice(0, particles.length-260);
  }

  function drawFx(ms, x, y, delta) {
    ctx.clearRect(0,0,w,h);
    trail.push({x,y,t:ms});
    while (trail.length && ms-trail[0].t > 520) trail.shift();
    if (trail.length > 1) {
      ctx.lineCap = 'round';
      for (let i=1;i<trail.length;i++) {
        const age = ms-trail[i].t;
        const a = Math.max(0,1-age/520);
        ctx.strokeStyle = `rgba(255,185,36,${.18*a*a})`;
        ctx.lineWidth = 1 + 5*a;
        ctx.beginPath();
        ctx.moveTo(trail[i-1].x,trail[i-1].y);
        ctx.lineTo(trail[i].x,trail[i].y);
        ctx.stroke();
      }
    }
    emit(x,y,ms);
    const dt = Math.min(delta,34)/1000;
    particles = particles.filter(p => {
      p.life -= delta;
      if (p.life <= 0) return false;
      p.x += p.vx*dt; p.y += (p.vy+8)*dt; p.vx *= .986; p.vy *= .986;
      const a = p.life/p.max;
      ctx.fillStyle = `rgba(255,213,113,${.72*a})`;
      ctx.beginPath(); ctx.arc(p.x,p.y,p.size*(.75+.25*a),0,Math.PI*2); ctx.fill();
      ctx.fillStyle = `rgba(255,249,220,${.82*a})`;
      ctx.beginPath(); ctx.arc(p.x,p.y,Math.max(.8,p.size*.28),0,Math.PI*2); ctx.fill();
      return true;
    });
  }

  function scheduleSound(offset=0) {
    if (soundStarted) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      audioCtx ||= new AC();
      if (audioCtx.state !== 'running') return;
      soundStarted = true;
      const now = audioCtx.currentTime;
      const when = (t) => now + Math.max(.01, t-offset);
      const noiseBuffer = audioCtx.createBuffer(1, Math.ceil(audioCtx.sampleRate*1.45), audioCtx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i=0;i<data.length;i++) data[i]=(Math.random()*2-1)*.28;
      if (offset < 1.55) {
        const n = audioCtx.createBufferSource(); n.buffer=noiseBuffer;
        const f = audioCtx.createBiquadFilter(); f.type='bandpass'; f.frequency.value=650; f.Q.value=.55;
        const g = audioCtx.createGain();
        const s = when(.18), e = when(1.55);
        g.gain.setValueAtTime(.0001,s); g.gain.exponentialRampToValueAtTime(.11,s+.42); g.gain.exponentialRampToValueAtTime(.0001,e);
        n.connect(f).connect(g).connect(audioCtx.destination); n.start(s, Math.max(0,offset-.18)); n.stop(e+.05);
      }
      if (offset < 4.45) {
        [1046.5,1318.5,1568].forEach((freq,idx)=>{
          const o=audioCtx.createOscillator(); const g=audioCtx.createGain();
          o.type='sine'; o.frequency.value=freq;
          const s=when(3.90+idx*.025); g.gain.setValueAtTime(.0001,s); g.gain.exponentialRampToValueAtTime(.045/(idx+1),s+.018); g.gain.exponentialRampToValueAtTime(.0001,s+.62);
          o.connect(g).connect(audioCtx.destination); o.start(s); o.stop(s+.68);
        });
      }
    } catch (_) {}
  }

  const trySound = async () => {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC || soundStarted) return;
    try {
      audioCtx ||= new AC();
      await audioCtx.resume();
      if (audioCtx.state === 'running') scheduleSound((performance.now()-startedAt)/1000);
    } catch (_) {}
  };
  trySound();
  window.addEventListener('pointerdown', trySound, { once:true, passive:true });

  if (reduced) {
    plane.style.display='none';
    lockup.style.opacity='1';
    lockup.style.transform='translateY(0) scale(1)';
  }

  let last = startedAt;
  function frame(now) {
    const ms = now-startedAt;
    const delta = now-last; last=now;
    if (!reduced) {
      const p = positionAt(ms);
      const p2 = positionAt(Math.min(4050,ms+12));
      const angle = Math.atan2(p2.y-p.y,p2.x-p.x)*180/Math.PI + 24;
      const planeAlpha = ms < 180 ? 0 : ms < 420 ? smooth((ms-180)/240) : ms > 3780 ? 1-smooth((ms-3780)/300) : 1;
      plane.style.opacity = String(clamp01(planeAlpha));
      plane.style.transform = `translate3d(${p.x}px,${p.y}px,0) translate(-50%,-50%) rotate(${angle}deg)`;
      drawFx(ms,p.x,p.y,delta);
      const reveal = smooth((ms-3900)/430);
      lockup.style.opacity = String(reveal);
      lockup.style.transform = `translateY(${10*(1-reveal)}px) scale(${.94+.06*reveal})`;
      if (ms > 3850 && ms < 4260) {
        const flash = Math.sin(Math.PI*clamp01((ms-3850)/410));
        splash.style.setProperty('--h3-flash', String(flash));
      }
    }
    if (ms >= DURATION) return finish();
    requestAnimationFrame(frame);
  }

  let finished=false;
  function finish() {
    if (finished) return; finished=true;
    lockup.style.opacity='1';
    lockup.style.transform='translateY(0) scale(1)';
    document.body.classList.remove('h3-intro-running');
    document.body.classList.add('h3-intro-reveal');
    splash.classList.add('is-leaving');
    window.setTimeout(()=>{
      splash.remove();
      document.body.classList.remove('h3-intro-reveal');
      window.removeEventListener('resize',resize);
    },650);
  }

  requestAnimationFrame(frame);
  window.setTimeout(finish, DURATION+900);
})();
