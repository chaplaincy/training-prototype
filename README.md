# Chaplaincy Volunteer Preparation — prototype

This is a standalone, data-driven replacement for the existing Adapt course. It does not change or connect to the live course.

`CONTENT-REVIEW.md` lists the chaplaincy, policy and accessibility decisions that need approval before publication.

## Preview locally

From this folder, run:

```bash
python3 -m http.server 8000
```

Then visit <http://localhost:8000>.

The small web server is needed because browsers do not allow a page opened directly from disk to load the separate course-content files.

## Edit course-wide details

Open `content/course.json` to change:

- course title, description and version;
- content review date;
- pass mark;
- organisation names;
- certificate wording;
- module order and estimated duration.

## Edit a module

Each module has one file in `content/modules/`:

- `01-welcome.json`
- `02-role.json`
- `03-visiting.json`
- `04-listening.json`
- `05-boundaries.json`
- `06-concerns.json`
- `07-safety.json`
- `08-assessment.json`

The learner-facing wording is kept in these files rather than mixed into the layout code. Preserve commas, quotation marks and brackets when editing JSON.

Common section types are:

- `text` — headings and paragraphs;
- `cards` — short related ideas;
- `callout` — important or safety-critical guidance;
- `steps` — an ordered process;
- `doDont` — paired practical lists;
- `scenario` — a choice with feedback;
- `video` — a YouTube video plus written alternative.

## Replace the active-listening video

Open `content/modules/04-listening.json` and change `youtubeId`. For a URL such as `https://youtu.be/M6Pob4qpMpw`, the ID is `M6Pob4qpMpw`.

Update the written alternative at the same time. Captions and the full alternative must be checked before publication.

## Edit the final questions

Open `content/modules/08-assessment.json`. Every question must have:

- a unique `id`;
- two or more options;
- exactly one option with `"correct": true`;
- helpful feedback for every option.

The pass mark is stored in `content/course.json`.

## Check content after editing

Run:

```bash
node scripts/validate-content.mjs
node scripts/smoke-test.mjs
```

The first command checks that every file can be read, module IDs agree, scenarios have a preferred response and assessment questions have exactly one correct answer. The second briefly serves the site and confirms that the course shell and every module load successfully.

## Progress and privacy

Progress and the optional certificate name are saved only in the learner's browser using local storage. Nothing is transmitted or stored centrally. Clearing browser data or using another device starts a fresh copy.

## Certificate

Completing modules 1–7 and passing the final check unlocks the certificate. The learner can leave the name blank. The browser print dialogue provides “Save as PDF” on supported devices.

## Files that rarely need changing

- `index.html` contains the page structure and printable certificate.
- `styles.css` contains the visual design and print layout.
- `app.js` loads content, saves progress and runs the scenarios and assessment.

Ordinary wording and policy updates should not require editing these files.
