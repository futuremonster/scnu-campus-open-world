const $ = id => document.getElementById(id);
const map = $('map');
let canvas = $('scene');
const trees=makeTrees();
const terrain=makeTerrain(trees);
let renderGL;
try {
  renderGL=renderer(canvas,terrain,sceneMesh(trees));
} catch(error) {
  console.warn('WebGL scene unavailable',error);
  const replacement=canvas.cloneNode(false);
  canvas.replaceWith(replacement);
  canvas=replacement;
}
const context2D=renderGL?null:canvas.getContext('2d');
let exploreMode=Boolean(renderGL);
const defaultYaw=.25;
const defaultTilt=.88;
let topMode=!renderGL;
let labelsVisible=true;
let current=null;
const view={yaw:topMode?0:defaultYaw,tilt:topMode?Math.PI/2:defaultTilt,half:430,target:toWorld([1534,805])};
let previous3D={yaw:defaultYaw,tilt:defaultTilt};
let width=1, height=1, frameRequested=false, tween=0;
let overviewFraming=true;
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarsePointer=matchMedia('(pointer: coarse)');
const ordered=['track','engineering','gym','academic','library','info','business','rennes','dorm','dining','north','southeast'];
const priorities=['academic','track','engineering','dorm','library','dining','info','business','southeast','north','gym','rennes'];
const pins=new Map();
const sideLinks=new Map();
const extentMini={left:831,top:55,width:1410,depth:1491};
const mini=$('overview');
const miniContext=mini.getContext('2d');
const miniBase=document.createElement('canvas');
miniBase.width=mini.width;
miniBase.height=mini.height;
const miniBackground=miniBase.getContext('2d');
miniBackground.scale(mini.width/extentMini.width,mini.height/extentMini.depth);
miniBackground.translate(-extentMini.left,-extentMini.top);
function drawFlatMap(ctx) {
  ctx.drawImage(terrain,extent.left,extent.top,extent.width,extent.depth);
  for(const {points,material} of outdoorSurfaces) {
    paint(ctx,points,surfaceColors[material][0],material==='step'?'#afa68e':'#a29984',.85);
  }
  for(const buildings of Object.values(buildingGroups)) {
    for(const [,points,style='modern'] of [...buildings].sort((a,b)=>a[0]-b[0])) {
      paint(ctx,points,colors[style][0],'#797f72',1.25);
    }
  }
}
drawFlatMap(miniBackground);

function addPlace(id) {
  const zone=zones[id];
  const button=document.createElement('button');
  button.type='button';
  button.className='location';
  button.style.setProperty('--accent',zone.color);
  button.setAttribute('aria-pressed','false');
  for(const [cls,content] of [['swatch',''],['location-name',zone.name],['location-category',zone.category]]) {
    const span=document.createElement('span');
    span.className=cls;
    span.textContent=content;
    button.append(span);
  }
  button.addEventListener('click',()=>select(id,true));
  $('locations').append(button);
  sideLinks.set(id,button);
  const pin=document.createElement('button');
  pin.type='button';
  pin.className='pin';
  pin.textContent=zone.name;
  pin.style.setProperty('--accent',zone.color);
  pin.addEventListener('click',()=>select(id,true));
  $('labels').append(pin);
  pins.set(id,pin);
}
ordered.forEach(addPlace);

const roads = [
  ['桃园东路',[1320,131,0]],
  ['信息大道南',[2232,659,0]],
  ['万锦路',[1792,1251,0]]
].map(([name,[x,z]])=>{
  const el=document.createElement('span');
  el.className='route-label';
  el.textContent=name;
  $('labels').prepend(el);
  return {el,point:toWorld([x,z,groundHeightAt(x,z)])};
});

function screen(point) {
  const {right,up,back}=viewAxes(view.yaw,view.tilt);
  const offset=point.map((v,i)=>v-view.target[i]);
  const scale=height/(2*view.half);
  return [width/2+dot(right,offset)*scale,height/2-dot(up,offset)*scale,dot(back,offset)];
}

