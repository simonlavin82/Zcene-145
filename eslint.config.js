import firebaseRulesPlugin from '@firebase/eslint-plugin-security-rules';
import js from '@eslint/js';

export default [
  js.configs.recommended,
  {
    ignores: ['dist/**/*']
  },
  firebaseRulesPlugin.configs['flat/recommended']
];
