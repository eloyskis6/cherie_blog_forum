
import sqlite3
import re
import json
import secrets
import subprocess
import mimetypes
from pathlib import Path
from urllib.parse import unquote
from PIL import Image, UnidentifiedImageError
from urllib.parse import urlsplit, parse_qs


def init_blog_db(connect):
    with connect() as db:
        db.execute("""
            CREATE TABLE IF NOT EXISTS blog_artigos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                autor_id INTEGER NOT NULL,
                titulo TEXT NOT NULL,
                subtitulo TEXT NOT NULL DEFAULT '',
                conteudo TEXT NOT NULL,
                criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (autor_id) REFERENCES usuarios(id)
            )
        """)

        db.execute("""
            CREATE TABLE IF NOT EXISTS blog_comentarios (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                artigo_id INTEGER NOT NULL,
                autor_id INTEGER NOT NULL,
                conteudo TEXT NOT NULL,
                criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (artigo_id) REFERENCES blog_artigos(id),
                FOREIGN KEY (autor_id) REFERENCES usuarios(id)
            )
        """)

        db.execute("""
            CREATE TABLE IF NOT EXISTS blog_midias (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                artigo_id INTEGER NOT NULL,
                tipo TEXT NOT NULL CHECK(tipo IN ('imagem','video')),
                arquivo TEXT NOT NULL,
                nome_original TEXT NOT NULL,
                FOREIGN KEY (artigo_id) REFERENCES blog_artigos(id)
            )
        """)
        db.execute("""
            CREATE INDEX IF NOT EXISTS idx_blog_midias_artigo
            ON blog_midias(artigo_id, id)
        """)
        db.execute("""
            CREATE INDEX IF NOT EXISTS idx_blog_comentarios_artigo
            ON blog_comentarios(artigo_id, id)
        """)


def is_admin(user):
    return bool(
        user and user["username"].casefold() == "eloyse"
    )


def handle_blog_get(handler, path, connect):
    if path not in ("/api/blog", "/api/blog/comentarios"):
        return False

    query = parse_qs(urlsplit(handler.path).query)

    if path == "/api/blog" and "midia" in query:
        try:
            media_id = int(query["midia"][0])
        except (ValueError, IndexError):
            handler.json_response(400, "Mídia inválida.")
            return True
        with connect() as db:
            media = db.execute("SELECT arquivo, tipo FROM blog_midias WHERE id=?", (media_id,)).fetchone()
        if not media:
            handler.json_response(404, "Mídia não encontrada.")
            return True
        file_path = Path(__file__).resolve().parent / "blog_uploads" / media["arquivo"]
        if not file_path.is_file():
            handler.json_response(404, "Arquivo não encontrado.")
            return True
        mime = mimetypes.guess_type(file_path.name)[0] or "application/octet-stream"
        handler.send_response(200)
        handler.send_header("Content-Type", mime)
        handler.send_header("Content-Length", str(file_path.stat().st_size))
        handler.send_header("X-Content-Type-Options", "nosniff")
        handler.send_header("Cache-Control", "public, max-age=3600")
        handler.end_headers()
        with file_path.open("rb") as f:
            while chunk := f.read(65536):
                handler.wfile.write(chunk)
        return True

    if path == "/api/blog":
        with connect() as db:
            rows = db.execute("""
                SELECT
                    a.id, a.titulo, a.subtitulo,
                    a.conteudo, a.criado_em,
                    u.username AS autor,
                    (
                        SELECT COUNT(*)
                        FROM blog_comentarios c
                        WHERE c.artigo_id = a.id
                    ) AS comentarios
                FROM blog_artigos a
                JOIN usuarios u ON u.id = a.autor_id
                ORDER BY a.id DESC
                LIMIT 100
            """).fetchall()

        articles = [dict(r) for r in rows]
        with connect() as db:
            media_rows = db.execute("SELECT id, artigo_id, tipo FROM blog_midias ORDER BY id").fetchall()
        for article in articles:
            article["midias"] = [
                {"id": m["id"], "tipo": m["tipo"], "url": "/api/blog?midia=" + str(m["id"])}
                for m in media_rows if m["artigo_id"] == article["id"]
            ]
        handler.json_response(200, {"artigos": articles})
        return True

    try:
        artigo_id = int(query.get("id", ["0"])[0])
        if artigo_id < 1:
            raise ValueError()
    except ValueError:
        handler.json_response(400, "ID inválido.")
        return True

    with connect() as db:
        artigo = db.execute(
            "SELECT 1 FROM blog_artigos WHERE id=?",
            (artigo_id,)
        ).fetchone()

        if not artigo:
            handler.json_response(404, "Artigo não encontrado.")
            return True

        rows = db.execute("""
            SELECT
                c.id, c.conteudo, c.criado_em,
                c.autor_id, u.username AS autor,
                COALESCE(u.avatar, 'initial.jpeg') AS avatar
            FROM blog_comentarios c
            JOIN usuarios u ON u.id = c.autor_id
            WHERE c.artigo_id=?
            ORDER BY c.id ASC
            LIMIT 300
        """, (artigo_id,)).fetchall()

    handler.json_response(200, {
        "comentarios": [dict(r) for r in rows]
    })
    return True


