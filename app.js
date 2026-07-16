"use strict";

const STORAGE_KEY = "chaplaincy-volunteer-preparation-v1";

const elements = {
  appShell: document.querySelector("#app-shell"),
  main: document.querySelector("#main-content"),
  rail: document.querySelector("#course-rail"),
  navigation: document.querySelector("#module-navigation"),
  headerProgress: document.querySelector("#header-progress"),
  toast: document.querySelector("#toast")
};

let course = null;
let modules = [];
let activeModule = null;
let toastTimer = null;

const defaultState = {
  completedModules: [],
  scenarios: {},
  assessment: {
    attempted: false,
    passed: false,
    score: 0,
    answers: {}
  },
  certificateName: "",
  completedDate: ""
};

let state = loadState();

document.addEventListener("DOMContentLoaded", initialise);
window.addEventListener("hashchange", renderRoute);
window.addEventListener("afterprint", clearCertificatePrintMode);

document.addEventListener("click", (event) => {
  const routeButton = event.target.closest("[data-route]");
  if (routeButton) {
    navigate(routeButton.dataset.route);
    return;
  }

  const scenarioOption = event.target.closest("[data-scenario-option]");
  if (scenarioOption) {
    chooseScenarioOption(scenarioOption);
    return;
  }

  const action = event.target.closest("[data-action]");
  if (!action) return;

  switch (action.dataset.action) {
    case "complete-module":
      completeActiveModule();
      break;
    case "submit-assessment":
      submitAssessment();
      break;
    case "retry-assessment":
      retryAssessment();
      break;
    case "print-certificate":
      prepareCertificate();
      break;
    case "reset-progress":
      resetProgress();
      break;
    default:
      break;
  }
});

document.addEventListener("input", (event) => {
  if (event.target.matches("#learner-name")) {
    state.certificateName = event.target.value;
    saveState();
  }
});

async function initialise() {
  try {
    const courseResponse = await fetch("content/course.json");
    if (!courseResponse.ok) throw new Error("The course settings could not be loaded.");
    course = await courseResponse.json();

    modules = await Promise.all(
      course.modules.map(async (moduleReference) => {
        const response = await fetch(moduleReference.file);
        if (!response.ok) throw new Error(`The module ${moduleReference.id} could not be loaded.`);
        const moduleContent = await response.json();
        return { ...moduleReference, ...moduleContent };
      })
    );

    syncCompletion();
    renderRoute();
  } catch (error) {
    renderError(error);
  }
}

