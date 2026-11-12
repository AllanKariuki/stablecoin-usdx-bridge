import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

const MONEY_COERCION = 'Do not coerce a Money amount field to a number: render money.display, or forward the decimal string as-is.';

export default tseslint.config(
  { ignores: ['dist'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: { ecmaVersion: 2022, globals: globals.browser },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
  {
    // docs/building-plan.md's P1 decision: Money never becomes a float.
    // Unlike the portal, every screen here carries Money (or core-ledger's
    // decimal strings), so the rule covers all of src.
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "CallExpression[callee.name=/^(Number|parseFloat|parseInt)$/] > MemberExpression.arguments:matches([property.name='amount'], [property.name='balance'], [property.name='runningBalance'], [property.name='drift'], [property.name='debits'], [property.name='credits'])",
          message: MONEY_COERCION,
        },
        {
          selector:
            "UnaryExpression[operator='+'] > MemberExpression.argument:matches([property.name='amount'], [property.name='balance'], [property.name='runningBalance'], [property.name='drift'], [property.name='debits'], [property.name='credits'])",
          message: MONEY_COERCION,
        },
      ],
    },
  },
);
