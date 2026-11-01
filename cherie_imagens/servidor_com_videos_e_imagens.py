"""Servidor de desenvolvimento local Chérie. Não publique sem auditoria de segurança e HTTPS."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from videos_backend import VideoMixin, init_video_db
from imagens_backend import ImageMixin, init_image_db
from pathlib import Path
from urllib.parse import urlsplit, parse_qs
from http.cookies import SimpleCookie
import base64, hashlib, hmac, json, re, secrets, sqlite3, time, threading

ROOT = Path(__file__).resolve().parent
DB = ROOT / 'usuarios.db'
UPLOADS = ROOT / 'uploads'
SESSIONS = {}
LOCK = threading.RLock()
SESSION_SECONDS = 86400
MAX_IMAGE_BYTES = 2 * 1024 * 1024

def connect():
    db = sqlite3.connect(DB, timeout=10)
    db.row_factory = sqlite3.Row
    db.execute('PRAGMA busy_timeout=5000')
    return db

def init_db():
    UPLOADS.mkdir(exist_ok=True)
    with connect() as db:
        db.execute('''CREATE TABLE IF NOT EXISTS usuarios (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT NOT NULL UNIQUE COLLATE NOCASE,
          email TEXT NOT NULL UNIQUE COLLATE NOCASE,
          salt BLOB NOT NULL, password_hash BLOB NOT NULL,
          age INTEGER NOT NULL CHECK(age BETWEEN 18 AND 130),
          sex TEXT CHECK(sex IN ('mulher','homem','outros') OR sex IS NULL),
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)''')
        cols = {r['name'] for r in db.execute('PRAGMA table_info(usuarios)')}
        for name, definition in {
            'avatar': 'TEXT', 'banner': 'TEXT',
            'hide_age': 'INTEGER NOT NULL DEFAULT 0',
            'hide_sex': 'INTEGER NOT NULL DEFAULT 0',
        }.items():
            if name not in cols:
                db.execute(f'ALTER TABLE usuarios ADD COLUMN {name} {definition}')
        db.execute('''CREATE TABLE IF NOT EXISTS posts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          author_id INTEGER NOT NULL REFERENCES usuarios(id),
          title TEXT NOT NULL, body TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)''')
        db.execute('''CREATE TABLE IF NOT EXISTS comentarios (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          post_id INTEGER NOT NULL REFERENCES posts(id),
          author_id INTEGER NOT NULL REFERENCES usuarios(id),
          body TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)''')
        db.execute('''CREATE TABLE IF NOT EXISTS votos_conteudo (
          voter_id INTEGER NOT NULL REFERENCES usuarios(id),
          kind TEXT NOT NULL CHECK(kind IN ('post','comment')),
          target_id INTEGER NOT NULL,
          vote INTEGER NOT NULL CHECK(vote IN (-1,1)),
          PRIMARY KEY(voter_id,kind,target_id))''')
        db.execute('CREATE INDEX IF NOT EXISTS idx_comentarios_post ON comentarios(post_id,id)')
        db.execute('CREATE INDEX IF NOT EXISTS idx_votos_conteudo ON votos_conteudo(kind,target_id)')
        db.execute('''CREATE TABLE IF NOT EXISTS votos (
          voter_id INTEGER NOT NULL, target_id INTEGER NOT NULL,
          vote INTEGER NOT NULL CHECK(vote IN (-1,1)),
          PRIMARY KEY(voter_id,target_id),
          FOREIGN KEY(voter_id) REFERENCES usuarios(id),
          FOREIGN KEY(target_id) REFERENCES usuarios(id))''')

def password_hash(password, salt):
    return hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt, 600000)

def counts(db, user_id):
    row = db.execute('SELECT COALESCE(SUM(vote=1),0) likes, COALESCE(SUM(vote=-1),0) dislikes FROM votos WHERE target_id=?', (user_id,)).fetchone()
    return {'likes': row['likes'], 'dislikes': row['dislikes']}

def public_profile(db, row):
    return {'id': row['id'], 'username': row['username'],
            'age': None if row['hide_age'] else row['age'],
            'sex': None if row['hide_sex'] else row['sex'],
            'hide_age': bool(row['hide_age']), 'hide_sex': bool(row['hide_sex']),
            'avatar': row['avatar'] or 'initial.jpeg', 'banner': row['banner'],
            **counts(db, row['id'])}

def content_row(db, row, kind, viewer_id=None):
    data = dict(row)
    target_id = data['id']
    result = db.execute('''SELECT COALESCE(SUM(vote=1),0) upvotes,
        COALESCE(SUM(vote=-1),0) downvotes FROM votos_conteudo
        WHERE kind=? AND target_id=?''', (kind,target_id)).fetchone()
    data['upvotes'] = result['upvotes']
    data['downvotes'] = result['downvotes']
    data['my_vote'] = 0
    if viewer_id:
        vote = db.execute('SELECT vote FROM votos_conteudo WHERE voter_id=? AND kind=? AND target_id=?',
                          (viewer_id,kind,target_id)).fetchone()
        data['my_vote'] = vote['vote'] if vote else 0
    if kind == 'post':
        data['comment_count'] = db.execute('SELECT COUNT(*) FROM comentarios WHERE post_id=?', (target_id,)).fetchone()[0]
    return data

class Handler(ImageMixin, SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def json_response(self, status, payload, cookie=None):
        if isinstance(payload, str): payload = {'message': payload}
        body = json.dumps(payload, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        if cookie: self.send_header('Set-Cookie', cookie)
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def session_token(self):
        try:
            c = SimpleCookie(); c.load(self.headers.get('Cookie',''))
            return c['bb_session'].value if 'bb_session' in c else ''
        except Exception: return ''

    def current_user(self):
        token = self.session_token()
        with LOCK:
            session = SESSIONS.get(token)
            if not session: return None
            uid, expires = session
            if expires <= time.time():
                SESSIONS.pop(token, None)
                return None
        with connect() as db:
            return db.execute('SELECT * FROM usuarios WHERE id=?', (uid,)).fetchone()

    def set_session(self, user_id, status, message):
        token = secrets.token_urlsafe(32)
        with LOCK: SESSIONS[token] = (user_id, time.time()+SESSION_SECONDS)
        self.json_response(status, message, f'bb_session={token}; Path=/; HttpOnly; SameSite=Lax; Max-Age={SESSION_SECONDS}')

    def read_json(self, limit=3_000_000):
        size = int(self.headers.get('Content-Length', '0'))
        if size < 1 or size > limit: raise ValueError('Dados ausentes ou muito grandes.')
        if not self.headers.get('Content-Type','').startswith('application/json'):
            raise ValueError('Envie JSON.')
        data = json.loads(self.rfile.read(size))
        if not isinstance(data, dict): raise ValueError('Formato inválido.')
        return data

    def save_image(self, user_id, field, data):
        if not isinstance(data, str): raise ValueError('Imagem inválida.')
        match = re.fullmatch(r'data:image/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)', data)
        if not match: raise ValueError('Use JPG, PNG ou WebP.')
        try: raw = base64.b64decode(match.group(2), validate=True)
        except Exception: raise ValueError('Imagem inválida.')
        if len(raw) > MAX_IMAGE_BYTES: raise ValueError('A imagem deve ter até 2 MB.')
        # Verifica assinatura binária; não confia apenas no MIME informado pelo navegador.
        if raw.startswith(b'\x89PNG\r\n\x1a\n') and len(raw) >= 24:
            fmt = 'PNG'
            width = int.from_bytes(raw[16:20], 'big')
            height = int.from_bytes(raw[20:24], 'big')
            if width < 1 or height < 1 or width*height > 16_000_000:
                raise ValueError('Resolução inválida ou muito grande.')
        elif raw.startswith(b'\xff\xd8\xff') and raw.endswith(b'\xff\xd9'):
            fmt = 'JPEG'
        elif len(raw) >= 12 and raw[:4] == b'RIFF' and raw[8:12] == b'WEBP':
            fmt = 'WEBP'
        else:
            raise ValueError('Arquivo não parece ser uma imagem JPG, PNG ou WebP válida.')
        extension = {'JPEG':'jpg','PNG':'png','WEBP':'webp'}[fmt]
        filename = f'{field}_{user_id}_{secrets.token_hex(8)}.{extension}'
        (UPLOADS / filename).write_bytes(raw)
        return '/uploads/' + filename

    def _original_do_GET(self):
        path = urlsplit(self.path).path
        if path == '/api/posts':
            query = parse_qs(urlsplit(self.path).query)

            try:
                page = int(query.get('page', ['1'])[0])
            except ValueError:
                return self.json_response(400, 'Página inválida.')

            if not 1 <= page <= 100000:
                return self.json_response(400, 'Página inválida.')

            sort = query.get('sort', ['recentes'])[0]
            search = query.get('search', [''])[0].strip()

            if sort not in ('relevantes', 'recentes', 'antigos'):
                return self.json_response(400, 'Ordenação inválida.')

            if len(search) > 100:
                return self.json_response(400, 'Pesquisa muito longa.')

            if sort == 'antigos':
                order = 'p.id ASC'
            elif sort == 'relevantes':
                order = '''
                    (
                        SELECT COALESCE(SUM(v.vote), 0)
                        FROM votos_conteudo v
                        WHERE v.kind = 'post'
                        AND v.target_id = p.id
                    ) DESC, p.id DESC
                '''
            else:
                order = 'p.id DESC'

            viewer = self.current_user()
            viewer_id = viewer['id'] if viewer else None

            sql = f'''
                SELECT p.*, u.username, u.avatar
                FROM posts p
                JOIN usuarios u ON u.id = p.author_id
                WHERE (
                    ? = ''
                    OR instr(lower(p.title), lower(?)) > 0
                    OR instr(lower(p.body), lower(?)) > 0
                )
                ORDER BY {order}
                LIMIT 21 OFFSET ?
            '''

            with connect() as db:
                rows = db.execute(
                    sql,
                    (search, search, search, (page - 1) * 20)
                ).fetchall()

                items = [
                    content_row(db, r, 'post', viewer_id)
                    for r in rows[:20]
                ]

            return self.json_response(
                200,
                {
                    'posts': items,
                    'has_more': len(rows) > 20
                }
            )


        if path == '/api/post':
            query = parse_qs(urlsplit(self.path).query)
            try:
                post_id = int(query.get('id', [''])[0])
            except ValueError:
                return self.json_response(400, 'ID inválido.')

            viewer = self.current_user()
            viewer_id = viewer['id'] if viewer else None

            with connect() as db:

                row = db.execute('''SELECT p.*,u.username,u.avatar FROM posts p
                    JOIN usuarios u ON u.id=p.author_id WHERE p.id=?''',(post_id,)).fetchone()
                if not row: return self.json_response(404,'Publicação não encontrada.')
                post = content_row(db,row,'post',viewer_id)
                comments = db.execute('''SELECT c.*,u.username,u.avatar FROM comentarios c
                    JOIN usuarios u ON u.id=c.author_id WHERE c.post_id=? ORDER BY c.id LIMIT 501''',(post_id,)).fetchall()
                items = [content_row(db,r,'comment',viewer_id) for r in comments[:500]]
            return self.json_response(200,{'post':post,'comments':items,'comments_truncated':len(comments)>500})
        if path == '/api/me':
            user = self.current_user()
            if not user: return self.json_response(401, 'Sessão expirada. Entre na sua conta.')
            with connect() as db:
                data = public_profile(db, user)
                data.update({'age': user['age'], 'sex': user['sex'],
                             'show_age': not bool(user['hide_age']), 'show_sex': not bool(user['hide_sex'])})
            return self.json_response(200, data)
        if path == '/api/usuario':
            query = parse_qs(urlsplit(self.path).query)
            try: uid = int(query.get('id',[''])[0])
            except ValueError: return self.json_response(400,'ID inválido.')
            with connect() as db:
                row = db.execute('SELECT * FROM usuarios WHERE id=?',(uid,)).fetchone()
                if not row: return self.json_response(404,'Usuário não encontrado.')
                result = public_profile(db,row)
                viewer = self.current_user()
                result['my_vote'] = 0
                if viewer:
                    vote = db.execute('SELECT vote FROM votos WHERE voter_id=? AND target_id=?',(viewer['id'],uid)).fetchone()
                    result['my_vote'] = vote['vote'] if vote else 0
            return self.json_response(200,result)
        if path.startswith('/api/') or path.endswith(('.db','.py','.sqlite','.sqlite3')) or '/.' in path or path.startswith('/uploads/') and '..' in path:
            return self.send_error(404)
        return SimpleHTTPRequestHandler.do_GET(self)


    def _original_do_DELETE(self):
        path = urlsplit(self.path).path

        origin = self.headers.get("Origin")
        if origin and origin not in (
            "http://127.0.0.1:8000",
            "http://localhost:8000"
        ):
            return self.json_response(
                403, "Origem não autorizada."
            )

        if path not in (
            "/api/posts",
            "/api/comentarios"
        ):
            return self.json_response(
                404, "Rota não encontrada."
            )

        user = self.current_user()

        if not user:
            return self.json_response(
                401, "Faça login para excluir conteúdo."
            )

        query = parse_qs(urlsplit(self.path).query)

        try:
            content_id = int(query.get("id", [""])[0])
        except ValueError:
            return self.json_response(
                400, "ID inválido."
            )

        if content_id < 1:
            return self.json_response(
                400, "ID inválido."
            )

        is_admin = user["username"].casefold() == "eloyse"

        try:
            with connect() as db:

                if path == "/api/posts":
                    post = db.execute(
                        "SELECT author_id FROM posts WHERE id=?",
                        (content_id,)
                    ).fetchone()

                    if not post:
                        return self.json_response(
                            404, "Publicação não encontrada."
                        )

                    if (
                        post["author_id"] != user["id"]
                        and not is_admin
                    ):
                        return self.json_response(
                            403, "Você não pode excluir esta publicação."
                        )

                    # Excluir votos dos comentários
                    db.execute("""
                        DELETE FROM votos_conteudo
                        WHERE kind='comment'
                        AND target_id IN (
                            SELECT id FROM comentarios
                            WHERE post_id=?
                        )
                    """, (content_id,))

                    # Excluir comentários
                    db.execute(
                        "DELETE FROM comentarios WHERE post_id=?",
                        (content_id,)
                    )

                    # Excluir votos do post
                    db.execute("""
                        DELETE FROM votos_conteudo
                        WHERE kind='post' AND target_id=?
                    """, (content_id,))

                    # Excluir publicação
                    db.execute(
                        "DELETE FROM posts WHERE id=?",
                        (content_id,)
                    )

                    message = "Publicação excluída."

                else:
                    comment = db.execute(
                        "SELECT author_id FROM comentarios WHERE id=?",
                        (content_id,)
                    ).fetchone()

                    if not comment:
                        return self.json_response(
                            404, "Comentário não encontrado."
                        )

                    if (
                        comment["author_id"] != user["id"]
                        and not is_admin
                    ):
                        return self.json_response(
                            403, "Você não pode excluir este comentário."
                        )

                    # Excluir votos do comentário
                    db.execute("""
                        DELETE FROM votos_conteudo
                        WHERE kind='comment' AND target_id=?
                    """, (content_id,))

                    # Excluir comentário
                    db.execute(
                        "DELETE FROM comentarios WHERE id=?",
                        (content_id,)
                    )

                    message = "Comentário excluído."

            return self.json_response(
                200, {"message": message}
            )

        except sqlite3.Error as error:
            print("Erro ao excluir:", repr(error))
            return self.json_response(
                500, "Erro ao excluir conteúdo."
            )


    def _original_do_POST(self):
        path = urlsplit(self.path).path
        origin = self.headers.get('Origin')
        if origin and origin not in ('http://127.0.0.1:8000','http://localhost:8000'):
            return self.json_response(403,'Origem não autorizada.')
        try:
            if path == '/api/sair':
                with LOCK: SESSIONS.pop(self.session_token(), None)
                return self.json_response(200,'Sessão encerrada.', 'bb_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0')
            data = self.read_json()
            if path == '/api/cadastro':
                username = str(data.get('username','')).strip()
                email = str(data.get('email','')).strip().lower()
                password = str(data.get('password',''))
                confirm = data.get('confirm_password')
                age = int(data.get('age',0))
                sex = data.get('sex') or None
                if not re.fullmatch(r'[A-Za-z0-9_.-]{3,24}',username): raise ValueError('Nome de usuário inválido.')
                if len(email)>254 or not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+',email): raise ValueError('E-mail inválido.')
                if not 7 <= len(password) <= 128: raise ValueError('A senha deve ter entre 7 e 128 caracteres.')
                if confirm is not None and password != confirm: raise ValueError('As senhas não coincidem.')
                if not 18 <= age <= 130: raise ValueError('O cadastro é permitido a partir de 18 anos.')
                if sex not in (None,'mulher','homem','outros'): raise ValueError('Sexo inválido.')
                salt = secrets.token_bytes(16)
                with connect() as db:
                    cur = db.execute('INSERT INTO usuarios (username,email,salt,password_hash,age,sex) VALUES (?,?,?,?,?,?)',
                        (username,email,salt,password_hash(password,salt),age,sex))
                    uid = cur.lastrowid
                return self.set_session(uid,201,'Conta criada!')
            if path == '/api/login':
                identifier = str(data.get('identifier',data.get('username',data.get('email','')))).strip()
                password = str(data.get('password',''))
                with connect() as db:
                    row = db.execute('SELECT * FROM usuarios WHERE username=? COLLATE NOCASE OR email=? COLLATE NOCASE',(identifier,identifier)).fetchone()
                if not row or not hmac.compare_digest(password_hash(password,row['salt']),row['password_hash']):
                    return self.json_response(401,'Usuário, e-mail ou senha incorretos.')
                return self.set_session(row['id'],200,'Login realizado!')
            user = self.current_user()
            if not user: return self.json_response(401,'Sessão expirada. Entre na sua conta.')
            uid = user['id']
            if path == '/api/posts':
                title = data.get('title','')
                body = data.get('body','')
                if not isinstance(title,str) or not 1 <= len(title.strip()) <= 120:
                    raise ValueError('Título deve ter entre 1 e 120 caracteres.')
                if not isinstance(body,str) or not 1 <= len(body.strip()) <= 5000:
                    raise ValueError('Descrição deve ter entre 1 e 5000 caracteres.')
                with connect() as db:
                    cur = db.execute('INSERT INTO posts(author_id,title,body) VALUES(?,?,?)',
                                     (uid,title.strip(),body.strip()))
                    post_id = cur.lastrowid
                return self.json_response(201,{'id':post_id,'message':'Publicação criada!'})
            if path == '/api/comentarios':
                post_id = int(data.get('post_id',0))
                body = data.get('body','')
                if not isinstance(body,str) or not 1 <= len(body.strip()) <= 2000:
                    raise ValueError('Comentário deve ter entre 1 e 2000 caracteres.')
                with connect() as db:
                    if not db.execute('SELECT 1 FROM posts WHERE id=?',(post_id,)).fetchone():
                        return self.json_response(404,'Publicação não encontrada.')
                    cur = db.execute('INSERT INTO comentarios(post_id,author_id,body) VALUES(?,?,?)',
                                     (post_id,uid,body.strip()))
                    comment_id = cur.lastrowid
                return self.json_response(201,{'id':comment_id,'message':'Comentário publicado!'})
            if path == '/api/voto-conteudo':
                kind = data.get('kind')
                target_id = int(data.get('id',0))
                vote = int(data.get('vote',0))
                if kind not in ('post','comment') or vote not in (-1,0,1) or target_id < 1:
                    raise ValueError('Voto inválido.')
                table = 'posts' if kind == 'post' else 'comentarios'
                with connect() as db:
                    if not db.execute(f'SELECT 1 FROM {table} WHERE id=?',(target_id,)).fetchone():
                        return self.json_response(404,'Conteúdo não encontrado.')
                    if vote == 0:
                        db.execute('DELETE FROM votos_conteudo WHERE voter_id=? AND kind=? AND target_id=?',
                                   (uid,kind,target_id))
                    else:
                        db.execute('''INSERT INTO votos_conteudo(voter_id,kind,target_id,vote)
                            VALUES(?,?,?,?) ON CONFLICT(voter_id,kind,target_id)
                            DO UPDATE SET vote=excluded.vote''',(uid,kind,target_id,vote))
                    result = db.execute('''SELECT COALESCE(SUM(vote=1),0) upvotes,
                        COALESCE(SUM(vote=-1),0) downvotes FROM votos_conteudo
                        WHERE kind=? AND target_id=?''',(kind,target_id)).fetchone()
                return self.json_response(200,{'my_vote':vote,'upvotes':result['upvotes'],'downvotes':result['downvotes']})
            if path == '/api/perfil':
                allowed = {'avatar','banner','username','hide_age','hide_sex','show_age','show_sex'}
                if not data or set(data)-allowed: raise ValueError('Campos inválidos.')
                updates = {}
                if 'username' in data:
                    username = str(data['username']).strip()
                    if not re.fullmatch(r'[A-Za-z0-9_.-]{3,24}',username): raise ValueError('Nome de usuário inválido.')
                    updates['username'] = username
                for key in ('avatar','banner'):
                    if key in data: updates[key] = self.save_image(uid,key,data[key])
                for key in ('hide_age','hide_sex'):
                    if key in data:
                        if not isinstance(data[key],bool): raise ValueError('Preferência inválida.')
                        updates[key] = int(data[key])
                for key in ('show_age','show_sex'):
                    if key in data:
                        if not isinstance(data[key],bool): raise ValueError('Preferência inválida.')
                        updates['hide_'+key[5:]] = int(not data[key])
                if not updates: raise ValueError('Nenhuma alteração recebida.')
                with connect() as db:
                    sql = ', '.join(f'{key}=?' for key in updates)
                    db.execute(f'UPDATE usuarios SET {sql} WHERE id=?',(*updates.values(),uid))
                return self.json_response(200,'Perfil atualizado!')
            if path == '/api/perfil/senha':
                old = str(data.get('old_password',''))
                new = str(data.get('new_password',''))
                if not hmac.compare_digest(password_hash(old,user['salt']),user['password_hash']):
                    return self.json_response(403,'Senha atual incorreta.')
                if not 7 <= len(new) <= 128: raise ValueError('A nova senha deve ter entre 7 e 128 caracteres.')
                salt = secrets.token_bytes(16)
                with connect() as db:
                    db.execute('UPDATE usuarios SET salt=?,password_hash=? WHERE id=?',(salt,password_hash(new,salt),uid))
                return self.json_response(200,'Senha atualizada!')
            if path == '/api/voto':
                target = int(data.get('user_id',0))
                vote = int(data.get('vote',0))
                if vote not in (-1,0,1): raise ValueError('Voto inválido.')
                if target == uid: return self.json_response(403,'Você não pode votar no próprio perfil.')
                with connect() as db:
                    if not db.execute('SELECT 1 FROM usuarios WHERE id=?',(target,)).fetchone():
                        return self.json_response(404,'Usuário não encontrado.')
                    if vote == 0:
                        db.execute('DELETE FROM votos WHERE voter_id=? AND target_id=?',(uid,target))
                    else:
                        db.execute('INSERT INTO votos(voter_id,target_id,vote) VALUES (?,?,?) ON CONFLICT(voter_id,target_id) DO UPDATE SET vote=excluded.vote',(uid,target,vote))
                    result = counts(db,target)
                return self.json_response(200,{'message':'Voto registrado.',**result})
            return self.json_response(404,'Rota não encontrada.')
        except sqlite3.IntegrityError:
            return self.json_response(409,'Esse nome de usuário ou e-mail já está em uso.')
        except (ValueError,TypeError,json.JSONDecodeError) as exc:
            return self.json_response(400,str(exc) or 'Confira os dados enviados.')
        except Exception as exc:
            print('Erro interno:',repr(exc))
            return self.json_response(500,'Erro interno no servidor.')

if __name__ == '__main__':
    init_db()
    init_video_db(connect, ROOT)
    init_image_db(connect, ROOT)
    print('Chérie em http://127.0.0.1:8000/perfil.html')
    ThreadingHTTPServer(('127.0.0.1',8000),Handler).serve_forever()
