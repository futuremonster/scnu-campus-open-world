const toWorld = ([x,z,y=0]) => [(x-1530)*metresPerPixel,y,(z-820)*metresPerPixel];
const toMap = ([x,,z]) => [1530+x/metresPerPixel,820+z/metresPerPixel];
const cross = ([ax,az],[bx,bz],[cx,cz]) => (bx-ax)*(cz-az)-(bz-az)*(cx-ax);
const area = points => points.reduce((sum,[x,z],i)=>{
  const [a,b]=points[(i+1)%points.length];
  return sum+x*b-a*z;
},0)/2;

function triangulate(points) {
  const remaining=points.map((_,i)=>i);
  if(area(points)<0) remaining.reverse();
  const triangles=[];
  while(remaining.length>3) {
    let found=false;
    for(let i=0;i<remaining.length;i++) {
      const ia=remaining[(i+remaining.length-1)%remaining.length];
      const ib=remaining[i];
      const ic=remaining[(i+1)%remaining.length];
      const a=points[ia], b=points[ib], c=points[ic];
      const orientation=cross(a,b,c);
      if(Math.abs(orientation)<1e-6) {
        remaining.splice(i,1);
        found=true;
        break;
      }
      if(orientation<0) continue;
      const blocked=remaining.some(id=>id!==ia&&id!==ib&&id!==ic&&
        cross(a,b,points[id])>=-1e-6&&cross(b,c,points[id])>=-1e-6&&cross(c,a,points[id])>=-1e-6);
      if(blocked) continue;
      triangles.push([ia,ib,ic]);
      remaining.splice(i,1);
      found=true;
      break;
    }
    if(!found) throw new Error('Unable to triangulate footprint '+JSON.stringify(points));
  }
  triangles.push(remaining);
  return triangles;
}

const rgb = name => {
  const v=Number.parseInt(name.slice(1),16);
  return [(v>>16)/255,((v>>8)&255)/255,(v&255)/255];
};
const tint = (color,k) => color.map(c=>Math.min(1,Math.max(0,c*k)));

class Mesh {
  vertices=[];
  triangle(a,b,c,color) {
    this.vertices.push(...a,...color,...b,...color,...c,...color);
  }
  quad(a,b,c,d,color) {
    this.triangle(a,b,c,color);
    this.triangle(a,c,d,color);
  }
  flat(points,h,color) {
    const corners=points.map(([x,z])=>toWorld([x,z,h]));
    for(const [a,b,c] of triangulate(points)) this.triangle(corners[a],corners[b],corners[c],color);
  }
}

function addBuilding(mesh,height,points,style,base) {
  const [roof,wall,glass]=colors[style].map(rgb);
  const trim=tint(roof,.96);
  const winding=area(points)>0?1:-1;
  mesh.flat(points,base+height,roof);
  points.forEach(([ax,az],i)=>{
    const [bx,bz]=points[(i+1)%points.length];
    const dx=bx-ax, dz=bz-az, length=Math.hypot(dx,dz);
    if(length<.001) return;
    const nx=winding*dz/length, nz=-winding*dx/length;
    const light=.87+.17*(-.68*nx-.73*nz);
    const point=(u,v,push=0)=>toWorld([ax+dx*u+nx*push,az+dz*u+nz*push,base+v]);
    const band=(u0,u1,v0,v1,push,color)=>{
      mesh.quad(point(u0,v0,push),point(u1,v0,push),point(u1,v1,push),point(u0,v1,push),color);
    };
    band(0,1,groundLevel-base-.05,0,0,tint(trim,light*.79));
    band(0,1,0,height,0,tint(wall,light));
    band(0,1,0,.38,.04,tint(trim,light*.82));
    band(0,1,height-Math.min(.8,height*.17),height,.07,tint(trim,light));
    if(height<6 || length<13) return;
    const floors=Math.max(1,Math.round(height/(style==='modern'?4.1:3.7)));
    const bays=Math.max(1,Math.round(length*metresPerPixel/(style==='modern'?4.5:5.4)));
    const spacing=height/floors;
    for(let f=0;f<floors;f++) {
      if(style==='gym') {
        if(f===1) band(.13,.87,f*spacing+1.1,f*spacing+2.3,.11,tint(glass,light));
        continue;
      }
      const bottom=f*spacing+spacing*.25;
      const top=bottom+spacing*(style==='modern'?.44:.38);
      for(let k=0;k<bays;k++) {
        const gap=style==='modern'?.1:.22;
        const start=(k+gap)/bays, end=(k+1-gap)/bays;
        band(start,end,bottom,top,.12,tint(glass,light*(.95+(k%5===0?.12:0))));
        band(start,end,top-.12,top,.15,tint(glass,light*1.16));
        band(start,end,bottom-.055,bottom,.16,tint(trim,light*.94));
      }
    }
  });
}

