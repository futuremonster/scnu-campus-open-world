const extent = {left:670, top:-65, width:1740, depth:1780};
const trackBoundary = ovalStadium(1265, 367, 146, 294);
const field = rect(1205,268,120,194);
const courts = [rect(1391,487,100,59)];
const plaza = [[1260,650],[1327,649],[1328,765],[1365,788],[1362,820],[1318,820],[1318,892],[1362,918],[1357,944],[1310,917],[1266,902],[1276,870],[1271,815],[1237,797],[1239,770],[1257,764]];
const parking = [[1589,872],[1664,868],[1669,925],[1587,929]];
const treeColors = ['#537259','#5d805b','#6d9063','#719465','#7b9a67','#4f775c','#779567'];

function ovalStadium(x, z, width, length) {
  const r = width / 2;
  const halfStraight = length / 2 - r;
  const points = [];
  for (let i = 0; i <= 32; i++) {
    const angle = i * Math.PI / 32;
    points.push([x+r*Math.cos(angle), z+halfStraight+r*Math.sin(angle)]);
  }
  for (let i = 0; i <= 32; i++) {
    const angle = Math.PI+i*Math.PI/32;
    points.push([x+r*Math.cos(angle), z-halfStraight+r*Math.sin(angle)]);
  }
  return points;
}

function outline(ctx, points, close = true) {
  ctx.beginPath();
  ctx.moveTo(...points[0]);
  for (const p of points.slice(1)) ctx.lineTo(...p);
  if (close) ctx.closePath();
}

function paint(ctx, points, fill, stroke, width = 1) {
  outline(ctx,points);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = width;
    ctx.stroke();
  }
}

function trace(ctx, points, color, width) {
  outline(ctx,points,false);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}

function pond(ctx, points, random) {
  ctx.save();
  outline(ctx,points);
  ctx.clip();
  const tint = ctx.createLinearGradient(900, 500, 2030, 1360);
  tint.addColorStop(0,'#79abb2');
  tint.addColorStop(0.58,'#79aeb4');
  tint.addColorStop(1,'#8abcc0');
  paint(ctx,points,tint,'#a4c6bd',23);
  const xs = points.map(p=>p[0]);
  const zs = points.map(p=>p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs);
  for (let i=0;i<260;i++) {
    const x = minX+random()*(maxX-minX);
    const z = minZ+random()*(maxZ-minZ);
    const len = 4+random()*28;
    trace(ctx,[[x,z],[x+len,z-1]],i%3?'#dbece642':'#5e929538',0.7+random());
  }
  ctx.restore();
  paint(ctx,points,null,'#87a49a',1.6);
}

function randomSource(seed) {
  return () => {
    seed = (Math.imul(seed,1664525)+1013904223) >>> 0;
    return seed/4294967296;
  };
}

function within(x,z,points) {
  let inside = false;
  for (let i=0,j=points.length-1;i<points.length;j=i++) {
    const [a,b] = points[i], [c,d] = points[j];
    if ((b>z)!==(d>z) && x < (c-a)*(z-b)/(d-b)+a) inside = !inside;
  }
  return inside;
}

function pathDistanceSquared(x,z,path) {
  let closest=Infinity;
  for (let i=1;i<path.length;i++) {
    const [a,b] = path[i-1], [c,d] = path[i];
    const dx=c-a, dz=d-b;
    const length=dx*dx+dz*dz;
    const t=length?Math.max(0,Math.min(1,((x-a)*dx+(z-b)*dz)/length)):0;
    closest=Math.min(closest,(x-a-t*dx)**2+(z-b-t*dz)**2);
  }
  return closest;
}

function nearPath(x,z,path,width) {
  return pathDistanceSquared(x,z,path)<width**2;
}