def handle_blog_post(handler, path, connect):
    routes = (
        "/api/blog/publicar",
        "/api/blog/comentar",
        "/api/blog/excluir",
        "/api/blog/comentario/excluir",
        "/api/blog/midia"
    )

    if path not in routes:
        return False

    origin = handler.headers.get("Origin")
    if origin and origin not in (
        "http://127.0.0.1:8000",
        "http://localhost:8000"
    ):
        handler.json_response(403, "Origem não autorizada.")
        return True

    user = handler.current_user()

    if not user:
        handler.json_response(401, "Faça login primeiro.")
        return True

    if path == "/api/blog/midia":
        if not is_admin(user):
            handler.json_response(403, "Apenas a administração pode enviar mídias.")
            return True
        target = None
        try:
            article_id = int(handler.headers.get("X-Blog-Article-ID", "0"))
            kind = handler.headers.get("X-Blog-Media-Type", "")
            name = unquote(handler.headers.get("X-Blog-Media-Name", ""))
            if len(name) > 200 or not name:
                raise ValueError("Nome do arquivo inválido.")
            name = Path(name.replace("\\", "/")).name
            ext = Path(name).suffix.lower()
            allowed_images = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
            allowed_videos = {".mp4", ".webm", ".mov", ".mkv"}
            if kind not in ("imagem", "video") or ext not in (allowed_images if kind == "imagem" else allowed_videos):
                raise ValueError("Formato de mídia não permitido.")
            length = int(handler.headers.get("Content-Length", "0"))
            maximum = 12 * 1024 * 1024 if kind == "imagem" else 150 * 1024 * 1024
            if not 0 < length <= maximum:
                handler.json_response(413, "Arquivo excede o limite permitido.")
                return True
            with connect() as db:
                if not db.execute("SELECT 1 FROM blog_artigos WHERE id=?", (article_id,)).fetchone():
                    raise ValueError("Artigo não encontrado.")
                count = db.execute("SELECT COUNT(*) FROM blog_midias WHERE artigo_id=? AND tipo=?", (article_id, kind)).fetchone()[0]
                if count >= (10 if kind == "imagem" else 6):
                    raise ValueError("Limite de mídias por artigo atingido.")
            folder = Path(__file__).resolve().parent / "blog_uploads"
            folder.mkdir(exist_ok=True)
            filename = secrets.token_hex(16) + ext
            target = folder / filename
            with target.open("xb") as out:
                remaining = length
                while remaining:
                    chunk = handler.rfile.read(min(65536, remaining))
                    if not chunk:
                        raise ValueError("Upload incompleto.")
                    out.write(chunk)
                    remaining -= len(chunk)
            if kind == "imagem":
                Image.MAX_IMAGE_PIXELS = 30_000_000
                try:
                    with Image.open(target) as img:
                        width, height = img.size
                        actual = img.format
                        img.verify()
                except (UnidentifiedImageError, OSError, Image.DecompressionBombError):
                    raise ValueError("Imagem inválida.")
                formats = {"JPEG": {".jpg", ".jpeg"}, "PNG": {".png"}, "WEBP": {".webp"}, "GIF": {".gif"}}
                if not 0 < width * height <= 30_000_000 or ext not in formats.get(actual, set()):
                    raise ValueError("Formato ou resolução de imagem inválido.")
            else:
                try:
                    probe = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "format=duration:stream=codec_type", "-of", "json", str(target)], capture_output=True, text=True, timeout=30, check=True)
                except (FileNotFoundError, subprocess.SubprocessError):
                    raise ValueError("Não foi possível validar o vídeo (ffprobe necessário).")
                metadata = json.loads(probe.stdout)
                if not metadata.get("streams"):
                    raise ValueError("O arquivo não contém vídeo válido.")
                duration = float(metadata.get("format", {}).get("duration", "nan"))
                if not 0 < duration <= 1800:
                    raise ValueError("O vídeo deve ter até 30 minutos.")
            with connect() as db:
                db.execute("BEGIN IMMEDIATE")
                count = db.execute("SELECT COUNT(*) FROM blog_midias WHERE artigo_id=? AND tipo=?", (article_id, kind)).fetchone()[0]
                if count >= (10 if kind == "imagem" else 6):
                    raise ValueError("Limite de mídias por artigo atingido.")
                cur = db.execute("INSERT INTO blog_midias(artigo_id,tipo,arquivo,nome_original) VALUES(?,?,?,?)", (article_id, kind, filename, name))
                media_id = cur.lastrowid
            handler.json_response(201, {"message": "Mídia enviada.", "id": media_id})
        except (ValueError, TypeError, OverflowError) as exc:
            if target:
                target.unlink(missing_ok=True)
            handler.json_response(400, str(exc))
        except (sqlite3.Error, OSError, json.JSONDecodeError) as exc:
            if target:
                target.unlink(missing_ok=True)
            print("Erro no upload do blog:", repr(exc))
            handler.json_response(500, "Falha ao salvar mídia.")
        return True

    try:
        data = handler.read_json()

        if path == "/api/blog/publicar":
            if not is_admin(user):
                handler.json_response(
                    403, "Somente a administradora pode publicar."
                )
                return True

            titulo = str(data.get("titulo", "")).strip()
            subtitulo = str(data.get("subtitulo", "")).strip()
            conteudo = str(data.get("conteudo", "")).strip()

            if not 3 <= len(titulo) <= 150:
                raise ValueError("Título: entre 3 e 150 caracteres.")

            if len(subtitulo) > 300:
                raise ValueError("Subtítulo muito longo.")

            if not 1 <= len(conteudo) <= 30000:
                raise ValueError("Conteúdo: até 30.000 caracteres.")

            with connect() as db:
                cur = db.execute("""
                    INSERT INTO blog_artigos
                    (autor_id, titulo, subtitulo, conteudo)
                    VALUES (?, ?, ?, ?)
                """, (
                    user["id"], titulo, subtitulo, conteudo
                ))

                artigo_id = cur.lastrowid

            handler.json_response(201, {
                "message": "Artigo publicado!",
                "id": artigo_id
            })
            return True

        if path == "/api/blog/comentar":
            artigo_id = int(data.get("artigo_id", 0))
            conteudo = str(data.get("conteudo", "")).strip()

            if not 1 <= len(conteudo) <= 2000:
                raise ValueError(
                    "Comentário: entre 1 e 2.000 caracteres."
                )

            with connect() as db:
                existe = db.execute(
                    "SELECT 1 FROM blog_artigos WHERE id=?",
                    (artigo_id,)
                ).fetchone()

                if not existe:
                    handler.json_response(
                        404, "Artigo não encontrado."
                    )
                    return True

                db.execute("""
                    INSERT INTO blog_comentarios
                    (artigo_id, autor_id, conteudo)
                    VALUES (?, ?, ?)
                """, (artigo_id, user["id"], conteudo))

            handler.json_response(
                201, "Comentário publicado!"
            )
            return True

        if path == "/api/blog/excluir":
            if not is_admin(user):
                handler.json_response(
                    403, "Acesso negado."
                )
                return True

            artigo_id = int(data.get("id", 0))

            with connect() as db:
                filenames = [r[0] for r in db.execute("SELECT arquivo FROM blog_midias WHERE artigo_id=?", (artigo_id,)).fetchall()]
                db.execute("DELETE FROM blog_midias WHERE artigo_id=?", (artigo_id,))
                db.execute(
                    "DELETE FROM blog_comentarios WHERE artigo_id=?",
                    (artigo_id,)
                )
                cur = db.execute(
                    "DELETE FROM blog_artigos WHERE id=?",
                    (artigo_id,)
                )

            if cur.rowcount:
                for filename in filenames:
                    (Path(__file__).resolve().parent / "blog_uploads" / filename).unlink(missing_ok=True)
            handler.json_response(
                200 if cur.rowcount else 404,
                "Artigo excluído." if cur.rowcount
                else "Artigo não encontrado."
            )
            return True

        if path == "/api/blog/comentario/excluir":
            comentario_id = int(data.get("id", 0))

            with connect() as db:
                row = db.execute("""
                    SELECT autor_id FROM blog_comentarios
                    WHERE id=?
                """, (comentario_id,)).fetchone()

                if not row:
                    handler.json_response(
                        404, "Comentário não encontrado."
                    )
                    return True

                if (
                    row["autor_id"] != user["id"]
                    and not is_admin(user)
                ):
                    handler.json_response(
                        403, "Você não pode excluir esse comentário."
                    )
                    return True

                db.execute(
                    "DELETE FROM blog_comentarios WHERE id=?",
                    (comentario_id,)
                )

            handler.json_response(
                200, "Comentário excluído."
            )
            return True

    except (ValueError, TypeError) as exc:
        handler.json_response(
            400, str(exc) or "Dados inválidos."
        )
        return True

    except sqlite3.Error as exc:
        print("Erro no blog:", repr(exc))
        handler.json_response(
            500, "Erro no banco de dados."
        )
        return True

    return True
