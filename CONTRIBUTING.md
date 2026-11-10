# Contributing

Thank you for contributing to this project! This file is meant
to describe the structure and the tools used within this
project.

## Project structure

This repository uses an npm workspace monorepo:

- `packages/frontend` contains the Next.js app, including its
  server code

Install all dependencies from the repository root:

```bash
npm install
```

## Supabase setup

Copy `packages/frontend/.env.example` to
`packages/frontend/.env.local`, then add the project URL and
publishable key from the Supabase Dashboard. Do not commit the
local environment file or use a service-role key in the
frontend.

## Component tests

Tests live in `packages/frontend/test` and run in node. To test
a React component, name the file `*.test.jsx` and put this
comment on its first line, so that only that file gets a DOM:

```js
// @vitest-environment jsdom
```

Render the component with React Testing Library and call
`afterEach(cleanup)`, because vitest globals are off. Assert on
what the user sees, such as a role or a label.
`test/email-form.test.jsx` is an example.

Run all tests from the repository root:

```bash
npm test
```

Run one file from `packages/frontend`:

```bash
npx vitest run test/email-form.test.jsx
```
