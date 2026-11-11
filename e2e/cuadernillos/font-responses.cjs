// Next's documented font mock hook loads this response map with CommonJS require.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { getFontAxes } = require('next/dist/compiled/@next/font/dist/google/get-font-axes.js')
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { getGoogleFontsUrl } = require('next/dist/compiled/@next/font/dist/google/get-google-fonts-url.js')

const fontFile = process.env.T8_E2E_MOCK_FONT_PATH
if (!fontFile || !fontFile.startsWith('/')) {
  throw new Error('T8_E2E_MOCK_FONT_PATH must be an absolute local font path')
}

const definitions = [
  { family: 'Barlow', weights: ['400', '500', '600', '700'] },
  { family: 'Barlow Semi Condensed', weights: ['700', '800'] },
  { family: 'Montserrat', weights: ['700'] },
  { family: 'Inter', weights: ['variable'] },
]

module.exports = Object.fromEntries(definitions.map(({ family, weights }) => {
  const url = getGoogleFontsUrl(family, getFontAxes(family, weights, ['normal']), 'swap')
  const faces = weights.map((weight) => `@font-face {
  font-family: '${family}';
  font-style: normal;
  font-weight: ${weight === 'variable' ? '100 900' : weight};
  src: url(${fontFile}) format('truetype');
}`).join('\n')
  return [url, `/* latin */\n${faces}`]
}))
