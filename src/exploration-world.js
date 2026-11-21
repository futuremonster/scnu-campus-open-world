const explorerRadius = .36;
const explorerSpeed = 9;
const clamp = (value,min,max) => Math.max(min,Math.min(max,value));

function footprint(points,height=0) {
  const polygon=points.map(point=>{
    const [x,,z]=toWorld(point);
    return [x,z];
  });
  const xs=polygon.map(([x])=>x), zs=polygon.map(([,z])=>z);
  return {polygon,height,minX:Math.min(...xs),maxX:Math.max(...xs),
    minZ:Math.min(...zs),maxZ:Math.max(...zs)};
}

function overlapsFootprint(x,z,radius,shape) {
  const {polygon,minX,maxX,minZ,maxZ}=shape;
  if(x<minX-radius || x>maxX+radius || z<minZ-radius || z>maxZ+radius) return false;
  if(within(x,z,polygon)) return true;
  const limit=radius**2;
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++) {
    const [a,b]=polygon[j], [c,d]=polygon[i];
    const dx=c-a, dz=d-b, length=dx*dx+dz*dz;
    const t=length?clamp(((x-a)*dx+(z-b)*dz)/length,0,1):0;
    if((x-a-t*dx)**2+(z-b-t*dz)**2<limit) return true;
  }
  return false;
}

function explorationWorld(trees) {
  const solidWalls=Object.entries(buildingGroups).flatMap(([id,group])=>
    group.map(([height,points],i)=>footprint(points,buildingBase(id,points,i)+height)));
  for(const {points,height} of bridgeParapets) {
    solidWalls.push(footprint(points,Math.max(...points.map(([x,z])=>height(x,z)))));
  }
  const ponds=water.map(points=>footprint(points));
  const bounds=footprint(rect(extent.left,extent.top,extent.width,extent.depth));
  const treeTrunks=trees.map(({x,z,size})=>{
    const [worldX,,worldZ]=toWorld([x,z]);
    return {x:worldX,z:worldZ,radius:size*.065};
  });
  const bridges=[...campusRoads,...surroundingRoads];

  function surfaceElevation(x,z) {
    return surfaceHeightAt(...toMap([x,0,z]));
  }

  function canStand(x,z) {
    if(x<bounds.minX+explorerRadius || x>bounds.maxX-explorerRadius ||
      z<bounds.minZ+explorerRadius || z>bounds.maxZ-explorerRadius) return false;
    if(solidWalls.some(shape=>overlapsFootprint(x,z,explorerRadius,shape))) return false;
    for(const trunk of treeTrunks) {
      const radius=trunk.radius+explorerRadius;
      if(Math.abs(x-trunk.x)<radius && (x-trunk.x)**2+(z-trunk.z)**2<radius**2) return false;
    }
    if(!ponds.some(shape=>overlapsFootprint(x,z,explorerRadius,shape))) return true;
    const [mx,mz]=toMap([x,0,z]);
    // Roads and the southeast crossing are drawn over the water where they span it.
    return within(mx,mz,southeastBridge) ||
      bridges.some(([width,path])=>nearPath(mx,mz,path,width/2-explorerRadius/metresPerPixel));
  }

  function move(player,dx,dz) {
    const startX=player.x, startZ=player.z;
    // Keep each step shorter than the collider radius so thin walls cannot be skipped.
    const steps=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.14));
    const sx=dx/steps, sz=dz/steps;
    player.y=surfaceElevation(startX,startZ);
    function stepTo(x,z) {
      if(!canStand(x,z)) return false;
      const y=surfaceElevation(x,z);
      // A riser is walkable. Taller terrace edges act as retaining walls.
      if(Math.abs(y-player.y)>.25) return false;
      Object.assign(player,{x,y,z});
      return true;
    }
    for(let i=0;i<steps;i++) {
      const x=player.x+sx, z=player.z+sz;
      if(stepTo(x,z)) continue;
      // Allow the free component of a diagonal input to slide alongside a wall.
      if(sx) stepTo(x,player.z);
      if(sz) stepTo(player.x,z);
    }
    return Math.hypot(player.x-startX,player.z-startZ);
  }

  function cameraClearance(anchor,offset) {
    const distance=Math.hypot(...offset);
    const steps=Math.ceil(distance/.10);
    for(let i=1;i<=steps;i++) {
      const t=i/steps;
      const x=anchor[0]+offset[0]*t;
      const y=anchor[1]+offset[1]*t;
      const z=anchor[2]+offset[2]*t;
      if(y<=surfaceElevation(x,z)+.15 ||
        solidWalls.some(shape=>y<=shape.height+.14 && overlapsFootprint(x,z,.19,shape))) {
        return (i-1)/steps;
      }
    }
    return 1;
  }

  return {canStand,move,cameraClearance,surfaceElevation};
}
