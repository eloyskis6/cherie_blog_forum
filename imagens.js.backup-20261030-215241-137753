/* Chérie / Imagens: preserva o layout dos Posts */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const el = (tag, cls = '', text) => { const x=document.createElement(tag);x.className=cls;if(text!==undefined)x.textContent=text;return x; };
  let page=1,sort='recentes',search='',current=null,user=null;
  const stickers=[[':cherie_curledup:','cherie%20stickers/curledup.png'],[':cherie_naughty:','cherie%20stickers/naughty.png'],[':cherie_love:','cherie%20stickers/love.png'],[':cherie_throwingup:','cherie%20stickers/throwingup.png']];
  const say = message => { $('forum-feedback').textContent=message||''; };
  async function api(url,method='GET',body) {
    const opts={method,credentials:'same-origin',cache:'no-store'};
    if(body!==undefined){opts.headers={'Content-Type':'application/json'};opts.body=JSON.stringify(body);}
    const response=await fetch(url,opts),data=await response.json().catch(()=>({}));
    if(!response.ok)throw Error(data.message||`Erro HTTP ${response.status}`);
    return data;
  }
  function rich(value) {
    const box=el('div','post-body');
    const pattern=/(:cherie_curledup:|:cherie_naughty:|:cherie_love:|:cherie_throwingup:)/g;
    for(const part of String(value||'').split(pattern)) {
      const found=stickers.find(x=>x[0]===part);
      if(found){const img=el('img','cat-sticker');img.src=found[1];img.alt='Figurinha Chérie';img.loading='lazy';box.append(img);}
      else box.append(document.createTextNode(part));
    }
    return box;
  }
  function stickerBars(){
    document.querySelectorAll('.sticker-bar').forEach(bar=>{
      const target=$(bar.dataset.target);if(!target)return;
      const toggle=el('button','sticker-toggle','Figurinhas');toggle.type='button';toggle.setAttribute('aria-expanded','false');
      const menu=el('div','sticker-menu');menu.hidden=true;menu.append(el('div','sticker-menu-title','Lista de figurinhas'));
      const grid=el('div','sticker-grid');
      stickers.forEach(([token,src])=>{const b=el('button','sticker-choice');b.type='button';b.title=token;const img=el('img');img.src=src;img.alt=token;b.append(img);b.onclick=()=>{const start=target.selectionStart,end=target.selectionEnd;target.setRangeText(token,start,end,'end');target.focus();menu.hidden=true;toggle.setAttribute('aria-expanded','false');};grid.append(b);});
      menu.append(grid);toggle.onclick=()=>{menu.hidden=!menu.hidden;toggle.setAttribute('aria-expanded',String(!menu.hidden));};bar.replaceChildren(toggle,menu);
    });
  }
  function author(item){
    const meta=el('div','post-meta');const img=el('img');img.src=item.avatar||'initial.jpeg';img.alt='Avatar';img.onerror=()=>{img.onerror=null;img.src='initial.jpeg';};
    const a=el('a','user-link',item.username);a.href='usuario.html?id='+encodeURIComponent(item.author_id);
    const time=el('span','',item.created_at||'');meta.append(img,a,time);return meta;
  }
  function votes(item,kind){
    const wrap=el('div','content-votes');const up=el('button','vote-arrow','▲'),down=el('button','vote-arrow','▼');const score=el('strong','vote-score',String((item.upvotes||0)-(item.downvotes||0)));
    [up,down].forEach((b,i)=>{const v=i===0?1:-1;b.type='button';b.classList.toggle('active',item.my_vote===v);b.onclick=async()=>{if(!user){say('Entre na sua conta para votar.');return;}try{const data=await api('/api/images/vote','POST',{kind,id:item.id,vote:item.my_vote===v?0:v});item.my_vote=data.my_vote;item.upvotes=data.upvotes;item.downvotes=data.downvotes;up.classList.toggle('active',item.my_vote===1);down.classList.toggle('active',item.my_vote===-1);score.textContent=String(data.upvotes-data.downvotes);}catch(e){say(e.message);}};});
    wrap.append(up,score,down,el('span','vote-details','Votos'));return wrap;
  }
  function remove(item,kind){
    if(!user||(Number(item.author_id)!==Number(user.id)&&user.username.toLowerCase()!=='eloyse'))return null;
    const b=el('button','posts-metal-button delete-content-button','✕ Excluir');b.type='button';b.onclick=async()=>{
      if(!confirm(kind==='image'?'Excluir esta publicação, todas as imagens e comentários?':'Excluir este comentário?'))return;
      b.disabled=true;try{await api((kind==='image'?'/api/images':'/api/images/comment')+'?id='+item.id,'DELETE');if(kind==='image'){current=null;history.replaceState(null,'','imagens.html');await feed();}else await detail(current);}catch(e){say(e.message);b.disabled=false;}
    };return b;
  }
  function card(item,expanded=false){
    const box=el('article','post-card');box.append(el('div','post-card-head','Publicações com imagens'));
    const body=el('div','post-content');const title=el('h2','post-title');
    if(expanded)title.textContent=item.title;else{const a=el('a','',item.title);a.href='imagens.html?id='+item.id;title.append(a);}
    body.append(title,author(item),rich(item.body));
    const grid=el('div','image-grid');(item.images||[]).forEach(v=>{
      const fig=el('figure');const a=el('a');a.href=v.url;a.target='_blank';a.rel='noopener noreferrer';
      const img=el('img');img.src=v.url;img.alt=v.original_name;img.loading='lazy';a.append(img);
      const label=el('figcaption','',v.original_name);fig.append(a,label);grid.append(fig);
    });body.append(grid,votes(item,'image'));
    const del=remove(item,'image');if(del)body.append(del);
    box.append(body);
    if(!expanded){const footer=el('div','post-actions');const a=el('a','',`Comentários (${item.comment_count||0}) →`);a.href='imagens.html?id='+item.id;footer.append(a);box.append(footer);}
    return box;
  }
  function commentCard(item){const box=el('article','comment-card');box.append(author(item),rich(item.body),votes(item,'comment'));const del=remove(item,'comment');if(del)box.append(del);return box;}
  function displayDetail(yes){$('post-detail').hidden=!yes;$('images-feed').hidden=yes;$('pagination').hidden=yes;}
  async function feed(){
    displayDetail(false);$('compose-panel').hidden=true;say('Carregando imagens...');
    try{const q=new URLSearchParams({page:String(page),sort,search});const data=await api('/api/images?'+q);const container=$('images-feed');container.replaceChildren();if(!data.posts.length)container.append(el('div','empty-posts',search?'Nenhuma imagem encontrada.':'Ainda não há imagens publicadas.'));data.posts.forEach(p=>container.append(card(p)));$('page-label').textContent='Página '+page;$('prev-page').disabled=page===1;$('next-page').disabled=!data.has_more;say('');}catch(e){say(e.message);}
  }
  async function detail(id){
    current=id;displayDetail(true);say('Carregando publicação...');
    try{const data=await api('/api/image?id='+id);$('detail-content').replaceChildren(card(data.post,true));$('comments-list').replaceChildren(...data.comments.map(commentCard));say('');}catch(e){say(e.message);}
  }
  async function upload(postId,file){
    const url='/api/images/upload?post_id='+encodeURIComponent(postId);
    const response=await fetch(url,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/octet-stream','X-Image-Name':encodeURIComponent(file.name)},body:file});
    const data=await response.json().catch(()=>({}));if(!response.ok)throw Error(data.message||`Erro HTTP ${response.status}`);return data;
  }
  function selected(){const files=[...$('image-files').files];$('image-selected').textContent=files.length?files.map(x=>x.name).join(' | '):'';}
  $('image-files').addEventListener('change',selected);
  $('open-compose').onclick=()=>{$('compose-panel').hidden=!$('compose-panel').hidden;};
  $('cancel-compose').onclick=()=>{$('compose-panel').hidden=true;};
  $('image-form').onsubmit=async event=>{
    event.preventDefault();const files=[...$('image-files').files];if(!files.length||files.length>10){say('Selecione de 1 a 10 imagens.');return;}
    for(const f of files){if(f.size>12*1024*1024){say(`O arquivo ${f.name} excede 12 MB.`);return;}}
    const submit=$('image-submit');submit.disabled=true;let postId=null;
    try{
      const data=await api('/api/images','POST',{title:$('image-title').value,body:$('image-body').value});postId=data.id;
      for(let i=0;i<files.length;i++){say(`Enviando imagem ${i+1} de ${files.length}: ${files[i].name}`);await upload(postId,files[i]);}
      $('image-form').reset();selected();$('compose-panel').hidden=true;page=1;history.replaceState(null,'','imagens.html');await feed();say('Imagens publicadas com sucesso!');
    }catch(e){say(`Falha no envio: ${e.message}. ${postId?'Os arquivos enviados com sucesso podem permanecer na publicação; verifique a lista antes de tentar novamente.':''}`);}finally{submit.disabled=false;}
  };
  $('comment-form').onsubmit=async event=>{event.preventDefault();if(!current)return;try{await api('/api/images/comment','POST',{post_id:current,body:$('comment-body').value});$('comment-body').value='';await detail(current);}catch(e){say(e.message);}};
  $('back-to-posts').onclick=()=>{current=null;history.replaceState(null,'','imagens.html');feed();};
  $('prev-page').onclick=()=>{if(page>1){page--;feed();}};
  $('next-page').onclick=()=>{page++;feed();};
  document.querySelectorAll('.filter-button').forEach(b=>b.onclick=()=>{sort=b.dataset.sort;page=1;document.querySelectorAll('.filter-button').forEach(x=>x.classList.toggle('active',x===b));feed();});
  $('posts-search-form').onsubmit=e=>{e.preventDefault();search=$('posts-search').value.trim();page=1;feed();};
  $('posts-search').addEventListener('search',()=>{search=$('posts-search').value.trim();page=1;feed();});
  stickerBars();
  (async()=>{
    try{user=await api('/api/me');$('forum-username').textContent=user.username;$('forum-avatar').src=user.avatar||'initial.jpeg';}catch(e){$('forum-username').textContent='Visitante';say('Faça login para publicar imagens.');}
    const id=new URLSearchParams(location.search).get('id');if(id&&/^\d+$/.test(id))await detail(Number(id));else await feed();
  })();
})()