class Vector3{constructor(x=0,y=0,z=0){this.x=x;this.y=y;this.z=z}set(x,y,z){this.x=x;this.y=y;this.z=z;return this}copy(v){this.x=v.x;this.y=v.y;this.z=v.z;return this}clone(){return new Vector3(this.x,this.y,this.z)}
add(v){this.x+=v.x;this.y+=v.y;this.z+=v.z;return this}sub(v){this.x-=v.x;this.y-=v.y;this.z-=v.z;return this}multiplyScalar(s){this.x*=s;this.y*=s;this.z*=s;return this}
addScaledVector(v,s){this.x+=v.x*s;this.y+=v.y*s;this.z+=v.z*s;return this}dot(v){return this.x*v.x+this.y*v.y+this.z*v.z}lengthSq(){return this.dot(this)}length(){return Math.sqrt(this.lengthSq())}
normalize(){const l=this.length()||1;return this.multiplyScalar(1/l)}distanceTo(v){return Math.hypot(this.x-v.x,this.y-v.y,this.z-v.z)}
cross(v){return this.crossVectors(this,v)}crossVectors(a,b){const ax=a.x,ay=a.y,az=a.z,bx=b.x,by=b.y,bz=b.z;this.x=ay*bz-az*by;this.y=az*bx-ax*bz;this.z=ax*by-ay*bx;return this}
applyQuaternion(q){const x=this.x,y=this.y,z=this.z,qx=q.x,qy=q.y,qz=q.z,qw=q.w;const ix=qw*x+qy*z-qz*y,iy=qw*y+qz*x-qx*z,iz=qw*z+qx*y-qy*x,iw=-qx*x-qy*y-qz*z;
this.x=ix*qw+iw*-qx+iy*-qz-iz*-qy;this.y=iy*qw+iw*-qy+iz*-qx-ix*-qz;this.z=iz*qw+iw*-qz+ix*-qy-iy*-qx;return this}}
class Quaternion{constructor(x=0,y=0,z=0,w=1){this.x=x;this.y=y;this.z=z;this.w=w}set(x,y,z,w){this.x=x;this.y=y;this.z=z;this.w=w;return this}copy(q){return this.set(q.x,q.y,q.z,q.w)}
setFromAxisAngle(a,an){const s=Math.sin(an/2);return this.set(a.x*s,a.y*s,a.z*s,Math.cos(an/2))}invert(){this.x*=-1;this.y*=-1;this.z*=-1;return this}
multiply(b){const a=this,qax=a.x,qay=a.y,qaz=a.z,qaw=a.w,qbx=b.x,qby=b.y,qbz=b.z,qbw=b.w;return this.set(qax*qbw+qaw*qbx+qay*qbz-qaz*qby,qay*qbw+qaw*qby+qaz*qbx-qax*qbz,qaz*qbw+qaw*qbz+qax*qby-qay*qbx,qaw*qbw-qax*qbx-qay*qby-qaz*qbz)}
normalize(){const l=Math.hypot(this.x,this.y,this.z,this.w);return this.set(this.x/l,this.y/l,this.z/l,this.w/l)}setFromEuler(){return this}}
class Color{constructor(h){this.set(h||"#000")}convertSRGBToLinear(){return this}setRGB(r,g,b){this.r=r;this.g=g;this.b=b;return this}setRGB(r,g,b){this.r=r;this.g=g;this.b=b;return this}set(h){if(typeof h==='number')h='#'+h.toString(16).padStart(6,'0');const n=parseInt(h.slice(1).padEnd(6,h.slice(1)),16);this.r=(n>>16&255)/255;this.g=(n>>8&255)/255;this.b=(n&255)/255;return this}}
class Curve{constructor(p){this.p=p;this.cum=[0];for(let i=1;i<p.length;i++)this.cum.push(this.cum[i-1]+p[i].distanceTo(p[i-1]));this.L=this.cum[this.cum.length-1]}
seg(t){const d=t*this.L;let i=1;while(i<this.cum.length-1&&this.cum[i]<d)i++;const u=(d-this.cum[i-1])/(this.cum[i]-this.cum[i-1]);return[i,u]}
getPointAt(t){const[i,u]=this.seg(Math.min(1,Math.max(0,t)));const a=this.p[i-1],b=this.p[i];return new Vector3(a.x+(b.x-a.x)*u,0,a.z+(b.z-a.z)*u)}
getTangentAt(t){const[i]=this.seg(Math.min(.9999,Math.max(0,t)));return this.p[i].clone().sub(this.p[i-1]).normalize()}getSpacedPoints(n){const r=[];for(let i=0;i<=n;i++)r.push(this.getPointAt(i/n));return r}}
class Obj{constructor(){this.position=new Vector3();this.rotation={x:0,y:0,z:0,set(){} };this.scale=new Vector3(1,1,1);this.children=[]}add(...o){this.children.push(...o)}translate(){return this}setMatrixAt(){}setColorAt(){}}
const stub=class extends Obj{};
global.THREE={Vector3,Quaternion,Color,CatmullRomCurve3:Curve,Group:stub,Mesh:stub,InstancedMesh:stub,Matrix4:class{compose(){}},Euler:class{set(){}},
IcosahedronGeometry:stub,ConeGeometry:stub,CylinderGeometry:stub,SphereGeometry:stub,TorusGeometry:stub,BoxGeometry:stub,PlaneGeometry:stub,CircleGeometry:stub,RingGeometry:stub,PointsMaterial:stub,Points:stub,BufferGeometry:stub,BufferAttribute:stub,MeshStandardMaterial:stub,MeshBasicMaterial:stub,DoubleSide:2,BackSide:1};
