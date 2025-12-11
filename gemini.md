# Gemini CLI Project Readme - Frog Task Todo List App

This document provides an overview of the "Frog Task Todo List App," a Next.js application designed to help users manage their daily tasks with an engaging, frog-themed interface, complete with customizable skins and interactive animations.

## Project Overview

The application is a daily todo tracker with a focus on a rich user experience, incorporating drag-and-drop task management, user authentication, task history, and unique customization options through collectible "skins" for the frog character.

## Technology Stack

- **Framework:** Next.js (v14)
- **Language:** TypeScript
- **Styling:** Tailwind CSS, `clsx`, `tailwind-merge` for utility-first styling, and `tailwindcss-animate` for animations.
- **State Management:** `zustand` and `swr` for efficient data fetching and global state management.
- **Authentication:** `NextAuth.js` with `bcryptjs` for secure user authentication.
- **Database:** MongoDB, interfaced via `mongoose` for data persistence.
- **UI Components:** Leverages `Radix UI` primitives for accessible and customizable UI components (Checkbox, Dialog, Progress, Tabs).
- **Drag and Drop:** Implemented using `@dnd-kit` libraries (`core`, `modifiers`, `sortable`, `utilities`) and `@hello-pangea/dnd`, along with `array-move` for list reordering.
- **Animations & Interactivity:** Extensively uses `framer-motion`, `gsap`, `@rive-app/react-canvas` (for Rive animations like `fly.riv` and `frog_idle.riv`), and `canvas-confetti` for celebratory effects.
- **Date Handling:** `date-fns` for date manipulation.
- **Internationalization:** `next-intl` for multi-language support.
- **Validation:** `zod` for schema validation.
- **Unique IDs:** `uuid` for generating unique identifiers.

## Key Features

- **User Authentication:** Secure login and registration powered by NextAuth.js.
- **Task Management:** Create, read, update, and delete tasks. Features an interactive task board with daily columns and a backlog.
- **Drag and Drop Interface:** Intuitive drag-and-drop functionality for organizing tasks.
- **Task History:** Users can review their past completed tasks.
- **Frog Customization (Skins):** Collect and equip various frog skins, adding a unique gamified element to task completion. Skins are categorized into common, uncommon, rare, epic, and legendary tiers.
- **Rich Animations:** Smooth and engaging animations throughout the application, including Rive animations for the frog character and confetti effects for achievements.
- **Internationalization:** Support for multiple languages (e.g., English, Hebrew).
