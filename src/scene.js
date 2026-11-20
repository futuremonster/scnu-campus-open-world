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

function addBuilding(mesh,height,points,style) {
  const [roof,wall,glass]=colors[style].map(rgb);
  const trim=tint(roof,.96);
  const winding=area(points)>0?1:-1;
  mesh.flat(points,height,roof);
  points.forEach(([ax,az],i)=>{
    const [bx,bz]=points[(i+1)%points.length];
    const dx=bx-ax, dz=bz-az, length=Math.hypot(dx,dz);
    if(length<.001) return;
    const nx=winding*dz/length, nz=-winding*dx/length;
    const light=.87+.17*(-.68*nx-.73*nz);
    const point=(u,v,push=0)=>toWorld([ax+dx*u+nx*push,az+dz*u+nz*push,v]);
    const band=(u0,u1,v0,v1,push,color)=>{
      mesh.quad(point(u0,v0,push),point(u1,v0,push),point(u1,v1,push),point(u0,v1,push),color);
    };
    band(0,1,0,height,0,tint(wall,light));
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
        band((k+gap)/bays,(k+1-gap)/bays,bottom,top,.12,tint(glass,light*(.95+(k%5===0?.12:0))));
      }
    }
  });
}

function addGymRoof(mesh) {
  const rows=[];
  for (let i=0;i<=10;i++) {
    const t=i/10;
    const h=12+3.2*Math.sin(t*Math.PI);
    rows.push([toWorld([1397+89*t,332-t,h]),toWorld([1399+92*t,458-4*t,h])]);
  }
  const color=rgb('#aebbc1');
  const edge=rgb('#828f93');
  for (let i=1;i<rows.length;i++) {
    const [a,b]=rows[i-1], [c,d]=rows[i];
    mesh.quad(a,c,d,b,tint(color,.87+.14*Math.sin(i*.25)));
    mesh.triangle(a,c,[c[0],12,c[2]],edge);
    mesh.triangle(a,[c[0],12,c[2]],[a[0],12,a[2]],edge);
    mesh.triangle(b,d,[d[0],12,d[2]],edge);
    mesh.triangle(b,[d[0],12,d[2]],[b[0],12,b[2]],edge);
  }
}

function addTree(mesh,{x,z,size,yaw,color}) {
  const leaf=rgb(color);
  const trunk=rgb('#867c62');
  const base=toWorld([x,z,0]);
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

function sceneMesh(trees) {
  const mesh=new Mesh();
  for(const buildings of Object.values(buildingGroups)) {
    for(const [height,points,style='modern'] of buildings) addBuilding(mesh,height,points,style);
  }
  addGymRoof(mesh);
  for(const tree of trees) addTree(mesh,tree);
  return mesh;
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

function renderer(canvas,terrain,mesh) {
  const gl=canvas.getContext('webgl',{alpha:false,antialias:true});
  if(!gl) return null;
  const vertex=`
    attribute vec3 aPosition;
    attribute vec3 aData;
    uniform mat4 uView;
    varying vec3 vData;
    void main() { gl_Position = uView * vec4(aPosition, 1.0); vData = aData; }
  `;
  const fragment=`
    precision mediump float;
    varying vec3 vData;
    uniform sampler2D uMap;
    uniform bool uTerrain;
    void main() { gl_FragColor = uTerrain ? texture2D(uMap, vData.xy) : vec4(vData, 1.0); }
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
  const uTerrain=gl.getUniformLocation(program,'uTerrain');
  gl.enableVertexAttribArray(position);
  gl.enableVertexAttribArray(data);
  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  gl.clearColor(.838,.866,.780,1);
  const [tl,tr,br,bl]=rect(extent.left,extent.top,extent.width,extent.depth).map(p=>toWorld([...p,-.35]));
  const base=[
    ...tl,0,0,0,...tr,1,0,0,...br,1,1,0,
    ...tl,0,0,0,...br,1,1,0,...bl,0,1,0
  ];
  function buffer(values) {
    const id=gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER,id);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(values),gl.STATIC_DRAW);
    return {id,count:values.length/6};
  }
  const ground=buffer(base), structures=buffer(mesh.vertices);
  const texture=gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D,texture);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,terrain);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  gl.generateMipmap(gl.TEXTURE_2D);
  const anisotropy=gl.getExtension('EXT_texture_filter_anisotropic');
  if(anisotropy) gl.texParameterf(gl.TEXTURE_2D,anisotropy.TEXTURE_MAX_ANISOTROPY_EXT,
    Math.min(8,gl.getParameter(anisotropy.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
  function draw({id,count},isGround) {
    gl.bindBuffer(gl.ARRAY_BUFFER,id);
    gl.vertexAttribPointer(position,3,gl.FLOAT,false,24,0);
    gl.vertexAttribPointer(data,3,gl.FLOAT,false,24,12);
    gl.uniform1i(uTerrain,isGround);
    gl.drawArrays(gl.TRIANGLES,0,count);
  }
  return matrix=>{
    gl.viewport(0,0,canvas.width,canvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
    gl.uniformMatrix4fv(uView,false,matrix);
    draw(ground,1);
    draw(structures,0);
  };
}
