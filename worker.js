// Dekk-Keyp feed. /?size=225/55R17  /?ean=4019238082944  /?size=...&debug=1
const COLS=['ID','Type','Name','Stock','Regular price','Sale price','Product URL','SKU',
'No of Sales','Attributes','Categories','Tags','Status','Fjarlagur','Tøkt íalt','Goymsluprísur',
'Kostprísur'];
const FIELDS='id,type,name,manage_stock,stock_quantity,stock_status,regular_price,sale_price,permalink,sku,total_sales,attributes,categories,tags,meta_data';
const WANT=['pa_breidd','pa_profil','pa_tvormal','pa_arstid','pa_load-index','pa_speed-index'];
const REMOTE=['fjargoym','fjarlag','tokt','tøkt','remote_stock','remote_qty','supplier_stock',
'warehouse','extern','ekstern','lager_total','total_stock','stock_total','disponib','available_qty'];
// Kostprisur. Arkid er strikad, so hann ma koma ur WooCommerce. Ordid "cost"
// eina er ov breidt (_wc_cog_cost_total o.l. er HEILA ordrans kostur), so
// teir skarpu nøvnini standa fyrst og verda tikin fyrst. Sí /keys til at
// vita hvat hesin handilin veruliga nevnir tad.
const COST=['_alg_wc_cog_cost','_wc_cog_cost','kostprisur','kostprís','kostpris',
'_cost_price','cost_price','purchase_price','_purchase_price','innkop','indkobspris',
'_cogs_value','cogs','wholesale_price','_cost','kost'];

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

/** Kostprisur. Eins og mnum, men sleppur undan "_wc_cog_cost_total" og
 *  slikum - tad er heila ordrans kostur, ikki kosturin a einum dekki. */
function cost(p){
  for(const pat of COST)for(const m of p.meta_data||[]){
    const k=String(m.key||'').toLowerCase();
    if(k.indexOf(pat)<0)continue;
    if(/total|subtotal|qty|quantity|margin|profit|percent/.test(k))continue;
    if(m.value&&typeof m.value==='object')continue;
    const n=parseFloat(String(m.value==null?'':m.value).replace(/[^0-9.\-]/g,''));
    if(isFinite(n)&&n>0)return String(Math.round(n*100)/100);}
  return '';}

function prow(p){const am=amap(p),r=mnum(p,REMOTE);
  const stock=(p.manage_stock&&p.stock_quantity!=null)?p.stock_quantity:(p.stock_status||'');
  return [p.id,p.type,p.name,stock,p.regular_price,p.sale_price,p.permalink,p.sku,p.total_sales,
    WANT.filter(k=>am[k]).map(k=>k+': '+am[k]).join(', '),
    (p.categories||[]).map(c=>c.name).join('|'),(p.tags||[]).map(t=>t.name).join('|'),
    p.stock_status,r,r,mnum(p,['goymsluprisur','goymslu_prisur','goymslupris']),
    cost(p)];}

const UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
  +'(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const nap=ms=>new Promise(r=>setTimeout(r,ms));
async function wc(env,qs,path){
  for(let a=0;;a++){
    const res=await fetch(String(env.WC_SITE).replace(/\/+$/,'')+'/wp-json/wc/v3/'+(path||'products')+'?'+qs,
      {headers:{Authorization:'Basic '+btoa(env.WC_KEY+':'+env.WC_SECRET),
      Accept:'application/json, text/plain, */*',
      'Accept-Language':'fo,da;q=0.9,en;q=0.8',
      // A UA that says "Cloudflare Worker" is what Bot Fight Mode blocks on
      // sight. This is the same request either way - only the label changes.
      'User-Agent':UA,'Referer':String(env.WC_SITE||'')}});
    if(res.ok){
      // Don't trust content-type - just try to read it. A bot-challenge or a
      // WordPress error page comes back 200 with HTML, and a bare res.json()
      // would fail with something unreadable.
      const t=await res.text();
      try{return JSON.parse(t);}
      catch(e){throw new Error('WooCommerce sendi ikki JSON (bot-vernd ella challenge-sida): '
        +t.replace(/\s+/g,' ').slice(0,90));}}
    // 429/5xx is usually the rate limiter easing off in a second or two
    if([429,500,502,503,504].indexOf(res.status)>-1&&a<2){
      const ra=parseInt(res.headers.get('Retry-After')||'',10);
      await nap(isFinite(ra)&&ra>0?Math.min(ra*1000,6000):1500*(a+1));
      continue;}
    throw new Error('WooCommerce '+res.status+' - '+(await res.text()).replace(/\s+/g,' ').slice(0,120));}}

