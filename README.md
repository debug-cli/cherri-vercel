<h1 align="center">Graip</h1>

<p align="center">
  <img alt="image" src="https://github.com/user-attachments/assets/d0532d69-892b-4b08-ae29-f2191295fbf7" />
</p>

<p align="center">
  A UBG project built to be clean, simple, and easy to use. With over 700 games sourced from two different stores, 40 apps, a fast and powerful browser, extensive customization options, and much more, this is easily one of the best unblocked websites.
</p>
 
<hr>

## Roadmap

* [x] Games
* [x] Apps
* [x] Proxy
* [x] Movies
* [x] Chatroom
* [x] Game overlay

## Deployment

Graip is deployable to remotely any hosting service, and even locally deployable.

Follow the steps below to deploy.

### Method 1: Deploy Buttons

[![Deploy to Heroku](https://binbashbanana.github.io/deploy-buttons/buttons/remade/heroku.svg)](https://heroku.com/deploy/?template=https://github.com/debug-cli/cherri-vercel)
[![Run on Replit](https://binbashbanana.github.io/deploy-buttons/buttons/remade/replit.svg)](https://replit.com/github/debug-cli/cherri-vercel)
[![Remix on Glitch](https://binbashbanana.github.io/deploy-buttons/buttons/remade/glitch.svg)](https://glitch.com/edit/#!/import/github/debug-cli/cherri-vercel)
[![Deploy to Amplify Console](https://binbashbanana.github.io/deploy-buttons/buttons/remade/amplifyconsole.svg)](https://console.aws.amazon.com/amplify/home#/deploy?repo=https://github.com/debug-cli/cherri-vercel)
[![Run on Google Cloud](https://binbashbanana.github.io/deploy-buttons/buttons/remade/googlecloud.svg)](https://deploy.cloud.run/?git_repo=https://github.com/debug-cli/cherri-vercel)
[![Deploy to Oracle Cloud](https://binbashbanana.github.io/deploy-buttons/buttons/remade/oraclecloud.svg)](https://cloud.oracle.com/resourcemanager/stacks/create?zipUrl=https://github.com/debug-cli/cherri-vercel/archive/refs/heads/main.zip)
[![Deploy on Railway](https://binbashbanana.github.io/deploy-buttons/buttons/remade/railway.svg)](https://railway.app/new/template?template=https://github.com/debug-cli/cherri-vercel)
[![Deploy to Vercel](https://binbashbanana.github.io/deploy-buttons/buttons/remade/vercel.svg)](https://vercel.com/new/clone?repository-url=https://github.com/debug-cli/cherri-vercel)
[![Deploy to Netlify](https://binbashbanana.github.io/deploy-buttons/buttons/remade/netlify.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/debug-cli/cherri-vercel)
[![Deploy to Koyeb](https://binbashbanana.github.io/deploy-buttons/buttons/remade/koyeb.svg)](https://app.koyeb.com/deploy?type=git&repository=github.com/debug-cli/cherri-vercel&branch=Main&name=graip)
[![Deploy to Render](https://binbashbanana.github.io/deploy-buttons/buttons/remade/render.svg)](https://render.com/deploy?repo=https://github.com/debug-cli/cherri-vercel)
[![Deploy to Cyclic](https://binbashbanana.github.io/deploy-buttons/buttons/remade/cyclic.svg)](https://app.cyclic.sh/api/app/deploy/debug-cli/cherri-vercel)

> [!IMPORTANT]
> To deploy on Cloudflare Pages, use [this repository.](https://github.com/x8rr/cherri-cloudflare)
> This version excludes Classplay store files due to Cloudflare's 25 MB limit.

### Method 2: Deploying Locally

Clone the repository:

```sh
git clone https://github.com/debug-cli/cherri-vercel.git
```

Enter the directory:

```sh
cd cherri-vercel
```

Run a local development server:

```sh
python3 -m http.server        # simple Python HTTP server
netlify dev                   # emulate a Netlify production environment
```

### Method 3: Deploying to Firebase

Ensure you have a Firebase account and a project ready.

Install the Firebase CLI:

```sh
npm i -g firebase-tools
```

Initialize a hosting project:

```sh
firebase init hosting
```

Follow the CLI steps, then deploy.

---

## If You Fork This Project

Please consider starring the repository.

You must **not**:

* Modify the AGPL license
* Claim this code as your own
* Fail to provide proper credit
* Use this code in your website without attribution
* Detach from the fork network without giving credit
* Violate the license in any way
* Steal the code or redistribute it without acknowledgment

You *may*:

* Deploy it without any modifications
* Deploy it with modifications (as long as credit and a changelog are included)
* Perform other allowed actions as defined by the license

To remain compliant, it is recommended that you include a notice like this:

---

## FORK NOTICE

This repository was derived from [x8rr/cherri](https://github.com/x8rr/cherri). All original code was written by the project owner (x8r). The following changes have been made to this fork:

* Rebranded from Cherri to Graip across the entire codebase (display text, localStorage keys, JavaScript globals, HTML elements, console logs)
* Changed the default theme from "default" to "midnight"
* Fixed toast switch fall-through bug in 404.html (error toasts showed warn icon)
* Fixed missing null checks in browserfunctions.js (full(), hideBrowser(), go())
* Updated stale "breeze" references in 404.html, newtab.html, and pages/watch.html

---
 
