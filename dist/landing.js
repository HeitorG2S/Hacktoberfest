(() => {
  "use strict";
  const $=s=>document.querySelector(s),$$=s=>Array.from(document.querySelectorAll(s));
  const video=$("#heroVideo"),endAction=$("#videoEndAction"),replay=$("[data-replay]"),nav=$("#mainNav"),menu=$("[data-menu]");
  const reduceMotion=window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const sample={
    months:["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"],
    income:[7200,7600,7350,7900,7750,8100,7850,8300,8150,8500,8250,8800],
    expense:[5180,5420,5310,5660,5520,5890,5730,6010,5830,6220,5980,6310],
    categories:[["Moradia",2380],["Alimentação",1210],["Transporte",540],["Saúde",390],["Assinaturas",210],["Outros",660]]
  };
  let sampleChart=null,questionMode="trend",period=6;
  const money=n=>new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL",maximumFractionDigits:0}).format(Number(n)||0);
  const human={
    trend:{question:"Como evoluíram as despesas?",answer:"A linha mostra a variação das despesas mês a mês. Selecione uma categoria ou um período para mudar a análise.",title:"Tendência mensal das despesas",mode:"line"},
    categories:{question:"Quais categorias pesam mais?",answer:"No exemplo, Moradia concentra a maior despesa, seguida por Alimentação. Os valores da sua análise dependem dos registros importados.",title:"Despesas por categoria",mode:"bar"},
    flow:{question:"Quanto entrou e saiu?",answer:"As séries comparam entradas e despesas em cada mês. No painel, os valores vêm do período que você selecionar.",title:"Entradas e despesas por mês",mode:"bar"},
    balance:{question:"Como ficou o saldo?",answer:"O saldo mensal é calculado pelas entradas menos as despesas. O gráfico ajuda a encontrar meses positivos ou negativos.",title:"Saldo mensal",mode:"line"}
  };
  function chartRows(mode){
    if(mode==="categories")return sample.categories.slice().sort((a,b)=>b[1]-a[1]);
    const start=sample.months.length-period;
    return sample.months.slice(start).map((label,i)=>({label,income:sample.income[start+i],expense:sample.expense[start+i],balance:sample.income[start+i]-sample.expense[start+i]}));
  }
  function drawSampleChart(){
    const canvas=$("#sampleChart");if(!canvas||!window.Chart)return;
    const preset=human[questionMode],rows=chartRows(questionMode),horizontal=questionMode==="categories";
    let labels,datasets;
    if(horizontal){labels=rows.map(r=>r[0]);datasets=[{label:"Despesas",data:rows.map(r=>r[1]),backgroundColor:["#187e57","#48a678","#7fbd91","#a8cc9d","#d9b276","#db9881"],borderRadius:7,barThickness:18}];}
    else{labels=rows.map(r=>r.label);datasets=questionMode==="flow"?[
      {label:"Entradas",data:rows.map(r=>r.income),backgroundColor:"#16815d",borderRadius:5,maxBarThickness:24},
      {label:"Despesas",data:rows.map(r=>r.expense),backgroundColor:"#e3a08c",borderRadius:5,maxBarThickness:24}
    ]:[{label:questionMode==="balance"?"Saldo mensal":"Despesas",data:rows.map(r=>questionMode==="balance"?r.balance:r.expense),borderColor:questionMode==="balance"?"#16815d":"#da917c",backgroundColor:questionMode==="balance"?"#16815d20":"#da917c20",pointBackgroundColor:questionMode==="balance"?"#16815d":"#da917c",pointRadius:3,borderWidth:2,fill:true,tension:.32}];}
    if(sampleChart)sampleChart.destroy();
    sampleChart=new Chart(canvas,{type:preset.mode,data:{labels,datasets},options:{responsive:true,maintainAspectRatio:false,devicePixelRatio:Math.min(window.devicePixelRatio||1,2),animation:{duration:reduceMotion?0:520,easing:"easeOutQuart"},interaction:{mode:"index",intersect:false},indexAxis:horizontal?"y":"x",plugins:{legend:{display:questionMode==="flow",position:"top",align:"end",labels:{usePointStyle:true,pointStyle:"circle",boxWidth:7,boxHeight:7,padding:14,color:"#748178",font:{size:9}}},tooltip:{backgroundColor:"#143d2c",padding:10,cornerRadius:8,callbacks:{label:ctx=>" "+ctx.dataset.label+": "+money(ctx.parsed.x??ctx.parsed.y)}}},scales:horizontal?{x:{beginAtZero:true,grid:{color:"#edf1ed"},border:{display:false},ticks:{color:"#8b968e",font:{size:8},callback:value=>money(value)}},y:{grid:{display:false},border:{display:false},ticks:{color:"#596c5e",font:{size:8}}}}:{x:{grid:{display:false},border:{display:false},ticks:{color:"#8b968e",font:{size:8},maxRotation:0,autoSkip:false}},y:{beginAtZero:questionMode!=="balance",grid:{color:"#edf1ed"},border:{display:false},ticks:{color:"#8b968e",font:{size:8},callback:value=>money(value)}}},onClick:(event,elements,chart)=>{if(!elements.length)return;const index=elements[0].index;if(questionMode==="categories"){$("#sampleAnswer").textContent=chart.data.labels[index]+" concentra "+money(chart.data.datasets[0].data[index])+" em despesas neste exemplo.";}else{const row=rows[index];$("#sampleAnswer").textContent=row.label+": entradas "+money(row.income)+", despesas "+money(row.expense)+" e saldo "+money(row.balance)+" no exemplo.";}}}});
    $("#sampleChartTitle").textContent=preset.title;$("#sampleChartSubtitle").textContent=questionMode==="categories"?"Categorias de demonstração · valores em reais":"Últimos "+period+" meses · valores em reais";
    const entryLegend=$("#legendIncome"),expenseLegend=$("#legendExpense"),balanceLegend=$("#legendBalance");if(entryLegend)entryLegend.hidden=questionMode!=="flow";if(expenseLegend)expenseLegend.hidden=questionMode==="balance";if(balanceLegend)balanceLegend.hidden=questionMode!=="balance";
    const hint=$("#sampleChartHint");if(hint)hint.textContent=questionMode==="categories"?"Selecione uma categoria para consultar o total":questionMode==="flow"?"Selecione uma coluna para consultar os valores":"Selecione um ponto para consultar o valor";
    canvas.setAttribute("aria-label",preset.title+"; dados demonstrativos fictícios");
  }
  function setSampleQuestion(mode){
    if(!human[mode])return;questionMode=mode;const preset=human[mode];
    $$("[data-demo-question]").forEach(button=>button.setAttribute("aria-pressed",String(button.dataset.demoQuestion===mode)));
    $("#samplePromptTitle").textContent=preset.question;$("#sampleAnswer").textContent=preset.answer;
    const animeApi=window.anime;if(!reduceMotion&&animeApi?.animate){animeApi.animate($("#sampleAnswer"),{opacity:[.25,1],y:[7,0],duration:360,ease:"outQuad"});animeApi.animate('[data-demo-question="'+mode+'"]',{scale:[.98,1],duration:250,ease:"outQuad"});}
    drawSampleChart();
  }
  if(video&&endAction&&replay){
    video.muted=true;const start=video.play();if(start&&typeof start.catch==="function")start.catch(()=>{replay.hidden=false;});
    video.addEventListener("ended",()=>{endAction.hidden=false;replay.hidden=false;});
    video.addEventListener("play",()=>{endAction.hidden=true;replay.hidden=true;});
    video.addEventListener("error",()=>{replay.hidden=false;});
    replay.addEventListener("click",()=>{video.currentTime=0;video.play().catch(()=>{});});
  }
  if(menu&&nav){menu.addEventListener("click",()=>{const opened=nav.classList.toggle("open");menu.setAttribute("aria-expanded",String(opened));menu.setAttribute("aria-label",opened?"Fechar menu":"Abrir menu");});nav.addEventListener("click",e=>{if(e.target.closest("a")){nav.classList.remove("open");menu.setAttribute("aria-expanded","false");}});}
  $$("[data-demo-question]").forEach(button=>button.addEventListener("click",()=>setSampleQuestion(button.dataset.demoQuestion)));
  $$("[data-demo-period]").forEach(button=>button.addEventListener("click",()=>{period=Number(button.dataset.demoPeriod)||6;$$("[data-demo-period]").forEach(item=>item.setAttribute("aria-pressed",String(item===button)));drawSampleChart();const animeApi=window.anime;if(!reduceMotion&&animeApi?.animate)animeApi.animate(button,{scale:[.95,1],duration:220,ease:"outQuad"});}));
  drawSampleChart();
  if(!reduceMotion&&window.gsap){
    const intro=window.gsap.timeline({defaults:{ease:"power3.out"}});
    intro.from(".site-header",{y:-16,autoAlpha:0,duration:.5}).from(".hero-copy .eyebrow",{y:12,autoAlpha:0,duration:.42},"-=.22").from(".hero h1",{y:25,autoAlpha:0,duration:.65},"-=.2").from(".hero-description,.hero-actions,.hero-proof",{y:14,autoAlpha:0,duration:.42,stagger:.09},"-=.3").from(".video-shell",{y:23,autoAlpha:0,scale:.985,duration:.7},"-=.48").from(".video-note",{y:12,autoAlpha:0,duration:.4},"-=.3");
    const revealObserver=new IntersectionObserver(entries=>entries.forEach(entry=>{if(!entry.isIntersecting)return;window.gsap.fromTo(entry.target,{y:23,autoAlpha:0},{y:0,autoAlpha:1,duration:.65,ease:"power2.out",clearProps:"transform,opacity,visibility"});revealObserver.unobserve(entry.target);}),{threshold:.14});
    $$('[data-reveal],.process-card').forEach(element=>revealObserver.observe(element));
  }
})();
