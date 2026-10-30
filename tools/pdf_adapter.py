"""Untrusted PDF -> bounded text/preview adapter. No network, no embedded links followed."""
import sys,json,re,io
from pathlib import Path
import fitz
from PIL import Image
import pytesseract

MAX_PAGES=60
MAX_TEXT=30000

def ingest(path,outdir):
 doc=fitz.open(path)
 if not doc.is_pdf: raise ValueError('Uploaded file is not a PDF')
 if len(doc)>MAX_PAGES: raise ValueError(f'PDF exceeds {MAX_PAGES}-page demo limit')
 outdir=Path(outdir);outdir.mkdir(parents=True,exist_ok=True)
 pages=[]
 for index,page in enumerate(doc):
  text=page.get_text('text')[:MAX_TEXT]
  used_ocr=False
  pix=page.get_pixmap(matrix=fitz.Matrix(1.4,1.4),alpha=False)
  img=Image.open(io.BytesIO(pix.tobytes('png'))).convert('RGB')
  img.thumbnail((1150,1500));img.save(outdir/f'page-{index}.jpg',quality=84)
  if len(text.strip())<40:
   used_ocr=True
   ocr=page.get_pixmap(matrix=fitz.Matrix(3.0,3.0),alpha=False)
   text=pytesseract.image_to_string(Image.open(io.BytesIO(ocr.tobytes('png'))),config='--psm 3')[:MAX_TEXT]
  label_match=re.search(r'(?:Printed\s+page|Page)\s+([0-9IVXivx]+)',text,re.I)
  label=label_match.group(1) if label_match else None
  pages.append({'index':index,'printed_label':label,'text':text,'method':'ocr' if used_ocr else 'embedded',
   'warning':'OCR text requires verification against page image.' if used_ocr else None})
 if not pages: raise ValueError('PDF contains no pages')
 return {'pages':pages}

if __name__=='__main__':
 try: print(json.dumps(ingest(sys.argv[1],sys.argv[2])))
 except Exception as exc:
  print(json.dumps({'error':str(exc)}));sys.exit(1)
