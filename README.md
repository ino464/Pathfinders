<div align="center">

# Pathfinders

### A canvas for branching ideas

A canvas where a single prompt branches into paths you can
follow, merge, and prune, so nothing gets lost in a chat log.

![Project Status](https://img.shields.io/badge/status-in%20development-yellow)
![Next.js](https://img.shields.io/badge/Next.js-black?logo=next.js)
![React](https://img.shields.io/badge/React-20232A?logo=react&logoColor=61DAFB)
![Supabase](https://img.shields.io/badge/Supabase-181818?logo=supabase)
![Vercel](https://img.shields.io/badge/Vercel-black?logo=vercel)
![Course](https://img.shields.io/badge/Cal%20Poly-CSC%203100-154734)

</div>

---

## About Pathfinders

Traditional AI chats organize ideas in one long, linear
conversation. As conversations grow, useful ideas become buried,
abandoned branches are difficult to revisit, and users can lose
track of why they made certain decisions.

Pathfinders replaces the linear chat log with an interactive
visual canvas. A single prompt can branch into multiple
directions, allowing users to explore alternatives without
losing earlier ideas.

The application is useful for anyone, but specifically people
who struggle with brainstorming such as developing the next
Notion to someone choosing a birthday gift.

## Core Features

- Generate new ideas with an AI model
- Display ideas as connected nodes on a visual canvas
- Create multiple branches from any previous idea
- Continue exploring any existing branch
- Return to earlier ideas without losing progress
- Prune branches that are no longer useful
- Preserve the context and history of each branch
- Save and reopen brainstorming sessions
- Track ideas the user accepts, rejects, or ignores
- Merge related branches into a shared direction

> Branch merging is a stretch goal and may be postponed to
> prioritize the core branching experience.

## Example

A user could begin with the following prompt:

```text
An app for my CSC 3100 class
```

Pathfinders might generate several possible directions:

```text
├── Productivity tracker
├── Terminal for developers
├── Beginner-friendly context vault
└── Platform for learning how to code
```

Instead of choosing one direction and losing the others, the
user can select any branch, develop it further, and return to
the original alternatives later.

## Technology Stack

| Technology                           | Purpose                                                     |
| ------------------------------------ | ----------------------------------------------------------- |
| [Next.js](https://nextjs.org/)       | Full-stack application framework                            |
| [React](https://react.dev/)          | Component-based user interface                              |
| [React Flow](https://reactflow.dev/) | Interactive node and branching canvas                       |
| [Supabase](https://supabase.com/)    | PostgreSQL database, authentication, and row-level security |
| [Vercel](https://vercel.com/)        | Application deployment and hosting                          |
| Server-side LLM API                  | AI-powered branch generation                                |

## System Design

```text
Browser
  ├── React Flow canvas
  └── Supabase Auth ─────────► anonymous sign-in, session cookie
        │
        ▼  requests carry the session cookie
Next.js server (route handlers, server actions)
  ├── Context assembly ──────► Groq LLM API
  └── Data access layer (lib/graph-data.js)
        │
        ▼
Supabase PostgreSQL ── RLS checks every row
```

Model requests are sent through the server so that the LLM API
key is never exposed to the browser.

Context assembly is kept separate from the visual canvas. This
allows the team to test and improve the information sent to the
model without rewriting the user interface.

## Project Structure

```text
.
├── app/                  # Next.js pages, layouts, and server routes
├── components/           # Reusable React components
├── lib/                  # Supabase, AI, and utility functions
├── public/               # Images and other static assets
├── .env.example          # Required environment variables
├── package.json          # Dependencies and project scripts
└── README.md             # Project documentation
```

> The directory structure may change as development continues.

## Getting Started

### Prerequisites

Before running Pathfinders, install:

- [Git](https://git-scm.com/)
- [Node.js](https://nodejs.org/)
- npm
- [Docker Desktop](https://www.docker.com/products/docker-desktop/),
  which runs a local copy of Supabase

You will also need access to the team's Supabase project and LLM
API provider.

### Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/ino464/csc-3100-software-engineering-project.git
   ```

2. Enter the project directory:

   ```bash
   cd csc-3100-software-engineering-project
   ```

3. Install the dependencies:

   ```bash
   npm install
   ```

4. Start Docker Desktop, then start the local Supabase stack.
   The first run downloads the images and applies every
   migration in `supabase/migrations`:

   ```bash
   npx supabase start
   ```

5. Create the frontend environment file:

   ```bash
   cp packages/frontend/.env.example packages/frontend/.env.local
   ```

6. Run `npx supabase status` and copy two values into
   `packages/frontend/.env.local`: the API URL as
   `NEXT_PUBLIC_SUPABASE_URL` and the publishable key as
   `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Use the base API URL,
   such as `http://127.0.0.1:54321`, not the storage or S3 URL.

7. Start the development server:

   ```bash
   npm run dev -w frontend
   ```

8. Open [http://localhost:3000](http://localhost:3000) in your
   browser. The app signs you in anonymously on first load, and
   the page shows your user id.

Local Supabase Studio, where you can browse the tables, runs at
[http://127.0.0.1:54323](http://127.0.0.1:54323).

### Working with the database

The schema lives in `supabase/migrations` and is never edited
through the dashboard. After pulling changes:

- If `supabase/migrations` changed, run `npx supabase db reset`
  to rebuild the local database. This deletes local data.
- If `supabase/config.toml` changed, run `npx supabase stop` and
  then `npx supabase start`.

To apply migrations to the hosted project:

```bash
npx supabase login
npx supabase link --project-ref <project-ref>
npx supabase db push
```

The project ref is the id in the hosted project's dashboard URL.

## Environment Configuration

The required environment variables are documented in
`packages/frontend/.env.example`.

```env
# Copy the variable names from .env.example and provide your local values.
```

Do not commit `packages/frontend/.env.local` or any real API
keys to the repository.

The LLM API key must only be accessed through server-side code.
It should never be included in a client component or sent to the
browser.

## Development Commands

| Command                     | Description                         |
| --------------------------- | ----------------------------------- |
| `npm run dev -w frontend`   | Starts the local development server |
| `npm run build -w frontend` | Creates a production build          |
| `npm run lint`              | Checks the project with ESLint      |
| `npm run format:check`      | Checks code formatting              |
| `npm run format`            | Fixes code formatting               |
| `npx supabase start`        | Starts the local Supabase stack     |
| `npx supabase stop`         | Stops the local Supabase stack      |
| `npx supabase db reset`     | Rebuilds the local database         |

## Continuous Integration

GitHub Actions will run automated checks on every pull request.

The initial CI workflow will verify:

- ESLint passes
- Prettier formatting is correct
- The application builds successfully

Once the workflow is added, its status badge can be placed at
the top of this README.

## Project Status

Pathfinders is currently in **Sprint 1**.

### Sprint 1 Objectives

- [ ] Create the Supabase project and invite team members
- [ ] Provision an LLM API key
- [ ] Create the Vercel project and invite team members
- [ ] Create `.env.example`
- [x] Create the initial project README
- [ ] Complete the Software Requirements Document
- [ ] Scaffold the frontend with Next.js
- [ ] Scaffold the backend around Supabase
- [ ] Configure CI with ESLint and Prettier

Update these checkboxes as tasks are completed:

- `[ ]` means incomplete
- `[x]` means complete

## Risks and Mitigations

| Risk                                                                   | Mitigation                                                                                                  |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Model usage could become expensive or be abused on a public deployment | Set an account spending limit and rate-limit each session                                                   |
| Branch quality depends on the context sent to the model                | Implement context assembly as an independently testable pure function                                       |
| The visual canvas may be difficult to implement                        | Use React Flow and postpone branch merging if necessary                                                     |
| Other branching chat applications already exist                        | Focus on the graph, branch history, and revisiting decisions rather than recreating a normal chat interface |

## Team

| Team Member    | Role          |
| -------------- | ------------- |
| Cole Edmonston | Lead Engineer |
| Ethan Ikenaga  | Product Owner |
| Jonah Depaz    | Scrum Master  |
| Tyler Kim      | Tester        |

## Contributing

1. Create a branch for your assigned issue.
2. Make and test your changes locally.
3. Run the linting and formatting checks.
4. Push the branch to GitHub.
5. Open a pull request.
6. Request a review from another team member.

Before opening a pull request, make sure:

- The application runs locally
- No API keys or `.env.local` files are included
- ESLint and Prettier checks pass
- The pull request clearly explains the changes

## Academic Context

Pathfinders is being developed for **CSC 3100: Software
Engineering** at California Polytechnic State University, San
Luis Obispo.

---

<div align="center">

Developed by the Pathfinders team.

</div>