const buildingFootprints = Object.values(buildingGroups).flatMap(group => group.map(([,p])=>p));
function siteForTree(x,z) {
  return !water.some(p=>within(x,z,p)) && !buildingFootprints.some(p=>within(x,z,p)) &&
    !outdoorSurfaces.some(surface=>within(x,z,surface.points)) &&
    !within(x,z,trackBoundary) && !within(x,z,plaza) && !within(x,z,parking) &&
    !courts.some(p=>within(x,z,p)) &&
    !campusRoads.some(([w,path])=>nearPath(x,z,path,w/2+5)) &&
    !surroundingRoads.some(([w,path])=>nearPath(x,z,path,w/2+6));
}

function makeTrees() {
  const random = randomSource(5067);
  const trees = [];
  function add(x,z,mature) {
    if (!siteForTree(x,z)) return;
    if (trees.some(t=>(t.x-x)**2+(t.z-z)**2<38)) return;
    const size = mature ? 4.2+random()*3.8 : 2.8+random()*3.0;
    trees.push({x,z,size,yaw:random()*Math.PI*2,color:treeColors[Math.floor(random()*treeColors.length)]});
  }
  for (const {kind,points} of greens) {
    const step = {woods:15,park:24,lawn:33}[kind];
    const xs=points.map(p=>p[0]), zs=points.map(p=>p[1]);
    for (let x=Math.min(...xs)+5;x<Math.max(...xs);x+=step) {
      for (let z=Math.min(...zs)+5;z<Math.max(...zs);z+=step) {
        const tx=x+(random()-.5)*step*.9, tz=z+(random()-.5)*step*.9;
        if (within(tx,tz,points) && random()<(kind==='lawn'?.5:.9)) add(tx,tz,kind==='woods');
      }
    }
  }
  for (const [w,path] of [...surroundingRoads,...campusRoads.slice(0,6)]) {
    for (let i=1;i<path.length;i++) {
      const [a,b]=path[i-1], [c,d]=path[i], length=Math.hypot(c-a,d-b);
      for (let v=10;v<length-5;v+=29+random()*12) {
        const offset=(w/2+9)*(random()>.5?1:-1);
        add(a+(v*(c-a)-offset*(d-b))/length,b+(v*(d-b)+offset*(c-a))/length,false);
      }
    }
  }
  return trees;
}

function drawTrack(ctx) {
  paint(ctx,rect(1180,231,169,268),'#d1cabb');
  paint(ctx,trackBoundary,'#a75242','#e4c0a1',3.1);
  for (let i=1;i<=7;i++) {
    const inset=i*2.15;
    paint(ctx,ovalStadium(1265,367,146-inset*2,294-inset*2),null,'#efc9ab',0.77);
  }
  paint(ctx,ovalStadium(1265,367,111,255),'#7f9d60','#e1bf9e',1.1);
  paint(ctx,field,'#769658','#e0dfba',1.15);
  for(let i=0;i<8;i+=2) {
    paint(ctx,rect(1206,269+24.1*i,118,24.1),'#a1b47966');
  }
  trace(ctx,[[1205,365],[1325,365]],'#e0dfba',1.15);
  paint(ctx,oval(1265,365,14,14),null,'#e0dfba',1.15);
  for (const z of [269,434]) {
    paint(ctx,rect(1236,z,58,27),null,'#e0dfba',1.15);
    paint(ctx,rect(1254,z===269?z:z+19,22,8),null,'#e0dfba',1);
  }
}

function drawCourts(ctx) {
  paint(ctx,courts[0],'#788eac','#d6d3c3',2.5);
  for (let i=0;i<3;i++) {
    const x=1394+i*32;
    paint(ctx,rect(x,490,29,53),'#738dab','#e3e1d6',.8);
    trace(ctx,[[x,516],[x+29,516]],'#e3e1d6',1);
    paint(ctx,oval(x+14.5,516,4.8,4.8,18),null,'#e3e1d6',.8);
    paint(ctx,rect(x+9,490,11,9),null,'#e3e1d6',.8);
    paint(ctx,rect(x+9,534,11,9),null,'#e3e1d6',.8);
  }
}

