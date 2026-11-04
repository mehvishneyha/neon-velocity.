
// NEON VELOCITY — an original, dependency-light pseudo-3D arcade racer.
// All road geometry, skylines, vehicles, neon effects, and audio are generated in code.
const $ = (id) => document.getElementById(id);
const canvas = $('game');
const ctx = canvas.getContext('2d', { alpha: false });
const TAU = Math.PI * 2;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp = (a,b,t) => a+(b-a)*t;
const mod = (v,n) => ((v%n)+n)%n;
const ease = (a,b,t) => a+(b-a)*(1-Math.cos(t*Math.PI))/2;
const rnd = (n) => { const s = Math.sin(n * 127.1 + 17.23) * 43758.5453123; return s-Math.floor(s); };
const pad = (n) => String(Math.floor(n)).padStart(2,'0');
const fmt = (t) => `${pad(t/60)}:${pad(t%60)}.${pad((t%1)*100)}`;
const $ui = Object.fromEntries(['menu','hud','mobileControls','pauseScreen','resultsScreen','countdown','positionVal','lapVal','speedVal','gearVal','nitroVal','nitroFill','timeVal','bestLapVal','trackProgress','raceBanner','driftNotice','toast','pauseBtn','soundBtn','resultTitle','resultPlace','resultTime','resultLap','resultEyebrow'].map(x=>[x,$(x)]));

const SEGMENT_LENGTH=200, ROAD_WIDTH=2000, LANES=3, DRAW_DISTANCE=235, CAMERA_HEIGHT=1020, FOV=100, CAMERA_DEPTH=1/Math.tan(FOV/2*Math.PI/180);
const MAX_SPEED=13800, ACCEL=8200, DECEL=5200, BRAKE=15500, CENTRIFUGAL=.27, TOTAL_LAPS=3;
const ROAD_COLORS=[{road:'#262f3e',rumble:'#f9f4dc',lane:'#a5b7bd',side:'#101b2c'},{road:'#293344',rumble:'#e54469',lane:'#8c9dab',side:'#111b2c'}];
const segments=[], drivers=[], particles=[];
let W=0,H=0,DPR=1, trackLength=0, state='menu', lastTime=0, raceTime=0, lapStart=0, bestLap=Infinity, lapsDone=0, countdown=3.8, toastTimer=0, shake=0;
let speed=0, nitro=100, playerX=0, position=0, raceStart=0, roadCurve=0, steerVisual=0, driftScore=0, drifting=false, nitroActive=false, collisionCooldown=0;
let playedCountdown=new Set(), mobilePointer=false, audioContext=null, audioMuted=false, engineOsc=null, engineGain=null, noiseSource=null;
const keys={left:false,right:false,gas:false,brake:false,nitro:false,drift:false};
const city=[];
for(let i=0;i<94;i++) city.push({x:i/94,h:55+rnd(i*8)*195,w:28+rnd(i*3+1)*88,shade:rnd(i*17),n:rnd(i*13)});
const stars=Array.from({length:105},(_,i)=>({x:rnd(i+87),y:rnd(i+245)*.56,r:rnd(i+34)*1.5+.4}));
const palette=['#ff365e','#21daf7','#f6c74b','#c8e4ec','#b35df4','#2ed5ae','#ff8940','#f0f0f0'];
const carNames=['YOU','GHOST','VIPER','ECHO','RAVEN','BLAZE','NOVA','STRYKER'];

