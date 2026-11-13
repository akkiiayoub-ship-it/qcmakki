/* Accompagnateur vocal — Web Speech API (synthèse vocale du navigateur), sans serveur ni clé. */
(function(){
'use strict';
var top_=(window.parent===window);
/* Dans un iframe du même site : on réutilise l'accompagnateur de la page parente (une seule voix, un seul panneau). */
if(!top_){try{if(window.parent.Coach){window.Coach=window.parent.Coach;return}}catch(e){}}
var synth=window.speechSynthesis,SUP=!!(synth&&window.SpeechSynthesisUtterance);
var KEY='coach-v1';
var D={on:false,rate:1,voice:'',voiceAr:'',lang:'fr',q:true,opts:true,fb:true,nav:true,hover:true};
var ST=Object.assign({},D);
try{ST=Object.assign(ST,JSON.parse(localStorage.getItem(KEY)||'{}'))}catch(e){}
var persist=function(){try{localStorage.setItem(KEY,JSON.stringify(ST))}catch(e){}};
var tok=0,last=null,busy=0,voices=[];
var rnd=function(a){return a[Math.floor(Math.random()*a.length)]};

/* ---------- nettoyage du texte pour la voix ---------- */
var ACR={APC:'A P C',PPO:'P P O',ZPD:'Z P D',QCM:'Q C M',OFPPT:'O F P P T',CMC:'C M C',FAD:'F A D',AAV:'A A V',GPEEC:'G P E E C',TP:'T P',GNSS:'G N S S',RTK:'R T K',BIM:'B I M',LLL:'L L L'};
function clean(t){
  t=String(t==null?'':t);
  t=t.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}‍]/gu,' ');
  t=t.replace(/N°\s*/g,'numéro ').replace(/[✓✗★↻↗]/g,' ').replace(/→/g,' puis ').replace(/←/g,' ').replace(/•/g,'. ').replace(/·/g,', ').replace(/[«»"]/g,' ').replace(/\s\/\s/g,', ').replace(/%/g,' pour cent').replace(/&/g,' et ');
  t=t.replace(/\b([A-ZÉ]{2,6})\b/g,function(m){return ACR[m]||m});
  t=t.replace(/\s*\n+\s*/g,'. ').replace(/\s{2,}/g,' ').replace(/\.\s*\./g,'.');
  return t.trim();
}
function cleanAr(t){
  t=String(t==null?'':t);
  t=t.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}‍]/gu,' ');
  t=t.replace(/[✓✗★↻↗]/g,' ').replace(/[←→]/g,' ').replace(/•/g,'. ').replace(/%/g,' بالمئة').replace(/[«»"]/g,' ').replace(/\s*\n+\s*/g,'. ').replace(/\s{2,}/g,' ');
  return t.trim();
}
function norm(x){
  var out=[];
  (function add(v){
    if(v==null||v==='')return;
    if(Array.isArray(v))return v.forEach(add);
    if(typeof v==='string')return out.push({l:'fr',t:v});
    if(v.t)out.push(v);
  })(x);
  var m=[];out.forEach(function(s){var p=m[m.length-1];if(p&&p.l===s.l)p.t+=(/[.!?:;؟،؛]\s*$/.test(p.t)?' ':'. ')+s.t;else m.push({l:s.l,t:s.t})});
  return m;
}
function chunks(t){
  var parts=t.replace(/([.!?;:…؟؛،])\s+/g,'$1\u0001').split('\u0001'),out=[],cur='';
  parts.forEach(function(p){if((cur+' '+p).length>190&&cur){out.push(cur);cur=p}else cur=cur?cur+' '+p:p});
  if(cur)out.push(cur);return out;
}

/* ---------- voix ---------- */
var allV=[];
function loadVoices(){if(!SUP)return;allV=synth.getVoices();voices=allV.filter(function(v){return /^fr/i.test(v.lang)});fillSel()}
function arVoices(){return allV.filter(function(v){return /^ar/i.test(v.lang)})}
function pickAr(){
  var av=arVoices();if(!av.length)return null;
  if(ST.voiceAr){var f=av.filter(function(v){return v.name===ST.voiceAr})[0];if(f)return f}
  var order=ST.lang==='dar'?[/^ar[-_]MA/i,/^ar[-_](DZ|TN|EG)/i,/^ar[-_]SA/i]:[/^ar[-_]SA/i,/^ar[-_]EG/i,/^ar[-_]MA/i];
  for(var i=0;i<order.length;i++){var m=av.filter(function(v){return order[i].test(v.lang)&&/natural|neural|online|google/i.test(v.name)})[0]||av.filter(function(v){return order[i].test(v.lang)})[0];if(m)return m}
  return av[0];
}
function pick(){
  if(ST.voice){var f=voices.filter(function(v){return v.name===ST.voice})[0];if(f)return f}
  var pref=[/google.*fran/i,/natural|neural|online/i,/denise|hortense|henri|thomas|amelie|audrey|julie/i];
  for(var i=0;i<pref.length;i++){var m=voices.filter(function(v){return pref[i].test(v.name)&&/fr-FR/i.test(v.lang)})[0];if(m)return m}
  return voices.filter(function(v){return /fr-FR/i.test(v.lang)})[0]||voices[0]||null;
}
if(SUP){loadVoices();synth.onvoiceschanged=loadVoices}

/* ---------- parole ---------- */
function say(text,o){
  o=o||{};
  var segs=norm(text).map(function(g){return {l:g.l,t:g.l==='fr'?clean(g.t):cleanAr(g.t)}}).filter(function(g){return g.t});
  if(!SUP||!segs.length)return;
  if(!ST.on&&!o.force)return;
  if(!o.queue){tok++;synth.cancel();busy=0;ui()}
  last=segs;var my=tok,vf=pick(),va=pickAr();
  var go=function(){
    if(my!==tok)return;
    segs.forEach(function(g){
      chunks(g.t).forEach(function(c){
        var u=new SpeechSynthesisUtterance(c);u.rate=ST.rate;u.pitch=1;
        if(g.l==='fr'){u.lang='fr-FR';if(vf)u.voice=vf}
        else{u.lang=va?va.lang:(ST.lang==='dar'?'ar-MA':'ar-SA');if(va)u.voice=va}
        u.onstart=function(){busy++;ui()};u.onend=u.onerror=function(){busy=Math.max(0,busy-1);ui()};
        synth.speak(u);
      });
    });
  };
  setTimeout(go,o.queue?75:60);
}
function stop(){tok++;if(SUP)synth.cancel();busy=0;ui()}
function repeat(){if(last){say(last,{force:true})}}

/* ---------- phrases localisées (fr / ar = arabe standard / dar = darija marocaine) ---------- */
var T={
fr:{ok:['Bonne réponse !','Exact !','C’est ça, bravo !','Très bien, c’est correct.'],ko:['Ce n’est pas la bonne réponse.','Attention, c’est un piège classique.','Presque, mais non.','Pas tout à fait.'],
 streak:function(n){return ' Série de '+n+', continue comme ça.'},principle:'Retiens ce principe : ',p1:' Plus un point.',m1:' Moins un point.',sk:'Tu passes cette question : zéro point. ',can:function(sc,tot,pass,ok,ko,sk){return 'Note canadienne : '+sc+' sur '+tot+', avec '+ok+' juste'+(ok>1?'s':'')+', '+ko+' fausse'+(ko>1?'s':'')+' et '+sk+' sans réponse. '+(pass?'Résultat final : tu as réussi !':'Résultat final : tu as été raté.')},chose:'Tu as choisi : ',whyNot:' Ce choix ne convient pas, voici pourquoi : ',whyYes:' C’est correct, voici pourquoi : ',anc:' À ancrer dans ta mémoire : ',youAns:'Tu as répondu : ',correctIs:'La bonne réponse est : ',why:'Pourquoi ? ',check:' Attention, cette réponse est à vérifier avec ton cours.',
 qn:function(n,t){return 'Question '+n+' sur '+t+'. '},theme:'Thème : ',resp:'Réponse',expl:' Explication : ',auth:' Auteurs à retenir : ',
 sum:function(ok,tot,pct){return 'Bilan : '+ok+' bonne'+(ok>1?'s':'')+' réponse'+(ok>1?'s':'')+' sur '+tot+', soit '+pct+' pour cent. '},left:function(w){return ' Il te reste '+w+' point'+(w>1?'s':'')+' à revoir. Je peux te relire les corrections.'},
 card:'Carte : ',ans:'Réponse : ',pct:' de réussite, ',
 on:'Accompagnateur activé. Je t’explique chaque réponse, chaque principe et chaque section. Pose-moi une question en répondant, je te dis pourquoi.',
 test:'Bonjour ! Je suis ton accompagnateur. Je t’explique chaque bonne ou mauvaise réponse, et chaque principe à retenir. Courant, approche, méthode : ne confonds plus jamais.'},
ar:{ok:['إجابة صحيحة!','أحسنت!','هذا هو الصواب، برافو!','ممتاز، إجابتك صحيحة.'],ko:['هذه ليست الإجابة الصحيحة.','انتبه، هذا فخ شائع.','اقتربت، لكن لا.','ليس تمامًا.'],
 streak:function(n){return ' سلسلة من '+n+' إجابات صحيحة، تابع هكذا.'},principle:'احفظ هذا المبدأ: ',p1:' زائد نقطة واحدة.',m1:' ناقص نقطة واحدة.',sk:'تجاوزت هذا السؤال: صفر نقطة. ',can:function(sc,tot,pass,ok,ko,sk){return 'العلامة الكندية: '+sc+' من '+tot+'، مع '+ok+' صحيحة و'+ko+' خاطئة و'+sk+' دون جواب. '+(pass?'النتيجة النهائية: لقد نجحت!':'النتيجة النهائية: لقد رسبت.')},chose:'اخترتَ: ',whyNot:' هذا الاختيار غير مناسب، والسبب: ',whyYes:' اختيارك صحيح، والسبب: ',anc:' للترسيخ في ذاكرتك: ',youAns:'أجبتَ: ',correctIs:'الإجابة الصحيحة هي: ',why:'لماذا؟ ',check:' انتبه، هذه الإجابة تحتاج إلى التأكد منها مع درسك.',
 qn:function(n,t){return 'السؤال رقم '+n+' من '+t+'. '},theme:'المحور: ',resp:'الاقتراح',expl:' الشرح: ',auth:' المؤلفون الواجب حفظهم: ',
 sum:function(ok,tot,pct){return 'الحصيلة: '+ok+' إجابات صحيحة من '+tot+'، أي '+pct+' بالمئة. '},left:function(w){return ' بقيت '+w+' نقاط للمراجعة. يمكنني أن أقرأ لك التصحيحات.'},
 card:'بطاقة: ',ans:'الجواب: ',pct:' نجاح، ',
 on:'تم تفعيل المرافق. سأشرح لك كل إجابة وكل مبدأ وكل قسم. أجب عن سؤال وسأخبرك لماذا.',
 test:'مرحبًا! أنا مرافقك الصوتي. أشرح لك كل إجابة صحيحة أو خاطئة، وكل مبدأ يجب حفظه. التيار والمقاربة والطريقة: لا تخلط بينها بعد اليوم.'},
dar:{ok:['جواب صحيح!','زوين، براڤو!','هادا هو، مزيان!','زوين، الجواب ديالك صحيح.'],ko:['هادا ماشي هو الجواب الصحيح.','حاضي، هادي فخ معروف.','قريب، ولكن لا.','ماشي بالضبط.'],
 streak:function(n){return ' سلسلة د '+n+' د الأجوبة الصحيحة، كمّل هكا.'},principle:'حفظ هاد المبدأ: ',p1:' زائد نقطة وحدة.',m1:' ناقص نقطة وحدة.',sk:'دزتي هاد السؤال: زيرو نقطة. ',can:function(sc,tot,pass,ok,ko,sk){return 'النقطة الكندية: '+sc+' من '+tot+'، فيها '+ok+' صحيحة و'+ko+' غالطة و'+sk+' بلا جواب. '+(pass?'النتيجة النهائية: نجحتي!':'النتيجة النهائية: ما نجحتيش.')},chose:'نتا ختاريتي: ',whyNot:' هاد الاختيار ماشي مناسب، والسبب: ',whyYes:' الاختيار ديالك صحيح، والسبب: ',anc:' باش يثبت ليك فالذاكرة: ',youAns:'نتا جاوبتي: ',correctIs:'الجواب الصحيح هو: ',why:'علاش؟ ',check:' حاضي، هاد الجواب خاصك تتأكد منو مع الدرس ديالك.',
 qn:function(n,t){return 'السؤال نمرة '+n+' من '+t+'. '},theme:'الموضوع: ',resp:'الاختيار',expl:' الشرح: ',auth:' المؤلفين لي خاصك تحفظ: ',
 sum:function(ok,tot,pct){return 'الحصيلة: '+ok+' د الأجوبة الصحيحة من '+tot+'، يعني '+pct+' فالمية. '},left:function(w){return ' بقاو ليك '+w+' د النقط باش تراجعهم. نقدر نقرا ليك التصحيحات.'},
 card:'بطاقة: ',ans:'الجواب: ',pct:' د النجاح، ',
 on:'تفعل المرافق. غادي نشرح ليك كل جواب وكل مبدأ وكل قسم. جاوب على شي سؤال وأنا نقول ليك علاش.',
 test:'مرحبا! أنا المرافق الصوتي ديالك. كنشرح ليك كل جواب صحيح ولا غالط، وكل مبدأ خاصك تحفظو. التيار والمقاربة والطريقة: ما تخلطش بيناتهم مرة أخرى.'}
};
var lg=function(){return ST.lang==='ar'||ST.lang==='dar'?ST.lang:'fr'};
var P=function(k){var a=Array.prototype.slice.call(arguments,1),f=T[lg()][k];if(typeof f==='function')f=f.apply(null,a);return {l:lg()==='fr'?'fr':'ar',t:f}};
var C=function(t){return {l:'fr',t:t}};
var X=function(o){/* explication : traduite si disponible, sinon française */
  if(lg()!=='fr'&&o.x&&o.x[lg()==='ar'?0:1])return {l:'ar',t:o.x[lg()==='ar'?0:1]};return C(o.expl)};
function L(fr,ar,dar){/* texte libre multilingue */
  var l=lg();if(l==='fr')return fr;var t=l==='ar'?ar:dar;return t?{l:'ar',t:t}:fr;
}
function rndP(k){var l=lg();return {l:l==='fr'?'fr':'ar',t:rnd(T[l][k])}}

function question(o){
  if(!ST.q)return;
  var s=[];
  if(o.n)s.push(P('qn',o.n,o.total));
  if(o.theme)s.push(P('theme'),C(o.theme));
  s.push(C(o.text+'.'));
  if(ST.opts&&o.options)o.options.forEach(function(x,i){s.push(lg()==='fr'?C('Réponse '+'ABCD'[i]+' : '+x+'.'):[P('resp'),C('ABCD'[i]+' : '+x+'.')])});
  say(s,{queue:!!o.queue});
}
function answer(o){
  if(!ST.fb)return;
  if(o.skip){var s0=[P('sk'),P('correctIs'),C(o.correct+'.'),P('why'),X(o)],an0=o.anch&&(lg()==='fr'?C(o.anch[0]):{l:'ar',t:o.anch[lg()==='ar'?1:2]});if(an0)s0.push(P('anc'),an0);return say(s0)}
  var s=[],an=o.anch&&(lg()==='fr'?C(o.anch[0]):{l:'ar',t:o.anch[lg()==='ar'?1:2]});
  if(o.ok){
    s.push(rndP('ok'),P('p1'));if(o.streak>=3)s.push(P('streak',o.streak));
    s.push(P('chose'),C(o.chosen+'.'),P('whyYes'),X(o));
  }else{
    s.push(rndP('ko'),P('m1'),P('chose'),C(o.chosen+'.'),P('whyNot'),X(o),P('correctIs'),C(o.correct+'.'));
  }
  if(an)s.push(P('anc'),an);
  if(o.flag==='check')s.push(P('check'));
  say(s);
}
function summary(o){
  if(!ST.fb)return;
  say([P('can',o.score,o.tot,o.pass,o.ok,o.ko,o.sk),o.wrong?P('left',o.wrong):'']);
}

/* ---------- lecture de l'écran / sélection ---------- */
function activeDoc(){
  var st=document.getElementById('stage');
  if(st&&st.classList.contains('on')){var f=document.querySelector('iframe.on');if(f){try{return f.contentDocument}catch(e){}}}
  return document;
}
function readScreen(){
  var d=activeDoc(),sel='';
  try{sel=(d.getSelection&&d.getSelection().toString())||''}catch(e){}
  if(sel.trim())return say(sel,{force:true});
  var n=d.querySelector('#app')||d.querySelector('.hub')||d.body;
  var clone=n.cloneNode(true);clone.querySelectorAll('script,style,button.sm,.grid,svg,canvas').forEach(function(x){x.remove()});
  say(clone.innerText||clone.textContent||'',{force:true});
}

/* ---------- adaptateurs pour les pages d'origine (QCM Auteurs, Flashcards) ---------- */
var tx=function(e){return e?e.textContent.replace(/\s+/g,' ').trim():''};
var deep=function(e){if(!e)return '';var out=[];Array.prototype.forEach.call(e.children,function(k){
  var chips=k.classList.contains('chips')?Array.prototype.map.call(k.children,tx).join(', '):tx(k);if(chips)out.push(chips)});return out.length?out.reduce(function(s,x){return s?(/:$/.test(s)?s+' '+x:s+'. '+x):x},''):tx(e)};
function attach(doc){
  if(!doc||!doc.body||doc.__coach)return;doc.__coach=1;
  var scan=function(node){
    if(!node||node.nodeType!==1)return;
    var q=function(s){return node.matches&&node.matches(s)?node:node.querySelector&&node.querySelector(s)};
    var fb=q('.feedback');
    if(fb&&ST.on&&ST.fb){
      var ok=fb.classList.contains('ok'),good=tx(fb.querySelector('.fb-good')).replace(/^Bonne réponse\s*:\s*/,''),ex=tx(fb.querySelector('.fb-ex')),au=Array.prototype.map.call(fb.querySelectorAll('.fb-aut .chip'),tx).join(', ');
      var sg=[rndP(ok?'ok':'ko')];if(!ok)sg.push(P('correctIs'),C(good+'.'));
      sg.push(P('expl'),C(ex));if(au)sg.push(P('auth'),C(au+'.'));
      say(sg);return;
    }
    var qt=q('.qtext');
    if(qt&&ST.on&&ST.q&&node.querySelector&&node.querySelector('.choices')){
      var cnt=tx(node.querySelector('.qcount')),th=tx(node.querySelector('.badge')),sg=[];
      if(cnt){var m=cnt.match(/(\d+)\D+(\d+)/);sg.push(m?P('qn',m[1],m[2]):C('Question '+cnt+'.'))}
      if(th)sg.push(C(th+'.'));sg.push(C(tx(qt)+'.'));
      if(ST.opts)node.querySelectorAll('.choice').forEach(function(c){sg.push(lg()==='fr'?C('Réponse '+tx(c.querySelector('.L'))+' : '+tx(c.querySelector('.T'))+'.'):[P('resp'),C(tx(c.querySelector('.L'))+' : '+tx(c.querySelector('.T'))+'.')])});
      say(sg);return;
    }
    var res=q('.res');
    if(res&&ST.on&&ST.fb){say([lg()==='fr'?C('Bilan : '+tx(res.querySelector('.ring b'))+' de réussite, '+tx(res.querySelector('.ring span'))+'. '+tx(res.querySelector('.msg'))):[P('sum',tx(res.querySelector('.ring span')).replace(/\D+/g,' ').trim().split(' ')[0]||'',tx(res.querySelector('.ring span')).replace(/\D+/g,' ').trim().split(' ')[1]||'',tx(res.querySelector('.ring b')).replace(/\D/g,'')),C(tx(res.querySelector('.msg')))]])}
    var sc=q('.scene');
    if(sc&&ST.on&&ST.q){var fr=sc.querySelector('.face.front');if(fr){var c=fr.cloneNode(true);c.querySelectorAll('.hint').forEach(function(h){h.remove()});say([P('card'),C(deep(c)+'.')])}}
  };
  var obs=new MutationObserver(function(ms){
    ms.forEach(function(m){
      if(m.type==='attributes'){
        if(m.target.id==='flip'&&m.target.getAttribute('aria-pressed')==='true'&&ST.on&&ST.fb){
          var b=doc.querySelector('.face.back');if(b){var c=b.cloneNode(true);c.querySelectorAll('.lbl').forEach(function(l){l.textContent=l.textContent+' :'});say([P('ans'),C(deep(c)+'.')])}
        }
        return;
      }
      m.addedNodes.forEach(scan);
    });
  });
  obs.observe(doc.body,{childList:true,subtree:true,attributes:true,attributeFilter:['aria-pressed']});
}

/* ---------- description au survol / focus ---------- */
function bindHover(root){
  (root||document).querySelectorAll('[data-say]').forEach(function(el){
    if(el.__h)return;el.__h=1;var t=null;
    var on=function(){if(!ST.on||!ST.hover)return;clearTimeout(t);t=setTimeout(function(){var l=lg(),tt=(l!=='fr'&&el.getAttribute('data-say-'+l));say(tt?{l:'ar',t:tt}:el.getAttribute('data-say'))},650)};
    var off=function(){clearTimeout(t)};
    el.addEventListener('pointerenter',on);el.addEventListener('focus',on);el.addEventListener('pointerleave',off);el.addEventListener('blur',off);
  });
}

/* ---------- interface (panneau + bouton) ---------- */
var host,sh,fab,panel,sel;
function ui(){if(fab)fab.classList.toggle('talk',busy>0);if(fab)fab.classList.toggle('on',ST.on)}
function fillAr(){
  var sa=sh&&sh.getElementById('voiceAr');if(!sa)return;var av=arVoices();
  sa.innerHTML='<option value="">Voix automatique (arabe)</option>'+av.map(function(v){return '<option value="'+v.name.replace(/"/g,'&quot;')+'">'+v.name+' ('+v.lang+')</option>'}).join('');sa.value=ST.voiceAr;
  var w=sh.getElementById('noar');if(w)w.hidden=!(ST.lang!=='fr'&&!av.length);
}
function fillSel(){
  fillAr();
  if(!sel)return;sel.innerHTML='<option value="">Voix automatique (français)</option>'+voices.map(function(v){return '<option value="'+v.name.replace(/"/g,'&quot;')+'">'+v.name+' ('+v.lang+')</option>'}).join('');sel.value=ST.voice;
}
function build(){
  host=document.createElement('div');host.id='coach-root';document.body.appendChild(host);
  sh=host.attachShadow({mode:'open'});
  sh.innerHTML='<style>\
:host{all:initial}*{box-sizing:border-box;font-family:Inter,system-ui,Segoe UI,Roboto,sans-serif}\
.fab{position:fixed;right:16px;bottom:16px;z-index:2147483000;width:54px;height:54px;border-radius:50%;border:0;cursor:pointer;font-size:24px;color:#fff;background:linear-gradient(135deg,#2d45b8,#3fc58a);box-shadow:0 8px 26px rgba(0,0,0,.4);transition:transform .2s}\
.fab:hover{transform:scale(1.08)}.fab.on::after{content:"";position:absolute;right:3px;top:3px;width:12px;height:12px;border-radius:50%;background:#22c55e;border:2px solid #0a1233}\
.fab.talk{animation:wave 1.1s infinite}@keyframes wave{0%{box-shadow:0 0 0 0 rgba(34,211,238,.7)}100%{box-shadow:0 0 0 22px rgba(34,211,238,0)}}\
.panel{position:fixed;right:16px;bottom:80px;z-index:2147483000;width:min(340px,calc(100vw - 32px));max-height:calc(100vh - 110px);overflow:auto;background:#111a47;color:#eef1fb;border:1px solid rgba(255,255,255,.16);border-radius:18px;padding:16px;box-shadow:0 24px 60px rgba(0,0,0,.55);animation:up .25s both}\
@keyframes up{from{opacity:0;transform:translateY(12px)}to{opacity:1}}\
h3{margin:0 0 4px;font-size:1.05rem}p{margin:0 0 12px;font-size:.82rem;color:#a9b3cc}\
.row{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:10px 0;font-size:.9rem}\
label.chk{display:flex;gap:8px;align-items:flex-start;font-size:.86rem;margin:7px 0;cursor:pointer}\
select,input[type=range]{width:100%}select{background:#0a1233;color:#eef1fb;border:1px solid rgba(255,255,255,.2);border-radius:10px;padding:8px}\
.sw{position:relative;width:48px;height:26px;flex:none}.sw input{opacity:0;width:100%;height:100%;position:absolute;margin:0;cursor:pointer;z-index:2}\
.sw i{position:absolute;inset:0;background:#3a4466;border-radius:99px;transition:.2s}.sw i::after{content:"";position:absolute;left:3px;top:3px;width:20px;height:20px;border-radius:50%;background:#fff;transition:.2s}\
.sw input:checked+i{background:linear-gradient(135deg,#2d45b8,#3fc58a)}.sw input:checked+i::after{transform:translateX(22px)}\
.btns{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}button.b{flex:1 1 auto;border:1px solid rgba(255,255,255,.22);background:rgba(255,255,255,.08);color:#fff;border-radius:10px;padding:8px 10px;cursor:pointer;font-size:.84rem}\
button.b:hover{background:rgba(255,255,255,.16)}button.b.p{background:linear-gradient(135deg,#2d45b8,#3fc58a);border:0;font-weight:600}\
.x{position:absolute;right:10px;top:8px;background:none;border:0;color:#a9b3cc;font-size:18px;cursor:pointer}\
.warn{background:#38300f;color:#f0c15a;border-radius:10px;padding:8px;font-size:.82rem}\
:focus-visible{outline:3px solid #22d3ee;outline-offset:2px}\
</style>\
<button class="fab" id="fab" aria-label="Accompagnateur vocal" title="Accompagnateur vocal">🎧</button>\
<div class="panel" id="panel" hidden role="dialog" aria-label="Accompagnateur vocal"><button class="x" id="x" aria-label="Fermer">×</button>\
<h3>🎧 Accompagnateur vocal</h3><p>Une voix t’explique chaque réponse, juste ou fausse, et chaque principe, dans tout le site.</p>'+
(SUP?'<div class="row"><b>Activer la voix</b><span class="sw"><input type="checkbox" id="on" aria-label="Activer l’accompagnateur"><i></i></span></div>\
<label>Langue de l’accompagnateur<select id="lang"><option value="fr">Français</option><option value="ar">العربية (فصحى)</option><option value="dar">الدارجة المغربية</option></select></label>\
<label>Voix française<select id="voice"></select></label>\
<label>Voix arabe / الصوت العربي<select id="voiceAr"></select></label>\
<div class="warn" id="noar" hidden>Aucune voix arabe n’a été détectée sur cet appareil : en arabe et en darija, les phrases d’accompagnement peuvent être mal lues. Installe une voix arabe (Windows : Paramètres → Heure et langue → Voix ; Android/iPhone : langue Arabe dans les réglages de synthèse vocale) ou utilise Edge/Chrome.</div>\
<div class="row" style="margin-top:2px"></div>\
<div class="row" style="margin-bottom:2px"><span>Vitesse</span><b id="rv">1.0×</b></div><input type="range" id="rate" min="0.7" max="1.4" step="0.05">\
<label class="chk"><input type="checkbox" id="q"> Lire chaque question</label>\
<label class="chk"><input type="checkbox" id="opts"> …avec ses propositions</label>\
<label class="chk"><input type="checkbox" id="fb"> Expliquer chaque réponse (juste ou fausse), fiches et bilans</label>\
<label class="chk"><input type="checkbox" id="nav"> Présenter chaque section</label>\
<label class="chk"><input type="checkbox" id="hover"> Décrire les éléments au survol ou au clavier</label>\
<div class="btns"><button class="b p" id="test">▶ Tester</button><button class="b" id="rep">⟲ Répéter</button><button class="b" id="scr">📖 Lire l’écran / la sélection</button><button class="b" id="stp">⏹ Arrêter</button></div>\
<p style="margin:10px 0 0">Raccourcis dans les QCM : <b>R</b> répéter, <b>Échap</b> arrêter. La qualité de la voix dépend de ton navigateur (Chrome, Edge et Safari proposent de bonnes voix françaises).</p>'
:'<div class="warn">Ton navigateur ne gère pas la synthèse vocale. Essaie Chrome, Edge ou Safari.</div>')+'</div>';
  fab=sh.getElementById('fab');panel=sh.getElementById('panel');sel=sh.getElementById('voice');
  fab.onclick=function(){panel.hidden=!panel.hidden};sh.getElementById('x').onclick=function(){panel.hidden=true};
  if(!SUP){ui();return}
  var $=function(i){return sh.getElementById(i)};
  fillSel();
  var lsel=$('lang');lsel.value=ST.lang;
  lsel.onchange=function(){ST.lang=lsel.value;persist();fillAr();if(ST.on||true)say({l:lg()==='fr'?'fr':'ar',t:T[lg()].on},{force:true});document.dispatchEvent(new CustomEvent('coach-lang',{detail:ST.lang}))};
  $('voiceAr').onchange=function(){ST.voiceAr=$('voiceAr').value;persist()};
  ['on','q','opts','fb','nav','hover'].forEach(function(k){
    var c=$(k);c.checked=!!ST[k];
    c.onchange=function(){ST[k]=c.checked;persist();ui();
      if(k==='on'){if(c.checked){say({l:lg()==='fr'?'fr':'ar',t:T[lg()].on},{force:true})}else stop()}};
  });
  $('rate').value=ST.rate;$('rv').textContent=ST.rate.toFixed(2)+'×';
  $('rate').oninput=function(e){ST.rate=+e.target.value;$('rv').textContent=ST.rate.toFixed(2)+'×';persist()};
  sel.onchange=function(){ST.voice=sel.value;persist()};
  $('test').onclick=function(){say({l:lg()==='fr'?'fr':'ar',t:T[lg()].test},{force:true})};
  $('rep').onclick=repeat;$('stp').onclick=stop;$('scr').onclick=readScreen;
  ui();
}
function boot(){if(document.body){build()}else document.addEventListener('DOMContentLoaded',build)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',build);else build();

/* ---------- raccourcis ---------- */
document.addEventListener('keydown',function(e){
  if(e.target&&/INPUT|SELECT|TEXTAREA/.test(e.target.tagName))return;
  if(e.key==='Escape')stop();
});

window.Coach={
  get on(){return ST.on&&SUP},supported:SUP,
  opt:function(k){return ST[k]},
  say:say,L:L,P:P,C:C,get lang(){return lg()},stop:stop,repeat:repeat,question:question,answer:answer,summary:summary,
  attach:attach,bindHover:bindHover,readScreen:readScreen,
  openPanel:function(){if(panel)panel.hidden=false},
  enable:function(){ST.on=true;persist();ui();var c=sh&&sh.getElementById('on');if(c)c.checked=true}
};
})();