function worldAt(px,py,y=0) {
  const scale=height/(2*view.half);
  const across=(px-width/2)/scale;
  const rise=(height/2-py)/scale;
  const [sin,cos]=[Math.sin(view.yaw),Math.cos(view.yaw)];
  const along=(rise-(y-view.target[1])*Math.cos(view.tilt))/Math.sin(view.tilt);
  return [view.target[0]+across*cos-along*sin,y,view.target[2]-across*sin-along*cos];
}

function fitHalf(yaw,tilt,target) {
  const {right,up}=viewAxes(yaw,tilt);
  const bounds=boundary.map(([x,z])=>toWorld([x,z]));
  bounds.push(toWorld([1015,238,35]),toWorld([1550,1305,0]));
  const aspect=width/height;
  return Math.max(...bounds.map(p=>{
    const offset=p.map((v,i)=>v-target[i]);
    return Math.max(Math.abs(dot(right,offset))/aspect,Math.abs(dot(up,offset)));
  }))*1.13;
}
const fullTarget = () => toWorld([1534,805]);
function schedule() {
  if(frameRequested) return;
  frameRequested=true;
  requestAnimationFrame(time=>{
    frameRequested=false;
    draw(time);
  });
}

function updatePins() {
  $('labels').hidden=!labelsVisible;
  if(!labelsVisible) return;
  const boxes=[];
  const order=current?[current,...priorities.filter(id=>id!==current)]:priorities;
  for(const id of order) {
    const pin=pins.get(id);
    const [sx,sy]=screen(placeAnchor(id));
    pin.hidden=false;
    const w=pin.offsetWidth, h=pin.offsetHeight;
    const x=sx, y=sy-4;
    const box=[x-w/2-3,y-h-2,x+w/2+3,y+3];
    pin.hidden=x<w/2||x>width-w/2||y<h||y>height-5||
      (id!==current&&boxes.some(([l,t,r,b])=>box[0]<r&&box[2]>l&&box[1]<b&&box[3]>t));
    if(pin.hidden) continue;
    boxes.push(box);
    pin.style.left=x+'px';
    pin.style.top=y+'px';
  }
  for(const {el,point} of roads) {
    const [x,y]=screen(point);
    el.hidden=x<40||x>width-40||y<12||y>height-12||boxes.some(([l,t,r,b])=>x+30>l&&x-30<r&&y+7>t&&y-7<b);
    el.style.left=x+'px';
    el.style.top=y+'px';
  }
}

function drawMini() {
  miniContext.drawImage(miniBase,0,0);
  const points=[[0,0],[width,0],[width,height],[0,height]].map(([x,y])=>{
    const [mx,mz]=toMap(worldAt(x,y));
    return [(mx-extentMini.left)*mini.width/extentMini.width,(mz-extentMini.top)*mini.height/extentMini.depth];
  });
  paint(miniContext,points,null,'#335e52',3);
  const [mx,mz]=toMap(view.target);
  const cx=(mx-extentMini.left)*mini.width/extentMini.width;
  const cy=(mz-extentMini.top)*mini.height/extentMini.depth;
  paint(miniContext,oval(cx,cy,5,5,10),'#2a594e','#fbf9ef',2);
}

function draw(time) {
  if(exploreMode) {
    explorer.draw(time,width/height);
    return;
  }
  if(renderGL) {
    renderGL(viewMatrix(view,width/height));
  } else {
    const ratio=canvas.width/width;
    context2D.setTransform(1,0,0,1,0,0);
    context2D.fillStyle='#d5ddc6';
    context2D.fillRect(0,0,canvas.width,canvas.height);
    const [left,top]=screen(toWorld([0,0]));
    const perPixel=height*metresPerPixel/(2*view.half)*ratio;
    context2D.setTransform(perPixel,0,0,perPixel,left*ratio,top*ratio);
    drawFlatMap(context2D);
  }
  updatePins();
  drawMini();
  const scale=height/(2*view.half);
  const step=[5,10,20,50,100,200,500].reduce((a,b)=>Math.abs(b*scale-69)<Math.abs(a*scale-69)?b:a);
  $('scale-line').style.width=step*scale+'px';
  $('scale-label').textContent='约 '+step+' 米';
  document.querySelector('.needle').style.transform='rotate('+Math.atan2(Math.sin(view.yaw),Math.cos(view.yaw)*Math.sin(view.tilt))+'rad)';
}