function addGymRoof(mesh) {
  const rows=[];
  const roofBase=12+buildingBase('gym',buildingGroups.gym[0][1],0);
  for (let i=0;i<=10;i++) {
    const t=i/10;
    const h=roofBase+3.2*Math.sin(t*Math.PI);
    rows.push([toWorld([1397+89*t,332-t,h]),toWorld([1399+92*t,458-4*t,h])]);
  }
  const color=rgb('#aebbc1');
  const edge=rgb('#828f93');
  for (let i=1;i<rows.length;i++) {
    const [a,b]=rows[i-1], [c,d]=rows[i];
    mesh.quad(a,c,d,b,tint(color,.87+.14*Math.sin(i*.25)));
    mesh.triangle(a,c,[c[0],roofBase,c[2]],edge);
    mesh.triangle(a,[c[0],roofBase,c[2]],[a[0],roofBase,a[2]],edge);
    mesh.triangle(b,d,[d[0],roofBase,d[2]],edge);
    mesh.triangle(b,[d[0],roofBase,d[2]],[b[0],roofBase,b[2]],edge);
  }
}

function addTree(mesh,{x,z,size,yaw,color}) {
  const leaf=rgb(color);
  const trunk=rgb('#867c62');
  const base=toWorld([x,z,surfaceHeightAt(x,z)]);
  const point=(x,y,z)=>[base[0]+x*size,base[1]+y*size,base[2]+z*size];
  mesh.quad(point(-.065,0,0),point(.065,0,0),point(.052,.72,0),point(-.052,.72,0),trunk);
  mesh.quad(point(0,0,-.065),point(0,0,.065),point(0,.72,.052),point(0,.72,-.052),trunk);
  const rings=[
    Array.from({length:7},(_,i)=>{const a=yaw+i*2*Math.PI/7;return point(Math.cos(a)*.78,.84,Math.sin(a)*.79);}),
    Array.from({length:7},(_,i)=>{const a=yaw+(i+.5)*2*Math.PI/7;return point(Math.cos(a)*.55,1.29,Math.sin(a)*.52);})
  ];
  const crown=point(-.09,1.58,.05), underside=point(.04,.48,.02);
  for(let i=0;i<7;i++) {
    const j=(i+1)%7;
    const k=.94-.14*Math.cos(yaw+i*2*Math.PI/7-.75);
    mesh.triangle(underside,rings[0][i],rings[0][j],tint(leaf,k*.78));
    mesh.triangle(rings[0][i],rings[0][j],rings[1][i],tint(leaf,k));
    mesh.triangle(rings[1][i],rings[1][j],rings[0][j],tint(leaf,k*1.05));
    mesh.triangle(crown,rings[1][i],rings[1][j],tint(leaf,k*1.16));
  }
}

const surfaceColors={
  stone:['#dad3bf','#a29a84'],
  step:['#d8ceba','#a59c87'],
  ramp:['#c8c4b2','#a09b88'],
  bridge:['#d6d1bf','#aaa594'],
  parapet:['#d9d9ca','#a8a99a']
};

function addOutdoorSurface(mesh,{points,height,material,base=()=>groundLevel-.06}) {
  const [top,wall]=surfaceColors[material].map(rgb);
  const corners=points.map(([x,z])=>toWorld([x,z,height(x,z)]));
  const bottom=points.map(([x,z])=>toWorld([x,z,base(x,z)]));
  if(points.length===4) mesh.quad(...corners,top);
  else for(const [a,b,c] of triangulate(points)) mesh.triangle(corners[a],corners[b],corners[c],top);
  for(let i=0;i<corners.length;i++) {
    const next=(i+1)%corners.length;
    const a=corners[i], b=corners[next];
    const lighting=Math.abs(b[0]-a[0])>=Math.abs(b[2]-a[2])?.95:.86;
    mesh.quad(a,b,bottom[next],bottom[i],tint(wall,lighting));
  }
  if(material==='step') {
    const [left,right,backRight,backLeft]=corners;
    const strip=(a,b)=>[a[0]+(b[0]-a[0])*.16,a[1]+.006,a[2]+(b[2]-a[2])*.16];
    mesh.quad(strip(left,left),strip(right,right),strip(right,backRight),strip(left,backLeft),tint(top,1.055));
  }
}

