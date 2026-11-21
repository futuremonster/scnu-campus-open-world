function createExplorer({canvas,trees,render,drawFlatMap,schedule,openMap}) {
  const world=explorationWorld(trees);
  const [x,,z]=toWorld([1517,1000]);
  const y=world.surfaceElevation(x,z);
  const camera={yaw:-.14,tilt:.16,fraction:1,ground:y};
  const player={x,y,z,facing:camera.yaw,phase:0,gait:0};
  const movementKeys=new Set(['KeyW','KeyA','KeyS','KeyD']);
  const pressed=new Set();
  let active=true, started=false, pendingLock=false, control='paused';
  let lastFrame=null, drag=null;

  const menu=$('explore-menu'), hud=$('explore-hud'), start=$('start-explore');
  const radar=$('explore-radar');
  const radarContext=radar.getContext('2d');
  const chart=document.createElement('canvas');
  const chartScale=.5;
  chart.width=extent.width*chartScale;
  chart.height=extent.depth*chartScale;
  const chartContext=chart.getContext('2d');
  chartContext.scale(chartScale,chartScale);
  chartContext.translate(-extent.left,-extent.top);
  drawFlatMap(chartContext);
  const landmarks=Object.values(zones).map(({name,anchor})=>({name,point:toWorld(anchor)}));

  function drawRadar() {
    const [mx,mz]=toMap([player.x,0,player.z]);
    const reach=57/metresPerPixel*chartScale;
    const cx=(mx-extent.left)*chartScale, cz=(mz-extent.top)*chartScale;
    const ctx=radarContext;
    ctx.fillStyle='#41534a';
    ctx.fillRect(0,0,radar.width,radar.height);
    ctx.drawImage(chart,cx-reach,cz-reach,reach*2,reach*2,0,0,radar.width,radar.height);
    ctx.save();
    ctx.translate(radar.width/2,radar.height/2);
    ctx.save();
    ctx.rotate(-camera.yaw);
    ctx.fillStyle='#24443757';
    ctx.beginPath();
    ctx.moveTo(0,0);
    ctx.arc(0,0,70,-Math.PI/2-.65,-Math.PI/2+.65);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.rotate(-player.facing);
    paint(ctx,[[0,-14],[10,9],[0,5],[-10,9]],'#e9f3b5','#20352a',3);
    ctx.restore();
  }

  function updatePlace() {
    let name='南海校园', closest=72**2;
    for(const landmark of landmarks) {
      const distance=(player.x-landmark.point[0])**2+(player.z-landmark.point[2])**2;
      if(distance<closest) {
        name=landmark.name;
        closest=distance;
      }
    }
    const location=$('explore-location');
    if(location.textContent!==name) location.textContent=name;
  }

  function advance(dt) {
    const forward=Number(pressed.has('KeyW'))-Number(pressed.has('KeyS'));
    const strafe=Number(pressed.has('KeyD'))-Number(pressed.has('KeyA'));
    const length=Math.hypot(forward,strafe);
    let pace=0;
    if(length && dt) {
      const sin=Math.sin(camera.yaw), cos=Math.cos(camera.yaw);
      const dx=(strafe*cos-forward*sin)/length, dz=(-strafe*sin-forward*cos)/length;
      const distance=world.move(player,dx*explorerSpeed*dt,dz*explorerSpeed*dt);
      pace=clamp(distance/(explorerSpeed*dt),0,1);
      player.phase=(player.phase+distance*Math.PI/1.6)%(2*Math.PI);
      const turn=Math.atan2(-dx,-dz)-player.facing;
      player.facing+=Math.atan2(Math.sin(turn),Math.cos(turn))*(1-Math.exp(-dt*18));
    }
    player.gait+=(pace-player.gait)*(1-Math.exp(-dt*15));
    if(player.gait<.002) player.gait=0;
  }

  function draw(time,aspect) {
    const dt=lastFrame===null?0:clamp((time-lastFrame)/1000,0,.05);
    if(control!=='paused') advance(dt);
    const heightDifference=player.y-camera.ground;
    if(control==='paused' || Math.abs(heightDifference)<.003) camera.ground=player.y;
    else camera.ground=clamp(camera.ground+heightDifference*(1-Math.exp(-dt*19)),player.y-.28,player.y+.28);
    const anchor=[player.x,camera.ground+1.17,player.z];
    const {right,back}=viewAxes(camera.yaw,camera.tilt);
    const offset=back.map((value,i)=>value*5.45+right[i]*Math.min(.64,aspect*.9));
    const clearance=world.cameraClearance(anchor,offset);
    camera.fraction=Math.min(clearance,camera.fraction+
      (clearance-camera.fraction)*(1-Math.exp(-dt*9)));
    if(clearance-camera.fraction<.002) camera.fraction=clearance;
    const eye=anchor.map((value,i)=>value+offset[i]*camera.fraction);
    // Lift a squeezed camera above the avatar while keeping its shortened horizontal clearance.
    const lift=clamp((.32-camera.fraction)/.24,0,1);
    eye[1]+=2.35*lift**2;
    const tilt=Math.atan2(eye[1]-anchor[1],Math.cos(camera.tilt)*5.45*camera.fraction);
    const view=perspectiveView({yaw:camera.yaw,tilt,eye},aspect);
    render(view,{eye,shadow:explorerShadow(player,world.surfaceElevation),avatar:explorerAvatar(player)});
    if(control!=='paused') {
      drawRadar();
      updatePlace();
    }
    const moving=control!=='paused' &&
      (pressed.size || player.gait || camera.fraction<clearance || camera.ground!==player.y);
    lastFrame=moving?time:null;
    if(moving) schedule();
  }

  function play(mode) {
    pendingLock=false;
    control=mode;
    started=true;
    canvas.classList.toggle('drag-look',mode==='drag');
    $('drag-look-hint').hidden=mode!=='drag';
    menu.hidden=true;
    hud.hidden=false;
    canvas.focus({preventScroll:true});
    schedule();
  }

  function pause(focus=false) {
    const wasPlaying=control!=='paused';
    control='paused';
    pendingLock=false;
    pressed.clear();
    lastFrame=null;
    player.gait=0;
    if(drag && canvas.hasPointerCapture(drag.id)) canvas.releasePointerCapture(drag.id);
    drag=null;
    if(document.pointerLockElement===canvas) document.exitPointerLock();
    start.firstElementChild.textContent=started?'继续探索':'开始探索';
    canvas.classList.remove('drag-look');
    menu.hidden=false;
    hud.hidden=true;
    if(focus && wasPlaying) start.focus({preventScroll:true});
    schedule();
  }

  function dragFallback() {
    if(active && pendingLock) play('drag');
  }

  function begin() {
    if(!active || pendingLock || control!=='paused') return;
    pendingLock=true;
    if(!canvas.requestPointerLock) {
      dragFallback();
      return;
    }
    try {
      const request=canvas.requestPointerLock();
      request?.catch(dragFallback);
    } catch {
      dragFallback();
    }
  }

  function look(dx,dy) {
    camera.yaw-=dx*.0034;
    camera.tilt=clamp(camera.tilt+dy*.0034,-.13,.80);
    schedule();
  }

  document.addEventListener('pointerlockchange',()=>{
    if(document.pointerLockElement===canvas) {
      if(active && pendingLock) play('locked');
      else if(!active || control!=='locked') document.exitPointerLock();
    } else if(control==='locked') {
      pause(true);
    }
  });
  document.addEventListener('pointerlockerror',dragFallback);
  document.addEventListener('mousemove',event=>{
    if(active && control==='locked' && document.pointerLockElement===canvas) {
      look(event.movementX,event.movementY);
    }
  });
  canvas.addEventListener('pointerdown',event=>{
    if(!active || control!=='drag' || event.button!==0 || drag) return;
    drag={id:event.pointerId,x:event.clientX,y:event.clientY};
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove',event=>{
    if(drag?.id!==event.pointerId) return;
    look(event.clientX-drag.x,event.clientY-drag.y);
    drag.x=event.clientX;
    drag.y=event.clientY;
  });
  canvas.addEventListener('lostpointercapture',event=>{
    if(drag?.id===event.pointerId) drag=null;
  });

  window.addEventListener('keydown',event=>{
    if(!active || event.altKey || event.ctrlKey || event.metaKey) return;
    if(event.code==='KeyM' && !event.repeat) {
      event.preventDefault();
      openMap();
    } else if(event.code==='Escape' && control!=='paused') {
      pause(true);
    } else if(control!=='paused' && movementKeys.has(event.code)) {
      event.preventDefault();
      pressed.add(event.code);
      schedule();
    }
  });
  window.addEventListener('keyup',event=>pressed.delete(event.code));
  window.addEventListener('blur',()=>{
    if(active && (control!=='paused' || pendingLock)) pause();
  });
  document.addEventListener('visibilitychange',()=>{
    if(active && document.hidden && (control!=='paused' || pendingLock)) pause();
  });
  start.addEventListener('click',begin);
  $('explore-map').addEventListener('click',openMap);
  $('pause-explore').addEventListener('click',()=>pause(true));

  return {draw,setActive(enabled) {
    active=enabled;
    if(enabled) start.focus({preventScroll:true});
    else pause();
  }};
}
