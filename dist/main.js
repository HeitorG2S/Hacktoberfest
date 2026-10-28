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
    $("#categoryTotal").textContent=money(totals.out);
    $("#categories").innerHTML=cats.slice(0,5).map((c,i)=>'<div class="cat"><span class="cat-name"><i class="swatch" style="background:'+["#388960","#8dbb9b","#e5b47a","#a6b3cf","#c3a7d0"][i]+'"></i> '+esc(c.name)+'</span><span class="cat-value">'+money(c.value)+'</span><span class="track"><i style="width:'+Math.max(3,totals.out?c.value/totals.out*100:0)+'%;background:'+["#388960","#8dbb9b","#e5b47a","#a6b3cf","#c3a7d0"][i]+'"></i></span></div>').join("")||'<p class="empty">Nenhuma despesa neste mês.</p>';
    renderChart();renderTable();
    $("#dataNotice").textContent=isDemo?"Os valores exibidos são fictícios. Importe sua planilha para começar.":"Sua planilha está salva neste navegador. Os dados não são enviados a um servidor.";
  }
  function renderChart(){
    const base=new Date();base.setDate(1);base.setMonth(base.getMonth()-5);const list=[];
    for(let i=0;i<6;i++){const d=new Date(base.getFullYear(),base.getMonth()+i,1);const rows=records.filter(r=>{const x=parseDate(r.date);return x&&x.getFullYear()===d.getFullYear()&&x.getMonth()===d.getMonth();});list.push({d,...sum(rows)});}
    const max=Math.max(1,...list.map(x=>Math.max(x.in,x.out)));
    const scale=n=>n>=10000?"R$ "+Math.round(n/1000)+" mil":n>=1000?"R$ "+(n/1000).toFixed(1).replace(".",",")+" mil":money(n);
    $("#scaleTop").textContent=scale(max);$("#scaleMid").textContent=scale(max*.5);
    $("#chart").innerHTML=list.map(x=>'<div class="month" title="'+months[x.d.getMonth()]+": entradas "+money(x.in)+" · despesas "+money(x.out)+'"><div class="bars"><i class="bar in" style="height:'+Math.max(2,x.in/max*100)+'%"></i><i class="bar out" style="height:'+Math.max(2,x.out/max*100)+'%"></i></div><small>'+months[x.d.getMonth()]+'</small></div>').join("");
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
    add(q,true);const normalized=norm(q),month=currentRows(),out=month.filter(r=>r.type!=="entrada"),sumMonth=sum(month),cats=byCategory(out);let answer="",source="Resposta calculada localmente";
    if(!records.length)answer="Ainda não há lançamentos. Importe sua planilha ou adicione um registro para começarmos.";
    else if(normalized.includes("maior gasto")||normalized.includes("mais gastei")||normalized.includes("maior despesa")){const biggest=out.slice().sort((a,b)=>b.amount-a.amount)[0];answer=biggest?"Seu maior lançamento de despesa neste mês foi "+biggest.description+" ("+biggest.category+"): "+money(biggest.amount)+", em "+fmtDate(biggest.date)+".":"Não encontrei despesas registradas neste mês.";source="Conferi "+out.length+" despesas do mês atual";}
    else if(normalized.includes("categoria")||normalized.includes("onde gasto")||normalized.includes("pesaram")){answer=cats.length?"As maiores categorias neste mês são "+cats.slice(0,3).map(c=>c.name+" ("+money(c.value)+")").join(", ")+". O total classificado é "+money(sumMonth.out)+".":"Não encontrei despesas categorizadas neste mês.";source="Soma dos lançamentos por categoria";}
    else if(normalized.includes("compar")||normalized.includes("tendencia")){const a=new Date();a.setDate(1);const prior=new Date(a.getFullYear(),a.getMonth()-1,1);const previous=sum(records.filter(r=>{const d=parseDate(r.date);return d&&d.getFullYear()===prior.getFullYear()&&d.getMonth()===prior.getMonth();})).out;const delta=sumMonth.out-previous;answer=previous?"As despesas deste mês somam "+money(sumMonth.out)+"; no mês anterior, foram "+money(previous)+". A diferença foi "+money(Math.abs(delta))+(delta>0?" a mais.":delta<0?" a menos.":"."):"Ainda não há dados do mês anterior para comparar.";source="Comparação feita pelas datas da planilha";}
    else if(/entrada|saiu|saldo|receita|sobrou|quanto|total/.test(normalized)){answer="Neste mês encontrei "+money(sumMonth.in)+" em entradas e "+money(sumMonth.out)+" em despesas. O saldo calculado para esse período é "+money(sumMonth.in-sumMonth.out)+".";source="Resumo de "+month.length+" lançamentos do mês";}
    else answer="Posso resumir entradas e despesas, identificar o maior gasto registrado, listar as categorias com maior valor e comparar os últimos dois meses. Tente uma dessas perguntas sobre seus dados.";
    setTimeout(()=>add(answer,false,source),160);
  }
  $("#addBtn").addEventListener("click",()=>{const f=$("#entryForm");f.reset();f.elements.date.value=dateString(new Date());$("#addDialog").showModal();});
  $("#entryForm").addEventListener("submit",e=>{e.preventDefault();const f=e.currentTarget,d=new FormData(f),amount=parseAmount(d.get("amount")),date=parseDate(d.get("date"));if(!Number.isFinite(amount)||amount<=0||!date){toast("Informe um valor positivo e uma data válida.");return;}records.push({id:"local-"+Date.now(),date:dateString(date),description:String(d.get("description")).trim(),category:String(d.get("category")).trim()||"Sem categoria",type:d.get("type"),amount:Math.abs(amount),account:String(d.get("account")).trim()||"Conta principal"});records.sort((a,b)=>b.date.localeCompare(a.date));persist();render();$("#addDialog").close();toast("Lançamento salvo neste navegador.");});
  $("#fileInput").addEventListener("change",e=>{const file=e.target.files&&e.target.files[0];if(!file)return;if(!/\.(csv|tsv)$/i.test(file.name)){toast("Exporte sua planilha como CSV UTF-8 ou TSV.");e.target.value="";return;}file.text().then(text=>{const parsed=parseCSV(text);if(!confirm("Importar "+parsed.length+" registros e substituir os atuais neste navegador?"))return;records=parsed.sort((a,b)=>b.date.localeCompare(a.date));persist();render();toast(parsed.length+" lançamentos importados.");}).catch(err=>toast(err.message||"Não consegui ler esta planilha. Confira o formato.")).finally(()=>e.target.value="");});
  $("#search").addEventListener("input",renderTable);
  $("#chatForm").addEventListener("submit",e=>{e.preventDefault();send($("#chatInput").value);$("#chatInput").value="";$("#chatInput").focus();});
  $("#chatInput").addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();$("#chatForm").requestSubmit();}});
  document.addEventListener("click",e=>{
    const action=e.target.closest("[data-action]");if(action){const name=action.dataset.action;
      if(name==="import")$("#fileInput").click();
      if(name==="export"){downloadCSV(records,"lancamentos-clareza.csv");toast("Arquivo CSV exportado.");}
      if(name==="template"){downloadCSV([],"modelo-lancamentos.csv");toast("Modelo CSV baixado.");}
      if(name==="play-demo")$("#demoDialog").showModal();
      if(name==="close-demo"){ $("#demoVideo").pause();$("#demoDialog").close(); }
      if(name==="close-add")$("#addDialog").close();
      if(name==="ask-insight"){send("Quais categorias pesaram mais?");if(innerWidth<=1050)$("#chat").classList.add("open");}
      if(name==="show-example"){ $("#demoVideo").pause();$("#demoDialog").close();send("Qual foi meu maior gasto neste mês?");if(innerWidth<=1050)$("#chat").classList.add("open");}
      if(name==="toggle-chat")$("#chat").classList.toggle("open");
      if(name==="clear-chat"){$("#messages").innerHTML='<div class="date-line"><span>HOJE</span></div>';toast("Conversa limpa. Seus dados continuam salvos.");}
    }
    const question=e.target.closest("[data-question]");if(question)send(question.dataset.question);
    const del=e.target.closest("[data-delete]");if(del){const row=records.find(x=>String(x.id)===del.dataset.delete);if(row&&confirm("Excluir “"+row.description+"”?")){records=records.filter(x=>String(x.id)!==del.dataset.delete);persist();render();toast("Lançamento excluído.");}}
  });
  $("#demoDialog").addEventListener("click",e=>{if(e.target===$("#demoDialog"))$("#demoDialog").close();});
  $("#addDialog").addEventListener("click",e=>{if(e.target===$("#addDialog"))$("#addDialog").close();});
  $("#demoVideo").addEventListener("ended",()=>{const b=$("[data-action=show-example]");b.classList.add("pulse");setTimeout(()=>b.classList.remove("pulse"),900);});
  render();
  if(new URLSearchParams(location.search).get("example")==="1"){send("Quais categorias pesaram mais?");if(innerWidth<=1050)$("#chat").classList.add("open");}

})();
