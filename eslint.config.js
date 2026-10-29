import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // A react-leaflet <Pane> hands its pane to every child, popups and
      // tooltips included, which put stream and county popups under the map
      // data (#86). Create the pane with <Pane name="..." /> and set pane= on
      // the layer itself.
      'no-restricted-syntax': [
        'error',
        {
          selector:
            'JSXElement[openingElement.name.name="Pane"] > :matches(JSXElement, JSXExpressionContainer)',
          message:
            'Do not nest layers in <Pane>: their popups and tooltips inherit the pane (#86). Set pane= on the layer instead.',
        },
      ],
    },
  },
])