function sceneMesh(trees) {
  const mesh=new Mesh();
  for(const [id,buildings] of Object.entries(buildingGroups)) {
    buildings.forEach(([height,points,style='modern'],i)=>
      addBuilding(mesh,height,points,style,buildingBase(id,points,i)));
  }
  for(const surface of outdoorSurfaces) addOutdoorSurface(mesh,surface);
  for(const wall of bridgeParapets) addOutdoorSurface(mesh,wall);
  addGymRoof(mesh);
  for(const tree of trees) addTree(mesh,tree);
  return mesh;
}

function terrainVertices() {
  const {columns,rows,stride,dx,dz,heights}=ground;
  const points=new Float32Array(heights.length*6);
  for(let row=0;row<=rows;row++) {
    for(let column=0;column<=columns;column++) {
      const i=row*stride+column;
      const position=toWorld([extent.left+column*dx,extent.top+row*dz,heights[i]]);
      const left=heights[i-(column>0?1:0)], right=heights[i+(column<columns?1:0)];
      const north=heights[i-(row>0?stride:0)], south=heights[i+(row<rows?stride:0)];
      const shade=1+Math.max(-.17,Math.min(.12,(right-left+south-north)*.15));
      points.set([...position,column/columns,row/rows,shade],i*6);
    }
  }
  const vertices=new Float32Array(columns*rows*36);
  let offset=0;
  for(let row=0;row<rows;row++) {
    for(let column=0;column<columns;column++) {
      const nw=row*stride+column, sw=nw+stride;
      for(const id of [nw,nw+1,sw+1,nw,sw+1,sw]) {
        vertices.set(points.subarray(id*6,id*6+6),offset);
        offset+=6;
      }
    }
  }
  return vertices;
}

function viewAxes(yaw,tilt) {
  const sx=Math.sin(yaw), cx=Math.cos(yaw), sy=Math.sin(tilt), cy=Math.cos(tilt);
  return {right:[cx,0,-sx],up:[-sx*sy,cy,-cx*sy],back:[sx*cy,sy,cx*cy]};
}

const dot = (a,b) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
function viewMatrix(view,aspect) {
  const {right,up,back}=viewAxes(view.yaw,view.tilt);
  const w=view.half*aspect, h=view.half, depth=-1200;
  return new Float32Array([
    right[0]/w,up[0]/h,back[0]/depth,0,
    right[1]/w,up[1]/h,back[1]/depth,0,
    right[2]/w,up[2]/h,back[2]/depth,0,
    -dot(right,view.target)/w,-dot(up,view.target)/h,-dot(back,view.target)/depth,1
  ]);
}

function perspectiveView({yaw,tilt,eye},aspect) {
  const {right,up,back}=viewAxes(yaw,tilt);
  const scale=1/Math.tan(34*Math.PI/180);
  const near=.06, far=1200;
  const depth=(far+near)/(near-far), offset=2*far*near/(near-far);
  return new Float32Array([
    right[0]*scale/aspect, up[0]*scale, back[0]*depth, -back[0],
    right[1]*scale/aspect, up[1]*scale, back[1]*depth, -back[1],
    right[2]*scale/aspect, up[2]*scale, back[2]*depth, -back[2],
    -dot(right,eye)*scale/aspect, -dot(up,eye)*scale, -dot(back,eye)*depth+offset, dot(back,eye)
  ]);
}

