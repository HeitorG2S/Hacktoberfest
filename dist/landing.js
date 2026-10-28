(() => {
  "use strict";
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const video = $("#heroVideo");
  const heroDemoButton = $("#heroDemoButton");
  const endAction = $("#videoEndAction");
  const replay = $("[data-replay]");
  const nav = $("#mainNav");
  const menu = $("[data-menu]");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const sample = {
    months: ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"],
    income: [7200,7600,7350,7900,7750,8100,7850,8300,8150,8500,8250,8800],
    expense: [5180,5420,5310,5660,5520,5890,5730,6010,5830,6220,5980,6310],
    categories: [["Moradia",2380],["Alimentação",1210],["Transporte",540],["Saúde",390],["Assinaturas",210],["Outros",660]]
  };
  const human = {
    trend: {question:"Como evoluíram as despesas?",answer:"A linha mostra a variação das despesas mês a mês. Selecione um ponto para conferir o valor deste exemplo.",title:"Tendência mensal das despesas",mode:"line"},
    categories: {question:"Quais categorias pesam mais?",answer:"No exemplo, Moradia concentra a maior despesa, seguida por Alimentação. Os valores da sua análise dependem dos registros importados.",title:"Despesas por categoria",mode:"bar"},
    flow: {question:"Quanto entrou e saiu?",answer:"As séries comparam entradas e despesas em cada mês. No painel, os valores vêm do período selecionado.",title:"Entradas e despesas por mês",mode:"bar"},
    balance: {question:"Como ficou o saldo?",answer:"O saldo mensal é calculado pelas entradas menos as despesas. O gráfico ajuda a comparar os meses deste exemplo.",title:"Saldo mensal",mode:"line"}
  };
  let chart = null;
  let questionMode = "trend";
  let period = 6;
  const money = value => new Intl.NumberFormat("pt-BR", {style:"currency",currency:"BRL",maximumFractionDigits:0}).format(Number(value) || 0);

  function chartRows(mode) {
    if (mode === "categories") return sample.categories.slice().sort((a,b) => b[1] - a[1]);
    const start = sample.months.length - period;
    return sample.months.slice(start).map((label,index) => ({
      label,
      income: sample.income[start + index],
      expense: sample.expense[start + index],
      balance: sample.income[start + index] - sample.expense[start + index]
    }));
  }

  function showChartReading(text) {
    const answer = $("#sampleAnswer");
    if (!answer) return;
    answer.textContent = text;
    const anime = window.anime;
    if (!reduceMotion && anime?.animate) {
      anime.animate(answer, {opacity:[.35,1],y:[6,0],duration:320,ease:"outQuad"});
    }
  }

  function drawSampleChart() {
    const canvas = $("#sampleChart");
    if (!canvas || !window.Chart) return;
    const preset = human[questionMode];
    const rows = chartRows(questionMode);
    const horizontal = questionMode === "categories";
    let labels;
    let datasets;

    if (horizontal) {
      labels = rows.map(row => row[0]);
      datasets = [{
        label:"Despesas",
        data:rows.map(row => row[1]),
        backgroundColor:["#187e57","#48a678","#7fbd91","#a8cc9d","#d9b276","#db9881"],
        borderRadius:7,
        barThickness:18
      }];
    } else {
      labels = rows.map(row => row.label);
      datasets = questionMode === "flow" ? [
        {label:"Entradas",data:rows.map(row => row.income),backgroundColor:"#16815d",borderRadius:5,maxBarThickness:24},
        {label:"Despesas",data:rows.map(row => row.expense),backgroundColor:"#e3a08c",borderRadius:5,maxBarThickness:24}
      ] : [{
        label:questionMode === "balance" ? "Saldo mensal" : "Despesas",
        data:rows.map(row => questionMode === "balance" ? row.balance : row.expense),
        borderColor:questionMode === "balance" ? "#16815d" : "#da917c",
        backgroundColor:questionMode === "balance" ? "#16815d20" : "#da917c20",
        pointBackgroundColor:questionMode === "balance" ? "#16815d" : "#da917c",
        pointRadius:3,
        pointHoverRadius:5,
        borderWidth:2,
        fill:true,
        tension:.32
      }];
    }

    chart?.destroy();
    chart = new Chart(canvas, {
      type:preset.mode,
      data:{labels,datasets},
      options:{
        responsive:true,
        maintainAspectRatio:false,
        devicePixelRatio:Math.min(window.devicePixelRatio || 1,2),
        animation:{duration:reduceMotion ? 0 : 520,easing:"easeOutQuart"},
        interaction:{mode:"index",intersect:false},
        indexAxis:horizontal ? "y" : "x",
        plugins:{
          legend:{display:questionMode === "flow",position:"top",align:"end",labels:{usePointStyle:true,pointStyle:"circle",boxWidth:7,boxHeight:7,padding:14,color:"#748178",font:{size:9}}},
          tooltip:{backgroundColor:"#143d2c",padding:10,cornerRadius:8,callbacks:{label:context => " " + context.dataset.label + ": " + money(context.parsed.x ?? context.parsed.y)}}
        },
        scales:horizontal ? {
          x:{beginAtZero:true,grid:{color:"#edf1ed"},border:{display:false},ticks:{color:"#8b968e",font:{size:8},callback:value => money(value)}},
          y:{grid:{display:false},border:{display:false},ticks:{color:"#596c5e",font:{size:8}}}
        } : {
          x:{grid:{display:false},border:{display:false},ticks:{color:"#8b968e",font:{size:8},maxRotation:0,autoSkip:false}},
          y:{beginAtZero:questionMode !== "balance",grid:{color:"#edf1ed"},border:{display:false},ticks:{color:"#8b968e",font:{size:8},callback:value => money(value)}}
        },
        onClick:(event,elements,instance) => {
          if (!elements.length) return;
          const index = elements[0].index;
          if (questionMode === "categories") {
            showChartReading(rows[index][0] + " soma " + money(rows[index][1]) + " em despesas neste exemplo.");
            return;
          }
          const row = rows[index];
          const value = questionMode === "balance" ? "saldo de " + money(row.balance) : questionMode === "flow" ? "entradas de " + money(row.income) + " e despesas de " + money(row.expense) : "despesas de " + money(row.expense);
          showChartReading(row.label + ": " + value + " neste exemplo.");
        }
      }
    });

    $("#sampleChartTitle").textContent = preset.title;
    $("#sampleChartSubtitle").textContent = questionMode === "categories" ? "Categorias de demonstração · valores em reais" : "Últimos " + period + " meses · valores em reais";
    const entry = $("#legendIncome");
    const expense = $("#legendExpense");
    const balance = $("#legendBalance");
    if (entry) entry.hidden = questionMode !== "flow";
    if (expense) expense.hidden = questionMode === "balance";
    if (balance) balance.hidden = questionMode !== "balance";
    const hint = $("#sampleChartHint");
    if (hint) hint.textContent = questionMode === "categories" ? "Selecione uma barra para consultar o total" : "Selecione um ponto ou coluna para consultar os valores";
    canvas.setAttribute("aria-label",preset.title + "; dados demonstrativos fictícios");
  }

  function setQuestion(mode) {
    if (!human[mode]) return;
    questionMode = mode;
    const preset = human[mode];
    $$("[data-demo-question]").forEach(button => button.setAttribute("aria-pressed",String(button.dataset.demoQuestion === mode)));
    $("#samplePromptTitle").textContent = preset.question;
    showChartReading(preset.answer);
    drawSampleChart();
    const anime = window.anime;
    const selected = $('[data-demo-question="' + mode + '"]');
    if (!reduceMotion && anime?.animate && selected) anime.animate(selected,{scale:[.98,1],duration:250,ease:"outQuad"});
  }

  if (video && endAction && replay) {
    video.muted = true;
    const playback = video.play();
    playback?.catch(() => { replay.hidden = false; });
    video.addEventListener("ended",() => { endAction.hidden = false; replay.hidden = false; });
    video.addEventListener("play",() => { endAction.hidden = true; replay.hidden = true; });
    video.addEventListener("error",() => { replay.hidden = false; });
    replay.addEventListener("click",() => { video.currentTime = 0; video.play()?.catch(() => {}); });
  }

  if (heroDemoButton && video) { heroDemoButton.addEventListener("click",(event) => { event.preventDefault(); const card=$("#heroVideoCard"); card?.scrollIntoView({behavior:reduceMotion?"auto":"smooth",block:"center"}); const restart=() => { if(video.ended||video.currentTime>.15)video.currentTime=0; const playback=video.play(); playback?.catch(() => { if(replay)replay.hidden=false; }); }; window.setTimeout(restart,reduceMotion?0:320); if(!reduceMotion&&window.gsap&&card)window.gsap.fromTo(card,{scale:.985,boxShadow:"0 0 0 0 rgba(17,126,78,0)"},{scale:1,boxShadow:"0 0 0 5px rgba(17,126,78,.16)",duration:.38,yoyo:true,repeat:1,ease:"power2.out",clearProps:"transform,boxShadow"}); const anime=window.anime;if(!reduceMotion&&anime?.animate)anime.animate(heroDemoButton,{scale:[.98,1],duration:260,ease:"outQuad"}); }); }

  if (menu && nav) {
    menu.addEventListener("click",() => {
      const opened = nav.classList.toggle("open");
      menu.setAttribute("aria-expanded",String(opened));
      menu.setAttribute("aria-label",opened ? "Fechar menu" : "Abrir menu");
    });
    nav.addEventListener("click",event => {
      if (!event.target.closest("a")) return;
      nav.classList.remove("open");
      menu.setAttribute("aria-expanded","false");
      menu.setAttribute("aria-label","Abrir menu");
    });
    document.addEventListener("keydown",event => {
      if (event.key !== "Escape" || !nav.classList.contains("open")) return;
      nav.classList.remove("open");
      menu.setAttribute("aria-expanded","false");
      menu.setAttribute("aria-label","Abrir menu");
      menu.focus();
    });
  }

  $$("[data-demo-question]").forEach(button => button.addEventListener("click",() => setQuestion(button.dataset.demoQuestion)));
  $$("[data-demo-period]").forEach(button => button.addEventListener("click",() => {
    period = Number(button.dataset.demoPeriod) || 6;
    $$("[data-demo-period]").forEach(item => item.setAttribute("aria-pressed",String(item === button)));
    drawSampleChart();
    const anime = window.anime;
    if (!reduceMotion && anime?.animate) anime.animate(button,{scale:[.95,1],duration:220,ease:"outQuad"});
  }));
  $$(".faq-list details").forEach(item => item.addEventListener("toggle",() => {
    if (!item.open || reduceMotion || !window.anime?.animate) return;
    const paragraph = $("p",item);
    if (paragraph) window.anime.animate(paragraph,{opacity:[.2,1],y:[5,0],duration:260,ease:"outQuad"});
  }));

  const floating = $("#floatingCta");
  const hero = $("#inicio");
  if (floating && hero && "IntersectionObserver" in window) {
    const heroObserver = new IntersectionObserver(entries => {
      const visible = entries[0]?.isIntersecting;
      floating.classList.toggle("is-visible",!visible);
    },{threshold:.12});
    heroObserver.observe(hero);
  }

  drawSampleChart();
  if (!reduceMotion && window.gsap) {
    const gsap = window.gsap;
    const intro = gsap.timeline({defaults:{ease:"power3.out"}});
    intro.from(".site-header",{y:-14,autoAlpha:0,duration:.48})
      .from(".hero .eyebrow",{y:12,autoAlpha:0,duration:.4},"-=.2")
      .from(".hero-title-line",{y:24,autoAlpha:0,duration:.62,stagger:.12},"-=.16")
      .from(".hero-description,.hero-actions,.hero-reassurance,.hero-footnote",{y:12,autoAlpha:0,duration:.4,stagger:.075},"-=.24")
      .from(".hero-video-card",{y:34,scale:.975,filter:"blur(6px)",autoAlpha:0,duration:.82,clearProps:"transform,opacity,filter"},"-=.28")
      .from(".hero-conversation",{y:12,autoAlpha:0,duration:.42},"-=.28");
    gsap.to(".hero-ambient-one",{scale:1.08,duration:7,yoyo:true,repeat:-1,ease:"sine.inOut",transformOrigin:"center"});
    gsap.to(".hero-ambient-two",{x:-13,y:11,duration:8,yoyo:true,repeat:-1,ease:"sine.inOut"});
    gsap.to(".hero-spark-one",{y:-9,rotation:5,duration:5.5,yoyo:true,repeat:-1,ease:"sine.inOut"});
    gsap.to(".hero-spark-two",{y:8,rotation:-4,duration:7,yoyo:true,repeat:-1,ease:"sine.inOut"});
    gsap.to(".hero-conversation",{y:-5,duration:3.6,yoyo:true,repeat:-1,ease:"sine.inOut",delay:3.2});

    if ("IntersectionObserver" in window) {
      const revealObserver = new IntersectionObserver(entries => entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        gsap.fromTo(entry.target,{y:22,autoAlpha:0},{y:0,autoAlpha:1,duration:.62,ease:"power2.out",clearProps:"transform,opacity,visibility"});
        revealObserver.unobserve(entry.target);
      }),{threshold:.12});
      $$("[data-reveal],.feature-card").forEach(element => revealObserver.observe(element));
    }
  }
})();