// ---- Store-API ------------------------------------------------------------
// "search" er eitt LIKE-uppslag yvir 20.000 vorur. Tad er tad einasta sum
// verdur steðgað (/diag visti: 200, 401, 200 - bert leitingin brestur).
//
// wc/v3 kann BERT filtrera eftir einum eginleika - eitt kent WooCommerce-
// mark (issue #18221, #19165): fleiri attribute-paor gevur allar vorurnar.
// Store-API'ið kann filtrera eftir ollum trimum i senn:
//   /wc/store/v1/products?attributes[0][attribute]=pa_breidd
//                        &attributes[0][slug]=225 ... &attribute_relation=and
// Tad er somuleiðis UTTAN heimild, so tad rennur ikki i nykil-vegin.
//
// Tvey stig, tveir fyrispurningar, eingin "search":
//   1. Store-API -> id-ini fyri eina stodd  (1 fyrispurningur)
//   2. wc/v3 ?include=<id> -> full data vid meta_data/fjargoymslu (1 fyrisp.)
async function store(env,qs){
  for(let a=0;;a++){
    const res=await fetch(String(env.WC_SITE).replace(/\/+$/,'')+'/wp-json/wc/store/v1/'+qs,
      {headers:{Accept:'application/json','Accept-Language':'fo,da;q=0.9,en;q=0.8',
      'User-Agent':UA,Referer:String(env.WC_SITE||'')}});
    if(res.ok){const t=await res.text();
      try{return JSON.parse(t);}
      catch(e){throw new Error('Store-API sendi ikki JSON: '+t.replace(/\s+/g,' ').slice(0,90));}}
    if([429,500,502,503,504].indexOf(res.status)>-1&&a<2){
      const ra=parseInt(res.headers.get('Retry-After')||'',10);
      await nap(isFinite(ra)&&ra>0?Math.min(ra*1000,6000):1200*(a+1));
      continue;}
    throw new Error('Store-API '+res.status+' - '+(await res.text()).replace(/\s+/g,' ').slice(0,120));}}

/** Store-API: id-ini fyri eina stodd. trio = [[taxonomy,slug],...] */
async function storeIds(env,trio){
  const out=[];
  for(let pg=1;pg<=3;pg++){
    let qs='products?per_page=100&page='+pg+'&attribute_relation=and&_fields=id';
    for(let i=0;i<trio.length;i++)
      qs+='&attributes['+i+'][attribute]='+encodeURIComponent(trio[i][0])
        +'&attributes['+i+'][slug]='+encodeURIComponent(trio[i][1]);
    const b=await store(env,qs);
    if(!Array.isArray(b)||!b.length)break;
    for(const x of b)if(x&&x.id)out.push(x.id);
    if(b.length<100)break;}
  return out;}

/** wc/v3 ?include= : full data fyri bert tey id-ini. 100 i senn. */
async function byIds(env,ids){
  const out=[];
  for(let i=0;i<ids.length&&i<300;i+=100){
    const b=await wc(env,'per_page=100&status=publish&include='+ids.slice(i,i+100).join(',')
      +'&_fields='+encodeURIComponent(FIELDS));
    if(Array.isArray(b))for(const p of b)out.push(p);}
  return out;}

// ---- eginleika-filtur (nodloysn) ------------------------------------------
// Um Store-API'ið ikki er har, filtrera vit eftir pa_breidd aleina gjognum
// wc/v3. Tad er ein indekseradur taxonomy-fyrispurningur - ikki ein LIKE -
// men hann gevur ALLA breiddina, so tad eru fleiri siður. Id-ini broytast
// ikki, so tey verda goymd i KV i eitt samdogur.

async function cached(env,key,ttl,make){
  if(env.FEED){const v=await env.FEED.get(key);if(v)return v==='-'?null:v;}
  const got=await make();
  if(env.FEED)await env.FEED.put(key,got==null?'-':String(got),{expirationTtl:ttl});
  return got;}

/** Id'ið fyri ein eginleika, t.d. pa_breidd. WooCommerce skrivar slug'in
 *  bæði sum "pa_breidd" og "breidd" eftir sum, so vit kanna baðar. */