function resize() {
  const rectangle=map.getBoundingClientRect();
  width=Math.max(1,rectangle.width);
  height=Math.max(1,rectangle.height);
  const dpr=Math.min(devicePixelRatio||1,2);
  canvas.width=Math.round(width*dpr);
  canvas.height=Math.round(height*dpr);
  if(overviewFraming&&!tween) view.half=fitHalf(view.yaw,view.tilt,view.target);
  schedule();
}

function moveTo(next,animate=true) {
  cancelAnimationFrame(tween);
  tween=0;
  const start={...view,target:[...view.target]};
  let delta=next.yaw-start.yaw;
  delta=Math.atan2(Math.sin(delta),Math.cos(delta));
  if(!animate || reducedMotion) {
    Object.assign(view,next);
    schedule();
    return;
  }
  const began=performance.now();
  function step(now) {
    const t=Math.min(1,(now-began)/360), e=1-(1-t)**3;
    view.yaw=start.yaw+delta*e;
    view.tilt=start.tilt+(next.tilt-start.tilt)*e;
    view.half=start.half+(next.half-start.half)*e;
    view.target=start.target.map((v,i)=>v+(next.target[i]-v)*e);
    schedule();
    tween=t<1?requestAnimationFrame(step):0;
  }
  tween=requestAnimationFrame(step);
}

function setMode(top) {
  if(top===topMode||(!top&&!renderGL)) return;
  if(top) previous3D={yaw:view.yaw,tilt:view.tilt};
  topMode=top;
  $('view-3d').setAttribute('aria-pressed',String(!top));
  $('view-top').setAttribute('aria-pressed',String(top));
  mapHint();
  const angles=top?{yaw:0,tilt:Math.PI/2}:previous3D;
  moveTo({...view,...angles,half:overviewFraming?fitHalf(angles.yaw,angles.tilt,view.target):view.half});
}

function mapHint() {
  $('map-hint').textContent=coarsePointer.matches
    ? (topMode?'拖动平移 · 双指缩放':'拖动旋转 · 双指平移和缩放')
    : (topMode?'左键或右键拖动平移 · 滚轮缩放':'左键拖动旋转 · 滚轮缩放 · 右键拖动平移');
}

function select(id,focus=false) {
  if(current) {
    pins.get(current).classList.remove('selected');
    sideLinks.get(current).setAttribute('aria-pressed','false');
  }
  current=id;
  $('detail').hidden=!id;
  if(!id) {
    schedule();
    return;
  }
  const zone=zones[id];
  pins.get(id).classList.add('selected');
  sideLinks.get(id).setAttribute('aria-pressed','true');
  $('detail-category').textContent=zone.category;
  $('detail-title').textContent=zone.name;
  $('detail-height').textContent=zone.height?'模型高度 '+zone.height:'';
  $('detail-height').hidden=!zone.height;
  $('detail-description').textContent=zone.desc;
  if(focus) {
    overviewFraming=false;
    const [x,,z]=toWorld(zone.anchor);
    const localHalf={dorm:255,engineering:180,academic:175,track:145}[id]||120;
    moveTo({...view,target:[x,0,z],half:localHalf*Math.max(1,.86*height/width)});
  }
  schedule();
}

function reset() {
  overviewFraming=true;
  select(null);
  const yaw=topMode?0:defaultYaw;
  const tilt=topMode?Math.PI/2:defaultTilt;
  const target=fullTarget();
  moveTo({yaw,tilt,target,half:fitHalf(yaw,tilt,target)});
}

function interrupt() {
  cancelAnimationFrame(tween);
  tween=0;
  overviewFraming=false;
}
function pan(dx,dy) {
  const before=worldAt(width/2-dx,height/2-dy);
  view.target=before.map((v,i)=>i===1?0:Math.max(-575,Math.min(575,v)));
  schedule();
}
function zoom(factor,x=width/2,y=height/2) {
  interrupt();
  const before=worldAt(x,y);
  view.half=Math.max(50,Math.min(920,view.half*factor));
  const after=worldAt(x,y);
  view.target=view.target.map((v,i)=>Math.max(-575,Math.min(575,v+before[i]-after[i])));
  schedule();
}

