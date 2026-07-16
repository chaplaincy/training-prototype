import { readFile, access } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const root = resolve(scriptDirectory, "..");
const errors = [];
const warnings = [];

async function readJson(relativePath) {
  try {
    return JSON.parse(await readFile(join(root, relativePath), "utf8"));
  } catch (error) {
    errors.push(`${relativePath}: ${error.message}`);
    return null;
  }
}

function requiredText(value, location) {
  if (typeof value !== "string" || !value.trim()) errors.push(`${location} must contain text.`);
}

const course = await readJson("content/course.json");

if (course) {
  requiredText(course.title, "course.title");
  requiredText(course.courseVersion, "course.courseVersion");
  requiredText(course.reviewed, "course.reviewed");

  if (!Array.isArray(course.modules) || !course.modules.length) {
    errors.push("course.modules must contain at least one module.");
  } else {
    const moduleIds = new Set();
    const moduleNumbers = new Set();

    for (const reference of course.modules) {
      if (moduleIds.has(reference.id)) errors.push(`Duplicate module id: ${reference.id}`);
      if (moduleNumbers.has(reference.number)) errors.push(`Duplicate module number: ${reference.number}`);
      moduleIds.add(reference.id);
      moduleNumbers.add(reference.number);

      requiredText(reference.id, "module reference id");
      requiredText(reference.file, `${reference.id}.file`);

      if (!reference.file) continue;
      try {
        await access(join(root, reference.file));
      } catch {
        errors.push(`${reference.id}: referenced file does not exist (${reference.file}).`);
        continue;
      }

      const module = await readJson(reference.file);
      if (!module) continue;
      if (module.id !== reference.id) errors.push(`${reference.file}: id must match ${reference.id}.`);
      requiredText(module.summary, `${reference.id}.summary`);
      if (!Array.isArray(module.sections)) errors.push(`${reference.id}.sections must be an array.`);

      const scenarioIds = new Set();
      for (const [sectionIndex, section] of (module.sections || []).entries()) {
        requiredText(section.type, `${reference.id}.sections[${sectionIndex}].type`);
        if (section.type === "scenario") {
          if (scenarioIds.has(section.id)) errors.push(`${reference.id}: duplicate scenario id ${section.id}.`);
          scenarioIds.add(section.id);
          requiredText(section.id, `${reference.id} scenario id`);
          requiredText(section.title, `${section.id}.title`);
          if (!Array.isArray(section.options) || section.options.length < 2) {
            errors.push(`${section.id} must contain at least two options.`);
          } else if (!section.options.some((option) => option.preferred === true)) {
            errors.push(`${section.id} must contain a preferred option.`);
          }
        }

        if (section.type === "video") {
          requiredText(section.youtubeId, `${reference.id} video youtubeId`);
          if (!Array.isArray(section.alternative) || !section.alternative.length) {
            warnings.push(`${reference.id}: video should include a written alternative.`);
          }
        }
      }

      if (reference.id === "assessment") {
        if (!Array.isArray(module.questions) || !module.questions.length) {
          errors.push("assessment.questions must contain questions.");
        } else {
          for (const question of module.questions) {
            requiredText(question.id, "assessment question id");
            requiredText(question.question, `${question.id}.question`);
            const correctAnswers = (question.options || []).filter((option) => option.correct === true);
            if (correctAnswers.length !== 1) {
              errors.push(`${question.id} must have exactly one correct answer.`);
            }
            for (const [optionIndex, option] of (question.options || []).entries()) {
              requiredText(option.text, `${question.id}.options[${optionIndex}].text`);
              requiredText(option.feedback, `${question.id}.options[${optionIndex}].feedback`);
            }
          }

          if (course.passMark < 1 || course.passMark > module.questions.length) {
            errors.push(`course.passMark must be between 1 and ${module.questions.length}.`);
          }
        }
      }
    }
  }
}

if (warnings.length) {
  console.warn("Warnings:");
  for (const warning of warnings) console.warn(`- ${warning}`);
}

if (errors.length) {
  console.error("Content validation failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(`Content validation passed for ${course.modules.length} modules.`);
}
