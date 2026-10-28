// Dekk-Keyp feed. /?size=225/55R17  /?ean=4019238082944  /?size=...&debug=1
const COLS=['ID','Type','Name','Stock','Regular price','Sale price','Product URL','SKU',
'No of Sales','Attributes','Categories','Tags','Status','Fjarlagur','Tøkt íalt','Goymsluprísur'];
const FIELDS='id,type,name,manage_stock,stock_quantity,stock_status,regular_price,sale_price,permalink,sku,total_sales,attributes,categories,tags,meta_data';
const WANT=['pa_breidd','pa_profil','pa_tvormal','pa_arstid','pa_load-index','pa_speed-index'];
const REMOTE=['fjargoym','fjarlag','tokt','tøkt','remote_stock','remote_qty','supplier_stock',
'warehouse','extern','ekstern','lager_total','total_stock','stock_total','disponib','available_qty'];

const cell=v=>{const s=v==null?'':String(v);return /[",\n\r]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;};
const row=a=>a.map(cell).join(',');
const num=v=>{const n=parseInt(String(v==null?'':v).replace(/[^0-9]/g,''),10);return isFinite(n)?n:null;};

function amap(p){const m={};for(const a of p.attributes||[]){const s=a.slug||'';if(!s)continue;
  const v=Array.isArray(a.options)?a.options.join('|'):(a.option||'');if(v!=='')m[s]=String(v);}return m;}

function mnum(p,pats){for(const pat of pats)for(const m of p.meta_data||[]){
  if(String(m.key||'').toLowerCase().indexOf(pat)<0)continue;
  if(m.value&&typeof m.value==='object')continue;
  const n=parseFloat(String(m.value==null?'':m.value).replace(/[^0-9.\-]/g,''));
  if(isFinite(n)&&n>0)return String(Math.round(n));}return '';}

function prow(p){const am=amap(p),r=mnum(p,REMOTE);
  const stock=(p.manage_stock&&p.stock_quantity!=null)?p.stock_quantity:(p.stock_status||'');
  return [p.id,p.type,p.name,stock,p.regular_price,p.sale_price,p.permalink,p.sku,p.total_sales,
    WANT.filter(k=>am[k]).map(k=>k+': '+am[k]).join(', '),
    (p.categories||[]).map(c=>c.name).join('|'),(p.tags||[]).map(t=>t.name).join('|'),
    p.stock_status,r,r,mnum(p,['goymsluprisur','goymslu_prisur','goymslupris'])];}

async function wc(env,qs){
  const res=await fetch(String(env.WC_SITE).replace(/\/+$/,'')+'/wp-json/wc/v3/products?'+qs,
    {headers:{Authorization:'Basic '+btoa(env.WC_KEY+':'+env.WC_SECRET),Accept:'application/json',
    'User-Agent':'Dekk-Keyp-Prisroknari/2.0'}});
  if(!res.ok)throw new Error('WooCommerce '+res.status+' - '+(await res.text()).replace(/\s+/g,' ').slice(0,120));
  return res.json();}

async function search(env,term){const all=[];
  for(let pg=1;pg<=3;pg++){
    const b=await wc(env,'per_page=100&page='+pg+'&status=publish&search='+encodeURIComponent(term)+'&_fields='+encodeURIComponent(FIELDS));
    if(!Array.isArray(b)||!b.length)break;
    for(const p of b)all.push(p);
    if(b.length<100)break;}
  return all;}

async function findSize(env,b,p,t){
  const shapes=[b+'/'+p+'R '+t,b+'/'+p+'R'+t,b+'/'+p+' R'+t,b+'/'+p+' '+t,b+'/'+p];
  let err=null;
  for(const term of shapes){let raw;
    try{raw=await search(env,term);}catch(e){err=e;if(String(e.message).indexOf('429')>-1)throw e;continue;}
    const hit=raw.filter(x=>{const m=amap(x);
      return num(m['pa_breidd'])===b&&num(m['pa_profil'])===p&&num(m['pa_tvormal'])===t;});
    if(hit.length)return{rows:hit,term,raw:raw.length,error:null};}
  return{rows:[],term:null,raw:0,error:err?err.message:null};}

function cors(req,env){const o=req.headers.get('Origin')||'';
  const ok=String(env.ORIGINS||'').split(',').map(s=>s.trim()).filter(Boolean);
  const h={Vary:'Origin','Access-Control-Allow-Methods':'GET, OPTIONS'};
  if(o&&ok.indexOf(o)>-1)h['Access-Control-Allow-Origin']=o;
  else if(ok.indexOf('*')>-1)h['Access-Control-Allow-Origin']='*';
  return h;}

function txt(body,status,c,extra){const h=new Headers(Object.assign(
  {'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'},extra||{}));
  for(const k in c)h.set(k,c[k]);return new Response(body,{status,headers:h});}

const toCsv=rows=>[row(COLS)].concat(rows.map(p=>row(prow(p)))).join('\n');

export default{async fetch(req,env,ctx){
  const c=cors(req,env);
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:c});
  if(!env.WC_KEY||!env.WC_SECRET||!env.WC_SITE)return txt('FEILUR: WC_KEY, WC_SECRET ella WC_SITE vantar.',500,c);
  const u=new URL(req.url),dbg=u.searchParams.get('debug')==='1';

  if(u.pathname==='/keys'){try{
    const arr=await wc(env,'per_page=100&status=publish&_fields=sku,meta_data');
    const seen={};
    for(const p of arr||[])for(const m of p.meta_data||[]){const k=String(m.key||'');
      let v=m.value;if(v&&typeof v==='object')v=JSON.stringify(v);
      v=String(v==null?'':v).replace(/\s+/g,' ');
      if(!seen[k])seen[k]={n:0,num:0,s:v};seen[k].n++;
      const n2=parseFloat(v.replace(/[^0-9.\-]/g,''));
      if(isFinite(n2)&&n2>0&&v.length<12){seen[k].num++;if(seen[k].s.length>12)seen[k].s=v;}}
    const rs=Object.keys(seen).map(k=>({k,d:seen[k]})).sort((a,b)=>(b.d.num-a.d.num)||(b.d.n-a.d.n));
    return txt(rs.map(r=>(r.d.num?'  TAL  ':'       ')+r.k+'  ('+r.d.num+'/'+r.d.n+')  '+r.d.s.slice(0,40)).join('\n')+'\n',200,c);
  }catch(e){return txt('FEILUR: '+e.message,200,c);}}

  const ean=(u.searchParams.get('ean')||'').replace(/[^0-9]/g,'');
  if(ean){try{
    const arr=await wc(env,'sku='+encodeURIComponent(ean)+'&status=publish&_fields='+encodeURIComponent(FIELDS));
    return txt(toCsv(arr||[]),200,c,{'X-Dekk-Rows':String((arr||[]).length)});
  }catch(e){return txt('FEILUR: '+e.message,502,c);}}

  const raw=(u.searchParams.get('size')||'').trim();
  if(!raw)return txt('Dekk-Keyp feed.\n\n  /?size=225/55R17\n  /?ean=4019238082944\n  /?size=225/55R17&debug=1\n  /keys\n',200,c);
  const m=raw.replace(/\s+/g,'').match(/^(\d{2,3})[\/\-]?(\d{2,3})[-rR]*(\d{2})$/);
  if(!m)return txt('FEILUR: skilji ikki stoddina. Doemi: 225/55R17',400,c);
  const b=+m[1],p=+m[2],t=+m[3],key='s:'+b+'-'+p+'-'+t;

  if(env.FEED&&!dbg){const hit=await env.FEED.get(key,{type:'text'});
    if(hit)return txt(hit,200,c,{'X-Dekk-Cache':'hit'});}

  try{
    const f=await findSize(env,b,p,t),csv=toCsv(f.rows);
    if(dbg)return txt('Stodd: '+b+'/'+p+'R'+t+'\nFundin: '+f.rows.length+' dekk\nLeitiord: '
      +(f.term||'(einki rakti)')+'\nRasvar: '+f.raw+' vorur aftur\n'
      +(f.error?'Feila: '+f.error+'\n':'')+'\n'+csv+'\n',200,c);
    if(env.FEED&&f.rows.length)ctx.waitUntil(env.FEED.put(key,csv,{expirationTtl:180}).catch(()=>{}));
    return txt(csv,200,c,{'X-Dekk-Rows':String(f.rows.length),'X-Dekk-Cache':'miss'});
  }catch(e){return txt('FEILUR: '+e.message,502,c);}
}};
