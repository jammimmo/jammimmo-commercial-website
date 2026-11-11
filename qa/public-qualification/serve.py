"""Loopback static HTML only. Executed by root's selected Playwright launch."""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--directory', required=True)
directory = Path(parser.parse_args().directory).resolve()
artifact_root = Path(__file__).resolve().parents[4] / 'artifacts/commercial/next-public-qualification-20261103/public-qa'
if not directory.is_dir() or directory.name != 'html' or not directory.is_relative_to(artifact_root):
    raise SystemExit('Serve only the reviewed task HTML directory.')


class ClosedStaticHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        # Keep ordinary local/inline script, style and worker-blob capabilities.
        # Only external I/O and the existing preconnect hint are closed here.
        self.send_header('Content-Security-Policy', "default-src 'self' data: blob:; connect-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; worker-src 'self' blob:; object-src 'none'; frame-src 'none'")
        self.send_header('X-DNS-Prefetch-Control', 'off')
        super().end_headers()


ThreadingHTTPServer(('127.0.0.1', 4240), partial(ClosedStaticHandler, directory=str(directory))).serve_forever()
