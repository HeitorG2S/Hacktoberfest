(() => {
  "use strict";
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const KEY = "clareza-financeiro-v1";
  const GOALS_KEY = "clareza-metas-v1";
  const months = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
  let timer;
  function dateString(d) { return [d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-"); }
  function dateAt(offset, day) { const d=new Date(); d.setDate(1); d.setMonth(d.getMonth()+offset); d.setDate(day); return dateString(d); }
  function demoRows() {
    const rows=[];
    function add(o,d,description,category,type,amount,account) { rows.push({id:"demo-"+o+"-"+rows.length,date:dateAt(o,d),description,category,type,amount,account:account||"Conta principal"}); }
    for(let o=-5;o<=0;o++) { const v=o+5;
      add(o,2,"Salário","Salário","entrada",7900+(v%3)*180);
      if(o%2===0) add(o,9,"Projeto freelance","Renda extra","entrada",680+(v%3)*120);
      add(o,4,"Aluguel","Moradia","saída",2380+v*20);
      add(o,6,"Mercado da semana","Alimentação","saída",610+v*24,"Cartão principal");
      add(o,13,"Restaurantes e cafés","Alimentação","saída",310+v*19,"Cartão principal");
      add(o,15,"Transporte","Transporte","saída",335+v*13,"Cartão principal");
      add(o,18,"Conta de luz e água","Moradia","saída",238+v*7);
      add(o,21,"Farmácia","Saúde","saída",98+v*13,"Cartão principal");
      add(o,24,"Streaming e aplicativos","Assinaturas","saída",84.9,"Cartão principal");
      add(o,27,"Casa e rotina","Outros","saída",155+v*12,"Cartão principal");
    }
    return rows.sort((a,b)=>b.date.localeCompare(a.date));
  }
  let data;
  try { data=JSON.parse(localStorage.getItem(KEY)||"null"); } catch { data=null; }
  let isDemo=!Array.isArray(data);
  let records=isDemo?demoRows():data;
  let goals=[];
  try{const stored=JSON.parse(localStorage.getItem(GOALS_KEY)||"[]");if(Array.isArray(stored))goals=stored.filter(goal=>goal&&typeof goal.id==="string"&&typeof goal.name==="string"&&Number(goal.target)>0).map(goal=>({...goal,target:Number(goal.target),current:Number(goal.current)||0}));}catch{goals=[];}
  let financeChart=null,activeChart="flow",chartWindow=6,chartStyle="bar",analysisView="summary",categorySort="desc";
  const money=n=>new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(Number(n)||0);
  const fmtDate=s=>{const d=parseDate(s);return d?new Intl.DateTimeFormat("pt-BR",{day:"2-digit",month:"short"}).format(d).replace(".",""):"—";};
  function norm(s){return String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();}
  function esc(s){return String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
  function parseDate(value){
    if(value instanceof Date)return value;
    const s=String(value||"").trim(); let m=s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if(m)return new Date(+m[1],+m[2]-1,+m[3]);
    m=s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
    if(m)return new Date(+(m[3].length===2?"20"+m[3]:m[3]),+m[2]-1,+m[1]);
    const d=new Date(s);return Number.isNaN(d.getTime())?null:d;
  }
  function parseAmount(v){
    let s=String(v==null?"":v).trim().replace(/[R$\s]/g,"").replace(/[^\d,.-]/g,"");
    if(!s)return NaN; const neg=s.startsWith("-"); s=s.replace(/-/g,"");
    const comma=s.lastIndexOf(","),dot=s.lastIndexOf(".");
    if(comma>=0&&dot>=0){if(comma>dot)s=s.replace(/\./g,"").replace(",",".");else s=s.replace(/,/g,"");}
    else if(comma>=0)s=s.replace(/\./g,"").replace(",",".");
    const n=Number(s);return Number.isFinite(n)?(neg?-n:n):NaN;
  }
  function persist(){
    try{localStorage.setItem(KEY,JSON.stringify(records));isDemo=false;$("#dataNotice").textContent="Sua planilha está salva neste navegador. Os dados não são enviados a um servidor.";return true;}
    catch{toast("Não foi possível salvar localmente. Exporte uma cópia CSV.");return false;}
  }
  function currentRows(){const n=new Date();return records.filter(r=>{const d=parseDate(r.date);return d&&d.getMonth()===n.getMonth()&&d.getFullYear()===n.getFullYear();});}
  function sum(rows){return rows.reduce((a,r)=>{a[r.type==="entrada"?"in":"out"]+=Math.abs(+r.amount||0);return a;},{in:0,out:0});}
  function byCategory(rows){const m=new Map();rows.forEach(r=>m.set(r.category||"Sem categoria",(m.get(r.category||"Sem categoria")||0)+Math.abs(+r.amount||0)));return Array.from(m,([name,value])=>({name,value})).sort((a,b)=>b.value-a.value);}
  function render(){
    const now=new Date();$("#todayLabel").textContent=new Intl.DateTimeFormat("pt-BR",{weekday:"long",day:"numeric",month:"long"}).format(now).toLocaleUpperCase("pt-BR");
    const current=currentRows(), totals=sum(current), expenses=current.filter(r=>r.type!=="entrada"), cats=byCategory(expenses), balance=totals.in-totals.out;
    $("#balance").textContent=money(balance);$("#income").textContent=money(totals.in);$("#expense").textContent=money(totals.out);
    $("#balanceNote").textContent=balance>=0?"Saldo positivo no período":"Despesas acima das entradas";
    $("#incomeCount").textContent=current.filter(r=>r.type==="entrada").length;
    $("#expenseCount").textContent=expenses.length+(expenses.length===1?" lançamento":" lançamentos");
    $("#topCategory").textContent=cats[0]?cats[0].name:"Sem dados";$("#topCategoryValue").textContent=cats[0]?money(cats[0].value)+" neste mês":"Importe uma planilha";$("#insightText").textContent=cats[0]&&totals.out?cats[0].name+" concentra "+Math.round(cats[0].value/totals.out*100)+"% das despesas registradas neste mês.":"Importe uma planilha com lançamentos para gerar este resumo.";
    renderAnalysis();renderTable();
    $("#dataNotice").textContent=isDemo?"Os valores exibidos são fictícios. Importe sua planilha para começar.":"Sua planilha está salva neste navegador. Os dados não são enviados a um servidor.";
  }
  function monthBuckets(count){
    const now=new Date(),first=new Date(now.getFullYear(),now.getMonth()-count+1,1);
    return Array.from({length:count},(_,i)=>{const date=new Date(first.getFullYear(),first.getMonth()+i,1),rows=records.filter(r=>{const d=parseDate(r.date);return d&&d.getFullYear()===date.getFullYear()&&d.getMonth()===date.getMonth();}),totals=sum(rows);return{date,rows,in:totals.in,out:totals.out,balance:totals.in-totals.out};});
  }
  function periodRows(buckets){const dates=new Set(buckets.map(b=>b.date.getFullYear()+"-"+b.date.getMonth()));return records.filter(r=>{const d=parseDate(r.date);return d&&dates.has(d.getFullYear()+"-"+d.getMonth());});}
  function compactMoney(value){const n=Number(value)||0,abs=Math.abs(n);if(abs>=1000000)return"R$ "+(n/1000000).toFixed(1).replace(".",",")+" mi";if(abs>=1000)return"R$ "+(n/1000).toFixed(abs>=10000?0:1).replace(".",",")+" mil";return"R$ "+Math.round(n);}
  function monthLabel(date){return new Intl.DateTimeFormat("pt-BR",{month:"short",year:"2-digit"}).format(date).replace(".","");}
  function updateAnalysisControls(){
    const shell=$(".analysis-shell");
    if(!shell)return;
    shell.dataset.analysisView=analysisView;
    $(".analysis-mode").querySelectorAll("button[data-analysis-view]").forEach(button=>{
      const active=button.dataset.analysisView===analysisView;
      button.classList.toggle("is-active",active);
      button.setAttribute("aria-selected",String(active));
    });
    $$("[data-chart-mode]").forEach(button=>{
      const active=button.dataset.chartMode===activeChart;
      button.classList.toggle("is-active",active);
      button.setAttribute("aria-pressed",String(active));
    });
    const sortField=$(".category-sort-field"),styleField=$(".chart-style-field"),styleSelect=$("#chartStyle");
    if(sortField)sortField.hidden=activeChart!=="categories";
    if(styleField)styleField.hidden=false;
    if(styleSelect){
      Array.from(styleSelect.options).forEach(option=>{
        option.hidden=activeChart==="categories"?option.value==="line":option.value==="doughnut";
      });
      if(styleSelect.selectedOptions[0]?.hidden){
        styleSelect.value="bar";
        chartStyle="bar";
      }
    }
  }
  function updateChartTable(headers,rows){
    $("#chartDataHead").innerHTML="<tr>"+headers.map(h=>"<th>"+esc(h)+"</th>").join("")+"</tr>";
    $("#chartDataBody").innerHTML=rows.length?rows.map(row=>"<tr>"+row.map(cell=>"<td>"+esc(cell)+"</td>").join("")+"</tr>").join(""):'<tr><td colspan="'+headers.length+'" class="empty">Sem valores neste recorte.</td></tr>';
  }
  function renderAnalysis(){
    const periodSelect=$("#chartPeriod"),styleSelect=$("#chartStyle"),sortSelect=$("#categorySort");
    if(periodSelect)chartWindow=Number(periodSelect.value)||chartWindow;
    if(styleSelect)chartStyle=styleSelect.value;
    if(sortSelect)categorySort=sortSelect.value;
    updateAnalysisControls();

    const buckets=monthBuckets(chartWindow),rows=periodRows(buckets),totals=sum(rows);
    const categories=byCategory(rows.filter(row=>row.type!=="entrada"));
    const periodLabel="Últimos "+chartWindow+" meses",hasRows=rows.length>0;
    $("#graphRange").textContent=periodLabel;
    $("#analysisSubtitle").textContent=analysisView==="summary"?"Resumo calculado com os lançamentos carregados neste navegador.":"Explore períodos, categorias e formatos de gráfico; confira os valores exatos.";
    let labels=[],datasets=[],tableRows=[],hasChartData=hasRows;
    let horizontal=false,isDonut=false;

    if(activeChart==="categories"){
      const sorted=categories.slice().sort((a,b)=>categorySort==="asc"?a.value-b.value:b.value-a.value);
      const top=sorted.slice(0,9),rest=sorted.slice(9);
      if(rest.length)top.push({name:"Outras categorias",value:rest.reduce((total,item)=>total+item.value,0)});
      labels=top.map(item=>item.name);
      const palette=["#16815d","#44a67c","#77b990","#a9cda9","#e7b778","#d98e75","#8ca4bd","#a78db5","#bac5a2","#85958d"];
      isDonut=chartStyle==="doughnut";
      horizontal=!isDonut;
      datasets=[{
        label:"Despesas",
        data:top.map(item=>item.value),
        backgroundColor:top.map((_,index)=>palette[index%palette.length]),
        borderColor:isDonut?"#fff":"transparent",
        borderWidth:isDonut?3:0,
        borderRadius:isDonut?0:6,
        barThickness:16,
        hoverOffset:isDonut?8:0
      }];
      tableRows=top.map(item=>[item.name,money(item.value),totals.out?Math.round(item.value/totals.out*100)+"%":"0%"]);
      hasChartData=top.length>0;
      $("#graphEyebrow").textContent="DISTRIBUIÇÃO DAS DESPESAS";
      $("#graphTitle").textContent=isDonut?"Participação por categoria":"Despesas por categoria";
      $("#graphSummary").textContent=isDonut?"A rosca mostra quanto cada categoria representa do total.":"Categorias somadas no período selecionado.";
      $("#graphInsightTitle").textContent="Onde o dinheiro pesou mais";
      $("#graphInsight").textContent=top.length?"“"+top[0].name+"” lidera com "+money(top[0].value)+(totals.out?" ("+Math.round(top[0].value/totals.out*100)+"% das despesas).":" no período.")+" Alterne entre barras e rosca para comparar os pesos.":"Ainda não há despesas no período escolhido.";
      updateChartTable(["Categoria","Despesas","Participação"],tableRows);
    }else if(activeChart==="balance"){
      labels=buckets.map(bucket=>monthLabel(bucket.date));
      if(chartStyle==="line"){
        datasets=[{label:"Saldo mensal",data:buckets.map(bucket=>bucket.balance),borderColor:"#16815d",backgroundColor:"#16815d18",pointBackgroundColor:buckets.map(bucket=>bucket.balance>=0?"#16815d":"#d57363"),pointBorderColor:"#fff",pointRadius:3,pointHoverRadius:5,borderWidth:2,fill:true,tension:.32}];
      }else{
        datasets=[{label:"Saldo mensal",data:buckets.map(bucket=>bucket.balance),backgroundColor:buckets.map(bucket=>bucket.balance>=0?"#16815d":"#d57363"),borderRadius:5,maxBarThickness:30}];
      }
      tableRows=buckets.map(bucket=>[monthLabel(bucket.date),money(bucket.in),money(bucket.out),money(bucket.balance)]);
      $("#graphEyebrow").textContent="ENTRADAS MENOS DESPESAS";
      $("#graphTitle").textContent=chartStyle==="line"?"Tendência do saldo":"Saldo mensal por período";
      $("#graphSummary").textContent="Saldo mensal calculado a partir das entradas e despesas registradas.";
      const positive=buckets.filter(bucket=>bucket.balance>0).length;
      $("#graphInsightTitle").textContent="Leitura do saldo";
      $("#graphInsight").textContent=hasRows?"O saldo líquido do período é "+money(totals.in-totals.out)+". Em "+positive+" de "+buckets.length+" meses o resultado ficou positivo.":"Ainda não há lançamentos no período escolhido.";
      updateChartTable(["Mês","Entradas","Despesas","Saldo"],tableRows);
    }else{
      labels=buckets.map(bucket=>monthLabel(bucket.date));
      datasets=chartStyle==="line"?[
        {label:"Entradas",data:buckets.map(bucket=>bucket.in),borderColor:"#16815d",backgroundColor:"#16815d18",pointBackgroundColor:"#16815d",pointRadius:3,pointHoverRadius:5,borderWidth:2,fill:false,tension:.32},
        {label:"Despesas",data:buckets.map(bucket=>bucket.out),borderColor:"#d57363",backgroundColor:"#d5736318",pointBackgroundColor:"#d57363",pointRadius:3,pointHoverRadius:5,borderWidth:2,fill:false,tension:.32}
      ]:[
        {label:"Entradas",data:buckets.map(bucket=>bucket.in),backgroundColor:"#16815d",borderRadius:5,maxBarThickness:28},
        {label:"Despesas",data:buckets.map(bucket=>bucket.out),backgroundColor:"#e1a191",borderRadius:5,maxBarThickness:28}
      ];
      tableRows=buckets.map(bucket=>[monthLabel(bucket.date),money(bucket.in),money(bucket.out),money(bucket.balance)]);
      $("#graphEyebrow").textContent=chartStyle==="line"?"TENDÊNCIA MENSAL":"ENTRADAS E DESPESAS";
      $("#graphTitle").textContent=chartStyle==="line"?"Tendência do fluxo financeiro":"Comparação mensal";
      $("#graphSummary").textContent="Selecione um ponto ou coluna para ver os valores daquele mês.";
      const peak=buckets.slice().sort((a,b)=>b.out-a.out)[0];
      $("#graphInsightTitle").textContent="Visão do período";
      $("#graphInsight").textContent=hasRows?"Entraram "+money(totals.in)+" e saíram "+money(totals.out)+"; o saldo líquido foi "+money(totals.in-totals.out)+"."+(peak&&peak.out?" O maior total de despesas foi em "+monthLabel(peak.date)+" ("+money(peak.out)+").":""):"Ainda não há lançamentos no período escolhido.";
      updateChartTable(["Mês","Entradas","Despesas","Saldo"],tableRows);
    }

    $("#periodExpense").textContent=money(totals.out);
    $("#periodBalance").textContent=money(totals.in-totals.out);
    $("#periodCount").textContent=rows.length;
    const chartEmpty=$("#chartEmpty");
    chartEmpty.hidden=hasChartData&&Boolean(window.Chart);
    chartEmpty.textContent=!window.Chart?"O gráfico não carregou. Atualize a página para tentar novamente.":hasChartData?"":activeChart==="categories"?"Nenhuma despesa encontrada no período escolhido.":"Nenhum lançamento no período escolhido. Importe uma planilha ou selecione outro período.";
    $("#financeChart").setAttribute("aria-label",activeChart==="categories"?(isDonut?"Participação das despesas por categoria":"Despesas por categoria")+" nos últimos "+chartWindow+" meses":activeChart==="balance"?"Saldo financeiro mensal nos últimos "+chartWindow+" meses":"Comparação de entradas e despesas nos últimos "+chartWindow+" meses");
    if(financeChart){financeChart.destroy();financeChart=null;}
    const canvas=$("#financeChart");
    if(hasChartData&&window.Chart&&canvas){
      const chartType=isDonut?"doughnut":chartStyle==="line"?"line":"bar";
      const options={
        responsive:true,
        maintainAspectRatio:false,
        devicePixelRatio:Math.min(window.devicePixelRatio||1,2),
        animation:{duration:window.matchMedia("(prefers-reduced-motion: reduce)").matches?0:320},
        interaction:{mode:"index",intersect:false},
        plugins:{
          legend:{display:isDonut||activeChart==="flow",position:isDonut?"bottom":"top",align:isDonut?"center":"end",labels:{usePointStyle:true,pointStyle:"circle",boxWidth:7,boxHeight:7,padding:14,color:"#718078",font:{family:"Inter, system-ui, sans-serif",size:10}}},
          tooltip:{backgroundColor:"#173f32",padding:10,cornerRadius:8,displayColors:true,callbacks:{label:context=>{const value=typeof context.parsed==="number"?context.parsed:Number(context.parsed.x??context.parsed.y??0);return" "+context.dataset.label+": "+money(value);}}}
        },
        onClick:(event,elements,instance)=>{
          if(!elements.length)return;
          const index=elements[0].index;
          if(activeChart==="categories"){
            const value=instance.data.datasets[0].data[index],name=instance.data.labels[index];
            const share=totals.out?Math.round(value/totals.out*100):0;
            $("#chartSelection").textContent=name+" · "+money(value)+" · "+share+"% das despesas do período.";
          }else{
            const bucket=buckets[index];
            $("#chartSelection").textContent=monthLabel(bucket.date)+" · Entradas "+money(bucket.in)+" · Despesas "+money(bucket.out)+" · Saldo "+money(bucket.balance)+".";
          }
        }
      };
      if(!isDonut){
        options.indexAxis=horizontal?"y":"x";
        options.scales=horizontal?{
          x:{beginAtZero:true,grid:{color:"#edf1ed"},border:{display:false},ticks:{color:"#87948c",font:{size:9},callback:value=>compactMoney(value)}},
          y:{grid:{display:false},border:{display:false},ticks:{color:"#647269",font:{size:9},autoSkip:false}}
        }:{
          x:{grid:{display:false},border:{display:false},ticks:{color:"#87948c",font:{size:9},maxRotation:0,autoSkip:false}},
          y:{beginAtZero:activeChart!=="balance",grid:{color:"#edf1ed"},border:{display:false},ticks:{color:"#87948c",font:{size:9},callback:value=>compactMoney(value)}}
        };
      }
      financeChart=new Chart(canvas,{type:chartType,data:{labels,datasets},options});
    }
    $("#chartSelection").textContent=isDonut?"Selecione uma fatia para conferir o valor e a participação.":"Selecione uma coluna, linha ou ponto para ver os valores exatos.";
    const animeApi=window.anime;
    if(!window.matchMedia("(prefers-reduced-motion: reduce)").matches&&animeApi?.animate)animeApi.animate($("#graphInsightTitle"),{opacity:[.35,1],y:[5,0],duration:260,ease:"outQuad"});
  }
  function goalKind(type){
    return({reserva:"Reserva de emergência",viagem:"Viagem",compra:"Compra planejada",divida:"Quitar uma dívida",outra:"Outra meta"})[type]||"Outra meta";
  }
  function goalDateLabel(value){
    if(!value)return"Sem prazo definido";
    const date=parseDate(value);
    return date?new Intl.DateTimeFormat("pt-BR",{day:"2-digit",month:"short",year:"numeric"}).format(date).replace(".",""):"Prazo inválido";
  }
  function persistGoals(){
    try{localStorage.setItem(GOALS_KEY,JSON.stringify(goals));renderGoals();return true;}
    catch{toast("Não foi possível salvar a meta neste navegador.");return false;}
  }
  function renderGoals(){
    const summary=$("#goalOverview"),grid=$("#goalsGrid");
    if(!summary||!grid)return;
    const completed=goals.filter(goal=>Number(goal.current)>=Number(goal.target)).length;
    const active=goals.length-completed;
    const remaining=goals.reduce((total,goal)=>total+Math.max(0,Number(goal.target)-Number(goal.current)),0);
    summary.innerHTML='<article><span>Em andamento</span><b>'+active+'</b><small>metas ativas</small></article><article><span>Concluídas</span><b>'+completed+'</b><small>objetivos alcançados</small></article><article><span>Falta completar</span><b>'+money(remaining)+'</b><small>somando suas metas abertas</small></article>';
    const filter=$("#goalFilter")?.value||"all";
    let visible=goals.slice();
    if(filter==="active")visible=visible.filter(goal=>Number(goal.current)<Number(goal.target));
    if(filter==="completed")visible=visible.filter(goal=>Number(goal.current)>=Number(goal.target));
    if(!visible.length){
      const hasGoals=goals.length>0;
      grid.innerHTML='<div class="goals-empty"><span>◎</span><div><b>'+(hasGoals?"Nenhuma meta neste filtro.":"Sua próxima conquista começa com um plano.")+'</b><p>'+(hasGoals?"Altere o filtro para ver suas outras metas.":"Crie uma meta de reserva, viagem, compra planejada ou quitação de dívida. Defina o valor e acompanhe o progresso por aqui.")+'</p>'+(hasGoals?"":'<button class="btn primary" type="button" data-action="add-goal">Criar minha primeira meta</button>')+'</div></div>';
      return;
    }
    const icons={reserva:"◈",viagem:"✈",compra:"⌂",divida:"↘",outra:"✧"};
    grid.innerHTML=visible.map(goal=>{
      const target=Math.max(0,Number(goal.target)||0),current=Math.max(0,Number(goal.current)||0);
      const percent=target?Math.min(100,Math.round(current/target*100)):0;
      const complete=target>0&&current>=target;
      const due=goal.dueDate?parseDate(goal.dueDate):null;
      let status=complete?"Concluída":"Em andamento",statusClass=complete?"is-complete":"";
      let deadline=goalDateLabel(goal.dueDate);
      if(!complete&&due){
        const today=new Date();today.setHours(0,0,0,0);due.setHours(0,0,0,0);
        const days=Math.ceil((due-today)/86400000);
        if(days<0){status="Prazo passou";statusClass="is-late";deadline="Prazo passou em "+deadline;}
        else if(days===0)deadline="Prazo desejado: hoje";
        else deadline="Prazo em "+days+" dias · "+deadline;
      }
      return'<article class="goal-card"><div class="goal-card-head"><span class="goal-kind-icon">'+(icons[goal.type]||icons.outra)+'</span><span class="goal-status '+statusClass+'">'+status+'</span></div><span class="goal-type">'+esc(goalKind(goal.type))+'</span><h3>'+esc(goal.name)+'</h3><div class="goal-progress-copy"><span>'+money(current)+' <small>de</small> '+money(target)+'</span><b>'+percent+'%</b></div><div class="goal-progress-track" role="progressbar" aria-label="Progresso da meta '+esc(goal.name)+'" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+percent+'"><i style="width:'+percent+'%"></i></div><div class="goal-deadline"><span>'+esc(deadline)+'</span><b>'+(complete?"Objetivo alcançado":"Faltam "+money(Math.max(0,target-current)))+'</b></div><div class="goal-card-actions"><button type="button" data-action="contribute-goal" data-goal-id="'+esc(goal.id)+'">Atualizar progresso</button><button type="button" class="goal-edit" data-action="edit-goal" data-goal-id="'+esc(goal.id)+'" aria-label="Editar meta '+esc(goal.name)+'">Editar</button><button type="button" class="goal-delete" data-action="delete-goal" data-goal-id="'+esc(goal.id)+'" aria-label="Excluir meta '+esc(goal.name)+'">×</button></div></article>';
    }).join("");
  }
  function openGoalDialog(goal,focusProgress){
    const form=$("#goalForm");
    form.reset();
    const fields=form.elements;
    fields.namedItem("goalId").value=goal?goal.id:"";
    fields.namedItem("name").value=goal?goal.name:"";
    fields.namedItem("type").value=goal?goal.type:"reserva";
    fields.namedItem("target").value=goal?String(goal.target).replace(".",","):"";
    fields.namedItem("current").value=goal?String(goal.current||0).replace(".",","):"0,00";
    fields.namedItem("dueDate").value=goal?goal.dueDate||"":"";
    $("#goalDialogTitle").textContent=goal?(focusProgress?"Atualizar progresso":"Editar meta"):"Criar uma meta";
    $("#goalDialogDescription").textContent=focusProgress?"Informe o total que você já guardou ou pagou até agora.":"Escolha o que quer alcançar e acompanhe o valor por aqui.";
    $("#goalDialog").showModal();
    if(window.gsap&&!window.matchMedia("(prefers-reduced-motion: reduce)").matches)window.gsap.fromTo($("#goalDialog .modal-box"),{y:14,autoAlpha:0,scale:.985},{y:0,autoAlpha:1,scale:1,duration:.32,ease:"power2.out"});
    requestAnimationFrame(()=>fields.namedItem(focusProgress?"current":"name").focus());
  }

  function renderTable(){
    const q=norm($("#search").value.trim());
    const list=records.slice().sort((a,b)=>b.date.localeCompare(a.date)).filter(r=>!q||norm([r.description,r.category,r.account,r.type].join(" ")).includes(q)).slice(0,8);
    $("#rows").innerHTML=list.length?list.map(r=>'<tr class="row"><td><div class="name-cell"><span class="row-icon '+(r.type==="entrada"?"":"out")+'">'+(r.type==="entrada"?"↗":"↘")+'</span><span><b>'+esc(r.description||"Sem descrição")+'</b><small>'+(r.type==="entrada"?"Entrada":"Despesa")+'</small></span></div></td><td><span class="pill">'+esc(r.category||"Sem categoria")+'</span></td><td>'+fmtDate(r.date)+'</td><td>'+esc(r.account||"Conta principal")+'</td><td class="amount '+(r.type==="entrada"?"in":"out")+'">'+(r.type==="entrada"?"+ ":"− ")+money(r.amount)+'</td><td><button class="delete" data-delete="'+esc(r.id)+'" aria-label="Excluir '+esc(r.description)+'">×</button></td></tr>').join(""):'<tr><td colspan="6" class="empty">Nenhum lançamento encontrado. Importe uma planilha ou crie um lançamento.</td></tr>';
    $("#rowCount").textContent=list.length+" exibidos · "+records.length+" no total";
  }
  function toast(message){const t=$("#toast");t.textContent=message;t.classList.add("show");clearTimeout(timer);timer=setTimeout(()=>t.classList.remove("show"),3000);}
  function parseCSV(text){
    text=String(text).replace(/^\uFEFF/,"");const first=text.split(/\r?\n/,1)[0]||"",delims=[";",",","\t"];const delimiter=delims.sort((a,b)=>first.split(b).length-first.split(a).length)[0];
    const rows=[];let row=[],cell="",quoted=false;
    for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}else if(c===delimiter&&!quoted){row.push(cell.trim());cell="";}else if((c==="\n"||c==="\r")&&!quoted){if(c==="\r"&&text[i+1]==="\n")i++;row.push(cell.trim());cell="";if(row.some(x=>x!==""))rows.push(row);row=[];}else cell+=c;}
    row.push(cell.trim());if(row.some(x=>x!==""))rows.push(row);if(rows.length<2)throw Error("A planilha precisa ter cabeçalho e pelo menos um lançamento.");
    const heads=rows[0].map(x=>norm(x).replace(/[^a-z0-9]/g,""));const idx=aliases=>heads.findIndex(x=>aliases.includes(x));
    const di=idx(["data","date"]),desc=idx(["descricao","description","lancamento","nome"]),cat=idx(["categoria","category"]),type=idx(["tipo","type","natureza"]),val=idx(["valor","amount","value"]),acc=idx(["conta","account","banco"]);
    if(di<0||desc<0||val<0)throw Error("Faltam colunas obrigatórias. Use Data, Descrição e Valor.");
    const parsed=rows.slice(1).map((r,i)=>{const d=parseDate(r[di]),n=parseAmount(r[val]),name=(r[desc]||"").trim();if(!d||!name||!Number.isFinite(n))return null;const t=type<0?"":norm(r[type]||"");return{id:"import-"+Date.now()+"-"+i,date:dateString(d),description:name,category:cat<0?"Sem categoria":(r[cat]||"Sem categoria"),type:t?(t.includes("entrada")||t.includes("receita")||t.includes("credito")||t==="income"||t==="credit"?"entrada":"saída"):(n<0?"entrada":"saída"),amount:Math.abs(n),account:acc<0?"Conta principal":(r[acc]||"Conta principal")};}).filter(Boolean);
    if(!parsed.length)throw Error("Não encontrei linhas válidas. Confira datas e valores.");return parsed;
  }
  function downloadCSV(rows,name){
    const cols=["Data","Descrição","Categoria","Tipo","Valor","Conta"];
    const quote=v=>'"'+String(v==null?"":v).replace(/"/g,'""')+'"';
    const content=[cols.join(";"),...rows.map(r=>[r.date,r.description,r.category,r.type,(+r.amount).toFixed(2).replace(".",","),r.account].map(quote).join(";"))].join("\r\n");
    const a=document.createElement("a"),url=URL.createObjectURL(new Blob(["\uFEFF"+content],{type:"text/csv;charset=utf-8"}));a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
  }
  function send(q){
    q=String(q||"").trim();if(!q)return;
    const add=(text,user,source)=>{const m=document.createElement("div");m.className="message "+(user?"user":"assistant");m.innerHTML='<span class="msg-avatar">'+(user?"V":"✳")+'</span><div class="bubble"><p></p>'+(source?'<small class="source">'+esc(source)+'</small>':"")+'</div>';$("p",m).textContent=text;$("#messages").appendChild(m);$("#messages").scrollTop=$("#messages").scrollHeight;const animeApi=window.anime;if(!window.matchMedia("(prefers-reduced-motion: reduce)").matches&&animeApi?.animate)animeApi.animate(m,{opacity:[0,1],y:[8,0],duration:300,ease:"outQuad"});};
    add(q,true);const normalized=norm(q),asksGoal=normalized.includes("meta")||normalized.includes("objetivo")||normalized.includes("plano"),asksCategory=/categoria|onde gasto|onde concentro|pesaram|distribuicao|grupo de despesas/.test(normalized),asksBalance=/saldo|sobrou|quanto ficou|quanto restou|economizei/.test(normalized),asksTrend=/compar|variaram|mudaram|tendencia|evolucao|cresceram|variacao/.test(normalized),asksBiggest=/maior gasto|mais gastei|maior despesa|maiores despesas|maior lancamento/.test(normalized),asksFlow=/entrada|receita|saiu|fluxo|moviment|recebi|quanto entrou/.test(normalized);
    const currentOnly=/neste mes|este mes|mes atual/.test(normalized),monthMatch=normalized.match(/(?:ultimos?|ultimas?)?\s*(3|6|12)\s*mes/);if(monthMatch){chartWindow=Number(monthMatch[1]);$("#chartPeriod").value=String(chartWindow);}else if(currentOnly){chartWindow=3;$("#chartPeriod").value="3";}
    if(!asksGoal){activeChart=asksCategory||asksBiggest?"categories":asksBalance?"balance":"flow";if(asksTrend){chartStyle="line";$("#chartStyle").value="line";}analysisView="explore";renderAnalysis();}
    const month=currentRows(),rangeRows=periodRows(monthBuckets(chartWindow)),rows=currentOnly?month:rangeRows,totals=sum(rows),expenses=rows.filter(r=>r.type!=="entrada"),cats=byCategory(expenses);let answer="",source="Calculado localmente neste navegador";
    if(asksGoal){if(!goals.length)answer="Você ainda não criou metas. Abra “Metas financeiras”, escolha um objetivo e informe o valor que quer alcançar.";else{const completed=goals.filter(goal=>Number(goal.current)>=Number(goal.target)).length,open=goals.length-completed,remaining=goals.reduce((total,goal)=>total+Math.max(0,Number(goal.target)-Number(goal.current)),0);const next=goals.filter(goal=>Number(goal.current)<Number(goal.target)&&goal.dueDate).sort((a,b)=>a.dueDate.localeCompare(b.dueDate))[0];answer="Você tem "+goals.length+" metas: "+completed+" concluída(s) e "+open+" em andamento. Falta completar "+money(remaining)+" no total."+(next?" O próximo prazo informado é “"+next.name+"”, em "+goalDateLabel(next.dueDate)+".":"");}source="Metas registradas manualmente neste navegador";}else if(!records.length)answer="Ainda não há lançamentos. Importe sua planilha ou adicione um registro para começarmos.";
    else if(asksBiggest){const biggest=expenses.slice().sort((a,b)=>b.amount-a.amount)[0];answer=biggest?"O maior lançamento de despesa encontrado "+(currentOnly?"neste mês":"no período selecionado")+" foi “"+biggest.description+"” ("+(biggest.category||"Sem categoria")+"): "+money(biggest.amount)+", em "+fmtDate(biggest.date)+".":"Não encontrei despesas nos meses selecionados.";source="Verifiquei "+expenses.length+" despesas "+(currentOnly?"do mês atual":"dos últimos "+chartWindow+" meses");}
    else if(asksCategory){answer=cats.length?"As categorias com maior despesa "+(currentOnly?"neste mês":"nos últimos "+chartWindow+" meses")+" são "+cats.slice(0,3).map(c=>c.name+" ("+money(c.value)+")").join(", ")+". O total de despesas no recorte é "+money(totals.out)+".":"Não encontrei despesas categorizadas no período selecionado.";source="Soma local de "+expenses.length+" despesas agrupadas por categoria";}
    else if(asksTrend){const buckets=monthBuckets(chartWindow),first=buckets[0],last=buckets[buckets.length-1],delta=last.out-first.out,pct=first.out?Math.round(Math.abs(delta)/first.out*100):null;answer="As despesas foram "+money(first.out)+" em "+monthLabel(first.date)+" e "+money(last.out)+" em "+monthLabel(last.date)+"."+(delta===0?" O valor ficou igual entre esses meses.":" No último mês, ficaram "+money(Math.abs(delta))+" "+(delta>0?"acima":"abaixo")+" do primeiro"+(pct===null?".":" ("+pct+"%)."));source="Comparação dos totais mensais calculados pelas datas da planilha";}
    else if(asksBalance){const chosen=currentOnly?month:rangeRows;answer=(currentOnly?"Neste mês":"Nos últimos "+chartWindow+" meses")+", encontrei "+money(sum(chosen).in)+" em entradas e "+money(sum(chosen).out)+" em despesas. O saldo líquido calculado é "+money(sum(chosen).in-sum(chosen).out)+".";source="Resumo local de "+chosen.length+" lançamentos";}
    else if(asksFlow){answer=(currentOnly?"Neste mês":"Nos últimos "+chartWindow+" meses")+": entraram "+money(totals.in)+" e saíram "+money(totals.out)+". A diferença entre entradas e despesas é "+money(totals.in-totals.out)+".";source="Soma local de "+rows.length+" lançamentos do período";}
    else answer="Posso comparar a tendência das despesas, listar categorias, encontrar a maior despesa ou somar entradas e saídas. O gráfico foi ajustado para o tema mais próximo da sua pergunta; tente uma dessas opções para ver o cálculo.";
    setTimeout(()=>add(answer,false,source),160);
  }
  $("#addBtn").addEventListener("click",()=>{const f=$("#entryForm");f.reset();f.elements.date.value=dateString(new Date());$("#addDialog").showModal();if(window.gsap&&!window.matchMedia("(prefers-reduced-motion: reduce)").matches)window.gsap.fromTo($("#addDialog .modal-box"),{y:14,autoAlpha:0,scale:.985},{y:0,autoAlpha:1,scale:1,duration:.32,ease:"power2.out"});});
  $("#entryForm").addEventListener("submit",e=>{e.preventDefault();const f=e.currentTarget,d=new FormData(f),amount=parseAmount(d.get("amount")),date=parseDate(d.get("date"));if(!Number.isFinite(amount)||amount<=0||!date){toast("Informe um valor positivo e uma data válida.");return;}records.push({id:"local-"+Date.now(),date:dateString(date),description:String(d.get("description")).trim(),category:String(d.get("category")).trim()||"Sem categoria",type:d.get("type"),amount:Math.abs(amount),account:String(d.get("account")).trim()||"Conta principal"});records.sort((a,b)=>b.date.localeCompare(a.date));persist();render();$("#addDialog").close();toast("Lançamento salvo neste navegador.");});
  $("#goalForm").addEventListener("submit",e=>{e.preventDefault();const form=e.currentTarget,fields=form.elements,id=fields.namedItem("goalId").value,name=fields.namedItem("name").value.trim(),type=fields.namedItem("type").value,target=parseAmount(fields.namedItem("target").value),currentText=fields.namedItem("current").value.trim(),current=currentText?parseAmount(currentText):0,dueDate=fields.namedItem("dueDate").value;if(!name||!Number.isFinite(target)||target<=0||!Number.isFinite(current)||current<0||dueDate&&!parseDate(dueDate)){toast("Informe um nome, um valor-alvo positivo e valores válidos.");return;}const goal={id:id||"goal-"+Date.now()+"-"+Math.random().toString(36).slice(2,7),name,type,target:Math.round(target*100)/100,current:Math.round(current*100)/100,dueDate};const index=goals.findIndex(item=>item.id===id);if(index>=0)goals[index]=goal;else goals.unshift(goal);if(persistGoals()){$("#goalDialog").close();toast(index>=0?"Meta atualizada.":"Meta criada e salva neste navegador.");}}); $("#fileInput").addEventListener("change",e=>{const file=e.target.files&&e.target.files[0];if(!file)return;if(!/\.(csv|tsv)$/i.test(file.name)){toast("Exporte sua planilha como CSV UTF-8 ou TSV.");e.target.value="";return;}file.text().then(text=>{const parsed=parseCSV(text);if(!confirm("Importar "+parsed.length+" registros e substituir os atuais neste navegador?"))return;records=parsed.sort((a,b)=>b.date.localeCompare(a.date));persist();render();toast(parsed.length+" lançamentos importados.");}).catch(err=>toast(err.message||"Não consegui ler esta planilha. Confira o formato.")).finally(()=>e.target.value="");});
  $("#search").addEventListener("input",renderTable);
  $("#chartPeriod").addEventListener("change",renderAnalysis);
  $("#chartStyle").addEventListener("change",renderAnalysis);
  $("#categorySort").addEventListener("change",renderAnalysis); $("#goalFilter").addEventListener("change",renderGoals);
  $("#chatForm").addEventListener("submit",e=>{e.preventDefault();send($("#chatInput").value);$("#chatInput").value="";$("#chatInput").focus();});
  $("#chatInput").addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();$("#chatForm").requestSubmit();}});
  document.addEventListener("click",e=>{
    const view=e.target.closest("[data-analysis-view]");if(view){analysisView=view.dataset.analysisView;renderAnalysis();}
    const chartMode=e.target.closest("[data-chart-mode]");if(chartMode){activeChart=chartMode.dataset.chartMode;renderAnalysis();}
    const action=e.target.closest("[data-action]");if(action){const name=action.dataset.action;
      if(name==="import")$("#fileInput").click();
      if(name==="export"){downloadCSV(records,"lancamentos-clareza.csv");toast("Arquivo CSV exportado.");}
      if(name==="template"){downloadCSV([],"modelo-lancamentos.csv");toast("Modelo CSV baixado.");}
      if(name==="play-demo")$("#demoDialog").showModal();
      if(name==="close-demo"){ $("#demoVideo").pause();$("#demoDialog").close(); }
      if(name==="close-add")$("#addDialog").close(); if(name==="add-goal")openGoalDialog(null,false); if(name==="close-goal")$("#goalDialog").close(); if(name==="edit-goal"||name==="contribute-goal"){const goal=goals.find(item=>item.id===action.dataset.goalId);if(goal)openGoalDialog(goal,name==="contribute-goal");} if(name==="delete-goal"){const goal=goals.find(item=>item.id===action.dataset.goalId);if(goal&&confirm("Excluir a meta “"+goal.name+"”?")){goals=goals.filter(item=>item.id!==goal.id);persistGoals();toast("Meta excluída.");}}
      if(name==="ask-insight"){send("Quais categorias pesaram mais?");if(innerWidth<=1050)$("#chat").classList.add("open");}
      if(name==="ask-chart"){const q=activeChart==="categories"?"Quais categorias pesaram mais nos últimos "+chartWindow+" meses?":activeChart==="balance"?"Quanto sobrou nos últimos "+chartWindow+" meses?":"Como variaram minhas despesas nos últimos "+chartWindow+" meses?";send(q);if(innerWidth<=1050)$("#chat").classList.add("open");}
      if(name==="toggle-data"){const table=$("#chartDataTable"),expanded=action.getAttribute("aria-expanded")!=="true";table.hidden=!expanded;action.setAttribute("aria-expanded",String(expanded));action.innerHTML=expanded?'Ocultar dados do gráfico <span>−</span>':'Ver dados do gráfico <span>＋</span>';}
      if(name==="show-example"){ $("#demoVideo").pause();$("#demoDialog").close();send("Qual foi meu maior gasto neste mês?");if(innerWidth<=1050)$("#chat").classList.add("open");}
      if(name==="toggle-chat")$("#chat").classList.toggle("open");
      if(name==="clear-chat"){$("#messages").innerHTML='<div class="date-line"><span>HOJE</span></div>';toast("Conversa limpa. Seus dados continuam salvos.");}
    }
    const question=e.target.closest("[data-question]");if(question){send(question.dataset.question);if(innerWidth<=1050)$("#chat").classList.add("open");}
    const del=e.target.closest("[data-delete]");if(del){const row=records.find(x=>String(x.id)===del.dataset.delete);if(row&&confirm("Excluir “"+row.description+"”?")){records=records.filter(x=>String(x.id)!==del.dataset.delete);persist();render();toast("Lançamento excluído.");}}
  });
  $("#demoDialog").addEventListener("click",e=>{if(e.target===$("#demoDialog"))$("#demoDialog").close();});
  $("#addDialog").addEventListener("click",e=>{if(e.target===$("#addDialog"))$("#addDialog").close();}); $("#goalDialog").addEventListener("click",e=>{if(e.target===$("#goalDialog"))$("#goalDialog").close();});
  $("#demoVideo").addEventListener("ended",()=>{const b=$("[data-action=show-example]");b.classList.add("pulse");setTimeout(()=>b.classList.remove("pulse"),900);});
  render();renderGoals();
  if(!window.matchMedia("(prefers-reduced-motion: reduce)").matches){
    if(window.gsap)window.gsap.from(".welcome,.onboarding-strip,.summary,.insight-card,.analysis-shell,.goals-shell,.table-card",{opacity:0,y:15,duration:.46,ease:"power2.out",stagger:.065,clearProps:"transform,opacity"});
    if(window.anime?.animate)window.anime.animate($$(".metric"),{opacity:[0,1],y:[8,0],delay:window.anime.stagger(55),duration:400,ease:"outQuad"});
  }
  if(new URLSearchParams(location.search).get("example")==="1"){send("Quais categorias pesaram mais?");if(innerWidth<=1050)$("#chat").classList.add("open");}

})();
