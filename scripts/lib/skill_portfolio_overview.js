"use strict";

const {
  defaultOutcomesPath,
  evaluateSkillPortfolio,
  loadSkillCatalog,
  loadSkillPortfolioPolicy,
  parseOutcomeEventsFromJsonl,
}=require("./skill_portfolio_policy");

function safeString(value,max=240){
  if(typeof value!=="string")return"";
  const trimmed=value.trim();
  return trimmed?trimmed.slice(0,max):"";
}

function summarizePath(targetPath,summarizePathForOperationLog){
  if(typeof summarizePathForOperationLog==="function"){
    return summarizePathForOperationLog(targetPath,220);
  }
  return safeString(targetPath,220);
}

function toClampedCount(value){
  return Number.isFinite(Number(value))?Math.max(0,Math.trunc(Number(value))):0;
}

function toRate(value){
  const parsed=Number(value);
  if(!Number.isFinite(parsed))return 0;
  return Math.max(0,Math.min(1,parsed));
}

function buildOutcomeSummary(outcomeStats){
  const entries=Object.values(outcomeStats&&typeof outcomeStats==="object"?outcomeStats:{});
  const totalRuns=entries.reduce((sum,entry)=>sum+toClampedCount(entry&&entry.runs),0);
  const totalSuccesses=entries.reduce((sum,entry)=>sum+toClampedCount(entry&&entry.successes),0);
  const totalGuardFailures=entries.reduce((sum,entry)=>sum+toClampedCount(entry&&entry.guardFailures),0);
  return{
    sampledSkills:entries.length,
    totalRuns,
    totalSuccesses,
    overallSuccessRate:totalRuns>0?totalSuccesses/totalRuns:0,
    totalGuardFailures,
  };
}

function buildPromotionCandidates(report){
  return Array.isArray(report&&report.promotionCandidates)
    ?report.promotionCandidates
      .map((entry)=>({
        skill:safeString(entry&&entry.skill,120)||"",
        fromClass:safeString(entry&&entry.fromClass,40)||"",
        toClass:safeString(entry&&entry.toClass,40)||"",
        evidence:{
          runs:toClampedCount(entry&&entry.evidence&&entry.evidence.runs),
          successes:toClampedCount(entry&&entry.evidence&&entry.evidence.successes),
          successRate:toRate(entry&&entry.evidence&&entry.evidence.successRate),
          avgPrimaryScore:toRate(entry&&entry.evidence&&entry.evidence.avgPrimaryScore),
          guardFailures:toClampedCount(entry&&entry.evidence&&entry.evidence.guardFailures),
        },
      }))
      .filter((entry)=>entry.skill)
      .sort((left,right)=>{
        const byRuns=right.evidence.runs-left.evidence.runs;
        if(byRuns!==0)return byRuns;
        const byScore=right.evidence.avgPrimaryScore-left.evidence.avgPrimaryScore;
        if(byScore!==0)return byScore;
        return left.skill.localeCompare(right.skill);
      })
      .slice(0,8)
    :[];
}