function pick(px,py) {
  const {back}=viewAxes(view.yaw,view.tilt);
  let winner=null, max=-Infinity;
  const [gx,gz]=toMap(worldAt(px,py));
  const [lx,lz]=toMap(worldAt(px,py,1));
  const rx=lx-gx, rz=lz-gz;
  const trackRay=worldAt(px,py,placeAnchor('track')[1]);
  if(within(...toMap(trackRay),trackBoundary)) {
    winner='track';
    max=dot(back,trackRay);
  }
  for(const [id,points] of [['southeast',southeastBridge],['library',libraryTerrace]]) {
    const ray=worldAt(px,py,surfaceHeightAt(gx,gz));
    const depth=dot(back,ray);
    if(depth>max && within(...toMap(ray),points)) {
      winner=id;
      max=depth;
    }
  }
  for(const [id,parts] of Object.entries(buildingGroups)) {
    for(const [i,[height,points]] of parts.entries()) {
      const h=buildingBase(id,points,i)+height;
      const ray=worldAt(px,py,h);
      let hit=within(...toMap(ray),points) ? h : -Infinity;
      if(hit===-Infinity) {
        for(let i=0;i<points.length;i++) {
          const [a,b]=points[i], [c,d]=points[(i+1)%points.length];
          const sx=c-a, sz=d-b, determinant=rx*sz-rz*sx;
          if(Math.abs(determinant)<1e-8) continue;
          const y=((a-gx)*sz-(b-gz)*sx)/determinant;
          const along=((a-gx)*rz-(b-gz)*rx)/determinant;
          if(y<=h && along>=0 && along<=1 &&
            y>=groundHeightAt(gx+rx*y,gz+rz*y)-.02) hit=Math.max(hit,y);
        }
      }
      if(hit===-Infinity) continue;
      const depth=dot(back,worldAt(px,py,hit));
      if(depth>max) {
        winner=id;
        max=depth;
      }
    }
  }
  select(winner);
}

const pointers=new Map();
let moved=false;
let dragButton=0;
let initial=[0,0];
const local=e=>{
  const rect=canvas.getBoundingClientRect();
  return [e.clientX-rect.left,e.clientY-rect.top];
};
canvas.addEventListener('contextmenu',e=>e.preventDefault());
canvas.addEventListener('pointerdown',e=>{
  if(exploreMode) return;
  if(e.button!==0 && (e.pointerType!=='mouse' || e.button!==2)) return;
  const point=local(e);
  if(pointers.size===0) {
    moved=false;
    dragButton=e.button;
    initial=point;
  } else {
    moved=true;
  }
  pointers.set(e.pointerId,point);
  canvas.setPointerCapture(e.pointerId);
  canvas.classList.add('dragging');
  interrupt();
});
window.addEventListener('pointermove',e=>{
  if(!pointers.has(e.pointerId)) return;
  if(e.pointerType==='mouse') {
    if(!(e.buttons&3)) {
      endPointer(e);
      return;
    }
    if(!canvas.hasPointerCapture(e.pointerId)) canvas.setPointerCapture(e.pointerId);
  }
  const point=local(e);
  const previous=pointers.get(e.pointerId);
  const dx=point[0]-previous[0], dy=point[1]-previous[1];
  pointers.set(e.pointerId,point);
  if(pointers.size===2) {
    const other=[...pointers.entries()].find(([id])=>id!==e.pointerId)[1];
    const oldDistance=Math.hypot(previous[0]-other[0],previous[1]-other[1]);
    const distance=Math.hypot(point[0]-other[0],point[1]-other[1]);
    pan(dx/2,dy/2);
    if(oldDistance>5&&distance>5) zoom(oldDistance/distance,(point[0]+other[0])/2,(point[1]+other[1])/2);
    return;
  }
  if(pointers.size!==1) return;
  if(e.pointerType==='mouse' && e.buttons!==(dragButton===2?2:1)) return;
  if(!moved&&Math.hypot(point[0]-initial[0],point[1]-initial[1])<4) return;
  moved=true;
  if(topMode||dragButton===2) {
    pan(dx,dy);
  } else {
    view.yaw-=dx*.008;
    view.tilt=Math.max(.36,Math.min(1.43,view.tilt+dy*.006));
    schedule();
  }
});
function endPointer(e) {
  if(!pointers.delete(e.pointerId)) return;
  if(pointers.size>0) return;
  canvas.classList.remove('dragging');
  if(!moved&&dragButton===0&&e.button===0&&e.type==='pointerup') pick(...local(e));
}
window.addEventListener('pointerup',endPointer);
window.addEventListener('pointercancel',endPointer);
canvas.addEventListener('lostpointercapture',e=>{
  // Chrome can drop capture when the second mouse button is pressed.
  if(e.pointerType!=='mouse' || !(e.buttons&3)) endPointer(e);
});
window.addEventListener('blur',()=>{
  pointers.clear();
  canvas.classList.remove('dragging');
});
canvas.addEventListener('wheel',e=>{
  e.preventDefault();
  if(exploreMode) return;
  const unit=e.deltaMode===1?16:e.deltaMode===2?height:1;
  zoom(Math.exp(Math.max(-600,Math.min(600,e.deltaY*unit))*.0018),...local(e));
},{passive:false});

