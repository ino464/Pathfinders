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