function renderRoute() {
  if (!course) return;

  const route = window.location.hash.replace(/^#/, "") || "home";
  if (route === "home") {
    renderHome();
    return;
  }

  if (route.startsWith("module/")) {
    const moduleId = route.split("/")[1];
    const module = modules.find((item) => item.id === moduleId);
    if (module) {
      renderModule(module);
      return;
    }
  }

  navigate("home", true);
}

function navigate(route, replace = false) {
  const nextHash = `#${route}`;
  if (window.location.hash === nextHash) {
    renderRoute();
    return;
  }

  if (replace) {
    window.history.replaceState(null, "", nextHash);
    renderRoute();
  } else {
    window.location.hash = nextHash;
  }
}

function renderHome() {
  activeModule = null;
  elements.rail.hidden = true;
  elements.appShell.classList.remove("has-rail");
  document.title = course.title;

  const percentage = getProgressPercentage();
  const nextModule = modules.find((module) => !isModuleComplete(module.id)) || modules[modules.length - 1];
  const completedCount = modules.filter((module) => isModuleComplete(module.id)).length;
  const startLabel = completedCount === 0 ? "Begin the course" : isCourseComplete() ? "View certificate" : "Continue learning";

  elements.main.innerHTML = `
    <div class="home-page">
      <section class="hero" aria-labelledby="course-title">
        <div class="hero-inner">
          <div>
            <p class="eyebrow">Chaplaincy-specific preparation</p>
            <h1 id="course-title">Listening.<br>Presence.<br>Respect.</h1>
            <p class="hero-lead">${escapeHTML(course.description)}</p>
          </div>
          <div class="hero-progress-card">
            <div class="hero-progress-label">
              <span>Your progress</span>
              <span>${percentage}%</span>
            </div>
            <div class="progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percentage}" aria-label="Course progress">
              <div class="progress-fill" style="width: ${percentage}%"></div>
            </div>
            <p class="hero-progress-copy">${completedCount} of ${modules.length} modules completed. Progress is saved on this device.</p>
            <button class="button button-primary" type="button" data-route="module/${nextModule.id}">
              ${startLabel} <span aria-hidden="true">→</span>
            </button>
          </div>
        </div>
      </section>

      <section class="overview" aria-labelledby="module-list-title">
        <div class="overview-heading">
          <div>
            <p class="eyebrow">The course</p>
            <h2 id="module-list-title">Eight short modules</h2>
          </div>
          <p>Work through them in order or return to any section. Short scenarios help you apply the guidance as you go.</p>
        </div>
        <div class="module-grid">
          ${modules.map(renderModuleCard).join("")}
        </div>
      </section>

      <section class="course-meta" aria-label="About this course">
        <div class="meta-card">
          <strong>${escapeHTML(course.duration)}</strong>
          <p>Approximate completion time. Take a break whenever you need one.</p>
        </div>
        <div class="meta-card">
          <strong>One shared course</strong>
          <p>For chaplaincy volunteers across UHL and LPT, followed by a local induction.</p>
        </div>
        <div class="meta-card">
          <strong>Private by design</strong>
          <p>No account is required and no personal information is sent or centrally stored.</p>
        </div>
      </section>

      <footer class="home-footer">
        <div class="home-footer-inner">
          <span>${escapeHTML(course.status)} · Version ${escapeHTML(course.courseVersion)} · Content reviewed ${escapeHTML(course.reviewed)}</span>
          <button class="reset-button" type="button" data-action="reset-progress">Reset progress on this device</button>
        </div>
      </footer>
    </div>
  `;

  updateHeaderProgress();
  focusMain();
}

function renderModuleCard(module) {
  const complete = isModuleComplete(module.id);
  const status = complete ? "Completed" : module.id === "assessment" && state.assessment.passed ? "Assessment passed" : "Not yet completed";
  return `
    <button
      class="module-card ${complete ? "is-complete" : ""}"
      type="button"
      data-route="module/${module.id}"
      aria-label="${complete ? "Review" : "Open"} module ${escapeAttribute(String(module.number))}: ${escapeAttribute(module.title)}"
    >
      <span class="module-card-top">
        <span class="module-card-number">${complete ? "✓" : escapeHTML(String(module.number))}</span>
        <span class="module-card-time">${escapeHTML(module.duration)}</span>
      </span>
      <span class="module-card-copy">
        <span class="module-card-heading">${escapeHTML(module.title)}</span>
        <p>${escapeHTML(module.summary)}</p>
      </span>
      <span class="module-card-footer">
        <span class="module-card-status">${status}</span>
        <span class="module-card-action">${complete ? "Review" : "Open"} <span aria-hidden="true">→</span></span>
      </span>
    </button>
  `;
}

function renderModule(module) {
  activeModule = module;
  elements.rail.hidden = false;
  elements.appShell.classList.add("has-rail");
  document.title = `${module.title} · ${course.title}`;
  renderNavigation(module.id);

  const isAssessment = module.id === "assessment";
  elements.main.innerHTML = `
    <article class="module-page">
      <header class="module-hero">
        <div class="module-hero-inner">
          <p class="eyebrow">Module ${escapeHTML(String(module.number))} of ${modules.length}</p>
          <h1>${escapeHTML(module.title)}</h1>
          <p class="module-summary">${escapeHTML(module.summary)}</p>
          <div class="module-meta-line">
            <span>${escapeHTML(module.duration)}</span>
            <span aria-hidden="true">•</span>
            <span>${isModuleComplete(module.id) ? "Completed" : "In progress"}</span>
          </div>
        </div>
      </header>

      <div class="module-content">
        ${renderObjectives(module.objectives)}
        ${module.sections.map((section) => renderSection(section, module)).join("")}
        ${isAssessment ? renderAssessmentArea(module) : renderModuleActions(module)}
      </div>
    </article>
  `;

  restoreScenarioSelections(module);
  updateHeaderProgress();
  focusMain();
}

function renderNavigation(activeId) {
  elements.navigation.innerHTML = modules.map((module) => {
    const complete = isModuleComplete(module.id);
    return `
      <button
        class="rail-module ${complete ? "is-complete" : ""}"
        type="button"
        data-route="module/${module.id}"
        ${module.id === activeId ? 'aria-current="page"' : ""}
      >
        <span class="rail-number">${complete ? "✓" : escapeHTML(String(module.number))}</span>
        <span class="rail-title">${escapeHTML(module.shortTitle || module.title)}</span>
        <span class="rail-status" aria-label="${complete ? "Completed" : "Not completed"}">${complete ? "✓" : ""}</span>
      </button>
    `;
  }).join("");
}

function renderObjectives(objectives = []) {
  if (!objectives.length) return "";
  return `
    <section class="objectives" aria-labelledby="objectives-title">
      <h2 id="objectives-title">By the end of this module</h2>
      <ul>${objectives.map((objective) => `<li>${escapeHTML(objective)}</li>`).join("")}</ul>
    </section>
  `;
}

function renderSection(section, module) {
  switch (section.type) {
    case "text":
      return renderTextSection(section);
    case "cards":
      return renderCardsSection(section);
    case "callout":
      return renderCallout(section);
    case "steps":
      return renderSteps(section);
    case "doDont":
      return renderDoDont(section);
    case "quote":
      return renderQuote(section);
    case "scenario":
      return renderScenario(section);
    case "video":
      return renderVideo(section);
    case "assessmentIntro":
      return renderAssessmentIntro(section, module);
    default:
      return "";
  }
}

function renderTextSection(section) {
  return `
    <section class="content-section ${section.lead ? "lead-section" : ""}">
      ${section.eyebrow ? `<p class="eyebrow">${escapeHTML(section.eyebrow)}</p>` : ""}
      ${section.title ? `<h2>${escapeHTML(section.title)}</h2>` : ""}
      ${renderParagraphs(section.body)}
      ${section.list ? `<ul class="section-list">${section.list.map((item) => `<li>${escapeHTML(item)}</li>`).join("")}</ul>` : ""}
    </section>
  `;
}

function renderCardsSection(section) {
  return `
    <section class="content-section">
      ${section.title ? `<h2>${escapeHTML(section.title)}</h2>` : ""}
      ${renderParagraphs(section.body)}
      <div class="card-list">
        ${section.items.map((item) => `
          <article class="info-card">
            <h3>${escapeHTML(item.title)}</h3>
            ${renderParagraphs(item.body)}
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

function renderCallout(section) {
  const tone = ["warm", "safety", "success"].includes(section.tone) ? ` callout-${section.tone}` : "";
  return `
    <aside class="content-section callout${tone}">
      ${section.label ? `<span class="callout-label">${escapeHTML(section.label)}</span>` : ""}
      ${section.title ? `<h3>${escapeHTML(section.title)}</h3>` : ""}
      ${renderParagraphs(section.body)}
      ${section.list ? `<ul class="section-list">${section.list.map((item) => `<li>${escapeHTML(item)}</li>`).join("")}</ul>` : ""}
    </aside>
  `;
}

function renderSteps(section) {
  return `
    <section class="content-section">
      <h2>${escapeHTML(section.title)}</h2>
      ${renderParagraphs(section.body)}
      <ol class="step-list">
        ${section.items.map((item, index) => `
          <li class="step-item">
            <span class="step-number">${index + 1}</span>
            <div>
              <h3>${escapeHTML(item.title)}</h3>
              ${renderParagraphs(item.body)}
            </div>
          </li>
        `).join("")}
      </ol>
    </section>
  `;
}

function renderDoDont(section) {
  return `
    <section class="content-section">
      <h2>${escapeHTML(section.title)}</h2>
      ${renderParagraphs(section.body)}
      <div class="do-dont-grid">
        <div class="do-dont-card do">
          <h3>${escapeHTML(section.do.title)}</h3>
          <ul>${section.do.items.map((item) => `<li>${escapeHTML(item)}</li>`).join("")}</ul>
        </div>
        <div class="do-dont-card dont">
          <h3>${escapeHTML(section.dont.title)}</h3>
          <ul>${section.dont.items.map((item) => `<li>${escapeHTML(item)}</li>`).join("")}</ul>
        </div>
      </div>
    </section>
  `;
}

function renderQuote(section) {
  return `
    <figure class="content-section quote-card">
      <blockquote>${escapeHTML(section.quote)}</blockquote>
      ${section.caption ? `<figcaption>${escapeHTML(section.caption)}</figcaption>` : ""}
    </figure>
  `;
}

function renderScenario(section) {
  return `
    <section class="content-section scenario" data-scenario="${escapeAttribute(section.id)}">
      <span class="scenario-label">${escapeHTML(section.label || "Try this")}</span>
      <h2>${escapeHTML(section.title)}</h2>
      ${renderParagraphs(section.prompt)}
      <div class="scenario-options" aria-label="Choose a response">
        ${section.options.map((option, index) => `
          <button
            class="scenario-option"
            type="button"
            data-scenario-option
            data-scenario-id="${escapeAttribute(section.id)}"
            data-option-index="${index}"
            aria-pressed="false"
          >
            <span class="option-letter" aria-hidden="true">${String.fromCharCode(65 + index)}</span>
            <span>${escapeHTML(option.text)}</span>
          </button>
        `).join("")}
      </div>
      <div class="scenario-feedback" data-scenario-feedback hidden tabindex="-1"></div>
    </section>
  `;
}

function renderVideo(section) {
  const videoUrl = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(section.youtubeId)}?rel=0`;
  return `
    <section class="content-section">
      <h2>${escapeHTML(section.heading)}</h2>
      <div class="video-card">
        <div class="video-frame">
          <iframe
            src="${videoUrl}"
            title="${escapeAttribute(section.title)}"
            loading="lazy"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowfullscreen
          ></iframe>
        </div>
        <div class="video-copy">
          <h3>${escapeHTML(section.title)}</h3>
          ${renderParagraphs(section.body)}
          <details>
            <summary>${escapeHTML(section.alternativeTitle || "Written alternative")}</summary>
            ${renderParagraphs(section.alternative)}
          </details>
        </div>
      </div>
    </section>
  `;
}

function renderAssessmentIntro(section, module) {
  return `
    <section class="content-section assessment-intro">
      <h2>${escapeHTML(section.title)}</h2>
      ${renderParagraphs(section.body)}
      <p><strong>Pass mark:</strong> ${course.passMark} out of ${module.questions.length}. You can try again.</p>
    </section>
  `;
}

function renderModuleActions(module) {
  const complete = isModuleComplete(module.id);
  const index = modules.findIndex((item) => item.id === module.id);
  const previous = modules[index - 1];
  const next = modules[index + 1];

  return `
    <div id="completion-message" class="completion-message" role="alert" hidden></div>
    <div class="module-actions">
      ${previous ? `<button class="button button-quiet" type="button" data-route="module/${previous.id}"><span aria-hidden="true">←</span> Previous</button>` : `<button class="button button-quiet" type="button" data-route="home"><span aria-hidden="true">←</span> Overview</button>`}
      ${complete && next
        ? `<button class="button button-primary" type="button" data-route="module/${next.id}">Continue <span aria-hidden="true">→</span></button>`
        : `<button class="button button-primary" type="button" data-action="complete-module">${complete ? "Completed" : "Complete module"} <span aria-hidden="true">✓</span></button>`}
    </div>
  `;
}

function renderAssessmentArea(module) {
  const result = state.assessment.attempted ? renderAssessmentResult(module) : "";
  return `
    <form id="assessment-form" novalidate>
      ${module.questions.map((question, index) => renderAssessmentQuestion(question, index)).join("")}
      <div id="assessment-message" class="completion-message" role="alert" hidden></div>
      <button class="button button-primary" type="button" data-action="submit-assessment">Check my answers</button>
    </form>
    <div id="assessment-result-area" aria-live="polite">${result}</div>
    ${renderCertificatePanel()}
    <div class="module-actions">
      <button class="button button-quiet" type="button" data-route="module/${modules[modules.length - 2].id}"><span aria-hidden="true">←</span> Previous</button>
      <button class="button button-quiet" type="button" data-route="home">Course overview</button>
    </div>
  `;
}

function renderAssessmentQuestion(question, index) {
  const savedAnswer = state.assessment.answers[question.id];
  const showFeedback = state.assessment.attempted && Number.isInteger(savedAnswer);
  const correct = showFeedback && question.options[savedAnswer]?.correct;
  return `
    <fieldset class="assessment-question" data-question-id="${escapeAttribute(question.id)}">
      <legend>
        <span class="question-number">Question ${index + 1}</span>
        ${escapeHTML(question.question)}
      </legend>
      ${question.options.map((option, optionIndex) => `
        <label class="radio-option">
          <input
            type="radio"
            name="question-${escapeAttribute(question.id)}"
            value="${optionIndex}"
            ${savedAnswer === optionIndex ? "checked" : ""}
          >
          <span>${escapeHTML(option.text)}</span>
        </label>
      `).join("")}
      ${showFeedback ? `
        <div class="assessment-feedback ${correct ? "correct" : "incorrect"}">
          <strong>${correct ? "Correct." : "Not quite."}</strong> ${escapeHTML(question.options[savedAnswer].feedback)}
        </div>
      ` : ""}
    </fieldset>
  `;
}

function renderAssessmentResult(module) {
  const passed = state.assessment.passed;
  const coreComplete = areCoreModulesComplete();
  if (passed) {
    return `
      <section class="assessment-result pass" tabindex="-1">
        <h2>Knowledge check passed</h2>
        <p>You scored ${state.assessment.score} out of ${module.questions.length}. ${coreComplete ? "Your certificate is ready below." : "Complete the remaining modules to unlock your certificate."}</p>
      </section>
    `;
  }

  return `
    <section class="assessment-result retry" tabindex="-1">
      <h2>Have another look</h2>
      <p>You scored ${state.assessment.score} out of ${module.questions.length}. Review the explanations, then try again. This is a learning check, not a permanent failure.</p>
      <button class="button button-secondary" type="button" data-action="retry-assessment">Try again</button>
    </section>
  `;
}

function renderCertificatePanel() {
  if (!isCourseComplete()) return "";
  return `
    <section class="certificate-panel">
      <p class="eyebrow">Course complete</p>
      <h2>Your completion certificate</h2>
      <p>You may add your name or leave it blank for a generic certificate. The name remains on this device.</p>
      <label class="field-label" for="learner-name">Name on certificate (optional)</label>
      <input class="text-input" id="learner-name" type="text" autocomplete="name" maxlength="80" value="${escapeAttribute(state.certificateName)}">
      <p class="field-hint">Choose “Save as PDF” in your device’s print options to download a PDF copy.</p>
      <button class="button button-primary" type="button" data-action="print-certificate">Download or print certificate</button>
    </section>
  `;
}

function chooseScenarioOption(button) {
  const scenarioId = button.dataset.scenarioId;
  const optionIndex = Number(button.dataset.optionIndex);
  const scenario = activeModule?.sections.find((section) => section.type === "scenario" && section.id === scenarioId);
  if (!scenario || !scenario.options[optionIndex]) return;

  state.scenarios[scenarioId] = optionIndex;
  saveState();
  applyScenarioSelection(scenario, optionIndex, true);
}

function restoreScenarioSelections(module) {
  module.sections
    .filter((section) => section.type === "scenario")
    .forEach((scenario) => {
      const selected = state.scenarios[scenario.id];
      if (Number.isInteger(selected)) applyScenarioSelection(scenario, selected, false);
    });
}

function applyScenarioSelection(scenario, optionIndex, moveFocus) {
  const container = elements.main.querySelector(`[data-scenario="${cssEscape(scenario.id)}"]`);
  if (!container) return;

  container.querySelectorAll("[data-scenario-option]").forEach((optionButton) => {
    optionButton.setAttribute("aria-pressed", String(Number(optionButton.dataset.optionIndex) === optionIndex));
  });

  const chosen = scenario.options[optionIndex];
  const feedback = container.querySelector("[data-scenario-feedback]");
  feedback.hidden = false;
  feedback.innerHTML = `
    <strong>${chosen.preferred ? "A helpful response" : "Something to reconsider"}</strong>
    <span>${escapeHTML(chosen.feedback)}</span>
    ${scenario.debrief ? `<p>${escapeHTML(scenario.debrief)}</p>` : ""}
  `;
  if (moveFocus) feedback.focus();
}

function completeActiveModule() {
  if (!activeModule || activeModule.id === "assessment") return;
  const requiredScenarios = activeModule.sections.filter((section) => section.type === "scenario");
  const missing = requiredScenarios.filter((scenario) => !Number.isInteger(state.scenarios[scenario.id]));
  const message = document.querySelector("#completion-message");

  if (missing.length) {
    message.hidden = false;
    message.textContent = `Please respond to ${missing.length === 1 ? "the scenario" : `the ${missing.length} scenarios`} before completing this module.`;
    const firstMissing = document.querySelector(`[data-scenario="${cssEscape(missing[0].id)}"]`);
    firstMissing?.scrollIntoView({ behavior: "smooth", block: "center" });
    firstMissing?.querySelector("button")?.focus({ preventScroll: true });
    return;
  }

  if (!isModuleComplete(activeModule.id)) state.completedModules.push(activeModule.id);
  syncCompletion();
  saveState();
  showToast("Module completed. Your progress has been saved.");

  const index = modules.findIndex((module) => module.id === activeModule.id);
  const next = modules[index + 1];
  if (next) navigate(`module/${next.id}`);
  else renderModule(activeModule);
}

function submitAssessment() {
  if (!activeModule || activeModule.id !== "assessment") return;
  const form = document.querySelector("#assessment-form");
  const answers = {};
  const missing = [];

  activeModule.questions.forEach((question) => {
    const checked = form.querySelector(`input[name="question-${cssEscape(question.id)}"]:checked`);
    if (!checked) missing.push(question.id);
    else answers[question.id] = Number(checked.value);
  });

  const message = document.querySelector("#assessment-message");
  if (missing.length) {
    message.hidden = false;
    message.textContent = `Please answer all ${activeModule.questions.length} questions before checking your answers.`;
    form.querySelector(`[data-question-id="${cssEscape(missing[0])}"] input`)?.focus();
    return;
  }

  const score = activeModule.questions.reduce((total, question) => {
    return total + (question.options[answers[question.id]]?.correct ? 1 : 0);
  }, 0);

  state.assessment = {
    attempted: true,
    passed: score >= course.passMark,
    score,
    answers
  };
  syncCompletion();
  saveState();
  renderModule(activeModule);
  document.querySelector("#assessment-result-area .assessment-result")?.focus();
}

function retryAssessment() {
  state.assessment.attempted = false;
  state.assessment.answers = {};
  state.assessment.score = 0;
  saveState();
  renderModule(activeModule);
  document.querySelector("#assessment-form")?.scrollIntoView({ behavior: "smooth" });
}

function syncCompletion() {
  if (!course || !modules.length) return;
  const assessmentModule = modules.find((module) => module.id === "assessment");
  if (!assessmentModule) return;

  if (state.assessment.passed && areCoreModulesComplete()) {
    if (!state.completedModules.includes("assessment")) state.completedModules.push("assessment");
    if (!state.completedDate) state.completedDate = new Date().toISOString();
  } else {
    state.completedModules = state.completedModules.filter((id) => id !== "assessment");
  }
  saveState();
}

function areCoreModulesComplete() {
  return modules
    .filter((module) => module.id !== "assessment")
    .every((module) => isModuleComplete(module.id));
}

function isCourseComplete() {
  return modules.length > 0 && modules.every((module) => isModuleComplete(module.id));
}

function isModuleComplete(moduleId) {
  return state.completedModules.includes(moduleId);
}

function getProgressPercentage() {
  if (!modules.length) return 0;
  const completed = modules.filter((module) => isModuleComplete(module.id)).length;
  return Math.round((completed / modules.length) * 100);
}

function updateHeaderProgress() {
  elements.headerProgress.textContent = `${getProgressPercentage()}% complete`;
}

function prepareCertificate() {
  if (!isCourseComplete()) return;
  const certificate = course.certificate;
  const learnerName = state.certificateName.trim();
  const completionDate = state.completedDate ? new Date(state.completedDate) : new Date();

  document.querySelector("#certificate-title").textContent = certificate.title;
  document.querySelector("#certificate-intro").textContent = learnerName ? certificate.namedIntro : certificate.genericIntro;
  document.querySelector("#certificate-name").textContent = learnerName || certificate.genericName;
  document.querySelector("#certificate-copy").textContent = certificate.copy;
  document.querySelector("#certificate-date").textContent = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric" }).format(completionDate);
  document.querySelector("#certificate-version").textContent = course.courseVersion;
  document.querySelector("#certificate-organisations").innerHTML = course.organisations.map(escapeHTML).join("<br>");

  document.body.classList.add("is-printing-certificate");
  document.querySelector("#certificate-sheet").setAttribute("aria-hidden", "false");
  window.setTimeout(() => window.print(), 50);
}

function clearCertificatePrintMode() {
  document.body.classList.remove("is-printing-certificate");
  document.querySelector("#certificate-sheet").setAttribute("aria-hidden", "true");
}

function resetProgress() {
  const confirmed = window.confirm("Reset all course progress saved on this device? This cannot be undone.");
  if (!confirmed) return;
  state = structuredClone(defaultState);
  saveState();
  showToast("Course progress has been reset.");
  renderHome();
}

function loadState() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY));
    if (!saved) return structuredClone(defaultState);
    return {
      ...structuredClone(defaultState),
      ...saved,
      assessment: {
        ...structuredClone(defaultState.assessment),
        ...(saved.assessment || {})
      }
    };
  } catch {
    return structuredClone(defaultState);
  }
}

function saveState() {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // The course remains usable if browser storage is unavailable.
  }
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add("is-visible");
  toastTimer = window.setTimeout(() => elements.toast.classList.remove("is-visible"), 3200);
}

function focusMain() {
  window.scrollTo({ top: 0, behavior: "auto" });
  elements.main.focus({ preventScroll: true });
}

function renderError(error) {
  elements.main.innerHTML = `
    <section class="error-page">
      <p class="eyebrow">Course unavailable</p>
      <h1>We could not load the prototype</h1>
      <p>${escapeHTML(error.message)}</p>
      <p>If you opened the files directly, start the small local web server described in README.md and try again.</p>
    </section>
  `;
}

function renderParagraphs(value) {
  const paragraphs = Array.isArray(value) ? value : value ? [value] : [];
  return paragraphs.map((paragraph) => `<p>${escapeHTML(paragraph)}</p>`).join("");
}

function escapeHTML(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value = "") {
  return escapeHTML(value);
}

function cssEscape(value) {
  if (window.CSS?.escape) return window.CSS.escape(value);
  return String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}