async function attrId(env,tax){
  const v=await cached(env,'attr:'+tax,86400,async function(){
    const bare=String(tax).replace(/^pa_/,'').toLowerCase();
    for(const a of (await wc(env,'per_page=100','products/attributes'))||[]){
      const s=String(a.slug||'').toLowerCase();
      if(s===String(tax).toLowerCase()||s===bare)return a.id;}
    return null;});
  return v==null?null:+v;}

const breiddAttrId=env=>attrId(env,'pa_breidd');

/** Veruligi term-slug'urin fyri eitt virði, t.d. pa_breidd=225 -> "225".
 *  Bert brukt um Store-API'ið gav tomt vid talinum sum slug. */
async function slugFor(env,tax,val){
  return cached(env,'slug:'+tax+':'+val,86400,async function(){
    const aid=await attrId(env,tax);
    if(aid==null)return null;
    for(const t of await termList(env,aid))
      if(num(t.name)===+val||num(t.slug)===+val)return String(t.slug||'');
    return null;});}

/** Term-listin fyri ein eginleika. Ein lutil tabell - eingin "search". */
async function termList(env,aid){
  const all=[];
  for(let pg=1;pg<=5;pg++){
    const b=await wc(env,'per_page=100&page='+pg,'products/attributes/'+aid+'/terms');
    if(!Array.isArray(b)||!b.length)break;
    for(const x of b)all.push(x);
    if(b.length<100)break;}
  return all;}

async function breiddTermId(env,aid,width){
  return cached(env,'term:'+aid+':'+width,86400,async function(){
    for(const t of await termList(env,aid))
      if(num(t.name)===width||num(t.slug)===width)return t.id;
    return null;});}

/** Every tyre of one width, by indexed attribute query.
 *  Ein breidd kann vera 1.500-3.000 vorur i hesum handli, so 30 siður. */
async function byWidth(env,aid,tid){
  const all=[];
  for(let pg=1;pg<=30;pg++){
    const b=await wc(env,'per_page=100&page='+pg+'&status=publish'
      +'&attribute=pa_breidd&attribute_term='+encodeURIComponent(tid)
      +'&_fields='+encodeURIComponent(FIELDS));
    if(!Array.isArray(b)||!b.length)break;
    for(const p of b)all.push(p);
    if(b.length<100)break;}
  return all;}

