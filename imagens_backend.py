"""Rotas de imagens Chérie. Requer Pillow (python3-pil)."""
from videos_backend import VideoMixin
from PIL import Image, UnidentifiedImageError
import json
import mimetypes
import os
import re
import secrets
import sqlite3
import subprocess
from pathlib import Path
from urllib.parse import parse_qs, urlsplit, unquote

MAX_IMAGE_UPLOAD_BYTES = 12 * 1024 * 1024
MAX_IMAGE_PIXELS = 30_000_000
IMAGE_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.webp', '.gif'}


def init_image_db(connect, root):
    (root / 'image_uploads').mkdir(exist_ok=True)
    with connect() as db:
        db.executescript('''
        CREATE TABLE IF NOT EXISTS image_posts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            author_id INTEGER NOT NULL REFERENCES usuarios(id),
            title TEXT NOT NULL, body TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
        CREATE TABLE IF NOT EXISTS image_files (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            post_id INTEGER NOT NULL REFERENCES image_posts(id),
            filename TEXT NOT NULL UNIQUE, original_name TEXT NOT NULL,
            width INTEGER NOT NULL, height INTEGER NOT NULL, bytes INTEGER NOT NULL);
        CREATE INDEX IF NOT EXISTS idx_image_files_post ON image_files(post_id);
        CREATE TABLE IF NOT EXISTS image_comments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            post_id INTEGER NOT NULL REFERENCES image_posts(id),
            author_id INTEGER NOT NULL REFERENCES usuarios(id),
            body TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
        CREATE INDEX IF NOT EXISTS idx_image_comments_post ON image_comments(post_id);
        CREATE TABLE IF NOT EXISTS image_votes (
            voter_id INTEGER NOT NULL REFERENCES usuarios(id),
            kind TEXT NOT NULL CHECK(kind IN ('image','comment')),
            target_id INTEGER NOT NULL,
            vote INTEGER NOT NULL CHECK(vote IN (-1,1)),
            PRIMARY KEY(voter_id,kind,target_id));
        ''')


