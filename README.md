# Kaye Arnold | Creative Developer Portfolio

> A modern, performance-focused portfolio built to showcase creative web applications, mobile engineering, and tactile digital experiences.

[![Live Demo](https://img.shields.io/badge/demo-online-green.svg)](https://kayearnold-portfolio.netlify.app/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

## Overview
This is the source code for my personal portfolio. It is designed from the ground up without heavy frameworks to ensure maximum performance, accessibility, and a perfect Core Web Vitals score. It features a custom design system, dark/light mode persistence, and tactile UI elements.

## Features
* **Custom Design System:** Built using CSS variables for a seamless, scalable UI.
* **Theme Persistence:** Vanilla JS and `localStorage` to remember user Dark/Light mode preferences.
* **Performance First:** Zero framework bloat. 100% semantic HTML5, modern CSS3, and Vanilla JS.
* **Scroll-Spy Navigation:** Built using the native `IntersectionObserver` API for smooth, accurate active-state tracking.
* **Fully Responsive:** Fluid layouts designed to work flawlessly from mobile to desktop.

## Tech Stack
* **Markup:** Semantic HTML5
* **Styling:** Vanilla CSS3 (Custom Properties, Flexbox, Grid, Glassmorphism)
* **Logic:** Vanilla JavaScript (ES6+)
* **Deployment:** Netlify (static site + one serverless function for the portfolio assistant)

## 🚀 Running Locally
Because this project is built with Vanilla web technologies, no complex build steps are required.

1. Clone the repository:
   ```bash
   git clone [https://github.com/Kaye-Arnold/kayearnold-portfolio](https://github.com/Kaye-Arnold/kayearnold-portfolio)
   ```
2. Open `index.html` in a browser (or serve the folder with any static server).
   The contact form and the AI assistant need to be served over HTTP(S) — they will not work from `file://`.

## ✉️ Contact form (FormSubmit)
The contact form posts to [FormSubmit](https://formsubmit.co) and delivers to **contact.ArnoldDev@proton.me**.
`js/contact.js` submits via AJAX (`https://formsubmit.co/ajax/…`) with inline validation and success/error states; without JavaScript the form falls back to a normal POST.

**One-time activation:** FormSubmit emails an activation link to the recipient address after the first submission from the live domain. Until that link is clicked, messages are not delivered.

## 🤖 Portfolio assistant (Gemini via Netlify Function)
The bottom-right chat bubble opens an AI assistant that answers questions about this portfolio.
The browser only talks to the site's own endpoint — `POST /api/chat` (`netlify/functions/chat.mjs`) — which holds the system prompt, portfolio context, model settings, rate limits and the API key.

Environment variables (Netlify UI → *Site configuration → Environment variables*, scope **Functions**):

| Variable | Required | Notes |
| --- | --- | --- |
| `GEMINI_API_KEY` | yes | Google AI Studio key. Never commit it or expose it client-side. |
| `GEMINI_MODEL` | no | Defaults to `gemini-3.5-flash-lite` (free-tier model). |

If the key is missing, the quota is exhausted, or Gemini is unreachable, the assistant degrades to a friendly message pointing visitors to the email address above — no paid fallback is used.

## License
MIT — see [LICENSE](LICENSE).
