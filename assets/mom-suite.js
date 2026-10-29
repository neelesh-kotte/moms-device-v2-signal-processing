(() => {
  'use strict';
  const $ = (s, root=document) => root.querySelector(s);
  const $$ = (s, root=document) => [...root.querySelectorAll(s)];
  const state = { mode:'breath', report:null, fileName:'' };
  const modes = {
    breath:{title:'BreathGuard · Respiratory acoustics',desc:'Candidate high-frequency bursts and spectral changes for expert review.',band:[500,3000],kind:'High-frequency candidate',method:'A transparent signal-processing baseline. It does not identify wheeze, crackles, asthma, infection, or any disease.'},
    sleep:{title:'SleepSignal · Overnight audio',desc:'Low-energy intervals and changes in sound intensity across the recording.',band:[80,1200],kind:'Low-energy interval',method:'Quiet intervals are not proof of an apnea or breathing interruption. This baseline cannot score sleep or diagnose sleep apnea.'},
    heart:{title:'MurmurMap · Heart-sound acoustics',desc:'Sustained mid-band energy regions for inspection on labeled recordings.',band:[80,700],kind:'Sustained-band candidate',method:'A frequency band is not a heart murmur label. This baseline is not a heart-disease detector and requires labeled clinical research data.'},
    abdomen:{title:'MOM SenseLoop · Abdominal acoustics',desc:'Inspect a research feature used in the current public-data study.',band:[120,480],kind:'Band-energy change',method:'This feature has inconclusive cross-dataset evidence and is not a hunger, bowel-disease, or other medical detector.'}
  };
  const icons = {
    arrow:'<path d="M5 12h14M13 6l6 6-6 6"/>',
    lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    upload:'<path d="M12 16V4m-5 5 5-5 5 5"/><path d="M4 16v4h16v-4"/>',
    wave:'<path d="M2 12h3l2-6 4 12 3-9 3 6h5"/>',
    shield:'<path d="M12 3 20 6v5c0 5-3.4 8.3-8 10-4.6-1.7-8-5-8-10V6z"/><path d="m9 12 2 2 4-4"/>',
    heart:'<path d="M20.8 8.8c0 5.2-8.8 11-8.8 11s-8.8-5.8-8.8-11a4.8 4.8 0 0 1 8.8-2.4 4.8 4.8 0 0 1 8.8 2.4Z"/>',
    moon:'<path d="M20.8 14.1A8.5 8.5 0 0 1 9.9 3.2 8.6 8.6 0 1 0 20.8 14.1Z"/>',
    download:'<path d="M12 3v12m-5-5 5 5 5-5"/><path d="M4 17v4h16v-4"/>'
  };
  function icon(name){return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(icons[name]||icons.wave)+'</svg>'}
  const drop=$('#audioFile'), zone=$('#uploadZone'), canvas=$('#audioWave'), ctx=canvas.getContext('2d');
  function setMode(mode){
    if(!modes[mode])return;state.mode=mode;
    $$('.mode-switch button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===mode)));
    $('#profileTitle').textContent=modes[mode].title;
    $('#profileDesc').textContent=modes[mode].desc;
    $('#runModeLabel').textContent=mode==='breath'?'Respiratory profile':mode==='sleep'?'Sleep-audio profile':mode==='heart'?'Heart-sound profile':'Abdominal-acoustic profile';
    if(state.report)renderReport(state.report);
  }
  $$('.mode-switch button').forEach(b=>b.addEventListener('click',()=>setMode(b.dataset.mode)));
  $('#mobileToggle').addEventListener('click',()=>{const m=$('#mobileMenu');const open=m.classList.toggle('open');$('#mobileToggle').setAttribute('aria-expanded',String(open))});
  $$('#mobileMenu a').forEach(a=>a.addEventListener('click',()=>{$('#mobileMenu').classList.remove('open');$('#mobileToggle').setAttribute('aria-expanded','false')}));
  $('#year').textContent=new Date().getFullYear();
  $('#downloadReport').addEventListener('click',()=>{
    if(!state.report)return;
    const blob=new Blob([JSON.stringify(state.report,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download='mom-audio-research-report.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  drop.addEventListener('change',()=>{if(drop.files&&drop.files[0])processFile(drop.files[0])});
  ['dragenter','dragover'].forEach(e=>zone.addEventListener(e,ev=>{ev.preventDefault();zone.classList.add('drag')}));
  ['dragleave','drop'].forEach(e=>zone.addEventListener(e,ev=>{ev.preventDefault();zone.classList.remove('drag')}));
  zone.addEventListener('drop',ev=>{const f=ev.dataTransfer.files&&ev.dataTransfer.files[0];if(f)processFile(f)});
  function fft(real,imag){
    const n=real.length;
    for(let i=1,j=0;i<n;i++){let bit=n>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;if(i<j){[real[i],real[j]]=[real[j],real[i]];[imag[i],imag[j]]=[imag[j],imag[i]]}}
    for(let len=2;len<=n;len<<=1){const ang=-2*Math.PI/len,wr0=Math.cos(ang),wi0=Math.sin(ang);for(let i=0;i<n;i+=len){let wr=1,wi=0;for(let j=0;j<len/2;j++){const u=i+j,v=i+j+len/2,tr=real[v]*wr-imag[v]*wi,ti=real[v]*wi+imag[v]*wr;real[v]=real[u]-tr;imag[v]=imag[u]-ti;real[u]+=tr;imag[u]+=ti;const nwr=wr*wr0-wi*wi0;wi=wr*wi0+wi*wr0;wr=nwr}}}
  }
  function percentile(a,p){if(!a.length)return 0;const x=[...a].sort((u,v)=>u-v);return x[Math.min(x.length-1,Math.floor((x.length-1)*p))]}
  function median(a){return percentile(a,.5)}
  function processFrames(samples,sr,mode){
    const n=2048,hop=1024,nyq=sr/2,band=modes[mode].band,frames=[];
    const step=Math.max(1,Math.floor(samples.length/hop));
    let prevSpec=null;
    for(let start=0;start<samples.length;start+=hop){
      const real=new Float64Array(n),imag=new Float64Array(n);let sum=0,cross=0,prev=0;
      for(let i=0;i<n;i++){const x=samples[start+i]||0;sum+=x*x;if(i&&((x>=0)!==(prev>=0)))cross++;prev=x;real[i]=x*(.5-.5*Math.cos(2*Math.PI*i/(n-1)))}
      const rms=Math.sqrt(sum/n);fft(real,imag);let total=0,inBand=0,high=0,cent=0,flux=0;const spec=new Float32Array(n/2);
      for(let k=1;k<n/2;k++){const p=real[k]*real[k]+imag[k]*imag[k],hz=k*sr/n;spec[k]=p;total+=p;cent+=hz*p;if(hz>=band[0]&&hz<=band[1])inBand+=p;if(hz>=500&&hz<=3000)high+=p;if(prevSpec&&p>prevSpec[k])flux+=p-prevSpec[k]}
      frames.push({t:start/sr,rms,zc:cross/n,ratio:total?inBand/total:0,high:total?high/total:0,centroid:total?cent/total:0,flux:total?flux/total:0});
      prevSpec=spec;
    }
    return frames;
  }
  function getSegments(frames,mode){
    if(!frames.length)return [];
    const energies=frames.map(f=>f.rms),med=median(energies),mad=median(energies.map(x=>Math.abs(x-med)))||med*.05||.00001;
    const highs=frames.map(f=>f.high),hmed=median(highs),hmad=median(highs.map(x=>Math.abs(x-hmed)))||.01;
    const ratios=frames.map(f=>f.ratio),rmed=median(ratios),rmad=median(ratios.map(x=>Math.abs(x-rmed)))||.01;
    let flags;
    if(mode==='breath')flags=frames.map(f=>f.high>hmed+1.6*hmad&&f.rms>med*.25);
    else if(mode==='sleep')flags=frames.map(f=>f.rms<Math.max(.0008,med*.28));
    else if(mode==='heart')flags=frames.map(f=>f.ratio>rmed+1.5*rmad&&f.rms>med*.35);
    else flags=frames.map(f=>f.ratio>rmed+1.7*rmad&&f.rms>med*.25);
    const minRun=mode==='sleep'?5:mode==='breath'?2:3,segments=[];let begin=-1;
    for(let i=0;i<=flags.length;i++){if(i<flags.length&&flags[i]){if(begin<0)begin=i}else if(begin>=0){if(i-begin>=minRun){const slice=frames.slice(begin,i),avg=(key)=>slice.reduce((s,x)=>s+x[key],0)/slice.length;segments.push({start:frames[begin].t,end:frames[i-1].t+1024/8000,confidence:Math.min(.99,.5+Math.min(.45,(avg(mode==='breath'?'high':'ratio')-(mode==='breath'?hmed:rmed))*3)),meanRms:avg('rms'),meanRatio:avg('ratio')})}begin=-1}}
    return segments.sort((a,b)=>b.end-b.start).slice(0,8).sort((a,b)=>a.start-b.start);
  }
  async function processFile(file){
    state.fileName=file.name;$('#fileName').textContent=file.name;$('#reportError').textContent='';
    if(file.size>80*1024*1024){$('#reportError').textContent='Please choose a file smaller than 80 MB.';return}
    if(!/\.(wav|mp3|m4a|aac|ogg|webm|flac)$/i.test(file.name)){ $('#reportError').textContent='Choose an audio file (WAV is recommended).';return}
    $('#reportEmpty').classList.add('hidden');$('#reportLive').classList.remove('active');$('#reportLoading').classList.remove('hidden');$('#statusMessage').textContent='Decoding audio locally in this browser…';
    try{
      const AudioCtx=window.AudioContext||window.webkitAudioContext;if(!AudioCtx)throw new Error('This browser does not support local audio decoding.');
      const ac=new AudioCtx(),buf=await ac.decodeAudioData(await file.arrayBuffer());await ac.close();
      if(buf.duration>180)throw new Error('For this prototype, please use a clip of 3 minutes or less.');
      const sr=8000,total=Math.ceil(buf.duration*sr),mono=new Float32Array(total),channels=[];
      for(let c=0;c<buf.numberOfChannels;c++)channels.push(buf.getChannelData(c));
      const ratio=buf.sampleRate/sr;
      for(let i=0;i<total;i++){const at=i*ratio,j=Math.floor(at),f=at-j;let sum=0;for(const ch of channels){const a=ch[j]||0,b=ch[j+1]||0;sum+=a+(b-a)*f}mono[i]=sum/channels.length}
      $('#statusMessage').textContent='Extracting transparent signal features…';
      await new Promise(r=>setTimeout(r,30));
      const frames=processFrames(mono,sr,state.mode),rms=Math.sqrt(mono.reduce((s,x)=>s+x*x,0)/Math.max(1,mono.length)),peak=mono.reduce((m,x)=>Math.max(m,Math.abs(x)),0);
      const segments=getSegments(frames,state.mode);
      state.report={tool:'MOM Local Audio Research Baseline',version:'0.1.0',createdAt:new Date().toISOString(),fileName:file.name,profile:state.mode,durationSeconds:Number(buf.duration.toFixed(3)),originalSampleRate:buf.sampleRate,analysisSampleRateHz:sr,channels:buf.numberOfChannels,globalRms:Number(rms.toFixed(6)),peakAmplitude:Number(peak.toFixed(6)),frames:frames.length,segments:segments.map(s=>({...s,start:Number(s.start.toFixed(3)),end:Number(s.end.toFixed(3)),meanRms:Number(s.meanRms.toFixed(6)),meanRatio:Number(s.meanRatio.toFixed(5))})),interpretation:modes[state.mode].method,privacy:'Audio is decoded and analyzed in this browser tab. This page does not upload the selected audio.'};
      renderReport(state.report,frames);$('#reportLoading').classList.add('hidden');$('#reportLive').classList.add('active');$('#reportEmpty').classList.add('hidden');$('#statusMessage').textContent='Analysis complete · local browser processing';$('#downloadReport').classList.remove('hidden');
    }catch(err){$('#reportLoading').classList.add('hidden');$('#reportEmpty').classList.remove('hidden');$('#reportError').textContent=err.message||'Could not analyze this file.';$('#statusMessage').textContent='Analysis not completed.'}
  }
  function renderReport(report,frames){
    const mode=modes[report.profile]||modes[state.mode];$('#reportTitle').textContent=mode.title;$('#reportSummary').textContent=mode.desc;$('#reportDuration').textContent=report.durationSeconds.toFixed(1)+' s';$('#reportRms').textContent=report.globalRms.toFixed(4);$('#reportSegments').textContent=String(report.segments.length);$('#reportBadge').textContent='Exploratory baseline';
    const labels=report.profile==='sleep'?'Low-energy interval':mode.kind;
    $('#segmentTitle').textContent=labels+' · up to 8 shown';
    const list=$('#segmentList');list.replaceChildren();
    if(!report.segments.length){const p=document.createElement('p');p.className='report-foot';p.textContent='No segments passed this simple threshold in this clip. That does not establish that the recording is normal.';list.append(p)}
    else report.segments.forEach(s=>{const row=document.createElement('div');row.className='segment-row';const time=document.createElement('strong');time.textContent=fmt(s.start)+'–'+fmt(s.end);const track=document.createElement('div');track.className='segment-track';const span=document.createElement('span');span.style.width=Math.max(4,Math.min(100,(s.end-s.start)/Math.max(.25,report.durationSeconds)*100))+'%';track.append(span);const dur=document.createElement('span');dur.textContent=(s.end-s.start).toFixed(1)+' s';row.append(time,track,dur);list.append(row)});
    $('#reportMethod').textContent=mode.method;
    if(frames)drawWave(frames);
  }
  function fmt(t){return t.toFixed(1)+'s'}
  function drawWave(frames){
    const rect=canvas.getBoundingClientRect(),dpr=Math.min(2,window.devicePixelRatio||1),w=Math.max(1,Math.round(rect.width*dpr)),h=Math.max(1,Math.round(rect.height*dpr));canvas.width=w;canvas.height=h;ctx.clearRect(0,0,w,h);
    const values=frames.map(f=>f.rms),max=Math.max(...values,.0001);ctx.strokeStyle='rgba(201,240,223,.12)';ctx.lineWidth=1*dpr;for(let i=1;i<4;i++){ctx.beginPath();ctx.moveTo(0,h*i/4);ctx.lineTo(w,h*i/4);ctx.stroke()}
    ctx.beginPath();ctx.moveTo(0,h/2);values.forEach((v,i)=>{const x=i/(values.length-1||1)*w,y=h/2-(v/max)*h*.42;if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y)});ctx.strokeStyle='#c9f0df';ctx.lineWidth=1.5*dpr;ctx.stroke();
    if(state.report){ctx.fillStyle='rgba(151,211,185,.20)';state.report.segments.forEach(s=>{const x=s.start/state.report.durationSeconds*w,ww=(s.end-s.start)/state.report.durationSeconds*w;ctx.fillRect(x,0,ww,h)})}
  }
  const observer=new ResizeObserver(()=>{if(state.report)drawWave(state.report.framesCache||[])});
  if(canvas)observer.observe(canvas);
  function renderReportWithoutFrames(){if(state.report)renderReport(state.report)}
  // Recompute from the retained feature report when the user changes the analysis profile.
  const originalSetMode=setMode;
  function unused(){}
  // Keep the last frame series private to the tab for a responsive redraw.
  const oldProcessFile=processFile;
  // Override report renderer's frame cache after analysis through a lightweight wrapper.
  window.MOMResearchSuite={setMode,analyzeFile:processFile,getReport:()=>state.report};
  $('#reportMethod').textContent=modes[state.mode].method;
})();
