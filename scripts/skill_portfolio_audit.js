#!/usr/bin/env node
"use strict";

const {
  defaultOutcomesPath,
  evaluateSkillPortfolio,
  parseOutcomeEventsFromJsonl,
} = require("./lib/skill_portfolio_policy");

function parseArgs(argv) {
  const options = {
    outcomesPath: defaultOutcomesPath,
    json: false,
  };
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--json") {
      options.json = true;
      continue;
    }
    if (token === "--outcomes" && index + 1 < argv.length) {
      options.outcomesPath = argv[index + 1];
      index += 1;
      continue;
    }
    if (token === "--help" || token === "-h") {
      options.help = true;
      return options;
    }
  }
  return options;
}

function formatPercent(value) {
  return `${(Number(value || 0) * 100).toFixed(1)}%`;
}

function formatScore(value) {
  return Number.isFinite(value) ? value.toFixed(3) : "n/a";
}

function printUsage() {
  console.log("Usage:");
  console.log("  node scripts/skill_portfolio_audit.js [--outcomes logs/skill_outcomes.jsonl] [--json]");
}

function printHumanReport(report, outcomeInfo) {
  console.log(`[skill-portfolio-audit] status=${report.status}`);
  console.log(
    `[skill-portfolio-audit] policy=${report.policy.source}:${report.policy.path} catalog=${report.catalog.source}:${report.catalog.path}`
  );
  if (report.policy.loadError) {
    console.log(`[skill-portfolio-audit] policy_load_error=${report.policy.loadError}`);
  }
  if (report.catalog.loadError) {
    console.log(`[skill-portfolio-audit] catalog_load_error=${report.catalog.loadError}`);
  }
  console.log(
    `[skill-portfolio-audit] diversity=${report.portfolio.activeClassCount}/${report.portfolio.requiredClassDiversity} exposure=${report.portfolio.exposureTotal}`
  );

  const classNames = Object.keys(report.portfolio.exposureByClass);
  for (const className of classNames) {
    const count = report.portfolio.exposureByClass[className];
    const share = report.portfolio.classShare[className];
    console.log(`[skill-portfolio-audit] class ${className}: count=${count} share=${formatPercent(share)}`);
  }

  for (const roleCheck of report.roleChecks) {
    const missingClasses = roleCheck.missingClasses.length ? roleCheck.missingClasses.join("|") : "-";
    const missingSkills = roleCheck.missingSkills.length ? roleCheck.missingSkills.join("|") : "-";
    console.log(
      `[skill-portfolio-audit] role ${roleCheck.role}: pass=${roleCheck.pass} assigned=${roleCheck.assignedCount}/${roleCheck.minSkills} missingClasses=${missingClasses} missingSkills=${missingSkills}`
    );
  }

  if (report.issues.length) {
    for (const issue of report.issues) {
      console.log(
        `[skill-portfolio-audit] ISSUE type=${issue.type} role=${issue.role || "-"} class=${issue.className || "-"} detail=${issue.detail || "-"}`
      );
    }
  } else {
    console.log("[skill-portfolio-audit] ISSUE none");
  }

  if (report.warnings.length) {
    for (const warning of report.warnings) {
      console.log(`[skill-portfolio-audit] WARN type=${warning.type} role=${warning.role || "-"} detail=${warning.detail || "-"}`);
    }
  } else {
    console.log("[skill-portfolio-audit] WARN none");
  }

  console.log(
    `[skill-portfolio-audit] outcomes source=${outcomeInfo.source} path=${outcomeInfo.path} events=${outcomeInfo.events.length} parseErrors=${outcomeInfo.parseErrors.length}`
  );
  if (outcomeInfo.parseErrors.length) {
    for (const error of outcomeInfo.parseErrors) {
      console.log(`[skill-portfolio-audit] outcome_parse_error ${error}`);
    }
  }

  if (report.operationalMaturity) {
    const maturity = report.operationalMaturity;
    console.log(
      `[skill-portfolio-audit] operational_maturity profile=${maturity.scoreProfile} average=${formatScore(maturity.summary && maturity.summary.averageScore)} loggedSkills=${maturity.summary && maturity.summary.loggedSkillCount}/${maturity.summary && maturity.summary.skillCount}`
    );
    const dimensions = maturity.summary && maturity.summary.dimensions ? maturity.summary.dimensions : {};
    for (const [dimensionName, dimension] of Object.entries(dimensions)) {
      const statuses = dimension.statuses && typeof dimension.statuses === "object"
        ? Object.entries(dimension.statuses).map(([status, count]) => `${status}:${count}`).join("|")
        : "-";
      console.log(
        `[skill-portfolio-audit] maturity ${dimensionName}: applicable=${dimension.applicable} average=${formatScore(dimension.averageScore)} statuses=${statuses || "-"}`
      );
    }
  }

  if (report.promotionCandidates.length) {
    for (const candidate of report.promotionCandidates) {
      const evidence = candidate.evidence;
      console.log(
        `[skill-portfolio-audit] PROMOTION skill=${candidate.skill} ${candidate.fromClass}->${candidate.toClass} runs=${evidence.runs} successRate=${formatPercent(evidence.successRate)} primaryScore=${evidence.avgPrimaryScore.toFixed(3)} guardFailures=${evidence.guardFailures}`
      );
    }
  } else {
    console.log("[skill-portfolio-audit] PROMOTION none");
  }
}

function main() {
  const options = parseArgs(process.argv);
  if (options.help) {
    printUsage();
    return;
  }
  const outcomeInfo = parseOutcomeEventsFromJsonl(options.outcomesPath);
  const report = evaluateSkillPortfolio({ outcomeEvents: outcomeInfo.events });

  if (options.json) {
    console.log(JSON.stringify({
      report,
      outcomeInfo: {
        source: outcomeInfo.source,
        path: outcomeInfo.path,
        events: outcomeInfo.events.length,
        parseErrors: outcomeInfo.parseErrors,
      },
    }, null, 2));
  } else {
    printHumanReport(report, outcomeInfo);
  }

  if (report.status !== "PASS") {
    process.exitCode = 1;
    console.log("FAIL");
    return;
  }
  console.log("PASS");
}

try {
  main();
} catch (error) {
  console.error(`[skill-portfolio-audit] fatal=${error instanceof Error ? error.message : String(error)}`);
  console.log("FAIL");
  process.exit(1);
}
