"""Comprime imágenes de PDF sin reescribir texto, fuentes ni vectores.

Requiere pikepdf y Pillow. Uso: python optimizar-materiales.py ORIGINALES SALIDA
"""
import argparse
import io
import hashlib
import zlib
from pathlib import Path

import pikepdf
from PIL import Image


def optimizar(origen: Path, destino: Path) -> None:
    with pikepdf.open(origen) as pdf:
        imagenes = [obj for obj in pdf.objects if isinstance(obj, pikepdf.Stream)
                    and obj.get('/Subtype') == pikepdf.Name.Image]
        mascaras = {obj['/SMask'].objgen for obj in imagenes if '/SMask' in obj}
        for obj in imagenes:
            if ('/Mask' in obj or obj.get('/ImageMask', False)
                    or obj.get('/BitsPerComponent') != 8 or '/Decode' in obj):
                continue
            imagen = pikepdf.PdfImage(obj).as_pil_image()
            if max(imagen.size) < 800:
                continue
            imagen.thumbnail((1754, 1754), Image.Resampling.LANCZOS)
            if obj.objgen in mascaras:
                if imagen.size != (int(obj['/Width']), int(obj['/Height'])):
                    obj.write(zlib.compress(imagen.tobytes()), filter=pikepdf.Name.FlateDecode)
                    obj['/Width'], obj['/Height'] = imagen.size
                continue
            cs = obj.get('/ColorSpace')
            if imagen.mode == 'RGBA':
                # The alpha stays in the original /SMask object.
                imagen = imagen.convert('RGB')
                if isinstance(cs, pikepdf.Array) and cs[0] == pikepdf.Name.Indexed:
                    cs = cs[1]
            if imagen.mode not in ('RGB', 'L'):
                continue
            buffer = io.BytesIO()
            imagen.save(buffer, format='JPEG', quality=85, optimize=True, subsampling=2)
            contenido = buffer.getvalue()
            if len(contenido) >= len(obj.read_raw_bytes()) and '/SMask' not in obj:
                continue
            obj.write(contenido, filter=pikepdf.Name.DCTDecode)
            obj['/Width'], obj['/Height'] = imagen.size
            obj['/ColorSpace'] = cs
            if '/DecodeParms' in obj:
                del obj['/DecodeParms']
        def firma(obj):
            if isinstance(obj, pikepdf.Stream):
                return hashlib.sha256(obj.read_raw_bytes() + firma(dict(obj))).digest()
            if isinstance(obj, (dict, pikepdf.Dictionary)):
                return b''.join(str(k).encode() + firma(v) for k, v in sorted(obj.items()) if k != '/Length')
            if isinstance(obj, (list, pikepdf.Array)):
                return b''.join(firma(v) for v in obj)
            return str(obj).encode()

        unicas = {}
        reemplazos = {}
        for obj in imagenes:
            digest = firma(obj)
            if digest in unicas:
                reemplazos[obj.objgen] = unicas[digest]
            else:
                unicas[digest] = obj
        vistos = set()

        def deduplicar(obj):
            if not isinstance(obj, (pikepdf.Dictionary, pikepdf.Stream, pikepdf.Array)):
                return
            if obj.is_indirect:
                if obj.objgen in vistos:
                    return
                vistos.add(obj.objgen)
            pares = list(enumerate(obj)) if isinstance(obj, pikepdf.Array) else list(obj.items())
            for key, value in pares:
                if isinstance(value, pikepdf.Object) and value.objgen in reemplazos:
                    obj[key] = reemplazos[value.objgen]
                else:
                    deduplicar(value)
        deduplicar(pdf.Root)
        pdf.save(destino, compress_streams=True,
                 object_stream_mode=pikepdf.ObjectStreamMode.generate,
                 recompress_flate=True)
    if destino.stat().st_size >= origen.stat().st_size:
        destino.write_bytes(origen.read_bytes())
    print(f'{origen.name}: {origen.stat().st_size} -> {destino.stat().st_size}', flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('origen', type=Path)
    parser.add_argument('salida', type=Path)
    args = parser.parse_args()
    args.salida.mkdir(parents=True, exist_ok=True)
    for archivo in sorted(args.origen.glob('*.pdf')):
        optimizar(archivo, args.salida / archivo.name)