class ImageMixin(VideoMixin):
    def _image_json(self, status, data):
        return self.json_response(status, data)

    def _image_query(self):
        return parse_qs(urlsplit(self.path).query)

    def _image_id(self, key='id'):
        try:
            value = int(self._image_query().get(key, [''])[0])
        except (ValueError, TypeError):
            raise ValueError('ID inválido.')
        if value < 1:
            raise ValueError('ID inválido.')
        return value

    def _image_origin_ok(self):
        origin = self.headers.get('Origin')
        return not origin or origin in ('http://127.0.0.1:8000', 'http://localhost:8000')

    def _image_row(self, db, row, kind, viewer):
        d = dict(row)
        votes = db.execute('SELECT COALESCE(SUM(vote=1),0) upvotes, COALESCE(SUM(vote=-1),0) downvotes FROM image_votes WHERE kind=? AND target_id=?', (kind, d['id'])).fetchone()
        d.update(upvotes=votes['upvotes'], downvotes=votes['downvotes'], my_vote=0)
        if viewer:
            mine = db.execute('SELECT vote FROM image_votes WHERE kind=? AND target_id=? AND voter_id=?', (kind,d['id'],viewer['id'])).fetchone()
            d['my_vote'] = mine['vote'] if mine else 0
        if kind == 'image':
            d['images'] = [dict(x) for x in db.execute('SELECT id,original_name,width,height,bytes,filename FROM image_files WHERE post_id=? ORDER BY id', (d['id'],))]
            for v in d['images']:
                v['url'] = '/image_uploads/' + v.pop('filename')
            d['comment_count'] = db.execute('SELECT COUNT(*) FROM image_comments WHERE post_id=?',(d['id'],)).fetchone()[0]
        return d

    def do_GET(self):
        path = urlsplit(self.path).path
        if path.startswith('/image_uploads/'):
            return self._serve_image(path)
        if path not in ('/api/images','/api/image'):
            return super().do_GET()
        try:
            user = self.current_user()
            with self._image_connect() as db:
                if path == '/api/images':
                    try:
                        page = int(self._image_query().get('page',['1'])[0])
                    except ValueError:
                        raise ValueError('Página inválida.')
                    if not 1 <= page <= 100000: raise ValueError('Página inválida.')
                    sort = self._image_query().get('sort',['recentes'])[0]
                    if sort not in ('recentes','antigos','relevantes'): raise ValueError('Ordenação inválida.')
                    search = self._image_query().get('search',[''])[0].strip()
                    if len(search) > 100: raise ValueError('Busca muito longa.')
                    order = {'recentes':'p.id DESC','antigos':'p.id ASC','relevantes':"(SELECT COALESCE(SUM(vote),0) FROM image_votes WHERE kind='image' AND target_id=p.id) DESC, p.id DESC"}[sort]
                    rows = db.execute(f'''SELECT p.*,u.username,u.avatar FROM image_posts p JOIN usuarios u ON u.id=p.author_id
                    WHERE EXISTS (SELECT 1 FROM image_files f WHERE f.post_id=p.id)
                    AND (?='' OR instr(lower(p.title),lower(?))>0 OR instr(lower(p.body),lower(?))>0)
                    ORDER BY {order} LIMIT 21 OFFSET ?''',(search,search,search,(page-1)*20)).fetchall()
                    return self._image_json(200,{'posts':[self._image_row(db,r,'image',user) for r in rows[:20]],'has_more':len(rows)>20})
                post_id = self._image_id()
                row = db.execute('SELECT p.*,u.username,u.avatar FROM image_posts p JOIN usuarios u ON u.id=p.author_id WHERE p.id=?',(post_id,)).fetchone()
                if not row: return self._image_json(404,'Imagem não encontrada.')
                post = self._image_row(db,row,'image',user)
                comments = db.execute('SELECT c.*,u.username,u.avatar FROM image_comments c JOIN usuarios u ON u.id=c.author_id WHERE c.post_id=? ORDER BY c.id LIMIT 501',(post_id,)).fetchall()
                return self._image_json(200,{'post':post,'comments':[self._image_row(db,r,'comment',user) for r in comments[:500]],'comments_truncated':len(comments)>500})
        except ValueError as e:
            return self._image_json(400,str(e))
        except sqlite3.Error:
            return self._image_json(500,'Erro no banco de imagens.')

    def _image_connect(self):
        from servidor import connect
        return connect()

    def _serve_image(self, path):
        name = path.removeprefix('/image_uploads/')
        if not re.fullmatch(r'[0-9a-f]{32}\.(jpg|jpeg|png|webp|gif)', name):
            return self.send_error(404)
        with self._image_connect() as db:
            exists = db.execute('SELECT 1 FROM image_files WHERE filename=?',(name,)).fetchone()
        if not exists: return self.send_error(404)
        from servidor import ROOT
        file = ROOT / 'image_uploads' / name
        try: size = file.stat().st_size
        except OSError: return self.send_error(404)
        range_header = self.headers.get('Range','')
        start,end = 0,size-1
        if range_header:
            m = re.fullmatch(r'bytes=(\d*)-(\d*)',range_header)
            if not m: return self.send_error(416)
            if m.group(1):
                start = int(m.group(1))
                end = min(int(m.group(2)),size-1) if m.group(2) else size-1
            elif m.group(2):
                start = max(0,size-int(m.group(2)))
            else: return self.send_error(416)
            if start >= size or end < start: return self.send_error(416)
        length = end-start+1
        self.send_response(206 if range_header else 200)
        self.send_header('Content-Type',mimetypes.guess_type(name)[0] or 'application/octet-stream')
        self.send_header('Accept-Ranges','bytes')
        self.send_header('Content-Length',str(length))
        self.send_header('X-Content-Type-Options','nosniff')
        if range_header: self.send_header('Content-Range',f'bytes {start}-{end}/{size}')
        self.end_headers()
        try:
            with file.open('rb') as stream:
                stream.seek(start)
                while length:
                    data = stream.read(min(65536,length))
                    if not data: break
                    self.wfile.write(data)
                    length -= len(data)
        except (BrokenPipeError,ConnectionResetError): pass

    def do_POST(self):
        path = urlsplit(self.path).path
        if path not in ('/api/images','/api/images/upload','/api/images/comment','/api/images/vote'):
            return super().do_POST()
        if not self._image_origin_ok(): return self._image_json(403,'Origem não autorizada.')
        user = self.current_user()
        if not user: return self._image_json(401,'Entre na sua conta.')
        try:
            if path == '/api/images/upload':
                return self._image_upload(user)
            data = self.read_json()
            with self._image_connect() as db:
                if path == '/api/images':
                    title = data.get('title','')
                    body = data.get('body','')
                    if not isinstance(title,str) or not 1<=len(title.strip())<=120: raise ValueError('Título deve ter entre 1 e 120 caracteres.')
                    if not isinstance(body,str) or len(body)>5000: raise ValueError('Descrição muito longa.')
                    cur = db.execute('INSERT INTO image_posts(author_id,title,body) VALUES(?,?,?)',(user['id'],title.strip(),body.strip()))
                    return self._image_json(201,{'id':cur.lastrowid})
                if path == '/api/images/comment':
                    post_id = int(data.get('post_id',0));body=data.get('body','')
                    if not isinstance(body,str) or not 1<=len(body.strip())<=2000: raise ValueError('Comentário deve ter entre 1 e 2000 caracteres.')
                    if not db.execute('SELECT 1 FROM image_files WHERE post_id=?',(post_id,)).fetchone(): return self._image_json(404,'Publicação não encontrada.')
                    cur=db.execute('INSERT INTO image_comments(post_id,author_id,body) VALUES(?,?,?)',(post_id,user['id'],body.strip()))
                    return self._image_json(201,{'id':cur.lastrowid})
                kind=data.get('kind');target=int(data.get('id',0));vote=int(data.get('vote',0))
                if kind not in ('image','comment') or vote not in (-1,0,1) or target<1: raise ValueError('Voto inválido.')
                table = 'image_posts' if kind=='image' else 'image_comments'
                if not db.execute(f'SELECT 1 FROM {table} WHERE id=?',(target,)).fetchone():return self._image_json(404,'Conteúdo não encontrado.')
                if vote==0: db.execute('DELETE FROM image_votes WHERE voter_id=? AND kind=? AND target_id=?',(user['id'],kind,target))
                else: db.execute('INSERT INTO image_votes(voter_id,kind,target_id,vote) VALUES(?,?,?,?) ON CONFLICT(voter_id,kind,target_id) DO UPDATE SET vote=excluded.vote',(user['id'],kind,target,vote))
                votes=db.execute('SELECT COALESCE(SUM(vote=1),0) upvotes, COALESCE(SUM(vote=-1),0) downvotes FROM image_votes WHERE kind=? AND target_id=?',(kind,target)).fetchone()
                return self._image_json(200,{'my_vote':vote,'upvotes':votes['upvotes'],'downvotes':votes['downvotes']})
        except (ValueError,TypeError) as e:
            return self._image_json(400,str(e))
        except sqlite3.Error:
            return self._image_json(500,'Erro no banco de imagens.')

    def _image_upload(self, user):
        from servidor import ROOT
        target = None
        try:
            post_id = self._image_id('post_id')
            length = int(self.headers.get('Content-Length','0'))
            if not 0 < length <= MAX_IMAGE_UPLOAD_BYTES:
                return self._image_json(413,'Cada imagem deve ter até 12 MB.')
            name = unquote(self.headers.get('X-Image-Name','imagem.png'))
            if len(name)>200: raise ValueError('Nome do arquivo muito longo.')
            name = Path(name.replace('\\','/')).name
            ext = Path(name).suffix.lower()
            if ext not in IMAGE_EXTENSIONS: raise ValueError('Use JPG, PNG, WebP ou GIF.')
            with self._image_connect() as db:
                row=db.execute('SELECT author_id FROM image_posts WHERE id=?',(post_id,)).fetchone()
                if not row:return self._image_json(404,'Publicação não encontrada.')
                if row['author_id']!=user['id']:return self._image_json(403,'Sem permissão.')
                if db.execute('SELECT COUNT(*) FROM image_files WHERE post_id=?',(post_id,)).fetchone()[0]>=10:
                    return self._image_json(400,'Limite de 10 imagens por publicação.')
            folder=ROOT/'image_uploads';folder.mkdir(exist_ok=True)
            filename=secrets.token_hex(16)+ext
            target=folder/filename
            with target.open('xb') as out:
                remaining=length
                while remaining:
                    chunk=self.rfile.read(min(65536,remaining))
                    if not chunk:raise ValueError('Upload incompleto.')
                    out.write(chunk);remaining-=len(chunk)
            Image.MAX_IMAGE_PIXELS=MAX_IMAGE_PIXELS
            try:
                with Image.open(target) as img:
                    width,height=img.size
                    actual=img.format
                    img.verify()
            except (UnidentifiedImageError, OSError, Image.DecompressionBombError):
                raise ValueError('Arquivo de imagem inválido.')
            if not 0<width*height<=MAX_IMAGE_PIXELS:
                raise ValueError('Resolução de imagem muito alta.')
            allowed={'JPEG':{'.jpg','.jpeg'},'PNG':{'.png'},'WEBP':{'.webp'},'GIF':{'.gif'}}
            if ext not in allowed.get(actual,set()):
                raise ValueError('O formato real não corresponde à extensão.')
            with self._image_connect() as db:
                db.execute('BEGIN IMMEDIATE')
                if db.execute('SELECT COUNT(*) FROM image_files WHERE post_id=?',(post_id,)).fetchone()[0]>=10:
                    raise ValueError('Limite de 10 imagens por publicação.')
                db.execute('INSERT INTO image_files(post_id,filename,original_name,width,height,bytes) VALUES(?,?,?,?,?,?)',(post_id,filename,name,width,height,length))
            return self._image_json(201,{'message':'Imagem enviada.','width':width,'height':height})
        except (ValueError,TypeError) as e:
            if target:target.unlink(missing_ok=True)
            return self._image_json(400,str(e))
        except sqlite3.Error:
            if target:target.unlink(missing_ok=True)
            return self._image_json(500,'Erro ao salvar imagem.')

    def do_DELETE(self):
        path=urlsplit(self.path).path
        if path not in ('/api/images','/api/images/comment'):return super().do_DELETE()
        if not self._image_origin_ok():return self._image_json(403,'Origem não autorizada.')
        user=self.current_user()
        if not user:return self._image_json(401,'Entre na sua conta.')
        try:
            target=self._image_id();is_admin=user['username'].casefold()=='eloyse'
            with self._image_connect() as db:
                if path=='/api/images/comment':
                    row=db.execute('SELECT author_id FROM image_comments WHERE id=?',(target,)).fetchone()
                    if not row:return self._image_json(404,'Comentário não encontrado.')
                    if row['author_id']!=user['id'] and not is_admin:return self._image_json(403,'Sem permissão.')
                    db.execute("DELETE FROM image_votes WHERE kind='comment' AND target_id=?",(target,))
                    db.execute('DELETE FROM image_comments WHERE id=?',(target,))
                else:
                    row=db.execute('SELECT author_id FROM image_posts WHERE id=?',(target,)).fetchone()
                    if not row:return self._image_json(404,'Publicação não encontrada.')
                    if row['author_id']!=user['id'] and not is_admin:return self._image_json(403,'Sem permissão.')
                    filenames=[r['filename'] for r in db.execute('SELECT filename FROM image_files WHERE post_id=?',(target,))]
                    db.execute("DELETE FROM image_votes WHERE kind='comment' AND target_id IN (SELECT id FROM image_comments WHERE post_id=?)",(target,))
                    db.execute("DELETE FROM image_votes WHERE kind='image' AND target_id=?",(target,))
                    db.execute('DELETE FROM image_comments WHERE post_id=?',(target,))
                    db.execute('DELETE FROM image_files WHERE post_id=?',(target,))
                    db.execute('DELETE FROM image_posts WHERE id=?',(target,))
            if path=='/api/images':
                from servidor import ROOT
                for name in filenames:(ROOT/'image_uploads'/name).unlink(missing_ok=True)
            return self._image_json(200,{'message':'Excluído com sucesso.'})
        except ValueError as e:return self._image_json(400,str(e))
        except sqlite3.Error:return self._image_json(500,'Erro ao excluir.')
