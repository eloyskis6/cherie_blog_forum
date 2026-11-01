import re
import secrets
import time

from http.cookies import SimpleCookie
from threading import Lock
from urllib.parse import urlsplit


_VISITANTES = {}
_LOCK = Lock()
_JANELA = 90


class PresenceMixin:
    def do_POST(self):
        if urlsplit(self.path).path != '/api/presenca':
            return super().do_POST()

        origin = self.headers.get('Origin')

        if origin and urlsplit(origin).netloc != self.headers.get('Host'):
            return self.json_response(403, 'Origem não autorizada.')

        if (
            self.headers.get('Content-Length', '0') != '0'
            or self.headers.get('Transfer-Encoding')
        ):
            self.close_connection = True
            return self.json_response(
                400,
                'Envie esta requisição sem conteúdo.'
            )

        cookies = SimpleCookie()

        try:
            cookies.load(self.headers.get('Cookie', ''))

            token = (
                cookies['cherie_visitante'].value
                if 'cherie_visitante' in cookies
                else ''
            )
        except Exception:
            token = ''

        if not re.fullmatch(r'[0-9a-f]{32}', token):
            token = secrets.token_hex(16)

        agora = time.monotonic()

        with _LOCK:
            expirados = [
                identificador
                for identificador, ultimo_aviso in _VISITANTES.items()
                if agora - ultimo_aviso >= _JANELA
            ]

            for identificador in expirados:
                del _VISITANTES[identificador]

            _VISITANTES[token] = agora
            total = len(_VISITANTES)

        return self.json_response(
            200,
            {'online': total},
            (
                f'cherie_visitante={token}; '
                'Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000'
            )
        )