function makeTerrain(trees) {
  const canvas=document.createElement('canvas');
  canvas.width=2048;
  canvas.height=2048;
  const ctx=canvas.getContext('2d');
  const random=randomSource(72);
  ctx.scale(canvas.width/extent.width,canvas.height/extent.depth);
  ctx.translate(-extent.left,-extent.top);
  ctx.lineJoin=ctx.lineCap='round';
  ctx.fillStyle='#d5ddc6';
  ctx.fillRect(extent.left,extent.top,extent.width,extent.depth);
  paint(ctx,[[746,228],[902,119],[974,109],[947,425],[988,476],[974,704],[796,823],[743,746]],'#d3d5c4');
  paint(ctx,[[1176,-65],[1547,-65],[1547,147],[1372,120],[1230,90]],'#d4d8c9');
  paint(ctx,[[1559,-65],[2100,-65],[1989,19],[1805,155],[1690,183],[1570,170]],'#c4d0b6');
  paint(ctx,[[2191,395],[2232,362],[2410,344],[2410,995],[2256,973],[2277,903],[2254,814]],'#ccd6bd');
  paint(ctx,[[1559,1325],[1678,1255],[1754,1223],[1877,1310],[1990,1355],[2078,1327],[2158,1255],[2292,1301],[2410,1400],[2410,1715],[1466,1715]],'#c8d2b8');
  paint(ctx,boundary,'#e2dfcc','#bbb194',13);
  for(const {kind,points} of greens) {
    paint(ctx,points,{woods:'#91a87d',park:'#b4c3a0',lawn:'#b8c5a0'}[kind]);
  }
  for(let i=0;i<11500;i++) {
    const x=extent.left+random()*extent.width, z=extent.top+random()*extent.depth;
    ctx.fillStyle=i%2?'#f3ead030':'#71837b1f';
    const size=.4+random()*1.8;
    ctx.fillRect(x,z,size,size);
  }
  for(const p of water) pond(ctx,p,random);
  for(const [w,p] of surroundingRoads) trace(ctx,p,'#b9beab',w+6);
  for(const [w,p] of surroundingRoads) {
    trace(ctx,p,'#e4e0d1',w);
    trace(ctx,p,'#d7d1bb',2.4);
  }
  for(const [w,p] of campusRoads) trace(ctx,p,'#bcb8a5',w+3.4);
  for(const [w,p] of campusRoads) trace(ctx,p,'#ece4d0',w);
  paint(ctx,plaza,'#dfd8c5','#c7bea6',2);
  paint(ctx,parking,'#c3c3b2','#b2b29d',1.4);
  for(let x=1595;x<1665;x+=8) trace(ctx,[[x,874],[x,886]],'#e7dfc8',.85);
  drawTrack(ctx);
  drawCourts(ctx);
  paint(ctx,boundary,null,'#b79063',2.9);
  for(const {x,z,size} of trees) {
    ctx.fillStyle='#42684e37';
    ctx.beginPath();
    ctx.ellipse(x+size*1.22,z+size*.77,size*1.8,size*1.17,.26,0,2*Math.PI);
    ctx.fill();
  }
  const shade=document.createElement('canvas');
  shade.width=canvas.width;
  shade.height=canvas.height;
  const shadow=shade.getContext('2d');
  shadow.setTransform(ctx.getTransform());
  for(const group of Object.values(buildingGroups)) {
    for (const [height,points] of group) {
      const dx=height*.92, dz=height*.6;
      paint(shadow,points.map(([x,z])=>[x+dx,z+dz]),'#4c5b59');
      points.forEach(([x,z],i)=>{
        const [a,b]=points[(i+1)%points.length];
        paint(shadow,[[x,z],[a,b],[a+dx,b+dz],[x+dx,z+dz]],'#4c5b59');
      });
    }
  }
  ctx.save();
  ctx.resetTransform();
  ctx.globalAlpha=.22;
  ctx.drawImage(shade,0,0);
  ctx.restore();
  return canvas;
}
