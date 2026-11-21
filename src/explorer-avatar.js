const avatarColors = {
  jacket:rgb('#28645f'),
  collar:rgb('#91b5a2'),
  pants:rgb('#2f3b46'),
  shoes:rgb('#e7ddc7'),
  soles:rgb('#545453'),
  skin:rgb('#c98e68'),
  hair:rgb('#2a2528'),
  backpack:rgb('#b96136'),
  pocket:rgb('#d68448'),
  straps:rgb('#54423c'),
  zipper:rgb('#f1c68c')
};

function avatarPart(mesh,transform,color,[x,y,z],[w,h,d]) {
  const cut=Math.min(w,d)*.16;
  const left=x-w/2, right=x+w/2, front=z-d/2, back=z+d/2;
  const corners=[
    [left+cut,front],[right-cut,front],[right,front+cut],[right,back-cut],
    [right-cut,back],[left+cut,back],[left,back-cut],[left,front+cut]
  ];
  const low=corners.map(([a,b])=>transform(a,y-h/2,b));
  const high=corners.map(([a,b])=>transform(a,y+h/2,b));
  const shade=[.98,1,.83,.80,.91,.96,.91,1.04];
  for(let i=0;i<8;i++) {
    const next=(i+1)%8;
    mesh.quad(low[i],low[next],high[next],high[i],tint(color,shade[i]));
  }
  const top=tint(color,1.18);
  for(let i=1;i<7;i++) mesh.triangle(high[0],high[i],high[i+1],top);
}

function explorerAvatar({x,y,z,facing,phase,gait}) {
  const mesh=new Mesh();
  const cos=Math.cos(facing), sin=Math.sin(facing);
  const sway=.023*Math.sin(phase)*gait;
  const lift=.025*Math.abs(Math.sin(phase))*gait;
  const toScene=(a,b,c)=>[x+a*cos+c*sin,y+b,-a*sin+z+c*cos];
  const body=(a,b,c)=>toScene(a+sway,b+lift,c);
  const part=(transform,color,center,size)=>avatarPart(mesh,transform,avatarColors[color],center,size);
  part(body,'jacket',[0,1.17,0],[.43,.47,.26]);
  part(body,'pants',[0,.91,0],[.33,.14,.23]);
  part(body,'collar',[0,1.40,0],[.22,.105,.23]);
  part(body,'skin',[0,1.49,-.005],[.13,.14,.14]);
  part(body,'skin',[0,1.62,-.02],[.225,.25,.22]);
  part(body,'hair',[0,1.72,-.005],[.24,.11,.25]);
  part(body,'hair',[0,1.63,.075],[.23,.13,.088]);
  part(body,'backpack',[0,1.18,.193],[.314,.40,.176]);
  part(body,'straps',[0,1.394,.17],[.105,.044,.038]);
  part(body,'pocket',[0,1.108,.281],[.237,.174,.066]);
  part(body,'zipper',[0,1.158,.317],[.157,.016,.009]);
  part(body,'straps',[0,1.285,.283],[.117,.035,.009]);

  for(const sign of [-1,1]) {
    const stride=sign*Math.sin(phase)*gait;
    const legAngle=.60*stride;
    const leg=(a,b,c)=>toScene(a+sign*.087+sway,b*Math.cos(legAngle)-c*Math.sin(legAngle)+.91+lift,
      b*Math.sin(legAngle)+c*Math.cos(legAngle));
    const kneeAngle=-.78*Math.max(0,-stride);
    const shin=(a,b,c)=>leg(a,b*Math.cos(kneeAngle)-c*Math.sin(kneeAngle)-.42,
      b*Math.sin(kneeAngle)+c*Math.cos(kneeAngle));
    part(leg,'pants',[0,-.205,0],[.156,.45,.184]);
    part(shin,'pants',[0,-.190,0],[.128,.43,.15]);
    part(shin,'shoes',[0,-.415,-.044],[.15,.108,.263]);
    part(shin,'soles',[0,-.473,-.044],[.153,.030,.267]);

    const armAngle=-.63*stride-.09;
    const arm=(a,b,c)=>body(a+sign*.253,b*Math.cos(armAngle)-c*Math.sin(armAngle)+1.37,
      b*Math.sin(armAngle)+c*Math.cos(armAngle));
    part(arm,'jacket',[0,-.187,0],[.128,.42,.152]);
    part(arm,'collar',[0,-.392,0],[.110,.048,.131]);
    part(arm,'skin',[0,-.448,-.008],[.093,.105,.104]);
    part(body,'straps',[sign*.14,1.25,-.137],[.037,.32,.025]);
  }
  return mesh.vertices;
}

function explorerShadow({x,y,z},surfaceElevation) {
  const shadowY=y+.018, vertices=[];
  const opacity=[.34,0,0], edge=[0,0,0];
  const count=18;
  const perimeter=Array.from({length:count},(_,i)=>{
    const angle=i*2*Math.PI/count;
    const px=x+Math.cos(angle)*.78, pz=z+Math.sin(angle)*.64;
    return [px,surfaceElevation(px,pz)+.018,pz];
  });
  for(let i=0;i<count;i++) {
    vertices.push(x,shadowY,z,...opacity,...perimeter[i],...edge,...perimeter[(i+1)%count],...edge);
  }
  return vertices;
}
