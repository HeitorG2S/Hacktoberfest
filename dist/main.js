(() => {
  "use strict";
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const KEY = "clareza-financeiro-v1";
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
    const shell=$(".analysis-shell");if(!shell)return;shell.dataset.analysisView=analysisView;
    $(".analysis-mode").querySelectorAll("button[data-analysis-view]").forEach(button=>{const active=button.dataset.analysisView===analysisView;button.classList.toggle("is-active",active);button.setAttribute("aria-selected",String(active));});
    $$("[data-chart-mode]").forEach(button=>{const active=button.dataset.chartMode===activeChart;button.classList.toggle("is-active",active);button.setAttribute("aria-pressed",String(active));});
    const sortField=$(".category-sort-field"),styleField=$(".chart-style-field");if(sortField)sortField.hidden=activeChart!=="categories";if(styleField)styleField.hidden=activeChart==="categories";
  }
  function updateChartTable(headers,rows){
    $("#chartDataHead").innerHTML="<tr>"+headers.map(h=>"<th>"+esc(h)+"</th>").join("")+"</tr>";
    $("#chartDataBody").innerHTML=rows.length?rows.map(row=>"<tr>"+row.map(cell=>"<td>"+esc(cell)+"</td>").join("")+"</tr>").join(""):'<tr><td colspan="'+headers.length+'" class="empty">Sem valores neste recorte.</td></tr>';
  }
  function renderAnalysis(){
    const periodSelect=$("#chartPeriod"),styleSelect=$("#chartStyle"),sortSelect=$("#categorySort");
    if(periodSelect)chartWindow=Number(periodSelect.value)||chartWindow;if(styleSelect)chartStyle=styleSelect.value;if(sortSelect)categorySort=sortSelect.value;
    updateAnalysisControls();
    const buckets=monthBuckets(chartWindow),rows=periodRows(buckets),totals=sum(rows),categories=byCategory(rows.filter(r=>r.type!=="entrada"));
    const periodLabel="Últimos "+chartWindow+" meses",hasRows=rows.length>0;
    $("#graphRange").textContent=periodLabel;$("#analysisSubtitle").textContent=analysisView==="summary"?"Resumo calculado com os lançamentos carregados neste navegador.":"Explore períodos, categorias e valores exatos dos seus lançamentos.";
    let labels=[],datasets=[],tableRows=[],hasChartData=hasRows;
    if(activeChart==="categories"){
      const sorted=categories.slice().sort((a,b)=>categorySort==="asc"?a.value-b.value:b.value-a.value),top=sorted.slice(0,9),rest=sorted.slice(9);
      if(rest.length)top.push({name:"Outras categorias",value:rest.reduce((a,c)=>a+c.value,0)});
      labels=top.map(c=>c.name);datasets=[{label:"Despesas",data:top.map(c=>c.value),backgroundColor:top.map((_,i)=>["#16815d","#44a67c","#77b990","#a9cda9","#e7b778","#d98e75","#8ca4bd","#a78db5","#bac5a2","#85958d"][i%10]),borderRadius:6,barThickness:16}];
      tableRows=top.map(c=>[c.name,money(c.value),totals.out?Math.round(c.value/totals.out*100)+"%":"0%"]);hasChartData=top.length>0;
      $("#graphEyebrow").textContent="DISTRIBUIÇÃO DAS DESPESAS";$("#graphTitle").textContent="Despesas por categoria";$("#graphSummary").textContent="Categorias somadas no período selecionado.";
      $("#graphInsightTitle").textContent="Onde o dinheiro pesou mais";
      $("#graphInsight").textContent=top.length?"“"+top[0].name+"” lidera com "+money(top[0].value)+(totals.out?" ("+Math.round(top[0].value/totals.out*100)+"% das despesas).":".")+" Use “Explorar dados” para mudar a ordem e conferir cada valor.":"Ainda não há despesas no período escolhido.";
      updateChartTable(["Categoria","Despesas","Participação"],tableRows);
    }else if(activeChart==="balance"){
      labels=buckets.map(b=>monthLabel(b.date));datasets=[{label:"Saldo mensal",data:buckets.map(b=>b.balance),borderColor:"#16815d",backgroundColor:"#16815d18",pointBackgroundColor:buckets.map(b=>b.balance>=0?"#16815d":"#d57363"),pointBorderColor:"#fff",pointRadius:3,pointHoverRadius:5,borderWidth:2,fill:chartStyle==="line",tension:.32}];
      tableRows=buckets.map(b=>[monthLabel(b.date),money(b.in),money(b.out),money(b.balance)]);$("#graphEyebrow").textContent="ENTRADAS MENOS DESPESAS";$("#graphTitle").textContent="Saldo ao longo do tempo";$("#graphSummary").textContent="Saldo mensal calculado a partir das entradas e despesas registradas.";
      const positive=buckets.filter(b=>b.balance>0).length;$("#graphInsightTitle").textContent="Leitura do saldo";$("#graphInsight").textContent=hasRows?"O saldo acumulado do período é "+money(totals.in-totals.out)+". Em "+positive+" de "+buckets.length+" meses o resultado mensal ficou positivo.":"Ainda não há lançamentos no período escolhido.";
      updateChartTable(["Mês","Entradas","Despesas","Saldo"],tableRows);
    }else{
      labels=buckets.map(b=>monthLabel(b.date));datasets=chartStyle==="line"?[
        {label:"Entradas",data:buckets.map(b=>b.in),borderColor:"#16815d",backgroundColor:"#16815d18",pointBackgroundColor:"#16815d",pointRadius:3,borderWidth:2,fill:false,tension:.32},
        {label:"Despesas",data:buckets.map(b=>b.out),borderColor:"#d57363",backgroundColor:"#d5736318",pointBackgroundColor:"#d57363",pointRadius:3,borderWidth:2,fill:false,tension:.32}
      ]:[
        {label:"Entradas",data:buckets.map(b=>b.in),backgroundColor:"#16815d",borderRadius:5,maxBarThickness:28},
        {label:"Despesas",data:buckets.map(b=>b.out),backgroundColor:"#e1a191",borderRadius:5,maxBarThickness:28}
      ];
      tableRows=buckets.map(b=>[monthLabel(b.date),money(b.in),money(b.out),money(b.balance)]);$("#graphEyebrow").textContent=chartStyle==="line"?"TENDÊNCIA MENSAL":"ENTRADAS E DESPESAS";$("#graphTitle").textContent=chartStyle==="line"?"Tendência do fluxo financeiro":"Comparação mensal";$("#graphSummary").textContent="Selecione um ponto ou coluna para ver os valores daquele mês.";
      const peak=buckets.slice().sort((a,b)=>b.out-a.out)[0];$("#graphInsightTitle").textContent="Visão do período";$("#graphInsight").textContent=hasRows?"Entraram "+money(totals.in)+" e saíram "+money(totals.out)+"; o saldo líquido foi "+money(totals.in-totals.out)+"."+(peak&&peak.out?" O maior total de despesas foi em "+monthLabel(peak.date)+" ("+money(peak.out)+").":""):"Ainda não há lançamentos no período escolhido.";
      updateChartTable(["Mês","Entradas","Despesas","Saldo"],tableRows);
    }
    $("#periodExpense").textContent=money(totals.out);$("#periodBalance").textContent=money(totals.in-totals.out);$("#periodCount").textContent=rows.length;
    const chartEmpty=$("#chartEmpty");chartEmpty.hidden=hasChartData&&Boolean(window.Chart);chartEmpty.textContent=!window.Chart?"O gráfico não carregou. Atualize a página para tentar novamente.":hasChartData?"":activeChart==="categories"?"Nenhuma despesa encontrada no período escolhido.":"Nenhum lançamento no período escolhido. Importe uma planilha ou selecione outro período.";$("#financeChart").setAttribute("aria-label",activeChart==="categories"?"Despesas por categoria nos últimos "+chartWindow+" meses":activeChart==="balance"?"Saldo financeiro mensal nos últimos "+chartWindow+" meses":"Comparação de entradas e despesas nos últimos "+chartWindow+" meses");
    if(financeChart){financeChart.destroy();financeChart=null;}
    const canvas=$("#financeChart");
    if(hasChartData&&window.Chart&&canvas){
      const horizontal=activeChart==="categories",isLine=activeChart!=="categories"&&(chartStyle==="line"||activeChart==="balance");
      financeChart=new Chart(canvas,{type:isLine?"line":"bar",data:{labels,datasets},options:{responsive:true,maintainAspectRatio:false,devicePixelRatio:Math.min(window.devicePixelRatio||1,2),animation:{duration:240},interaction:{mode:"index",intersect:false},indexAxis:horizontal?"y":"x",plugins:{legend:{display:activeChart!=="categories",position:"top",align:"end",labels:{usePointStyle:true,pointStyle:"circle",boxWidth:7,boxHeight:7,padding:14,color:"#718078",font:{family:"Inter, system-ui, sans-serif",size:10}}},tooltip:{backgroundColor:"#173f32",padding:10,cornerRadius:8,displayColors:true,callbacks:{label:ctx=>" "+ctx.dataset.label+": "+money(Number(ctx.parsed.x??ctx.parsed.y??0))}}},scales:horizontal?{x:{beginAtZero:true,grid:{color:"#edf1ed"},border:{display:false},ticks:{color:"#87948c",font:{size:9},callback:value=>compactMoney(value)}},y:{grid:{display:false},border:{display:false},ticks:{color:"#647269",font:{size:9},autoSkip:false}}}:{x:{grid:{display:false},border:{display:false},ticks:{color:"#87948c",font:{size:9},maxRotation:0,autoSkip:false}},y:{beginAtZero:activeChart!=="balance",grid:{color:"#edf1ed"},border:{display:false},ticks:{color:"#87948c",font:{size:9},callback:value=>compactMoney(value)}}},onClick:(event,elements,chart)=>{if(!elements.length)return;const index=elements[0].index;if(activeChart==="categories"){const value=chart.data.datasets[0].data[index],name=chart.data.labels[index];$("#chartSelection").textContent=name+" · "+money(value)+" em despesas no período.";}else{const b=buckets[index];$("#chartSelection").textContent=monthLabel(b.date)+" · Entradas "+money(b.in)+" · Despesas "+money(b.out)+" · Saldo "+money(b.balance)+".";}}}});
    }
    $("#chartSelection").textContent="Selecione uma coluna, linha ou ponto para ver os valores exatos.";
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
    const add=(text,user,source)=>{const m=document.createElement("div");m.className="message "+(user?"user":"assistant");m.innerHTML='<span class="msg-avatar">'+(user?"V":"✳")+'</span><div class="bubble"><p></p>'+(source?'<small class="source">'+esc(source)+'</small>':"")+'</div>';$("p",m).textContent=text;$("#messages").appendChild(m);$("#messages").scrollTop=$("#messages").scrollHeight;};
    add(q,true);const normalized=norm(q),asksCategory=/categoria|onde gasto|pesaram|distribuicao/.test(normalized),asksBalance=/saldo|sobrou|quanto ficou|quanto restou/.test(normalized),asksTrend=/compar|variaram|mudaram|tendencia|evolucao/.test(normalized),asksBiggest=/maior gasto|mais gastei|maior despesa/.test(normalized);
    const monthMatch=normalized.match(/(?:ultimos?|ultimas?)?\s*(3|6|12)\s*mes/);if(monthMatch){chartWindow=Number(monthMatch[1]);$("#chartPeriod").value=String(chartWindow);}else if(/neste mes|este mes|mes atual/.test(normalized)){chartWindow=3;$("#chartPeriod").value="3";}
    activeChart=asksCategory||asksBiggest?"categories":asksBalance?"balance":"flow";if(asksTrend){chartStyle="line";$("#chartStyle").value="line";}analysisView="explore";renderAnalysis();
    const month=currentRows(),selectedRows=periodRows(monthBuckets(chartWindow)),rows=selectedRows,totals=sum(rows),expenses=rows.filter(r=>r.type!=="entrada"),cats=byCategory(expenses);let answer="",source="Calculado localmente neste navegador";
    if(!records.length)answer="Ainda não há lançamentos. Importe sua planilha ou adicione um registro para começarmos.";
    else if(asksBiggest){const biggest=expenses.slice().sort((a,b)=>b.amount-a.amount)[0];answer=biggest?"O maior lançamento de despesa encontrado no período foi “"+biggest.description+"” ("+(biggest.category||"Sem categoria")+"): "+money(biggest.amount)+", em "+fmtDate(biggest.date)+".":"Não encontrei despesas nos meses selecionados.";source="Verifiquei "+expenses.length+" despesas dos últimos "+chartWindow+" meses";}
    else if(asksCategory){answer=cats.length?"As categorias com maior despesa nos últimos "+chartWindow+" meses são "+cats.slice(0,3).map(c=>c.name+" ("+money(c.value)+")").join(", ")+". O total de despesas no período é "+money(totals.out)+".":"Não encontrei despesas categorizadas nos meses selecionados.";source="Soma local de "+expenses.length+" despesas por categoria";}
    else if(asksTrend){const buckets=monthBuckets(chartWindow),first=buckets[0],last=buckets[buckets.length-1],delta=last.out-first.out,pct=first.out?Math.round(Math.abs(delta)/first.out*100):null;answer="As despesas foram "+money(first.out)+" em "+monthLabel(first.date)+" e "+money(last.out)+" em "+monthLabel(last.date)+"."+(delta===0?" O valor ficou igual entre esses meses.":" No último mês, ficaram "+money(Math.abs(delta))+" "+(delta>0?"acima":"abaixo")+" do primeiro"+(pct===null?".":" ("+pct+"%)."));source="Comparação dos valores mensais agrupados pelas datas da planilha";}
    else if(asksBalance){const currentOnly=/neste mes|este mes|mes atual/.test(normalized),chosen=currentOnly?month:rows,totalsChosen=sum(chosen);answer=(currentOnly?"Neste mês":"Nos últimos "+chartWindow+" meses")+", encontrei "+money(totalsChosen.in)+" em entradas e "+money(totalsChosen.out)+" em despesas. O saldo calculado é "+money(totalsChosen.in-totalsChosen.out)+".";source="Resumo de "+chosen.length+" lançamentos carregados localmente";}
    else{answer="O gráfico foi ajustado para mostrar o fluxo dos últimos "+chartWindow+" meses. Posso comparar a tendência, listar categorias, encontrar o maior gasto ou calcular o saldo. Pergunte sobre os lançamentos importados para ver os valores.";source="Leitura local; nenhuma informação enviada a um serviço externo";}
    setTimeout(()=>add(answer,false,source),160);
  }
  $("#addBtn").addEventListener("click",()=>{const f=$("#entryForm");f.reset();f.elements.date.value=dateString(new Date());$("#addDialog").showModal();});
  $("#entryForm").addEventListener("submit",e=>{e.preventDefault();const f=e.currentTarget,d=new FormData(f),amount=parseAmount(d.get("amount")),date=parseDate(d.get("date"));if(!Number.isFinite(amount)||amount<=0||!date){toast("Informe um valor positivo e uma data válida.");return;}records.push({id:"local-"+Date.now(),date:dateString(date),description:String(d.get("description")).trim(),category:String(d.get("category")).trim()||"Sem categoria",type:d.get("type"),amount:Math.abs(amount),account:String(d.get("account")).trim()||"Conta principal"});records.sort((a,b)=>b.date.localeCompare(a.date));persist();render();$("#addDialog").close();toast("Lançamento salvo neste navegador.");});
  $("#fileInput").addEventListener("change",e=>{const file=e.target.files&&e.target.files[0];if(!file)return;if(!/\.(csv|tsv)$/i.test(file.name)){toast("Exporte sua planilha como CSV UTF-8 ou TSV.");e.target.value="";return;}file.text().then(text=>{const parsed=parseCSV(text);if(!confirm("Importar "+parsed.length+" registros e substituir os atuais neste navegador?"))return;records=parsed.sort((a,b)=>b.date.localeCompare(a.date));persist();render();toast(parsed.length+" lançamentos importados.");}).catch(err=>toast(err.message||"Não consegui ler esta planilha. Confira o formato.")).finally(()=>e.target.value="");});
  $("#search").addEventListener("input",renderTable);
  $("#chartPeriod").addEventListener("change",renderAnalysis);
  $("#chartStyle").addEventListener("change",renderAnalysis);
  $("#categorySort").addEventListener("change",renderAnalysis);
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
      if(name==="close-add")$("#addDialog").close();
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
  $("#addDialog").addEventListener("click",e=>{if(e.target===$("#addDialog"))$("#addDialog").close();});
  $("#demoVideo").addEventListener("ended",()=>{const b=$("[data-action=show-example]");b.classList.add("pulse");setTimeout(()=>b.classList.remove("pulse"),900);});
  render();
  if(new URLSearchParams(location.search).get("example")==="1"){send("Quais categorias pesaram mais?");if(innerWidth<=1050)$("#chat").classList.add("open");}

})();
