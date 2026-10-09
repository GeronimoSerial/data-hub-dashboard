import katex from 'katex'
import 'katex/dist/katex.min.css'

// KaTeX renders to static HTML on the server and the client alike, so the
// formulas need no client-side script.
function renderizar(tex: string, displayMode: boolean): string {
  return katex.renderToString(tex, { displayMode, throwOnError: false, output: 'html' })
}

export function Formula({ tex }: { tex: string }) {
  return <div className="metodologia__formula" dangerouslySetInnerHTML={{ __html: renderizar(tex, true) }} />
}

export function Tex({ tex }: { tex: string }) {
  return <span dangerouslySetInnerHTML={{ __html: renderizar(tex, false) }} />
}
