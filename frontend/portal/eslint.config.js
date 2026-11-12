import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist', 'node_modules'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  {
    // docs/building-plan.md's P1 decision: "Money never becomes a float,
    // anywhere." `amount`/`balance`/`runningBalance` are Money's decimal
    // strings (services/bff/src/money/money.ts) — coercing them to a number
    // for arithmetic or display reintroduces the float rounding the Money
    // envelope exists to prevent. Render `.display` instead.
    //
    // Applied to all of src: every amount in this app is a BFF Money value
    // or a decimal string bound for the API — there are no plain-number
    // `amount` fields here to false-positive on.
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "CallExpression[callee.name=/^(Number|parseFloat|parseInt)$/] > MemberExpression.arguments:matches([property.name='amount'], [property.name='balance'], [property.name='runningBalance'])",
          message:
            'Do not coerce a Money amount field to a number — use money.display for rendering, or the decimal string as-is when forwarding to an API.',
        },
        {
          selector:
            "UnaryExpression[operator='+'] > MemberExpression.argument:matches([property.name='amount'], [property.name='balance'], [property.name='runningBalance'])",
          message:
            'Do not coerce a Money amount field to a number — use money.display for rendering, or the decimal string as-is when forwarding to an API.',
        },
      ],
    },
  },
)
