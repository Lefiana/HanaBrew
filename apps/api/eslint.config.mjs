import root from "../../eslint.config.mjs";

export default [
  ...root,
  {
    // NestJS dependency injection needs runtime (value) imports of classes that are only
    // used as constructor parameter types, which this rule would turn into type imports.
    files: ["src/**/*.ts", "test/**/*.ts"],
    rules: { "@typescript-eslint/consistent-type-imports": "off" },
  },
];