async function findSize(env,b,p,t){
  const fits=x=>{const m=amap(x);
    return num(m['pa_breidd'])===b&&num(m['pa_profil'])===p&&num(m['pa_tvormal'])===t;};
  const TRIO=[['pa_breidd',b],['pa_profil',p],['pa_tvormal',t]];
  let serr=null;

  // 1. Store-API + include: oll tryggju eginleikarnir i einum. Normala vegin.
  try{
    let ids=await storeIds(env,TRIO);
    if(!ids.length){
      // Ingi id. Tad kann vera at term-slug'urin ikki er bert talið
      // ("225-2" o.l.), so slaa upp veruligu slug'arnar og royn einaferð aftur.
      const real=[];
      for(const pair of TRIO){
        const s=await slugFor(env,pair[0],pair[1]);
        if(s==null){real.length=0;break;}
        real.push([pair[0],s]);}
      // Somu slug'ar => stoddin finst veruliga ikki. Tomt svar, ikki feila.
      const same=real.length===3&&real.every((x,i)=>String(x[1])===String(TRIO[i][1]));
      if(real.length===3&&!same)ids=await storeIds(env,real);
    }
    if(!ids.length)return{rows:[],term:'store',raw:0,error:null};
    const raw=await byIds(env,ids);
    let rows=raw.filter(fits);
    // Store-API'ið filtreraði longu eftir ollum trimum a servaranum, so um
    // okkara egna filtur tekur alt burtur, er tad okkara filtur sum feilar.
    if(!rows.length&&raw.length)rows=raw;
    return{rows:rows,term:'store',raw:raw.length,error:null};
  }catch(e){serr=e.message;}

  // 2. Nodloysn: wc/v3 filtur a pa_breidd aleina. Eingin "search" nokrantid.
  try{
    const aid=await breiddAttrId(env);
    if(aid){
      const tid=await breiddTermId(env,aid,b);
      // Eingin term fyri hesa breidd => stoddin finst ikki. Tomt svar.
      if(tid==null)return{rows:[],term:'pa_breidd='+b+' (eingin term)',raw:0,error:serr};
      const raw=await byWidth(env,aid,tid);
      return{rows:raw.filter(fits),term:'pa_breidd='+b,raw:raw.length,error:serr};
    }
  }catch(e){
    throw new Error('Store-API: '+(serr||'-')+' | eginleika-filtur: '+e.message);}
  throw new Error('Store-API: '+(serr||'-')+' | eginleikin pa_breidd fanst ikki');}

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

  // /diag - three calls that separate "blocked before WordPress" from
  // "WooCommerce said no". Shows status and headers for each.
  if(u.pathname==='/diag'){
    const site=String(env.WC_SITE).replace(/\/+$/,'');
    const out=[];
    const SHOW=['server','cf-ray','cf-cache-status','retry-after','x-powered-by',
      'content-type','x-litespeed-cache','x-ratelimit-limit','x-ratelimit-remaining',
      'x-wp-total','www-authenticate'];
    async function probe(label,url,hdrs){
      try{
        const r=await fetch(url,{headers:hdrs});
        const body=(await r.text()).replace(/\s+/g,' ').slice(0,120);
        out.push(label);
        out.push('  status: '+r.status);
        for(const h of SHOW){const v=r.headers.get(h);if(v)out.push('  '+h+': '+v);}
        out.push('  body: '+body);
        out.push('');
      }catch(e){out.push(label);out.push('  FEILUR: '+e.message);out.push('');}
    }
    const BROWSER={'User-Agent':UA,Accept:'application/json'};
    await probe('1. /wp-json/ uttan nykil (skal geva 200)',
      site+'/wp-json/',BROWSER);
    await probe('2. /wc/v3/products uttan nykil (skal geva 401)',
      site+'/wp-json/wc/v3/products?per_page=1',BROWSER);
    const AUTH=Object.assign({Authorization:'Basic '+btoa(env.WC_KEY+':'+env.WC_SECRET)},BROWSER);
    await probe('3. VID nykli, eingin leiting, 1 vora',
      site+'/wp-json/wc/v3/products?per_page=1',AUTH);
    // Which part of the real query is the expensive one?
    const sz=u.searchParams.get('size')||'215/55R17';
    const sm2=sz.replace(/\s+/g,'').match(/^(\d{2,3})[\/\-]?(\d{2,3})[-rR]*(\d{2})$/);
    const term=sm2?(sm2[1]+'/'+sm2[2]+'R '+sm2[3]):'215/55R 17';
    const q=encodeURIComponent(term);
    await probe('4. LEITING + 100 vorur + _fields  (tad sum brestur)',
      site+'/wp-json/wc/v3/products?per_page=100&status=publish&search='+q
      +'&_fields='+encodeURIComponent(FIELDS),AUTH);
    await probe('5. LEITING + 10 vorur + _fields',
      site+'/wp-json/wc/v3/products?per_page=10&status=publish&search='+q
      +'&_fields='+encodeURIComponent(FIELDS),AUTH);
    await probe('6. LEITING + 10 vorur, UTTAN _fields',
      site+'/wp-json/wc/v3/products?per_page=10&status=publish&search='+q,AUTH);
    await probe('7. 100 vorur, EINGIN leiting',
      site+'/wp-json/wc/v3/products?per_page=100&status=publish'
      +'&_fields='+encodeURIComponent(FIELDS),AUTH);
    await probe('8. eginleika-listin (til filtur uttan leiting)',
      site+'/wp-json/wc/v3/products/attributes',AUTH);
    // Tad vit brukja nu: Store-API, oll tryggju eginleikarnir, eingin nykil.
    const b2=sm2?sm2[1]:'215',p2=sm2?sm2[2]:'55',t2=sm2?sm2[3]:'17';
    await probe('9. STORE-API, oll 3 eginleikarnir (tad vit brukja nu)',
      site+'/wp-json/wc/store/v1/products?per_page=100&attribute_relation=and&_fields=id'
      +'&attributes[0][attribute]=pa_breidd&attributes[0][slug]='+b2
      +'&attributes[1][attribute]=pa_profil&attributes[1][slug]='+p2
      +'&attributes[2][attribute]=pa_tvormal&attributes[2][slug]='+t2,BROWSER);
    return txt(out.join('\n'),200,c);
  }

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
