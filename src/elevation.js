// Heights are approximate metres relative to the surrounding road and water level.
const groundLevel=-.35;
const academicLevel=1.82;
const libraryLevel=1.83;
const terrainGrades=[
  {area:[974,230,158,316],rise:.75,feather:65},
  {area:[1169,214,196,294],rise:1.55,feather:53},
  {area:[1228,606,195,255],rise:.55,feather:46},
  {area:[1005,757,188,153],rise:.38,feather:31},
  {area:[1570,278,505,153],rise:1.04,feather:65},
  {area:[1625,510,207,318],rise:.72,feather:56},
  {area:[1860,551,69,179],rise:2.65,feather:66},
  {area:[960,1296,160,144],rise:4.25,feather:78}
];

function groundGrid() {
  const columns=Math.ceil(extent.width/10), rows=Math.ceil(extent.depth/10);
  const stride=columns+1;
  const dx=extent.width/columns, dz=extent.depth/rows;
  const heights=new Float32Array(stride*(rows+1));
  const shores=water.map(points=>{
    const xs=points.map(([x])=>x), zs=points.map(([,z])=>z);
    return {points,outline:[...points,points[0]],left:Math.min(...xs)-32,right:Math.max(...xs)+32,
      top:Math.min(...zs)-32,bottom:Math.max(...zs)+32};
  });
  const smooth=t=>t*t*(3-2*t);
  for(let row=0;row<=rows;row++) {
    const z=extent.top+row*dz;
    for(let column=0;column<=columns;column++) {
      const x=extent.left+column*dx;
      let rise=0;
      for(const {area:[left,top,width,depth],rise:level,feather} of terrainGrades) {
        const offX=Math.max(left-x,0,x-left-width), offZ=Math.max(top-z,0,z-top-depth);
        const blend=1-Math.min(1,Math.hypot(offX,offZ)/feather);
        rise=Math.max(rise,level*smooth(blend));
      }
      if(rise>0) {
        for(const shore of shores) {
          if(x<shore.left || x>shore.right || z<shore.top || z>shore.bottom) continue;
          const distance=within(x,z,shore.points)?0:pathDistanceSquared(x,z,shore.outline);
          rise*=smooth(Math.min(1,Math.sqrt(distance)/32));
        }
      }
      heights[row*stride+column]=groundLevel+rise;
    }
  }
  return {columns,rows,stride,dx,dz,heights};
}

const ground=groundGrid();

function groundHeightAt(x,z) {
  const {columns,rows,stride,dx,dz,heights}=ground;
  const u=(x-extent.left)/dx, v=(z-extent.top)/dz;
  if(u<0 || u>columns || v<0 || v>rows) return groundLevel;
  const column=Math.min(Math.floor(u),columns-1), row=Math.min(Math.floor(v),rows-1);
  const a=u-column, b=v-row, i=row*stride+column;
  const nw=heights[i], se=heights[i+stride+1];
  // Match the two triangles and their shared diagonal in the textured ground mesh.
  return a>=b
    ? nw*(1-a)+heights[i+1]*(a-b)+se*b
    : nw*(1-b)+heights[i+stride]*(b-a)+se*a;
}

function outdoorSurface(points,height,material,base) {
  const xs=points.map(([x])=>x), zs=points.map(([,z])=>z);
  return {points,height,material,base,left:Math.min(...xs),right:Math.max(...xs),
    top:Math.min(...zs),bottom:Math.max(...zs)};
}

const terrace=(points,height,material='stone')=>outdoorSurface(points,()=>height,material);
const mixBank=(from,to,t)=>from.map(([x,z],i)=>[x+(to[i][0]-x)*t,z+(to[i][1]-z)*t]);

function ramp(from,to,low,high,material='ramp') {
  const [a,b]=from, [d,c]=to;
  const points=[a,b,c,d];
  if(low===high) return terrace(points,low,material);
  const side=([ax,az],[bx,bz],[x,z])=>(bx-ax)*(z-az)-(bz-az)*(x-ax);
  const diagonalSide=side(a,c,b);
  const fromSide=side(a,b,c), toSide=side(d,c,a);
  return outdoorSurface(points,(x,z)=>{
    const point=[x,z];
    const progress=side(a,c,point)*diagonalSide>=0
      ? side(a,b,point)/fromSide
      : 1-side(d,c,point)/toSide;
    return low+(high-low)*progress;
  },material);
}

function stairs(from,to,low,high,count) {
  return Array.from({length:count},(_,i)=>{
    const front=mixBank(from,to,i/count), back=mixBank(from,to,(i+1)/count);
    return terrace([...front,back[1],back[0]],low+(high-low)*(i+1)/count,'step');
  });
}

const [bridgeStart,bridgeEnd,bridgeEndRight,bridgeStartRight]=southeastBridge;
const nearBank=[bridgeStart,bridgeStartRight], farBank=[bridgeEnd,bridgeEndRight];
const deckStart=mixBank(nearBank,farBank,.17), deckEnd=mixBank(nearBank,farBank,.83);
const bridgeSurfaces=[
  ramp(nearBank,deckStart,groundLevel,1.12,'bridge'),
  ramp(deckStart,deckEnd,1.12,1.12,'bridge'),
  ramp(deckEnd,farBank,1.12,groundLevel,'bridge')
];
const bridgeParapets=bridgeSurfaces.flatMap(({points:[a,b,c,d],height})=>{
  const roof=(x,z)=>height(x,z)+.90;
  const [inA,inD]=mixBank([a,d],[b,c],.045);
  const [inB,inC]=mixBank([b,c],[a,d],.045);
  return [outdoorSurface([a,inA,inD,d],roof,'parapet',height),
    outdoorSurface([inB,b,c,inC],roof,'parapet',height)];
});
const outdoorSurfaces=[
  terrace(rect(1262,649,65,119),academicLevel),
  ...stairs([[1262,776],[1320,776]],[[1262,768],[1320,768]],.20,academicLevel,9),
  ramp([[1320,806],[1327,806]],[[1320,768],[1327,768]],.20,academicLevel),
  terrace(libraryTerrace,libraryLevel),
  ...stairs([[1186,854],[1186,880]],[[1175,854],[1175,880]],.03,libraryLevel,10),
  ...bridgeSurfaces
];

function surfaceHeightAt(x,z) {
  let elevation=groundHeightAt(x,z);
  for(const surface of outdoorSurfaces) {
    if(x<surface.left || x>surface.right || z<surface.top || z>surface.bottom) continue;
    if(within(x,z,surface.points)) elevation=Math.max(elevation,surface.height(x,z));
  }
  return elevation;
}

function buildingBase(id,points,index) {
  if(id==='academic' && index<4) return academicLevel;
  if(id==='library') return libraryLevel;
  const x=points.reduce((sum,p)=>sum+p[0],0)/points.length;
  const z=points.reduce((sum,p)=>sum+p[1],0)/points.length;
  return groundHeightAt(x,z);
}

function placeAnchor(id) {
  const [x,z,height=0]=zones[id].anchor;
  const building=buildingGroups[id]?.[0];
  const base=building && height?buildingBase(id,building[1],0):surfaceHeightAt(x,z);
  return toWorld([x,z,base+height]);
}
