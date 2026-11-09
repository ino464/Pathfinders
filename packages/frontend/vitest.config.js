import { configDefaults, defineConfig } from "vitest/config";

// The app writes JSX in .js files, which Next accepts and Vite
// does not parse by default. Tests run in node; a component test
// opts into a DOM with a `// @vitest-environment jsdom` comment.
export default defineConfig({
  oxc: {
    include: [/\/app\/.+\.js$/, /\.jsx$/],
    exclude: /node_modules/,
    lang: "jsx",
    jsx: { runtime: "automatic" }
  },
  test: {
    exclude: [...configDefaults.exclude, "ui-test/**"]
  }
});