function renderer(canvas,terrain,mesh) {
  const gl=canvas.getContext('webgl',{alpha:true,antialias:true});
  if(!gl) return null;
  const vertex=`
    attribute vec3 aPosition;
    attribute vec3 aData;
    uniform mat4 uView;
    varying vec3 vData;
    varying vec3 vPosition;
    void main() {
      gl_Position = uView * vec4(aPosition, 1.0);
      vData = aData;
      vPosition = aPosition;
    }
  `;
  const fragment=`
    #ifdef GL_FRAGMENT_PRECISION_HIGH
    precision highp float;
    #else
    precision mediump float;
    #endif
    varying vec3 vData;
    varying vec3 vPosition;
    uniform sampler2D uMap;
    uniform bool uExplore;
    uniform int uSurface;
    uniform vec3 uEye;
    void main() {
      if (uSurface == 2) {
        gl_FragColor = vec4(0.0, 0.0, 0.0, vData.r);
        return;
      }
      vec3 color = uSurface == 1 ? texture2D(uMap, vData.xy).rgb * vData.z : vData;
      if (uExplore) {
        float distanceFromEye = length((vPosition - uEye) * 0.001) * 1000.0;
        if (uSurface == 1) {
          vec2 tile = mod(floor(vPosition.xz * 24.0), 121.0);
          float grain = fract(sin(dot(tile, vec2(11.7, 53.3))) * 49.1) - 0.5;
          color += grain * 0.027 * (1.0 - smoothstep(7.0, 22.0, distanceFromEye));
        }
        color = mix(color, vec3(0.79, 0.88, 0.89), smoothstep(100.0, 520.0, distanceFromEye));
      }
      gl_FragColor = vec4(color, 1.0);
    }
  `;
  function shader(type,code) {
    const shader=gl.createShader(type);
    gl.shaderSource(shader,code);
    gl.compileShader(shader);
    if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
    return shader;
  }
  const program=gl.createProgram();
  gl.attachShader(program,shader(gl.VERTEX_SHADER,vertex));
  gl.attachShader(program,shader(gl.FRAGMENT_SHADER,fragment));
  gl.linkProgram(program);
  if(!gl.getProgramParameter(program,gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
  gl.useProgram(program);
  const position=gl.getAttribLocation(program,'aPosition');
  const data=gl.getAttribLocation(program,'aData');
  const uView=gl.getUniformLocation(program,'uView');
  const uExplore=gl.getUniformLocation(program,'uExplore');
  const uSurface=gl.getUniformLocation(program,'uSurface');
  const uEye=gl.getUniformLocation(program,'uEye');
  gl.enableVertexAttribArray(position);
  gl.enableVertexAttribArray(data);
  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  function buffer(values) {
    const id=gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER,id);
    gl.bufferData(gl.ARRAY_BUFFER,values instanceof Float32Array?values:new Float32Array(values),gl.STATIC_DRAW);
    return {id,count:values.length/6};
  }
  const horizon=new Mesh();
  const horizonLevel=groundLevel-.13;
  horizon.quad([-1800,horizonLevel,-1800],[1800,horizonLevel,-1800],
    [1800,horizonLevel,1800],[-1800,horizonLevel,1800],rgb('#bdc7aa'));
  const terrainMesh=buffer(terrainVertices()), structures=buffer(mesh.vertices), distantGround=buffer(horizon.vertices);
  const movingMesh={id:gl.createBuffer(),count:0};
  const texture=gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D,texture);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,terrain);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  gl.generateMipmap(gl.TEXTURE_2D);
  const anisotropy=gl.getExtension('EXT_texture_filter_anisotropic');
  if(anisotropy) gl.texParameterf(gl.TEXTURE_2D,anisotropy.TEXTURE_MAX_ANISOTROPY_EXT,
    Math.min(8,gl.getParameter(anisotropy.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
  function draw({id,count},surface=0) {
    gl.bindBuffer(gl.ARRAY_BUFFER,id);
    gl.vertexAttribPointer(position,3,gl.FLOAT,false,24,0);
    gl.vertexAttribPointer(data,3,gl.FLOAT,false,24,12);
    gl.uniform1i(uSurface,surface);
    gl.drawArrays(gl.TRIANGLES,0,count);
  }
  function drawMoving(vertices,surface) {
    gl.bindBuffer(gl.ARRAY_BUFFER,movingMesh.id);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(vertices),gl.DYNAMIC_DRAW);
    movingMesh.count=vertices.length/6;
    draw(movingMesh,surface);
  }
  return (matrix,explorer)=>{
    gl.viewport(0,0,canvas.width,canvas.height);
    if(explorer) gl.clearColor(0,0,0,0);
    else gl.clearColor(.838,.866,.780,1);
    gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
    gl.uniformMatrix4fv(uView,false,matrix);
    gl.uniform1i(uExplore,Boolean(explorer));
    if(explorer) {
      gl.uniform3fv(uEye,explorer.eye);
      draw(distantGround);
    }
    draw(terrainMesh,1);
    draw(structures);
    if(explorer) {
      gl.enable(gl.BLEND);
      gl.blendFuncSeparate(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA,gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
      drawMoving(explorer.shadow,2);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
      if(explorer.avatar) drawMoving(explorer.avatar,0);
    }
  };
}