function buildRoad(){
  segments.length=0;
  function add(curve,y){let n=segments.length;const prev=n?segments[n-1].p2.world.y:0;segments.push({index:n,p1:{world:{x:0,y:prev,z:n*SEGMENT_LENGTH},camera:{},screen:{}},p2:{world:{x:0,y:y,z:(n+1)*SEGMENT_LENGTH},camera:{},screen:{}},curve,decor:null,cars:[]});}
  function addRoad(enter,hold,leave,curve=0,hill=0){
    const start=segments.length, total=enter+hold+leave, ys=start?segments[start-1].p2.world.y:0;
    const end=ys+hill*SEGMENT_LENGTH;
    for(let n=0;n<total;n++){
      const c=n<enter?ease(0,curve,n/Math.max(1,enter)):n<enter+hold?curve:ease(curve,0,(n-enter-hold)/Math.max(1,leave));
      const y=ease(ys,end,(n+1)/total);
      add(c,y);
    }
  }
  addRoad(25,55,25,0,0);
  addRoad(40,80,40,1.15,13);
  addRoad(30,55,35,-1.45,-9);
  addRoad(45,70,40,2.2,7);
  addRoad(25,75,35,-2.25,-11);
  addRoad(40,60,45,.65,4);
  addRoad(38,75,40,-1.25,0);
  addRoad(30,75,35,1.75,9);
  addRoad(30,65,35,-1.7,-7);
  addRoad(35,70,40,1.0,-6);
  addRoad(35,65,30,-.55,0);
  addRoad(30,85,30,0,0);
  trackLength=segments.length*SEGMENT_LENGTH;
  for(let i=0;i<segments.length;i++){
    const s=segments[i];
    if(i%9===0){const r=rnd(i+4);s.decor=r<.37?'lamp':r<.68?'building':r<.88?'palm':'billboard';}
    if(i%28===8)s.decor='lamp';
    s.district=Math.floor(i/220)%4;
  }
}
function findSegment(z){return segments[Math.floor(mod(z,trackLength)/SEGMENT_LENGTH)];}
function project(p,camX,camY,camZ){
  p.camera.x=p.world.x-camX;p.camera.y=p.world.y-camY;p.camera.z=p.world.z-camZ;
  p.screen.scale=CAMERA_DEPTH/Math.max(1,p.camera.z);
  p.screen.x=Math.round(W/2+p.screen.scale*p.camera.x*W/2);
  p.screen.y=Math.round(H/2-p.screen.scale*p.camera.y*H/2);
  p.screen.w=Math.round(p.screen.scale*ROAD_WIDTH*W/2);
}
function quad(color,x1,y1,w1,x2,y2,w2){ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(x1-w1,y1);ctx.lineTo(x2-w2,y2);ctx.lineTo(x2+w2,y2);ctx.lineTo(x1+w1,y1);ctx.closePath();ctx.fill();}
function segmentQuad(s,color,top,bot,left1,right1,left2,right2){ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(top.x+top.w*left1,top.y);ctx.lineTo(top.x+top.w*right1,top.y);ctx.lineTo(bot.x+bot.w*right2,bot.y);ctx.lineTo(bot.x+bot.w*left2,bot.y);ctx.closePath();ctx.fill();}
function drawRoad(s){
  const p1=s.p1.screen,p2=s.p2.screen,alternate=Math.floor(s.index/4)%2, colors=ROAD_COLORS[alternate];
  ctx.fillStyle=colors.side;ctx.fillRect(0,p2.y,W,Math.max(0,p1.y-p2.y+1));
  quad(colors.rumble,p1.x,p1.y,p1.w*1.13,p2.x,p2.y,p2.w*1.13);
  quad(colors.road,p1.x,p1.y,p1.w,p2.x,p2.y,p2.w);
  const farRatio=Math.min(1,p2.w/65);
  if(alternate===0 && farRatio>.06){for(let lane=1;lane<LANES;lane++){
    const t=(lane/LANES)*2-1, lw=Math.max(.5,p1.w/90);
    quad(colors.lane,p1.x+p1.w*t,p1.y,lw,p2.x+p2.w*t,p2.y,Math.max(.5,p2.w/90));
  }}
  if(s.index%32<2){quad('rgba(41,229,249,.45)',p1.x,p1.y,p1.w*.016,p2.x,p2.y,p2.w*.016);}
  if(s.index%150<3){for(let i=0;i<9;i++){
    let x=-1+i*2/9;segmentQuad(s,i%2?'#f1f1ec':'#ea315d',p2,p1,x,x+2/9,x,x+2/9);
  }}
}
function drawSky(t){
  const horizon=H*.52;const g=ctx.createLinearGradient(0,0,0,H);g.addColorStop(0,'#080c26');g.addColorStop(.39,'#1b1945');g.addColorStop(.65,'#6a2b61');g.addColorStop(.88,'#1b273f');g.addColorStop(1,'#141c2a');ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
  const starShift=playerX*.009;
  ctx.fillStyle='rgba(236,248,255,.62)';stars.forEach((s,i)=>{ctx.globalAlpha=.25+rnd(i*2)*.55;ctx.fillRect(mod(s.x*W-starShift*2,W),s.y*H,s.r,s.r);});ctx.globalAlpha=1;
  const moonX=W*.73-starShift*1.2, moonY=H*.20;
  const glow=ctx.createRadialGradient(moonX,moonY,7,moonX,moonY,100);glow.addColorStop(0,'#ff77b144');glow.addColorStop(1,'#ff77b100');ctx.fillStyle=glow;ctx.beginPath();ctx.arc(moonX,moonY,100,0,TAU);ctx.fill();ctx.fillStyle='#f6b5d1';ctx.beginPath();ctx.arc(moonX,moonY,25,0,TAU);ctx.fill();
  // Distant atmospheric ridges.
  for(let layer=0;layer<2;layer++){
    ctx.beginPath();ctx.moveTo(0,H);let offset=playerX*(layer?.015:.008)+position*(layer?.00005:.000025);
    for(let x=-40;x<=W+40;x+=20){let xx=(x+offset)*.008;let height=(layer?33:66)+Math.sin(xx)*28+Math.sin(xx*2.45)*14;ctx.lineTo(x,horizon+30+height);}
    ctx.lineTo(W,H);ctx.fillStyle=layer?'#141f35':'#282244';ctx.fill();
  }
  let cityOffset=playerX*.025+position*.003;
  for(let n=-1;n<=2;n++)for(let i=0;i<city.length;i++){
    const b=city[i];const x=(i/94+n)*W*1.1-cityOffset% (W*1.1);const y=horizon+75-b.h*(H/780);
    if(x<-120||x>W+120)continue;
    const bw=b.w*(W/1350);const bh=(horizon+110-y);
    ctx.fillStyle=b.shade>.55?'#151b33':'#1c213e';ctx.fillRect(x,y,bw,bh);
    ctx.fillStyle=b.shade>.55?'#16e1ed':'#ea3a88';ctx.globalAlpha=.3;
    for(let col=0;col<bw-8;col+=12)for(let row=7;row<bh-7;row+=13)if(rnd(i*103+col*7+row*3)>.49)ctx.fillRect(x+col+6,y+row,3,4);
    ctx.globalAlpha=1;
    if(i%13===0){ctx.fillStyle='#e93b83';ctx.fillRect(x+2,y-2,bw-4,2);}
  }
  let haze=ctx.createLinearGradient(0,H*.45,0,H*.72);haze.addColorStop(0,'#8f3a7200');haze.addColorStop(.45,'#b43f6440');haze.addColorStop(1,'#111b2b00');ctx.fillStyle=haze;ctx.fillRect(0,H*.45,W,H*.27);
}
function neonLine(x1,y1,x2,y2,color,width){ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();}
function decor(s,side){
  const p=s.p1.screen;if(p.w<4||p.y>H+30)return;
  let scale=p.w/ROAD_WIDTH, x=p.x+side*p.w*(s.decor==='building'?2.35:1.55), y=p.y, size=clamp(p.w*.33,2,370);
  if(x<-450||x>W+450)return;
  ctx.save();
  if(s.decor==='lamp'){
    let h=size*2.5;neonLine(x,y,x,y-h,'#202d41',Math.max(2,size*.10));neonLine(x,y-h,x-side*size*.64,y-h,'#21344b',Math.max(2,size*.095));ctx.shadowColor=side===1?'#fd447a':'#25e8ff';ctx.shadowBlur=Math.max(6,size*.65);ctx.fillStyle=side===1?'#ff5b94':'#65f4ff';ctx.fillRect(x-side*size*.82,y-h-3,size*.48,Math.max(2,size*.075));ctx.shadowBlur=0;
  } else if(s.decor==='palm'){
    let h=size*2.6;neonLine(x,y,x-side*size*.18,y-h,'#293447',Math.max(2,size*.13));ctx.strokeStyle='#1b857e';ctx.lineWidth=Math.max(1,size*.10);for(let j=-2;j<=2;j++){ctx.beginPath();ctx.moveTo(x-side*size*.18,y-h);ctx.quadraticCurveTo(x+j*size*.5,y-h-size*.47,x+j*size*.84,y-h+size*.28);ctx.stroke();}
  } else if(s.decor==='billboard'){
    let bw=size*1.7,bh=size*.7,bx=x-bw/2,by=y-size*2;ctx.fillStyle='#131c36';ctx.fillRect(bx-5,by-5,bw+10,bh+10);ctx.strokeStyle=side===1?'#ff3975':'#35ddf4';ctx.lineWidth=Math.max(1,size*.035);ctx.strokeRect(bx,by,bw,bh);ctx.fillStyle='#f3edf9';ctx.font=`900 ${Math.max(7,bh*.49)}px Barlow Condensed`;ctx.textAlign='center';ctx.fillText(side===1?'NIGHT RUN':'FULL THROTTLE',x,by+bh*.65);ctx.fillStyle='#252d48';ctx.fillRect(x-size*.07,by+bh,size*.14,size*1.3);
  }else if(s.decor==='building'){
    let bw=size*1.45,bh=size*(2+rnd(s.index*.7)*2.2);ctx.fillStyle='#151c31';ctx.fillRect(x-bw/2,y-bh,bw,bh);ctx.fillStyle=side===1?'#e74080':'#26a3c7';ctx.globalAlpha=.7;for(let i=8;i<bw-4;i+=Math.max(8,size*.23))for(let j=10;j<bh-8;j+=Math.max(10,size*.25))if(rnd(i+j*3+s.index)>.28)ctx.fillRect(x-bw/2+i,y-bh+j,Math.max(2,size*.07),Math.max(3,size*.09));ctx.globalAlpha=1;neonLine(x-bw/2,y-bh,x+bw/2,y-bh,side===1?'#ef3974':'#17bdd8',Math.max(2,size*.045));
  }
  ctx.restore();
}
function drawCar(x,y,w,h,color,angle=0,ai=false,boost=false){
  if(w<2||h<2||y<-h||y>H+h)return;
  ctx.save();ctx.translate(x,y);ctx.rotate(angle);let cw=w,ch=h;
  // Asphalt shadow and ground glow.
  ctx.fillStyle='rgba(0,0,0,.42)';ctx.beginPath();ctx.ellipse(0,-ch*.08,cw*.68,ch*.12,0,0,TAU);ctx.fill();
  ctx.shadowColor=boost?'#20f1ff':color;ctx.shadowBlur=boost?cw*.37:cw*.17;ctx.fillStyle=boost?'#22daef99':color+'60';ctx.fillRect(-cw*.43,-ch*.11,cw*.86,ch*.055);ctx.shadowBlur=0;
  ctx.fillStyle='#0a1021';ctx.fillRect(-cw*.52,-ch*.35,cw*.19,ch*.29);ctx.fillRect(cw*.33,-ch*.35,cw*.19,ch*.29);
  ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(-cw*.47,-ch*.11);ctx.lineTo(-cw*.51,-ch*.41);ctx.lineTo(-cw*.35,-ch*.75);ctx.lineTo(-cw*.27,-ch*.89);ctx.lineTo(cw*.27,-ch*.89);ctx.lineTo(cw*.35,-ch*.75);ctx.lineTo(cw*.51,-ch*.41);ctx.lineTo(cw*.47,-ch*.11);ctx.closePath();ctx.fill();
  ctx.fillStyle='#101b31';ctx.beginPath();ctx.moveTo(-cw*.32,-ch*.7);ctx.lineTo(-cw*.23,-ch*.84);ctx.lineTo(cw*.23,-ch*.84);ctx.lineTo(cw*.32,-ch*.7);ctx.closePath();ctx.fill();
  ctx.fillStyle='#c2f9ff';ctx.globalAlpha=.38;ctx.beginPath();ctx.moveTo(-cw*.22,-ch*.82);ctx.lineTo(cw*.05,-ch*.82);ctx.lineTo(-cw*.12,-ch*.71);ctx.lineTo(-cw*.30,-ch*.71);ctx.fill();ctx.globalAlpha=1;
  ctx.fillStyle='#0b1220';ctx.fillRect(-cw*.48,-ch*.27,cw*.96,ch*.12);ctx.fillRect(-cw*.43,-ch*.54,cw*.86,ch*.035);
  ctx.fillStyle='#ff243d';ctx.shadowColor='#ff315d';ctx.shadowBlur=Math.max(5,cw*.13);ctx.fillRect(-cw*.44,-ch*.35,cw*.23,ch*.065);ctx.fillRect(cw*.21,-ch*.35,cw*.23,ch*.065);ctx.shadowBlur=0;
  ctx.fillStyle='#b9c7d6';ctx.fillRect(-cw*.14,-ch*.22,cw*.28,ch*.045);
  ctx.fillStyle='#0a0b1c';ctx.fillRect(-cw*.37,-ch*.11,cw*.74,ch*.06);
  if(!ai){ctx.fillStyle='#10182c';ctx.fillRect(-cw*.57,-ch*.54,cw*1.14,ch*.045);ctx.fillRect(-cw*.49,-ch*.57,cw*.08,ch*.12);ctx.fillRect(cw*.41,-ch*.57,cw*.08,ch*.12);}
  if(boost){ctx.fillStyle='#31e7ff';ctx.shadowColor='#19d5ff';ctx.shadowBlur=cw*.38;for(let side of [-1,1]){ctx.beginPath();ctx.moveTo(side*cw*.19,-ch*.09);ctx.lineTo(side*cw*.27,ch*(.22+Math.random()*.22));ctx.lineTo(side*cw*.34,-ch*.09);ctx.fill();}ctx.shadowBlur=0;}
  ctx.restore();
}
function drawPlayer(t){
  let carW=clamp(W*.19,112,260),carH=carW*.76;
  if(W<600)carW=W*.31,carH=carW*.78;
  const nx=W*.5+steerVisual*W*.022 + (Math.random()-.5)*shake*W*.004;
  const ny=H*.945+(nitroActive?Math.sin(t*50)*2:0);
  drawCar(nx,ny,carW,carH,'#eb345f',steerVisual*.046+((drifting&&speed>1000)?steerVisual*.06:0),false,nitroActive);
  if(nitroActive){ctx.fillStyle='rgba(39,200,255,.035)';ctx.fillRect(0,0,W,H);for(let i=0;i<16;i++){let x=rnd(i*3)*W,y=rnd(i*9+Math.floor(t*10))*H;neonLine(x,y,x+(x-W/2)*.06,y+Math.max(6,H*.04),'#8ef9ff44',1.5);}}
}
function drawRacers(segment,playerSegment,percent,offsetY){
  for(const d of segment.cars){
    let p=segment.p1.screen;let p2=segment.p2.screen;let frac=(mod(d.z,SEGMENT_LENGTH))/SEGMENT_LENGTH;
    let x=lerp(p.x,p2.x,frac)+lerp(p.w,p2.w,frac)*d.x;
    let y=lerp(p.y,p2.y,frac),w=lerp(p.w,p2.w,frac)*.37;
    if(y>H+70)continue;
    drawCar(x,y,w,w*.79,d.color,d.wobble*.018,true,d.boosting);
  }
}
function drawWorld(t){
  // Rebuild each segment's visible car list from continuously moving racers.
  for(const s of segments) s.cars.length=0;
  for(const d of drivers) findSegment(d.z).cars.push(d);
  ctx.save();if(shake>0){ctx.translate((Math.random()-.5)*shake*4,(Math.random()-.5)*shake*2);}
  drawSky(t);
  const base=findSegment(position), baseIndex=base.index, percent=mod(position,SEGMENT_LENGTH)/SEGMENT_LENGTH;
  const playerSegment=findSegment(position+CAMERA_HEIGHT*CAMERA_DEPTH);
  const playerPercent=mod(position+CAMERA_HEIGHT*CAMERA_DEPTH,SEGMENT_LENGTH)/SEGMENT_LENGTH;
  const playerY=lerp(playerSegment.p1.world.y,playerSegment.p2.world.y,playerPercent);
  let x=0,dx=-base.curve*percent,maxY=H;
  for(let n=0;n<DRAW_DISTANCE;n++){
    const s=segments[(baseIndex+n)%segments.length];s.looped=s.index<baseIndex;
    project(s.p1,playerX*ROAD_WIDTH-x,playerY+CAMERA_HEIGHT,position-(s.looped?trackLength:0));
    project(s.p2,playerX*ROAD_WIDTH-x-dx,playerY+CAMERA_HEIGHT,position-(s.looped?trackLength:0));
    x+=dx;dx+=s.curve;
  }
  for(let n=DRAW_DISTANCE-1;n>0;n--){
    const s=segments[(baseIndex+n)%segments.length],p1=s.p1.screen,p2=s.p2.screen;
    if(s.p1.camera.z<=CAMERA_DEPTH||p2.y>=p1.y)continue;
    ctx.save();drawRoad(s);
    if(n%3===0 && s.decor){decor(s,-1);if(n%2===0)decor(s,1);}
    drawRacers(s,playerSegment,playerPercent,0);
    ctx.restore();maxY=p2.y;
  }
  // Street-reflection vignette beneath the car.
  let carGlow=ctx.createRadialGradient(W/2,H*.89,8,W/2,H*.92,W*.38);carGlow.addColorStop(0,nitroActive?'#14ccfd1f':'#ff315d1e');carGlow.addColorStop(1,'#ff315d00');ctx.fillStyle=carGlow;ctx.fillRect(0,H*.5,W,H*.5);
  drawPlayer(t);ctx.restore();
}
function createDrivers(){
  drivers.length=0;
  for(let i=1;i<8;i++){
    const slot=i-1;
    drivers.push({name:carNames[i],color:palette[i],z:mod(position+1100+slot*850,trackLength),x:[-.62,.12,.66,-.2,.48,-.76,.07][slot],targetX:[-.62,.12,.66,-.2,.48,-.76,.07][slot],speed:MAX_SPEED*(.61+rnd(i*5)*.22),baseSpeed:MAX_SPEED*(.65+rnd(i*7)*.17),wobble:0,boosting:false,progress:1100+slot*850});
  }
}
function randomTraffic(){
  for(let i=0;i<18;i++){
    const pos=6000+i*trackLength/18;
    drivers.push({name:'TRAFFIC',color:['#6d83a0','#aeb2b9','#dbbc76','#6f7499'][i%4],z:mod(pos,trackLength),x:[-.72,0,.72][i%3],targetX:[-.72,0,.72][i%3],speed:MAX_SPEED*(.28+rnd(i*9)*.13),baseSpeed:MAX_SPEED*(.28+rnd(i*9)*.13),wobble:0,boosting:false,traffic:true,progress:pos});
  }
}
function reset(){
  raceTime=0;lapStart=0;bestLap=Infinity;lapsDone=0;countdown=3.8;playedCountdown.clear();speed=0;nitro=100;playerX=0;position=0;raceStart=0;steerVisual=0;driftScore=0;drifting=false;nitroActive=false;collisionCooldown=0;shake=0;toastTimer=0;
  Object.keys(keys).forEach(k=>keys[k]=false);createDrivers();randomTraffic();updateHud();
}
function setState(next){
  state=next;$ui.menu.classList.toggle('hidden',next!=='menu');$ui.hud.classList.toggle('hidden',next==='menu');$ui.pauseScreen.classList.toggle('hidden',next!=='paused');$ui.resultsScreen.classList.toggle('hidden',next!=='results');$ui.pauseBtn.classList.toggle('hidden',next==='menu'||next==='results');
  $ui.mobileControls.classList.toggle('hidden',!(['racing','countdown'].includes(next)&&mobilePointer));
  $ui.countdown.classList.toggle('hidden',next!=='countdown');
  if(next==='paused'||next==='results'||next==='menu')muteEngine();
}
function start(){reset();setState('countdown');unlockAudio();}
function pause(){if(state==='racing'||state==='countdown')setState('paused');else if(state==='paused')setState(countdown>0?'countdown':'racing');}
function home(){reset();setState('menu');}
function finish(){setState('results');let place=rank();$ui.resultEyebrow.textContent=place===1?'CITY CHAMPION':'RACE COMPLETE';$ui.resultTitle.innerHTML=place===1?'STREET<span> KING.</span>':'RACE<span> OVER.</span>';$ui.resultPlace.textContent=['','1ST','2ND','3RD'][place]||`${place}TH`;$ui.resultTime.textContent=fmt(raceTime);$ui.resultLap.textContent=isFinite(bestLap)?fmt(bestLap):'--:--.--';}
function rank(){let playerProgress=lapsDone*trackLength+position;return 1+drivers.filter(d=>!d.traffic&&d.progress>playerProgress).length;}
function showToast(text){$ui.toast.textContent=text;$ui.toast.classList.add('visible');toastTimer=1.7;}
function updateHud(){
  $ui.positionVal.textContent=pad(rank());$ui.lapVal.textContent=Math.min(TOTAL_LAPS,lapsDone+1);
  $ui.speedVal.textContent=Math.round(speed/MAX_SPEED*305);$ui.gearVal.textContent=Math.min(6,Math.max(1,Math.ceil(speed/MAX_SPEED*6)));
  $ui.nitroVal.textContent=Math.floor(nitro)+'%';$ui.nitroFill.style.width=nitro+'%';$ui.timeVal.textContent=fmt(raceTime);
  $ui.bestLapVal.textContent=isFinite(bestLap)?fmt(bestLap):'--:--.--';$ui.trackProgress.style.width=(position/trackLength*100)+'%';
  $ui.driftNotice.classList.toggle('visible',drifting&&speed>3500);$ui.driftNotice.textContent=`DRIFT  +${Math.floor(driftScore)}`;
}
function update(dt,t){
  if(state==='menu'||state==='results'||state==='paused'){if(state==='menu'){position=mod(position+dt*3200,trackLength);playerX=Math.sin(t*.2)*.13;steerVisual=Math.sin(t*.3)*.3;}return;}
  if(state==='countdown'){
    countdown-=dt;let num=Math.ceil(countdown);
    if(num>0){$ui.countdown.textContent=num;if(!playedCountdown.has(num)){playedCountdown.add(num);beep(520+num*60,.08,'sine',.06);}}
    if(countdown<=0){countdown=0;setState('racing');showToast('GO! GO! GO!');beep(820,.3,'sawtooth',.055);}
    updateHud();return;
  }
  raceTime+=dt;collisionCooldown=Math.max(0,collisionCooldown-dt);toastTimer-=dt;if(toastTimer<=0)$ui.toast.classList.remove('visible');shake=Math.max(0,shake-dt*3);
  const segment=findSegment(position), speedRatio=speed/MAX_SPEED;
  const isGas=keys.gas||(!mobilePointer&&!keys.brake); // Keyboard players auto-accelerate by default; touch players use GO.
  nitroActive=keys.nitro&&nitro>0&&speed>2200;
  const max=MAX_SPEED*(nitroActive?1.34:1);
  if(isGas)speed+=ACCEL*dt;else speed-=DECEL*dt;
  if(keys.brake)speed-=BRAKE*dt;
  if(nitroActive){speed+=ACCEL*.95*dt;nitro-=dt*22; if(Math.random()>.5)particles.push({x:W*(.47+Math.random()*.06),y:H*.95,life:.3});}
  else nitro=clamp(nitro+dt*(drifting?7:3.3),0,100);
  speed=clamp(speed,0,max);
  drifting=keys.drift&&speed>MAX_SPEED*.20;
  let steer=(keys.right?1:0)-(keys.left?1:0);
  let steeringPower=drifting?2.05:1.52;
  playerX+=steer*dt*steeringPower*(.38+speedRatio*.90);
  playerX-=dt*speedRatio*segment.curve*CENTRIFUGAL*(drifting?.68:1.1);
  steerVisual=lerp(steerVisual,steer,clamp(dt*7,0,1));
  if(drifting&&Math.abs(steer)){speed-=dt*450;driftScore+=dt*speedRatio*175;}
  else if(driftScore>30){if(driftScore>120)showToast(`CLEAN DRIFT  +${Math.round(driftScore)}`);nitro=clamp(nitro+Math.min(20,driftScore/35),0,100);driftScore=0;}
  else driftScore=0;
  if(Math.abs(playerX)>1){speed-=dt*speed*(Math.abs(playerX)>1.35?1.9:.7);if(Math.abs(playerX)>1.12)shake=Math.max(shake,.13);}
  playerX=clamp(playerX,-2.0,2.0);
  let old=position;position=mod(position+speed*dt,trackLength);
  if(position<old && speed>0){lapsDone++;let thisLap=raceTime-lapStart;lapStart=raceTime;bestLap=Math.min(bestLap,thisLap);if(lapsDone>=TOTAL_LAPS){finish();return;}showToast(`LAP ${lapsDone+1} / ${TOTAL_LAPS}`);beep(980,.18,'triangle',.09);}
  drivers.forEach((d,i)=>{
    let cs=findSegment(d.z);d.targetX+=Math.sin(raceTime*.26+i*5)*dt*.065;
    if(Math.abs(d.targetX)>.86)d.targetX=clamp(d.targetX,-.78,.78);
    d.x=lerp(d.x,d.targetX,dt*.55);d.wobble=Math.sin(raceTime*2+i);
    d.speed=d.baseSpeed*(1+Math.sin(raceTime*.31+i)*.06);
    let prev=d.z;d.z=mod(d.z+d.speed*dt,trackLength);d.progress+=d.speed*dt;
    let gap=mod(d.z-position,trackLength);
    if(gap<235&&gap>0&&Math.abs(playerX-d.x)<.33&&collisionCooldown<=0&&speed>1000){
      collisionCooldown=1.15;speed*=.43;shake=3;playerX+=playerX>d.x?.18:-.18;beep(80,.3,'sawtooth',.11);showToast('TRAFFIC COLLISION');
    }
  });
  updateEngine();updateHud();
}
function render(t){
  ctx.clearRect(0,0,W,H);drawWorld(t);
  if(state==='menu'){
    ctx.save();const gradient=ctx.createLinearGradient(0,H*.65,0,H);gradient.addColorStop(0,'#ff1d4e00');gradient.addColorStop(1,'#ff1d4e0c');ctx.fillStyle=gradient;ctx.fillRect(0,H*.65,W,H*.35);ctx.restore();
  }
  if(shake>1){ctx.fillStyle=`rgba(255,255,255,${Math.min(.16,shake*.04)})`;ctx.fillRect(0,0,W,H);}
}
function frame(now){const t=now/1000;const dt=clamp(lastTime?(now-lastTime)/1000:0,0,.05);lastTime=now;update(dt,t);render(t);requestAnimationFrame(frame);}
function resize(){DPR=Math.min(2,window.devicePixelRatio||1);W=window.innerWidth;H=window.innerHeight;canvas.width=Math.round(W*DPR);canvas.height=Math.round(H*DPR);ctx.setTransform(DPR,0,0,DPR,0,0);}
function keyName(e){switch(e.code){case'ArrowLeft':case'KeyA':return'left';case'ArrowRight':case'KeyD':return'right';case'ArrowUp':case'KeyW':return'gas';case'ArrowDown':case'KeyS':return'brake';case'ShiftLeft':case'ShiftRight':return'nitro';case'Space':return'drift';default:return null;}}
document.addEventListener('keydown',e=>{if(e.code==='Escape'||e.code==='KeyP'){if(!e.repeat)pause();e.preventDefault();return;}if(e.code==='Enter'&&state==='menu'){start();return;}const key=keyName(e);if(key){keys[key]=true;e.preventDefault();}});
document.addEventListener('keyup',e=>{const key=keyName(e);if(key){keys[key]=false;e.preventDefault();}});
window.addEventListener('blur',()=>{Object.keys(keys).forEach(k=>keys[k]=false);if(state==='racing'||state==='countdown')pause();});
window.addEventListener('resize',resize);
for(const button of document.querySelectorAll('[data-key]')){
  const key=button.dataset.key;
  button.addEventListener('pointerdown',e=>{e.preventDefault();button.setPointerCapture(e.pointerId);keys[key]=true;button.classList.add('pressed');unlockAudio();});
  const off=e=>{e.preventDefault();keys[key]=false;button.classList.remove('pressed');};button.addEventListener('pointerup',off);button.addEventListener('pointercancel',off);button.addEventListener('lostpointercapture',()=>{keys[key]=false;button.classList.remove('pressed');});
}
$('startBtn').addEventListener('click',start);$('pauseBtn').addEventListener('click',pause);$('resumeBtn').addEventListener('click',pause);$('restartPauseBtn').addEventListener('click',start);$('restartBtn').addEventListener('click',start);$('homeBtn').addEventListener('click',home);$('homePauseBtn').addEventListener('click',home);
$('soundBtn').addEventListener('click',()=>{audioMuted=!audioMuted;$ui.soundBtn.classList.toggle('muted',audioMuted);if(audioMuted)muteEngine();else unlockAudio();});
function unlockAudio(){if(audioMuted)return;try{if(!audioContext)audioContext=new (window.AudioContext||window.webkitAudioContext)();audioContext.resume();if(!engineOsc){engineOsc=audioContext.createOscillator();engineGain=audioContext.createGain();engineOsc.type='sawtooth';engineOsc.frequency.value=55;engineGain.gain.value=0;const filter=audioContext.createBiquadFilter();filter.type='lowpass';filter.frequency.value=220;engineOsc.connect(filter);filter.connect(engineGain);engineGain.connect(audioContext.destination);engineOsc.start();}}catch(e){}}
function updateEngine(){if(!engineGain||!audioContext||audioMuted)return;engineOsc.frequency.setTargetAtTime(44+speed/MAX_SPEED*95,audioContext.currentTime,.09);engineGain.gain.setTargetAtTime(state==='racing'?.014+speed/MAX_SPEED*.025:0,audioContext.currentTime,.06);}
function muteEngine(){if(engineGain&&audioContext)engineGain.gain.setTargetAtTime(0,audioContext.currentTime,.04);}
function beep(hz,duration,type='sine',volume=.07){if(audioMuted||!audioContext)return;try{const o=audioContext.createOscillator(),g=audioContext.createGain();o.type=type;o.frequency.setValueAtTime(hz,audioContext.currentTime);g.gain.setValueAtTime(volume,audioContext.currentTime);g.gain.exponentialRampToValueAtTime(.0001,audioContext.currentTime+duration);o.connect(g);g.connect(audioContext.destination);o.start();o.stop(audioContext.currentTime+duration);}catch(e){}}

mobilePointer=matchMedia('(pointer:coarse)').matches || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
buildRoad();reset();position=trackLength*.56;resize();setState('menu');requestAnimationFrame(frame);
setTimeout(()=>$('loading').classList.add('off'),180);