$('view-3d').addEventListener('click',()=>setMode(false));
$('view-top').addEventListener('click',()=>setMode(true));
function setSidebar(open) {
  const collapse=$('collapse-sidebar'), expand=$('expand-sidebar');
  $('sidebar').hidden=!open;
  $('campus-layout').classList.toggle('sidebar-collapsed',!open);
  collapse.setAttribute('aria-expanded',String(open));
  expand.setAttribute('aria-expanded',String(open));
  expand.hidden=open;
  (open?collapse:expand).focus({preventScroll:true});
}
$('collapse-sidebar').addEventListener('click',()=>setSidebar(false));
$('expand-sidebar').addEventListener('click',()=>setSidebar(true));
$('zoom-in').addEventListener('click',()=>zoom(.80));
$('zoom-out').addEventListener('click',()=>zoom(1.25));
$('reset').addEventListener('click',reset);
$('close-detail').addEventListener('click',()=>select(null));
$('open-sources').addEventListener('click',()=>$('sources').showModal());
$('toggle-labels').addEventListener('click',e=>{
  labelsVisible=!labelsVisible;
  e.currentTarget.setAttribute('aria-pressed',String(labelsVisible));
  schedule();
});
$('north').addEventListener('click',()=>{
  const target=[...view.target];
  moveTo({...view,yaw:0,target,half:overviewFraming?fitHalf(0,view.tilt,target):view.half});
});
mini.addEventListener('click',e=>{
  const box=mini.getBoundingClientRect();
  const x=extentMini.left+(e.clientX-box.left)/box.width*extentMini.width;
  const z=extentMini.top+(e.clientY-box.top)/box.height*extentMini.depth;
  overviewFraming=false;
  moveTo({...view,target:toWorld([x,z])});
});

function setExploreMode(enabled) {
  if(!explorer || enabled===exploreMode) return;
  exploreMode=enabled;
  document.body.dataset.mode=enabled?'explore':'map';
  pointers.clear();
  canvas.classList.remove('dragging');
  explorer.setActive(enabled);
  if(!enabled) $('return-to-explore').focus({preventScroll:true});
  resize();
}

const explorer=renderGL && createExplorer({
  canvas,trees,render:renderGL,drawFlatMap,schedule,openMap:()=>setExploreMode(false)
});
if(explorer) {
  document.body.dataset.mode='explore';
  $('return-to-explore').hidden=false;
  $('return-to-explore').addEventListener('click',()=>setExploreMode(true));
  window.addEventListener('keydown',event=>{
    if(!exploreMode && !event.defaultPrevented && event.code==='KeyM' && !event.repeat &&
      !event.altKey && !event.ctrlKey && !event.metaKey && !$('sources').open) {
      event.preventDefault();
      setExploreMode(true);
    }
  });
}
if(!renderGL) {
  $('view-3d').disabled=true;
  $('view-3d').setAttribute('aria-pressed','false');
  $('view-top').setAttribute('aria-pressed','true');
  $('fallback').hidden=false;
}
mapHint();
coarsePointer.addEventListener('change',mapHint);
resize();
new ResizeObserver(resize).observe(map);
