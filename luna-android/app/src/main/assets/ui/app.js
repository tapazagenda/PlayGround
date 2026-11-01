(function(){
'use strict';
const $=s=>document.querySelector(s), $$=s=>Array.from(document.querySelectorAll(s));
const N=window.LunaNative;
const hasNative=!!N;
function call(name,...args){try{if(N&&typeof N[name]==='function')return N[name](...args);}catch(e){log('error',name+': '+e.message);}return null;}
function parse(s,f){try{return JSON.parse(s);}catch(e){return f;}}
const DEFAULT_INSTRUCTIONS=`Você é Luna, uma companheira gamer de 18 anos, doce, divertida e leal.
Fala português do Brasil, com gírias leves de gamer. Chama o usuário de Tapazaki em público e Marcos em privado.
Você conversa, dá dicas de Minecraft, reage a eventos do jogo e protege o Tapazaki quando possível.
Seja natural, curta e carinhosa. Evite textões. Nunca finja ter feito algo que não fez.
No modo Gravação, seja animada e faça chamadas para o canal Tapazaki.
Quando ouvir "Luna, encerrar vídeo", faça uma despedida curta de vídeo.`;
const state={
  page:'home', settings:{name:'Tapazaki',privateName:'Marcos',rate:1,pitch:1.08,orientation:'auto',ctx:2048,threads:4,maxTokens:220,autoSpeak:true,keepAwake:true,mcAuto:true},
  instructions:DEFAULT_INSTRUCTIONS, memory:[], history:[], messages:[], modelLoaded:false, bridgeRunning:false, generating:false, listening:false, speaking:false,
  currentEl:null, currentText:'', mcPending:false, lastReply:'', mode:'Conversa'
};
function log(level,msg){const b=$('#consoleBody');const d=document.createElement('div');d.className=level;d.textContent='['+new Date().toLocaleTimeString()+'] '+msg;b.appendChild(d);b.scrollTop=b.scrollHeight;if(hasNative)call('log',level+': '+msg);}
function saveSettings(){localStorage.setItem('lunatz.settings',JSON.stringify(state.settings));call('saveSettings',JSON.stringify(state.settings));}
function saveMemory(){localStorage.setItem('lunatz.memory',JSON.stringify(state.memory));call('saveMemory',JSON.stringify(state.memory));renderMemory();}
function saveHistory(){localStorage.setItem('lunatz.history',JSON.stringify(state.history));call('saveHistory',JSON.stringify(state.history));}
function saveInstructions(){localStorage.setItem('lunatz.instructions',state.instructions);}
function loadAll(){
  state.settings=Object.assign(state.settings,parse(localStorage.getItem('lunatz.settings')||call('getSettings')||'{}',{}));
  state.memory=parse(localStorage.getItem('lunatz.memory')||call('getMemory')||'[]',[]);
  state.history=parse(localStorage.getItem('lunatz.history')||call('getHistory')||'[]',[]);
  state.instructions=localStorage.getItem('lunatz.instructions')||DEFAULT_INSTRUCTIONS;
}
function navigate(page){state.page=page;$$('.page').forEach(p=>p.classList.toggle('active',p.id==='page-'+page));$$('.nav-item').forEach(n=>n.classList.toggle('active',n.dataset.page===page));closeDrawer();if(page==='files')renderFiles();if(page==='history')renderHistory();if(page==='memory')renderMemory();if(page==='about')renderAbout();}
function openDrawer(){$('#drawer').classList.add('open');$('#drawerBackdrop').classList.add('open');}
function closeDrawer(){$('#drawer').classList.remove('open');$('#drawerBackdrop').classList.remove('open');}
function renderAbout(){const info=hasNative?parse(call('getAppInfo')||'{}',{}):{app:'LunaTz Companion (web preview)'};$('#appInfo').textContent=JSON.stringify(info,null,2);}
function renderFiles(){const files=parse(call('getFilesManifest')||localStorage.getItem('lunatz.files')||'[]',[]);const el=$('#fileList');el.innerHTML='';if(!files.length){el.innerHTML='<div class="hint">Nenhum arquivo importado ainda.</div>';return;}files.forEach(f=>{const d=document.createElement('div');d.className='file-item';d.innerHTML='<div><b>'+esc(f.name)+'</b><small>'+esc(f.kind||'')+' · '+fmtSize(f.size||0)+'</small></div><span class="ok">'+esc(f.status||'')+'</span>';el.appendChild(d);});}
function renderMemory(){const el=$('#memoryList');el.innerHTML='';state.memory.forEach((m,i)=>{const d=document.createElement('div');d.className='memory-item';d.innerHTML='<span>'+esc(m)+'</span>';const b=document.createElement('button');b.className='btn ghost';b.textContent='×';b.onclick=()=>{state.memory.splice(i,1);saveMemory();};d.appendChild(b);el.appendChild(d);});}
function renderHistory(){const el=$('#historyList');el.innerHTML='';state.history.slice().reverse().forEach(h=>{const d=document.createElement('div');d.className='history-item';d.innerHTML='<div><b>'+esc(h.role==='user'?'Você':'Luna')+'</b><small>'+esc((h.content||'').slice(0,120))+'</small></div>';el.appendChild(d);});}
function esc(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function fmtSize(n){if(n>1e9)return(n/1e9).toFixed(2)+' GB';if(n>1e6)return(n/1e6).toFixed(1)+' MB';if(n>1e3)return(n/1e3).toFixed(1)+' KB';return n+' B';}
function setPill(id,on,text){const el=$(id);el.classList.toggle('on',!!on);if(text)el.textContent=text;}
function addMsg(role,text,streaming){const el=document.createElement('div');el.className='msg '+role+(streaming?' streaming':'');el.innerHTML='<span class="who">'+(role==='user'?'Você':'Luna')+'</span><span class="body"></span>';el.querySelector('.body').textContent=text;$('#messages').appendChild(el);$('#messages').scrollTop=$('#messages').scrollHeight;return el;}
function buildMessages(userText){
  const sys=state.instructions+'\nNome público: '+state.settings.name+'. Nome privado: '+state.settings.privateName+'.\nModo atual: '+state.mode+'.'+(state.memory.length?'\nMemórias: '+state.memory.join('; '):'');
  const msgs=[{role:'system',content:sys}];
  state.messages.slice(-12).forEach(m=>msgs.push({role:m.role==='user'?'user':'assistant',content:m.content}));
  msgs.push({role:'user',content:userText});
  return msgs;
}
function sendChat(text,opts){
  text=(text||'').trim();if(!text||state.generating)return;
  opts=opts||{};
  navigate('chat');
  state.messages.push({role:'user',content:text});
  addMsg('user',text,false);
  $('#chatInput').value='';
  state.generating=true;$('#stopBtn').hidden=false;$('#sendBtn').hidden=true;
  state.currentText='';state.currentEl=addMsg('luna','',true);
  state.mcPending=!!opts.mc;
  const msgs=buildMessages(text);
  if(state.modelLoaded&&hasNative){call('chat',JSON.stringify(msgs),JSON.stringify({maxTokens:state.settings.maxTokens,temp:0.8,topP:0.9}));}
  else{fallbackStream(text);}
}
function fallbackStream(text){
  const reply=fallbackAnswer(text);
  let i=0;const timer=setInterval(()=>{if(!state.generating){clearInterval(timer);finishReply();return;}i+=2;const chunk=reply.slice(0,i);state.currentText=chunk;if(state.currentEl)state.currentEl.querySelector('.body').textContent=chunk;if(i>=reply.length){clearInterval(timer);finishReply();}},18);
}
function fallbackAnswer(t){
  t=t.toLowerCase();const n=state.settings.name;
  if(t.includes('encerrar vídeo'))return 'É isso, '+n+'! Obrigada por jogar comigo. Deixa o like, se inscreve no canal Tapazaki e até a próxima! 💜';
  if(t.includes('minecraft'))return 'Bora, '+n+'! Posso acompanhar eventos e mandar comandos pela ponte. Inicia a ponte na aba Minecraft e usa /connect no jogo. ⛏';
  if(t.includes('oi')||t.includes('olá'))return 'Oi, '+n+'! 💜 Tô aqui. Quer conversar, jogar ou configurar minha IA local?';
  if(t.includes('curiosidade'))return 'Sabia que o Minecraft já foi chamado de Cave Game? Parece outro jogo, né? 😄';
  return 'Entendi, '+n+'. Ainda estou sem o modelo GGUF carregado, então respondo em modo básico. Importa e carrega o LunaTz.gguf pra eu pensar de verdade. 💜';
}
function finishReply(){
  state.generating=false;$('#stopBtn').hidden=true;$('#sendBtn').hidden=false;
  if(state.currentEl)state.currentEl.classList.remove('streaming');
  const reply=state.currentText.trim();
  if(reply){state.messages.push({role:'assistant',content:reply});state.lastReply=reply;state.history.push({role:'user',content:state.messages.filter(m=>m.role==='user').slice(-1)[0]?.content||'',ts:Date.now()});state.history.push({role:'assistant',content:reply,ts:Date.now()});if(state.history.length>400)state.history=state.history.slice(-400);saveHistory();
    if(state.settings.autoSpeak&&state.mode!=='Silenciosa')call('speak',reply);
    if(state.mcPending&&state.bridgeRunning){call('sendCommand','say '+reply.replace(/\n/g,' ').slice(0,180));state.mcPending=false;}
  }
}
function stopGeneration(){state.generating=false;call('stopChat');finishReply();}
function speakToggle(){if(state.speaking)call('stopSpeaking');}
function renderSettings(){
  $('#setName').value=state.settings.name;$('#setPrivate').value=state.settings.privateName;$('#setRate').value=state.settings.rate;$('#setPitch').value=state.settings.pitch;$('#setOrientation').value=state.settings.orientation;$('#setCtx').value=state.settings.ctx;$('#setThreads').value=state.settings.threads;$('#setMaxTokens').value=state.settings.maxTokens;$('#setAutoSpeak').checked=state.settings.autoSpeak;$('#setKeepAwake').checked=state.settings.keepAwake;
}
function applySettings(){call('setVoice',state.settings.rate,state.settings.pitch);call('setOrientation',state.settings.orientation);call('keepScreenOn',state.settings.keepAwake);}
function mcLog(msg){const el=$('#mcLog');el.textContent+=msg+'\n';el.scrollTop=el.scrollHeight;}
function startQuiz(){const qs=[['Qual mob explode?','Creeper'],['Qual bloco é usado para fazer ferramentas de diamante?','Diamante'],['Qual dimensão tem o Ender Dragon?','End'],['Qual material faz o portal do Nether?','Obsidiana']];const q=qs[Math.floor(Math.random()*qs.length)];const box=$('#gameBox');box.hidden=false;box.innerHTML='<b>Quiz:</b> '+esc(q[0])+'<br>';['Creeper','Zumbi','Diamante','End','Obsidiana','Esqueleto'].forEach(a=>{const b=document.createElement('button');b.className='btn ghost';b.textContent=a;b.onclick=()=>{box.innerHTML+='<br><b>'+(a===q[1]?'Acertou! 💜':'Era '+q[1]+' 😅')+'</b>';};box.appendChild(b);});}
function startWord(){const words=['creeper','redstone','diamante','nether','encantamento'];const w=words[Math.floor(Math.random()*words.length)];const box=$('#gameBox');box.hidden=false;box.innerHTML='<b>Palavra secreta:</b> '+w.length+' letras. Dica: começa com "'+w[0]+'".<br>';const inp=document.createElement('input');inp.placeholder='Seu palpite';const b=document.createElement('button');b.className='btn';b.textContent='Chutar';b.onclick=()=>{box.innerHTML+='<br>'+(inp.value.toLowerCase()===w?'Acertou! 💜':'Ainda não… tenta de novo.');};box.appendChild(inp);box.appendChild(b);}
function startReaction(){const box=$('#gameBox');box.hidden=false;box.innerHTML='Espere o verde…';box.style.background='rgba(255,80,80,.2)';const t=Date.now()+1500+Math.random()*2500;const iv=setInterval(()=>{if(Date.now()>=t){clearInterval(iv);box.style.background='rgba(0,255,140,.2)';box.innerHTML='<b>AGORA!</b><br>';const start=Date.now();const b=document.createElement('button');b.className='btn';b.textContent='Clique!';b.onclick=()=>{box.innerHTML+='<br>Seu tempo: '+(Date.now()-start)+' ms';};box.appendChild(b);}},50);}
function bind(){
  $('#menuBtn').onclick=openDrawer;$('#drawerBackdrop').onclick=closeDrawer;$$('.nav-item').forEach(n=>n.onclick=()=>navigate(n.dataset.page));
  $$('[data-go]').forEach(b=>b.onclick=()=>navigate(b.dataset.go));
  $('#settingsBtn').onclick=()=>navigate('settings');$('#fullBtn').onclick=()=>{if(document.documentElement.requestFullscreen)document.documentElement.requestFullscreen();};
  $('#camBtn').onclick=()=>{state.mode='Gravação';$('#modeSelect').value='Gravação';log('info','Modo gravação ativado');};
  $$('.chip[data-quick]').forEach(b=>b.onclick=()=>sendChat(b.dataset.quick));
  $('#sendBtn').onclick=()=>sendChat($('#chatInput').value);$('#stopBtn').onclick=stopGeneration;
  $('#chatInput').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendChat(e.target.value);}});
  $('#modeSelect').onchange=e=>{state.mode=e.target.value;$('#chatMode').textContent='Modo '+state.mode.toLowerCase();};
  $('#clearChat').onclick=()=>{state.messages=[];$('#messages').innerHTML='';};
  $('#micBtn').onclick=()=>{if(state.listening)call('stopListening');else call('startListening');};
  $('#importBtn').onclick=()=>call('pickLunaFolder');
  $('#loadBtn').onclick=()=>{call('loadModel',state.settings.ctx,state.settings.threads,128);};
  $('#unloadBtn').onclick=()=>call('unloadModel');
  $('#sampleBtn').onclick=()=>call('playReferenceSample');
  $('#memoryAdd').onclick=()=>{const v=$('#memoryInput').value.trim();if(v){state.memory.push(v);$('#memoryInput').value='';saveMemory();}};
  $('#clearHistory').onclick=()=>{state.history=[];saveHistory();renderHistory();call('clearHistory');};
  $('#saveInstructions').onclick=()=>{state.instructions=$('#instructions').value;saveInstructions();log('info','Instruções salvas');};
  $('#resetInstructions').onclick=()=>{state.instructions=DEFAULT_INSTRUCTIONS;$('#instructions').value=DEFAULT_INSTRUCTIONS;saveInstructions();};
  $('#saveSettings').onclick=()=>{state.settings={...state.settings,name:$('#setName').value||'Tapazaki',privateName:$('#setPrivate').value||'Marcos',rate:+$('#setRate').value,pitch:+$('#setPitch').value,orientation:$('#setOrientation').value,ctx:+$('#setCtx').value,threads:+$('#setThreads').value,maxTokens:+$('#setMaxTokens').value,autoSpeak:$('#setAutoSpeak').checked,keepAwake:$('#setKeepAwake').checked};saveSettings();applySettings();log('info','Ajustes salvos');};
  $('#pingBtn').onclick=()=>{$('#pingResult').textContent='Pingando…';call('pingBedrock',$('#mcHost').value,+$('#mcPort').value||19132);};
  $('#bridgeBtn').onclick=()=>{if(state.bridgeRunning)call('stopBridge');else call('startBridge',+$('#bridgePort').value||8765);};
  $('#cmdBtn').onclick=()=>{const c=$('#cmdInput').value.trim();if(c){call('sendCommand',c);mcLog('> '+c);$('#cmdInput').value='';}};
  $('#launchMc').onclick=()=>call('launchMinecraft');
  $('#quizBtn').onclick=startQuiz;$('#wordBtn').onclick=startWord;$('#reactBtn').onclick=startReaction;
}
window.LunaNativeEvents={dispatch(event,data){
  switch(event){
    case 'onTtsReady':setPill('#pillVoice',data.ready,'voz');break;
    case 'onSpeaking':state.speaking=data.speaking;$('#lunaImg').style.filter=data.speaking?'drop-shadow(0 0 28px rgba(255,79,216,.6))':'';break;
    case 'onListening':state.listening=data.listening;$('#micBtn').classList.toggle('listening',data.listening);break;
    case 'onSpeechResult':if(data.text)sendChat(data.text);break;
    case 'onSpeechPartial':$('#chatInput').value=data.text;break;
    case 'onSpeechError':log('warn',data.error);break;
    case 'onAudioPermission':log('info','Microfone: '+(data.granted?'ok':'negado'));break;
    case 'onModelLoading':log('info','Carregando modelo…');$('#stageStatus').textContent='Carregando IA…';break;
    case 'onModelLoaded':state.modelLoaded=true;setPill('#pillModel',true,'IA local');$('#stageStatus').textContent='Luna online · IA local';log('info','Modelo carregado');break;
    case 'onModelError':log('error',data.error);$('#stageStatus').textContent='IA não carregada';break;
    case 'onModelUnloaded':state.modelLoaded=false;setPill('#pillModel',false,'IA local');break;
    case 'onToken':state.currentText+=data.token;if(state.currentEl)state.currentEl.querySelector('.body').textContent=state.currentText;$('#messages').scrollTop=$('#messages').scrollHeight;break;
    case 'onChatDone':log('info','Resposta: '+data.tokens+' tokens em '+data.millis+' ms');finishReply();break;
    case 'onChatError':log('error',data.error);finishReply();break;
    case 'onFolderPicked':if(data.ok){localStorage.setItem('lunatz.files',JSON.stringify(data.files));renderFiles();log('info','Pasta importada: '+data.files.length+' arquivos');}else log('error',data.error);break;
    case 'onImportProgress':$('#importProgress').hidden=false;$('#importProgress').firstElementChild.style.width=data.percent+'%';break;
    case 'onBedrockPing':$('#pingResult').textContent=data.ok?('OK · '+data.latencyMs+' ms\n'+data.motd):('Falha: '+data.error);break;
    case 'onBridgeStatus':state.bridgeRunning=data.running;setPill('#pillBridge',data.running,'Minecraft');$('#bridgeBtn').textContent=data.running?'Parar':'Iniciar';$('#bridgeResult').textContent=data.running?('Ativa na porta '+(data.port||8765)+'\nIPs: '+(data.ips||[]).join(', ')):(data.error||'Parada');break;
    case 'onMinecraftEvent':{
      const e=data.event;let line='['+e+']';
      if(data.properties){const p=data.properties;const msg=p.message||p.playerName||p.blockName||'';line+=' '+(p.sender?p.sender+': ':'')+msg;}
      else if(data.raw)line+=' '+data.raw.slice(0,160);
      mcLog(line);
      if(e==='PlayerMessage'&&state.settings.mcAuto&&data.properties&&data.properties.message&&/luna/i.test(data.properties.message)){sendChat(data.properties.message,{mc:true});}
      break;}
    case 'onCommandResult':if(!data.ok)mcLog('Erro: '+data.error);break;
    case 'onSample':log('info',data.ok?(data.playing?'Tocando amostra':'Amostra concluída'):data.error);break;
    case 'onLog':log(data.level||'info',data.message);break;
  }
}};
window.LunaUI={back(){if($('#drawer').classList.contains('open')){closeDrawer();return true;}if(state.page!=='home'){navigate('home');return true;}return false;}};
function init(){
  loadAll();renderSettings();applySettings();$('#instructions').value=state.instructions;bind();renderFiles();renderAbout();
  addMsg('luna','Oi, '+state.settings.name+'! 💜 Sou a Luna. Carregue meu GGUF na aba Arquivos para conversa completa, ou conecte a ponte Minecraft.',false);
  if(hasNative){const ms=parse(call('getModelStatus')||'{}',{});if(ms.loaded){state.modelLoaded=true;setPill('#pillModel',true,'IA local');}const bs=parse(call('getBridgeStatus')||'{}',{});if(bs.running){state.bridgeRunning=true;setPill('#pillBridge',true,'Minecraft');}}
  log('info','LunaTz Companion iniciado');
}
init();
})();