function buildSkillPortfolioOverview({summarizePathForOperationLog}={}){
  const policy=loadSkillPortfolioPolicy();
  const catalog=loadSkillCatalog();
  const outcomeInfo=parseOutcomeEventsFromJsonl(defaultOutcomesPath);
  const report=evaluateSkillPortfolio({policy,catalog,outcomeEvents:outcomeInfo.events});
  const assignments=Object.entries(catalog&&catalog.assignments&&typeof catalog.assignments==="object"?catalog.assignments:{})
    .map(([role,skills])=>({
      role:safeString(role,120)||"",
      skills:Array.isArray(skills)?skills.map((entry)=>safeString(entry,120)).filter(Boolean):[],
    }))
    .filter((entry)=>entry.role)
    .sort((left,right)=>left.role.localeCompare(right.role));
  const promotionCandidates=buildPromotionCandidates(report);
  const outcomeSummary=buildOutcomeSummary(report&&report.outcomeStats&&typeof report.outcomeStats==="object"?report.outcomeStats:{});
  return{
    status:safeString(report&&report.status,40)||"FAIL",
    policy:{
      schema:safeString(policy&&policy.schema,120)||"",
      version:safeString(policy&&policy.version,120)||"",
      path:summarizePath(policy&&policy.policyPath,summarizePathForOperationLog),
      source:safeString(policy&&policy.source,40)||"",
    },
    catalog:{
      schema:safeString(catalog&&catalog.schema,120)||"",
      version:safeString(catalog&&catalog.version,120)||"",
      path:summarizePath(catalog&&catalog.catalogPath,summarizePathForOperationLog),
      source:safeString(catalog&&catalog.source,40)||"",
      updatedAt:safeString(catalog&&catalog.updatedAt,40)||"",
    },
    outcomeEvents:{
      path:summarizePath(outcomeInfo&&outcomeInfo.path,summarizePathForOperationLog),
      source:safeString(outcomeInfo&&outcomeInfo.source,40)||"",
      count:Array.isArray(outcomeInfo&&outcomeInfo.events)?outcomeInfo.events.length:0,
      parseErrors:Array.isArray(outcomeInfo&&outcomeInfo.parseErrors)?outcomeInfo.parseErrors.slice(0,8):[],
    },
    outcomeSummary,
    operationalMaturity:report&&report.operationalMaturity&&typeof report.operationalMaturity==="object"
      ?{
        scoreProfile:safeString(report.operationalMaturity.scoreProfile,80)||"",
        scoreMeaning:safeString(report.operationalMaturity.scoreMeaning,240)||"",
        summary:report.operationalMaturity.summary&&typeof report.operationalMaturity.summary==="object"
          ?report.operationalMaturity.summary
          :{},
      }
      :{},
    promotionCandidateCount:promotionCandidates.length,
    promotionCandidates,
    promotionRules:{
      scenarioToRole:policy&&policy.promotionRules&&policy.promotionRules.scenarioToRole?policy.promotionRules.scenarioToRole:{},
      roleToGlobal:policy&&policy.promotionRules&&policy.promotionRules.roleToGlobal?policy.promotionRules.roleToGlobal:{},
      evidence:policy&&policy.promotionEvidence?policy.promotionEvidence:{},
      guardrail:policy&&policy.guardrail?policy.guardrail:{},
      revocation:policy&&policy.revocationPolicy?policy.revocationPolicy:{},
    },
    portfolioRules:{
      minClassDiversity:toClampedCount(policy&&policy.portfolio&&policy.portfolio.minClassDiversity),
      minClassShare:policy&&policy.portfolio&&policy.portfolio.minClassShare?policy.portfolio.minClassShare:{},
      maxClassShare:policy&&policy.portfolio&&policy.portfolio.maxClassShare?policy.portfolio.maxClassShare:{},
    },
    portfolio:report&&report.portfolio&&typeof report.portfolio==="object"?report.portfolio:{},
    roleChecks:Array.isArray(report&&report.roleChecks)
      ?report.roleChecks.map((entry)=>({
        role:safeString(entry&&entry.role,120)||"",
        pass:entry&&entry.pass?1:0,
        assignedCount:toClampedCount(entry&&entry.assignedCount),
        minSkills:toClampedCount(entry&&entry.minSkills),
        missingClasses:Array.isArray(entry&&entry.missingClasses)?entry.missingClasses.slice(0,8):[],
        missingSkills:Array.isArray(entry&&entry.missingSkills)?entry.missingSkills.slice(0,8):[],
      }))
      :[],
    issues:Array.isArray(report&&report.issues)?report.issues.slice(0,10):[],
    warnings:Array.isArray(report&&report.warnings)?report.warnings.slice(0,10):[],
    missingProposals:Array.isArray(report&&report.missingProposals)?report.missingProposals.slice(0,10):[],
    assignments,
  };
}

module.exports={
  buildSkillPortfolioOverview,
};
